"""Team mode: brain-kit's bridge (poll → dispatch → watch → collect → reconcile) and runnerd, hosted by the app.

Everything is brain-kit's: bridge.json is read by its ``load_bridge_config``, every check (``Bridge.verify``), the
contract and answer vouchers, the questions on the MR and what counts as an answer (``decisions.check_answer``), the
admission limits, the ledger, runnerd's workspace, and signing through a signer object. The bridge runs with
brain-kit's ``sign.SpoolSigner``, the one bridge.json names (``"signer": {"type": "spool", "spool_dir",
"allowed_signers"}``), and no key: the separate signer (signer/brain_signer.py, another OS user) holds it, checks
every request again and answers through the spool; brain-kit's bridge itself rejects the hand-over on a refusal (or
marks the answer ``refused``) and tries again next round when the signer does not answer. Nothing of brain-kit is
patched or subclassed. What the app changes:
- sessions: ``kc`` is the app's KiroCrewAdapter (crewadapter.py), not brain-kit's HTTP client;
- vouchers: brain-kit writes the app's copy to bridge.json ``vouchers_dir``; ``publish_vouchers`` is forced off
  (brain-intake gets its copy from the signer, its only writer);
- bridge.json must not name a ``signing_key``; ``kirocrew.base/app/secret_file`` are not used (the app talks to its
  own gateway);
- poll: the app runs ``Bridge.poll``'s loop itself (every project, every MR with the hand-over label,
  ``Bridge.process``) to keep what process() said for each MR for the page: accepted, rejected, seen (that head and
  label event were checked before), and brain-kit 72b278e's unlabelled (the newest event on the label takes it off:
  `brain handoff` re-adding it right now) and waiting (this very hand-over is being signed elsewhere: looked at again
  next round). brain-kit's poll returns nothing (BRAINKIT_REQUESTS 27).

The ledger is brain-kit's ``Ledger``: one sqlite connection any thread may use, ``ledger.lock`` around several
statements. Rounds run one at a time on the runtime's own worker thread (a round may wait on GitLab, KiroCrew and the
signer for a while: it stays off the event loop and the default pool); the page reads the same Ledger from any thread:
its runs (brain-kit 9935b11: a run id reserved while its contract is signed is in state ``signing``), decisions and
hand-overs, and the vouchers the signer has not answered yet (``pending_vouchers``: the next round asks for the very
same voucher, so a late signature is used).
"""

from __future__ import annotations

import concurrent.futures
import json
import os
import re
import sqlite3
import stat
import threading
import time
from collections import deque
from datetime import timedelta
from typing import Any

from .. import bk, problems
from .crewadapter import KiroCrewAdapter

REQ_RE = re.compile(r"^[a-z]+-[A-Za-z0-9-]{1,80}-[0-9a-f]{12}\.json$")
MAX_SPOOL_FILE = 64 * 1024
PENDING_WINDOW_S = 3600   # brain-kit's Ledger.pending_voucher(newer_than=3600): older ones are not asked for again
LEDGER_TABLES = ("runs", "decisions", "handoffs", "outbox", "notices")
# what the page shows of bridge.json and runnerd.json (brain-kit 0d52e97 reads each where it is used; a value that is
# not a positive number falls back to its default, sign.seconds): (key, default, unit, one plain line)
BRIDGE_KEYS = (
    ("interval", 60, "s", "桥每隔这么久跑一轮"),
    ("send_give_up_minutes", 60, "min", "接手消息送了 3 次都没进运行机的会话，过了这么久就算这次运行没能开始（回答和通知一直送，不放弃）"),
    ("runnerd_wait_minutes", 90, "min", "运行机这么久没准备好工作区、也没报错，就在 MR 上说一声（桥接着等）"),
    ("acceptance_ci_wait_minutes", 60, "min", "验收问题等流水线通过才发：流水线这么久还没跑完，就在 MR 上说一声"),
    ("edit_check_rounds", 3, "n", "查不到回复有没有被别人改过：连着这么多轮，就在 MR 上说一声（回答先等着，不算也不丢）"),
    ("edit_check_wait_minutes", 30, "min", "……或者从第一次查不到起过了这么久"),
)
RUNNERD_KEYS = (
    ("kit_dir", "app 用的这份 brain-kit", "path", "运行机用哪份 brain-kit 的 kit/：每建一个工作区前查一次，它带的 Lean 适配文件要是第 3 版"),
    ("agent_spec", "不查", "path", "brain-run 的设置：查它带着运行机那份 Lean 适配文件的三个拦截（调用工具前那个的匹配要是 *）"),
    ("hook_path", "/usr/bin:/bin", "path", "运行机上 Lean 的拦截找 git 和 ssh-keygen 用的 PATH"),
    ("git_timeout", 300, "s", "每次 fetch（和拉 brain-intake）最多等这么久"),
    ("clone_timeout", 3600, "s", "第一次克隆最多等这么久"),
    ("tries", 3, "n", "建工作区失败了，最多试这么多次"),
)


def load_config(path: str) -> dict[str, Any]:
    """bridge.json through brain-kit's own loader (required keys, the signer block), then the app's rules: a spool
    signer, no signing key, vouchers not published from here."""
    common = bk.m("common")
    cfg = bk.m("bridge.handoff").load_bridge_config(path)
    if cfg.get("signing_key"):
        raise common.BrainError("bridge.json 不能写 signing_key：私钥只给签名服务（signer/），桥用 \"signer\": "
                                "{\"type\": \"spool\", …} 请签名服务签")
    s = cfg.get("signer")
    if not isinstance(s, dict) or s.get("type") != "spool":
        raise common.BrainError("bridge.json 要有 \"signer\": {\"type\": \"spool\", \"spool_dir\": …, "
                                "\"allowed_signers\": …}：这个 app 只通过签名服务签名")
    cfg["publish_vouchers"] = False
    return cfg


class TeamRuntime:
    """The hosted bridge + runnerd of one enable of the app. ``start`` builds brain-kit's Bridge with the spool
    signer; ``loop_once`` runs one round; ``stop`` closes the ledger after the round in progress."""

    def __init__(self, team: dict[str, Any], loop: Any, mgr: Any, log: Any, *, transport: Any = None,
                 kick: Any = None, sign_timeout: float | None = None, scrub: Any = None) -> None:
        self.team, self.loop, self.mgr, self.log = team, loop, mgr, log
        self.scrub = scrub or (lambda s: s)
        # kick (tests): run the signer while the SpoolSigner waits; sign_timeout: instead of bridge.json's
        self.transport, self.kick, self.sign_timeout = transport, kick, sign_timeout
        self.host: Any = None
        self.cfg: dict[str, Any] = {}
        self.runnerd_cfg: dict[str, Any] | None = None
        self.spool = ""
        self.allowed_signers = ""
        self.error = ""
        self.loop_error = ""
        self.last_loop_at: float | None = None
        self.last_summary: dict[str, int] = {}
        self.last_handovers: list[dict[str, Any]] = []   # what Bridge.process said for each labelled MR, last round
        self.lines: deque = deque(maxlen=200)
        self.same_user = False
        self._lock = threading.Lock()
        self.executor = concurrent.futures.ThreadPoolExecutor(max_workers=1, thread_name_prefix="brain-bridge")

    # ---- setup ---------------------------------------------------------------------------------------- #

    def start(self) -> bool:
        common = bk.m("common")
        try:
            cfg = load_config(self.team["bridge_config"])
            s = cfg["signer"]
            spool, allowed = str(s["spool_dir"]), str(s["allowed_signers"])
            if not os.path.isfile(allowed):
                raise common.BrainError("找不到 bridge.json signer.allowed_signers：%s" % allowed)
            # the signer's answers come from another OS user: this one must not be able to write them
            writable = any(os.path.isdir(p) and os.access(p, os.W_OK)
                           for p in (os.path.join(spool, "signed"), os.path.join(spool, "refused")))
            self.same_user = writable or bool(self.team.get("dev_same_user"))
            if not self.team.get("dev_same_user"):
                if writable:
                    raise common.BrainError("签名服务的 signed/、refused/ 这个 app 的系统用户能写：签名服务要用自己的系统用户"
                                            "（brainbridge）跑。本机试用请在设置里打开「签名服务和 app 同一个用户」")
                owned = [p for p in (self.team["bridge_config"], self.team.get("runnerd_config") or "", allowed,
                                     cfg.get("identities") or "") if p and not foreign(p)]
                if owned:
                    raise common.BrainError("这些配置这个 app 的系统用户能改：%s。agent 和 app 是同一个用户，配置要归别的用户"
                                            "（root 或 brainbridge）所有、对 app 只读" % "、".join(os.path.basename(p) for p in owned))
            rcfg = None
            if self.team.get("runnerd_config"):
                rcfg = common.load_json(self.team["runnerd_config"])
                if os.path.realpath(str(rcfg.get("spool_dir") or "")) != os.path.realpath(cfg["spool_dir"]):
                    raise common.BrainError("runnerd.json 的 spool_dir 和 bridge.json 的不一样")
            rest = bk.m("rest")
            gcfg = cfg.get("gitlab") or {}
            tok = rest.read_token(gcfg.get("token_env", "BRIDGE_GITLAB_TOKEN"),
                                  default_file=gcfg.get("token_file", rest.DEFAULT_TOKEN_FILE))
            if not gcfg.get("base") or not tok:
                raise common.BrainError("bridge.json 的 gitlab.base 没写，或者读不到 GitLab token（%s / %s）"
                                        % (gcfg.get("token_env", "BRIDGE_GITLAB_TOKEN"), gcfg.get("token_file", rest.DEFAULT_TOKEN_FILE)))
            gl = rest.GitLab(gcfg["base"], tok, self.transport)
            jc = cfg.get("jira") or {}
            jira = None
            if jc.get("base"):
                jira = rest.Jira(jc["base"], os.environ.get(jc.get("token_env", "BRIDGE_JIRA_TOKEN"), ""), jc.get("api", "2"),
                                 self.transport, basic_user=os.environ.get(jc.get("user_env", ""), "") or None)
            sign = bk.m("sign")
            signer = sign.signer_from_config(cfg)          # brain-kit's SpoolSigner, from bridge.json's signer block
            if not isinstance(signer, sign.SpoolSigner):
                raise common.BrainError("bridge.json 的 signer 不是签名服务（spool）")
            if self.sign_timeout is not None:
                signer.timeout = float(self.sign_timeout)
            if self.kick is not None:
                kick = self.kick
                signer.sleep = lambda s: (kick(), time.sleep(s))
            kc = KiroCrewAdapter(self.loop, self.mgr, common.BrainError)
            self.host = bk.m("bridge.handoff").Bridge(cfg, gl, jira, kc, out=self._out, signer=signer)
            self.cfg, self.runnerd_cfg, self.spool, self.allowed_signers = cfg, rcfg, spool, allowed
            self.error = ""
            return True
        except Exception as exc:  # noqa: BLE001
            self.error = str(exc).split("\n", 1)[0][:400]
            self.host = None
            return False

    def stop(self) -> None:
        """Close the ledger after the round in progress (it runs on the executor), then let the executor go."""
        try:
            self.executor.submit(self._close).result(timeout=30)
        except Exception:  # noqa: BLE001
            pass
        self.executor.shutdown(wait=False)

    def _close(self) -> None:
        host, self.host = self.host, None
        if host is not None:
            try:
                host.ledger.close()
            except Exception:  # noqa: BLE001
                pass

    def _out(self, line: str) -> None:
        text = self.scrub(str(line)[:500])
        self.lines.append((time.time(), text))
        if self.log is not None:
            self.log.info("brain bridge: %s", text)

    # ---- one round ------------------------------------------------------------------------------------ #

    def loop_once(self) -> dict[str, int]:
        """poll, runnerd, dispatch, watch, collect, reconcile; one bad step does not stop the others."""
        host = self.host
        if host is None:
            raise RuntimeError(self.error or "运行机模式没有启动")
        common = bk.m("common")
        summary: dict[str, int] = {}
        errors = []
        with self._lock:
            for step in ("poll", "runnerd", "dispatch", "watch", "collect", "reconcile"):
                try:
                    if step == "runnerd":
                        if self.runnerd_cfg:
                            summary["prepared"] = int(bk.m("bridge.runnerd").once(self.runnerd_cfg, out=self._out) or 0)
                        continue
                    if step == "poll":
                        summary["poll"] = self._poll(host)
                        continue
                    n = getattr(host, step)()
                    if isinstance(n, int):
                        summary[step] = n
                except (common.BrainError, OSError, ValueError, sqlite3.Error) as exc:
                    errors.append("%s: %s" % (step, str(exc).split("\n", 1)[0][:200]))
                    self._out("%s failed this round: %s" % (step, exc))
            self.last_loop_at = time.time()
            self.loop_error = "；".join(errors)
            self.last_summary = summary
        return summary

    def _poll(self, host: Any) -> int:
        """brain-kit's Bridge.poll, MR by MR, keeping each MR's result (Bridge.process) for the page. One MR that fails
        does not stop the others, as in brain-kit (its error is logged the same way). -> how many MRs were looked at."""
        common = bk.m("common")
        seen: list[dict[str, Any]] = []
        try:
            for proj in host.cfg["projects"]:
                project = proj["project"] if isinstance(proj, dict) else proj
                kit = host.kit(project)
                for mr in host.gl.mrs_with_label(project, kit["handoff_label"]):
                    row = {"project": str(project), "iid": int(mr.get("iid") or 0), "sha": str(mr.get("sha") or "")[:40],
                           "result": "error", "error": "", "at": time.time()}
                    try:
                        row["result"] = str(host.process(project, kit, mr) or "")
                    except common.BrainError as e:  # retried next round, as brain-kit's poll does
                        host.out("error on %s!%s: %s" % (project, mr.get("iid"), e))
                        row["error"] = self.scrub(str(e).split("\n", 1)[0][:300])
                    seen.append(row)
        finally:
            self.last_handovers = seen
        return len(seen)

    def handovers(self) -> list[dict[str, Any]]:
        """The labelled MRs of the last round and what brain-kit's bridge said about each (see _poll)."""
        out = []
        for r in list(self.last_handovers):
            out.append(dict(r, mr_url=self.mr_url(r["project"], r["iid"])))
        return out

    # ---- what the page reads -------------------------------------------------------------------------- #

    def ledger(self) -> dict[str, Any]:
        """{runs, decisions, handoffs, outbox, notices}: read from the bridge's own Ledger (any thread), under its
        lock so the tables are one moment's. outbox and notices are brain-kit 0d52e97's (QA rounds 3 and 4: every
        message into a run's session, and what the bridge told an MR once); [] with an older brain-kit."""
        out: dict[str, Any] = {k: [] for k in LEDGER_TABLES}
        host = self.host
        if host is None:
            return out
        led = host.ledger
        try:
            with led.lock:
                tables = {r[0] for r in led.db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
                if "runs" in tables:
                    out["runs"] = [dict(r) for r in led.db.execute(
                        "SELECT run_id, project, req, iid, sha, voucher_id, state, slot, path, paths, owner, last_sha, "
                        "created, updated FROM runs ORDER BY created")]
                if "decisions" in tables:
                    out["decisions"] = [dict(r) for r in led.db.execute(
                        "SELECT id, run_id, project, iid, sha, kind, lean_request, state, answer, answerer, voucher_id, "
                        "created, updated FROM decisions ORDER BY created")]
                if "handoffs" in tables:
                    out["handoffs"] = [dict(r) for r in led.db.execute(
                        "SELECT project, iid, sha, state, run_id, voucher_id, reason, created, updated FROM handoffs "
                        "ORDER BY updated")]
                if "outbox" in tables:     # the messages themselves are not read (they are the run's)
                    out["outbox"] = [dict(r) for r in led.db.execute(
                        "SELECT send_id, run_id, slot, what, state, tries, created, updated FROM outbox ORDER BY created")]
                if "notices" in tables:
                    out["notices"] = [dict(r) for r in led.db.execute(
                        "SELECT key, run_id, project, iid, state, count, created, updated FROM notices ORDER BY created")]
        except sqlite3.Error:  # closed by stop() meanwhile
            return {k: [] for k in LEDGER_TABLES}
        return out

    def hook_rows(self) -> list[dict[str, Any]]:
        """The runner's Lean hooks as brain-runnerd checks them before each workspace (brain-kit 0d52e97's
        cli.runner_hook_problems for runnerd.json's kit_dir and agent_spec), as CheckRows; [] with an older brain-kit
        or without runnerd.json."""
        fn = getattr(bk.m("cli"), "runner_hook_problems", None) if bk.ok() else None
        if fn is None or not self.runnerd_cfg:
            return []
        try:
            probs = fn(self.runnerd_cfg.get("kit_dir") or None, self.runnerd_cfg.get("agent_spec") or None)
        except Exception as exc:  # noqa: BLE001 - said on the page, nothing stops
            return [problems.fallback("WARN", str(exc)[:300], todo="看下面的原话")]
        if not probs:
            return [problems.mk("OK", "运行机上 Lean 的拦截没问题：brain-kit 带的 %s是第 %s 版%s" % (
                problems.ADAPTER, getattr(bk.m("cli"), "CREW_HOOK_VERSION", "?"),
                "，brain-run 的三个拦截都对" if self.runnerd_cfg.get("agent_spec") else "（brain-run 的设置没让查）"))]
        return [problems.row("FAIL", str(x)) for x in probs][:20]

    def config_view(self) -> list[dict[str, Any]]:
        """The bridge.json and runnerd.json settings the page shows (TeamConfigRow): each key brain-kit reads, its value
        (or its default, said so) and one plain line. Only these keys: no token, no secret, no path of a key."""
        sec = getattr(bk.m("sign"), "seconds", None) if bk.ok() else None
        rows = []
        for file, cfg, specs in (("bridge.json", self.cfg or {}, BRIDGE_KEYS), ("runnerd.json", self.runnerd_cfg, RUNNERD_KEYS)):
            if cfg is None:
                continue
            for key, default, unit, text in specs:
                raw = cfg.get(key)
                if unit in ("min", "s", "n"):
                    v = sec(raw, None) if sec is not None else (raw if isinstance(raw, (int, float)) and not
                                                                isinstance(raw, bool) and raw > 0 else None)
                    shown = v if v is not None else default
                    value = "%g" % shown if isinstance(shown, (int, float)) else str(shown)
                    value += {"min": " 分钟", "s": " 秒", "n": ""}[unit] if isinstance(shown, (int, float)) else ""
                    is_default = v is None
                else:
                    is_default = not (isinstance(raw, str) and raw.strip())
                    value = str(raw).strip()[:300] if not is_default else str(default)
                rows.append({"file": file, "key": key, "value": value, "default": is_default, "text": text})
        return rows

    def pending(self, window_s: float = PENDING_WINDOW_S) -> list[dict[str, Any]]:
        """Vouchers the bridge asked the signer for in an earlier round and got no answer to (brain-kit's
        pending_vouchers): the next attempt asks for that very voucher again, so a late signature is used. Only those
        still within brain-kit's reuse window (Ledger.pending_voucher's newer_than)."""
        host = self.host
        if host is None:
            return []
        led = host.ledger
        common = bk.m("common")
        since = common.iso(common.utcnow() - timedelta(seconds=window_s))
        out = []
        try:
            with led.lock:
                if not led.db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='pending_vouchers'"
                                      ).fetchone():
                    return []
                rows = led.db.execute("SELECT ref, voucher, created FROM pending_vouchers WHERE created>=? "
                                      "ORDER BY created", (since,)).fetchall()
        except sqlite3.Error:
            return []
        for r in rows:
            try:
                v = json.loads(r["voucher"] or "{}")
            except ValueError:
                v = {}
            v = v if isinstance(v, dict) else {}
            out.append({"ref": str(r["ref"])[:200], "kind": str(v.get("kind") or ""), "run_id": str(v.get("run_id") or ""),
                        "since": r["created"] if isinstance(r["created"], str) else None})
        return out

    def counts(self, rows: dict[str, Any]) -> dict[str, dict[str, int]]:
        out: dict[str, dict[str, int]] = {"runs": {}, "decisions": {}, "handoffs": {}, "outbox": {}}
        for k in out:
            for r in rows.get(k) or []:
                out[k][str(r.get("state"))] = out[k].get(str(r.get("state")), 0) + 1
        return out

    def mr_url(self, project: str, iid: Any) -> str | None:
        base = str(((self.cfg or {}).get("gitlab") or {}).get("base") or "").rstrip("/")
        if not base or not project or not iid:
            return None
        return "%s/%s/-/merge_requests/%d" % (base, project, int(iid))

    def status(self) -> dict[str, Any]:
        sig = self.signer_view()
        return {"enabled": bool(self.team.get("enabled")), "ok": self.host is not None and not self.error,
                "error": self.error, "last_loop_at": self.last_loop_at, "loop_error": self.loop_error,
                "same_user": self.same_user,
                "signer": {"pending": len(sig["pending"]), "refused": len(sig["refused"])}}

    def signer_view(self) -> dict[str, Any]:
        return spool_view(self.spool) if self.host is not None and self.spool else {"pending": [], "refused": []}

    def interval(self) -> float:
        try:
            return max(5.0, float((self.cfg or {}).get("interval") or 60))
        except (TypeError, ValueError):
            return 60.0


def _read_small(path: str) -> Any:
    """JSON of a small regular file, opened without following a symlink or blocking on a FIFO (the agents' OS user can
    put anything into requests/); None otherwise."""
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
    try:
        fd = os.open(path, flags)
    except OSError:
        return None
    try:
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or st.st_size > MAX_SPOOL_FILE:
            return None
        data = os.read(fd, MAX_SPOOL_FILE + 1)
    finally:
        os.close(fd)
    try:
        return json.loads(data.decode("utf-8")) if len(data) <= MAX_SPOOL_FILE else None
    except (ValueError, UnicodeDecodeError):
        return None


def spool_view(spool: str, keep: int = 20) -> dict[str, Any]:
    """The signer spool (brain-kit's SpoolSigner layout) for the page: requests the bridge is waiting on (it takes a
    request back once answered or given up), and the signer's latest refusals with their reasons."""
    pending, refused = [], []
    req_dir, ref_dir = os.path.join(spool, "requests"), os.path.join(spool, "refused")
    for name in sorted(os.listdir(req_dir)) if os.path.isdir(req_dir) else []:
        if not REQ_RE.match(name):
            continue
        r = _read_small(os.path.join(req_dir, name))
        r = r if isinstance(r, dict) else {}
        v = r.get("voucher") if isinstance(r.get("voucher"), dict) else {}
        pending.append({"req_id": name[:-5], "kind": str(r.get("kind") or ""), "run_id": str(v.get("run_id") or ""),
                        "since": r.get("created") if isinstance(r.get("created"), str) else None})
    names = []
    for name in os.listdir(ref_dir) if os.path.isdir(ref_dir) else []:
        try:
            st = os.lstat(os.path.join(ref_dir, name))
        except OSError:
            continue
        if REQ_RE.match(name) and stat.S_ISREG(st.st_mode):
            names.append((st.st_mtime, name))
    for _, name in sorted(names)[-keep:]:
        r = _read_small(os.path.join(ref_dir, name))
        reasons = r.get("reasons") if isinstance(r, dict) and isinstance(r.get("reasons"), list) else []
        refused.append({"req_id": name[:-5], "kind": name.split("-", 1)[0],
                        "reasons": [str(x)[:300] for x in reasons][:10]})
    return {"pending": pending, "refused": refused}


def foreign(path: str) -> bool:
    """*path* and its folder are owned by another OS user and this one cannot write them (the agents run as this
    user: a config they can change is no check at all)."""
    try:
        for p in (path, os.path.dirname(os.path.abspath(path))):
            st = os.stat(p)
            if st.st_uid == os.getuid() or os.access(p, os.W_OK):
                return False
    except OSError:
        return False
    return True


def run_paths(row: dict[str, Any]) -> list[str]:
    try:
        return [p for p in json.loads(row.get("paths") or "[]") if isinstance(p, str)]
    except ValueError:
        return []
