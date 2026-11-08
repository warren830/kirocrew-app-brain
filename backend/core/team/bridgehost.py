"""Team mode: brain-kit's bridge (poll → dispatch → watch → collect → reconcile) and runnerd, hosted by the app.

What stays brain-kit's: every check (``Bridge.verify``), the contract and answer vouchers, the questions on the MR,
the answers' checks, the admission limits, the ledger, runnerd's workspace. What the app changes:
- sessions: ``kc`` is the app's KiroCrewAdapter (crewadapter.py), not brain-kit's HTTP client;
- signing: brain-kit's ``sign.sign`` (in the app's private copy only) is replaced by SpoolSigner.sign
  (spoolsigner.py): the separate signer re-checks and signs; the app only verifies;
- a refused signature: the hand-over is rejected on the MR with the signer's reasons, an answer is marked ``refused``
  (not retried); a signer that does not answer leaves the hand-over to be checked again next round and the answer
  open again (nothing was signed or sent);
- vouchers: brain-kit writes the app's copy to bridge.json ``vouchers_dir``; ``publish_vouchers`` is forced off
  (brain-intake gets its copy from the signer, its only writer).

bridge.json is brain-kit's format (examples/bridge.json). The app ignores ``signing_key`` (only notes whether this
OS user can read it) and ``kirocrew.base/app/secret_file`` (it talks to its own gateway).
"""

from __future__ import annotations

import concurrent.futures
import json
import os
import sqlite3
import threading
import time
import urllib.parse
from collections import deque
from typing import Any

from .. import bk
from .crewadapter import KiroCrewAdapter
from .spoolsigner import SpoolSigner

REQUIRED = ("identities", "spool_dir", "ledger", "vouchers_dir")


def load_bridge_config(path: str) -> dict[str, Any]:
    H = bk.m("bridge.handoff")
    common = bk.m("common")
    cfg = bk.m("config").merged(H.BRIDGE_DEFAULTS, common.load_json(path))
    missing = [k for k in REQUIRED if not cfg.get(k)]
    if missing:
        raise common.BrainError("bridge.json 缺 %s" % "、".join(missing))
    if not cfg.get("projects"):
        raise common.BrainError("bridge.json 的 projects 是空的")
    cfg["publish_vouchers"] = False
    return cfg


def host_class(Bridge: type) -> type:
    class BridgeHost(Bridge):
        """brain-kit's Bridge with the app's sessions and the out-of-process signer."""

        signer: SpoolSigner

        def _process(self, project, kit, mr, iid, sha, key, adder, *rest, **kw):  # noqa: ANN001
            try:
                return super()._process(project, kit, mr, iid, sha, key, adder, *rest, **kw)
            except self.signer.Refused as exc:
                why = str(exc)[:1500]
                self.ledger.set_handoff(project, iid, key, "checking", "rejected", reason=why)
                self.gl.comment(project, iid, "AI 接手被拒（%s）：\n- %s\n\n交接的检查都过了，但签名服务没有签这份合同。"
                                "请负责人看一下签名服务的记录；改好后重新推送，再打一次标签 `%s`。"
                                % (sha[:12], why, kit["handoff_label"]))
                self.gl.edit_labels(project, iid, add=[kit["rejected_label"]], remove=[kit["handoff_label"]])
                self.out("signer refused %s!%s: %s" % (project, iid, why))
                return "rejected"

        def deliver(self, d, row, author, choice, note, *rest, **kw):  # noqa: ANN001
            try:
                return super().deliver(d, row, author, choice, note, *rest, **kw)
            except self.signer.Unavailable as exc:
                # nothing was signed or sent: the answer is open again and is looked at next round
                self.ledger.db.execute("UPDATE decisions SET state='open', answer=NULL, answerer=NULL, updated=? "
                                       "WHERE id=? AND state='answered' AND voucher_id IS NULL",
                                       (bk.m("common").iso(bk.m("common").utcnow()), d["id"]))
                self.out("%s: signer unavailable, answer stays open: %s" % (d["id"], exc))
                return False
            except self.signer.Refused as exc:
                self.ledger.db.execute("UPDATE decisions SET state='refused', updated=? WHERE id=? AND state='answered'",
                                       (bk.m("common").iso(bk.m("common").utcnow()), d["id"]))
                self.gl.comment(d["project"], d["iid"], "%s 的回答没有送回 run：签名服务不签（%s）。请负责人看一下签名服务的记录。"
                                % (d["id"], str(exc)[:500]))
                self.out("%s: signer refused the answer: %s" % (d["id"], exc))
                return False

    return BridgeHost


class TeamRuntime:
    """The hosted bridge + runnerd of one enable of the app. ``start`` installs the spool signer into the private
    brain-kit copy; ``loop_once`` runs one round. Both run on the runtime's own single worker thread (``executor``):
    brain-kit's ledger is a sqlite connection, usable only in the thread that opened it."""

    def __init__(self, team: dict[str, Any], loop: Any, mgr: Any, log: Any, *, transport: Any = None,
                 kick: Any = None, sign_timeout: float = 30.0, scrub: Any = None) -> None:
        self.team, self.loop, self.mgr, self.log = team, loop, mgr, log
        self.scrub = scrub or (lambda s: s)
        self.transport, self.kick, self.sign_timeout = transport, kick, sign_timeout
        self.host: Any = None
        self.cfg: dict[str, Any] = {}
        self.runnerd_cfg: dict[str, Any] | None = None
        self.error = ""
        self.loop_error = ""
        self.last_loop_at: float | None = None
        self.last_summary: dict[str, int] = {}
        self.lines: deque = deque(maxlen=200)
        self._orig_sign = None
        self._lock = threading.Lock()
        self.key_readable = False
        self.executor = concurrent.futures.ThreadPoolExecutor(max_workers=1, thread_name_prefix="brain-bridge")

    # ---- setup ---------------------------------------------------------------------------------------- #

    def start(self) -> bool:
        common = bk.m("common")
        try:
            cfg = load_bridge_config(self.team["bridge_config"])
            key = str(cfg.get("signing_key") or "")
            self.key_readable = bool(key) and os.access(os.path.expanduser(key), os.R_OK)
            if self.key_readable and not self.team.get("dev_same_user"):
                raise common.BrainError("这个 app 的系统用户能读到签名私钥 %s：私钥必须只给签名服务的用户。本机试用请在设置里打开"
                                        "「签名服务和 app 同一个用户」" % key)
            if not os.path.isfile(self.team["allowed_signers"]):
                raise common.BrainError("找不到 allowed_signers：%s" % self.team["allowed_signers"])
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
            signer = SpoolSigner(self.team["signer_spool"], self.team["allowed_signers"], brain_error=common.BrainError,
                                 verify=sign.verify, digest=sign.digest, timeout=self.sign_timeout, kick=self.kick)
            Host = host_class(bk.m("bridge.handoff").Bridge)
            Host.signer = signer
            kc = KiroCrewAdapter(self.loop, self.mgr, common.BrainError)
            self.host = Host(cfg, gl, jira, kc, out=self._out)
            self.cfg, self.runnerd_cfg = cfg, rcfg
            if self._orig_sign is None:
                self._orig_sign = sign.sign
            sign.sign = signer.sign  # the app's private brain-kit copy only (bk.PKG)
            self.error = ""
            return True
        except Exception as exc:  # noqa: BLE001
            self.error = str(exc).split("\n", 1)[0][:400]
            self.host = None
            return False

    def stop(self) -> None:
        """Close the ledger on its own thread, give brain-kit its signing function back."""
        try:
            self.executor.submit(self._close).result(timeout=30)
        except Exception:  # noqa: BLE001
            pass
        self.executor.shutdown(wait=False)

    def _close(self) -> None:
        if self._orig_sign is not None:
            try:
                bk.m("sign").sign = self._orig_sign
            except Exception:  # noqa: BLE001
                pass
            self._orig_sign = None
        if self.host is not None:
            try:
                self.host.ledger.db.close()
            except Exception:  # noqa: BLE001
                pass
        self.host = None

    def _out(self, line: str) -> None:
        text = self.scrub(str(line)[:500])
        self.lines.append((time.time(), text))
        if self.log is not None:
            self.log.info("brain bridge: %s", text)

    # ---- one round ------------------------------------------------------------------------------------ #

    def loop_once(self) -> dict[str, int]:
        """poll, runnerd, dispatch, watch, collect, reconcile; one bad step does not stop the others."""
        if self.host is None:
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
                    n = getattr(self.host, step)()
                    if isinstance(n, int):
                        summary[step] = n
                except (common.BrainError, OSError, ValueError, sqlite3.Error) as exc:
                    errors.append("%s: %s" % (step, str(exc).split("\n", 1)[0][:200]))
                    self._out("%s failed this round: %s" % (step, exc))
            self.last_loop_at = time.time()
            self.loop_error = "；".join(errors)
            self.last_summary = summary
        return summary

    # ---- what the page reads -------------------------------------------------------------------------- #

    def _db(self) -> sqlite3.Connection | None:
        path = self.cfg.get("ledger") if self.cfg else None
        if not path or not os.path.exists(path):
            return None
        db = sqlite3.connect("file:%s?mode=ro" % urllib.parse.quote(os.path.abspath(path)), uri=True)
        db.row_factory = sqlite3.Row
        return db

    def ledger(self) -> dict[str, Any]:
        """{runs: [...], decisions: [...], handoffs: [...]} read only."""
        out: dict[str, Any] = {"runs": [], "decisions": [], "handoffs": []}
        db = self._db()
        if db is None:
            return out
        try:
            tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if "runs" in tables:
                out["runs"] = [dict(r) for r in db.execute(
                    "SELECT run_id, project, req, iid, sha, voucher_id, state, slot, path, paths, owner, created, updated "
                    "FROM runs ORDER BY created")]
            if "decisions" in tables:
                out["decisions"] = [dict(r) for r in db.execute(
                    "SELECT id, run_id, project, iid, sha, kind, lean_request, state, answer, answerer, voucher_id, "
                    "created, updated FROM decisions ORDER BY created")]
            if "handoffs" in tables:
                out["handoffs"] = [dict(r) for r in db.execute(
                    "SELECT project, iid, sha, state, run_id, voucher_id, reason, created, updated FROM handoffs "
                    "ORDER BY updated")]
        finally:
            db.close()
        return out

    def counts(self, rows: dict[str, Any]) -> dict[str, dict[str, int]]:
        out: dict[str, dict[str, int]] = {"runs": {}, "decisions": {}, "handoffs": {}}
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
        sig = self.host.signer.status() if self.host is not None else {"pending": [], "refused": []}
        return {"enabled": bool(self.team.get("enabled")), "ok": self.host is not None and not self.error,
                "error": self.error, "last_loop_at": self.last_loop_at, "loop_error": self.loop_error,
                "key_readable": self.key_readable,
                "signer": {"pending": len(sig["pending"]), "refused": len(sig["refused"])}}

    def signer_view(self) -> dict[str, Any]:
        return self.host.signer.status() if self.host is not None else {"pending": [], "refused": []}

    def interval(self) -> float:
        try:
            return max(5.0, float((self.cfg or {}).get("interval") or 60))
        except (TypeError, ValueError):
            return 60.0


def run_paths(row: dict[str, Any]) -> list[str]:
    try:
        return [p for p in json.loads(row.get("paths") or "[]") if isinstance(p, str)]
    except ValueError:
        return []
