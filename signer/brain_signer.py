#!/usr/bin/env python3
"""brain-signer: the bridge's signing key, kept away from the Brain app (and from the agents' OS user).

  python3 -I brain_signer.py --config /etc/brain-kit/signer.json once|loop
  python3 -I brain_signer.py --config /etc/brain-kit/signer.json close RUN-PAY-3-1    (a run that will never finish)

Runs as its own OS user (``brainbridge`` in brain-kit's layout), stdlib + brain-kit only, outbound only (GitLab, Jira),
listens on nothing. It is the other end of brain-kit's ``sign.SpoolSigner``: the bridge the app hosts (bridge.json
``"signer": {"type": "spool", ...}``, no key) writes ``<spool>/requests/<req>.json`` ({schema 1, req_id, kind, created,
voucher}); this process checks each request again against GitLab, signs it with the key (``sign.KeySigner``) and
answers in ``<spool>/signed/<req>.json`` ({req_id, voucher, sig}) or ``<spool>/refused/<req>.json`` ({req_id, reasons}).
A check it cannot make (GitLab down, more notes than brain-kit reads) gets no answer: the SpoolSigner gives up after its
timeout and the bridge asks again next round. Nothing in a request is trusted.

The rules are brain-kit's own, run with this signer's identities, ledger, GitLab token and Jira, and the kit config
read from the default branch (never anything from the app):
hand-over  ``Bridge.verify`` for the MR as GitLab shows it now: branch, the label added by the owner after GitLab
           recorded the head as pushed (MR versions), claim, run.json, the Lean note, the Brain commit, materials, no
           other open run.
answer     ``decisions.check_answer`` on the MR alone (no question id or round cursor from the app): the question is the
           unedited text the bridge posts for park.json at that commit, by kit.json ``bridge_user``, posted after GitLab
           recorded the push, its D-n bound to nothing else; the first valid reply after it (or after the bridge's last
           conflict note) is by a person allowed for that kind (decision_roles from main, this signer's roles; never a
           bot or the bridge account); no other allowed person answered differently; the MR head has not moved.
What this signer adds, because brain-kit cannot know it or does not offer it:
- the voucher is rebuilt from what those checks found and must be the one asked for, byte for byte (canonical JSON).
  brain-kit has no public voucher builder, so ``handoff_voucher`` / ``answer_voucher`` below copy the layout of
  ``Bridge._process`` and ``DecisionLoop.deliver``: a field brain-kit adds is refused until they are updated;
- the projects it serves; ``issued_at`` within max_clock_skew_s; a contract's expiry within contract_ttl_hours;
- an answer only for a run whose contract this signer signed, still open, on that MR, with that run's owner;
- in its own ledger: one answer per question (run, commit, park.json) and a D-n never bound to a second question.
  check_answer sees the MR as it is now, and whoever holds the bridge account's token (the agents' OS user can read
  the app's bridge.json) can delete the bridge's notes: what was signed is remembered here;
- a contract asked for again by the app (it did not get the first answer) is signed again for the same MR and commit.

What it signs is copied into vouchers_dir (brain-intake) and published there: the signer is that repo's only writer.

config (signer.json):
  {"brainkit": "/opt/brain-kit", "spool": "/srv/brain-signer", "signing_key": "/etc/brain-kit/bridge_ed25519",
   "projects": ["grp/repo"], "gitlab": {"base": "https://gitlab.example", "token_env": "SIGNER_GITLAB_TOKEN",
   "token_file": "~/.brain/signer-gitlab-token"}, "jira": {"base": "", "token_env": "SIGNER_JIRA_TOKEN"},
   "identities": "/srv/brain-authz/identities.json", "intake_dir": "/srv/brain-intake",
   "vouchers_dir": "/srv/brain-intake/vouchers", "publish_vouchers": true, "ledger": "/var/lib/brain-signer/ledger.sqlite",
   "contract_ttl_hours": 72, "pseudonym_salt": "<same as the app's bridge.json>", "bridge_users": ["brain-bridge"],
   "max_clock_skew_s": 600, "interval": 2, "keep_days": 14}
  bridge_users is optional: when set, kit.json's bridge_user must be one of them (a pin against a changed main).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import stat
import sys
import time
from datetime import timedelta

RETRY_S = 10.0
REQ_RE = re.compile(r"^[a-z]+-[A-Za-z0-9-]{1,80}-[0-9a-f]{12}\.json$")
MAX_REQUEST = 64 * 1024   # brain-kit's sign.MAX_SPOOL_FILE
SIGNED_SCHEMA = """
CREATE TABLE IF NOT EXISTS signed_answers (
  run_id TEXT NOT NULL, sha TEXT NOT NULL, park_hash TEXT NOT NULL, decision TEXT NOT NULL, voucher_id TEXT NOT NULL,
  choice TEXT NOT NULL, created TEXT NOT NULL, PRIMARY KEY (run_id, sha, park_hash));
CREATE TABLE IF NOT EXISTS bound_decisions (
  run_id TEXT NOT NULL, decision TEXT NOT NULL, sha TEXT NOT NULL, park_hash TEXT NOT NULL,
  PRIMARY KEY (run_id, decision));
"""
VERDICT = {"none": "MR 上没有可以回答 %s 的人的有效回答", "conflict": "%s 收到不同的回答，不签",
           "stale": "%s 作废：问题发出后分支又有了新推送", "void": "%s 作废：问题没有绑在这次推送和 park.json 上"}


def is_int(x):
    return type(x) is int


def is_str(x, n=500):
    return isinstance(x, str) and 0 < len(x) <= n and "\n" not in x and "\r" not in x


def read_request(path):
    """A request file: a regular file of at most MAX_REQUEST bytes, opened without following a symlink or blocking
    on a FIFO (anyone with the app's OS user can put anything into requests/). None when it is not one."""
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
    try:
        fd = os.open(path, flags)
    except OSError:
        return None
    try:
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or st.st_size > MAX_REQUEST:
            return None
        data = os.read(fd, MAX_REQUEST + 1)
    finally:
        os.close(fd)
    if len(data) > MAX_REQUEST:
        return None
    try:
        return json.loads(data.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return None


def load_brainkit(path):
    path = os.path.realpath(os.path.expanduser(path or "/opt/brain-kit"))
    if not os.path.isfile(os.path.join(path, "brainkit", "__init__.py")):
        raise SystemExit("brain-signer: no brain-kit at %s" % path)
    sys.path.insert(0, path)
    import brainkit  # noqa: F401
    from brainkit import sign
    from brainkit.bridge import decisions
    if not (hasattr(decisions, "check_answer") and hasattr(sign, "SpoolSigner")):
        raise SystemExit("brain-signer: brain-kit at %s is too old (needs decisions.check_answer and sign.SpoolSigner)"
                         % path)


class Refuse(Exception):
    def __init__(self, *reasons):
        self.reasons = [" ".join(str(r).split())[:300] for r in reasons] or ["没写原因"]
        super().__init__("; ".join(self.reasons))


def handoff_voucher(v, mr, facts, principal):
    """The contract brain-kit's Bridge._process signs for this MR and these verified facts (run id and times from
    the request)."""
    return {"schema": 1, "kind": "handoff", "run_id": v["run_id"], "project": v["project"], "mr_iid": int(mr["iid"]),
            "sha": mr["sha"], "branch": facts["branch"], "owner": facts["owner"], "key": facts["key"],
            "intent": facts["intent"], "brain_commit": facts["brain_commit"], "materials": facts["materials"],
            "route": "recheck", "issued_at": v["issued_at"], "expires_at": v["expires_at"], "issuer": principal}


def answer_voucher(v, run, verdict, answerer, principal):
    """The answer voucher brain-kit's DecisionLoop.deliver signs for what check_answer found (the decision, commit and
    park.json it is bound to, and the time, from the request)."""
    out = {"schema": 1, "kind": "answer", "decision": v["decision"], "run_id": v["run_id"], "project": run["project"],
           "mr_iid": int(run["iid"]), "sha": v["sha"], "park_hash": v["park_hash"], "decision_kind": verdict.kind,
           "choice": verdict.choice, "answerer": answerer, "issued_at": v["issued_at"], "issuer": principal}
    if v.get("lean_request"):                       # check_answer: it is park.json's
        out["lean_request"] = v["lean_request"]
    if verdict.review:
        out["review_items"] = list(verdict.review)
    if verdict.items:
        out["rejected_items"] = list(verdict.items)
    return out


class Signer:
    def __init__(self, cfg, gitlab, jira, out=print):
        from brainkit import common, rest, sign
        from brainkit.bridge import decisions
        from brainkit.bridge.handoff import BRIDGE_DEFAULTS, Bridge
        from brainkit.bridge.ledger import OPEN_RUN_STATES
        from brainkit.config import merged
        self.cfg, self.gl, self.out = cfg, gitlab, out
        self.common, self.rest, self.sign, self.decisions = common, rest, sign, decisions
        self.key = sign.KeySigner(cfg["signing_key"])
        bcfg = merged(BRIDGE_DEFAULTS, {k: cfg[k] for k in (
            "projects", "identities", "ledger", "vouchers_dir", "intake_dir", "publish_vouchers", "pseudonym_salt",
            "contract_ttl_hours", "signing_key") if k in cfg})
        bcfg["spool_dir"] = cfg["spool"]
        self.br = Bridge(bcfg, gitlab, jira, None, out, signer=self.key)
        self.ledger = self.br.ledger            # brain-kit's Ledger: any thread may use it; .lock for several steps
        with self.ledger.lock:
            self.ledger.db.executescript(SIGNED_SCHEMA)
            if "answer" not in {r[1] for r in self.ledger.db.execute("PRAGMA table_info(signed_answers)")}:
                try:
                    self.ledger.db.execute("ALTER TABLE signed_answers ADD COLUMN answer TEXT")
                except sqlite3.OperationalError:
                    pass
        self.open_states = tuple(OPEN_RUN_STATES) + ("reissue",)
        self.projects = [p["project"] if isinstance(p, dict) else p for p in cfg.get("projects") or []]
        self.bridge_users = {str(u).lower() for u in cfg.get("bridge_users") or []}
        self._failed = {}   # req id -> when a check could not be made (GitLab down): tried again after RETRY_S

    # ---------- the spool (brain-kit's SpoolSigner on the other side) ----------

    def dirs(self):
        return {k: os.path.join(self.cfg["spool"], k) for k in ("requests", "signed", "refused")}

    def once(self):
        d = self.dirs()
        for k in ("signed", "refused"):
            os.makedirs(d[k], exist_ok=True)
        if not os.path.isdir(d["requests"]):
            return 0
        done = 0
        for name in sorted(os.listdir(d["requests"])):
            if not REQ_RE.match(name) or any(os.path.lexists(os.path.join(d[k], name)) for k in ("signed", "refused")):
                continue
            rid = name[:-5]
            if time.time() - self._failed.get(rid, 0) < RETRY_S:
                continue
            req = read_request(os.path.join(d["requests"], name))
            if req is None:
                continue  # taken back, or not a plain small JSON file
            try:
                v, sig = self.handle(rid, req)
            except Refuse as e:
                self.write(os.path.join(d["refused"], name), {"req_id": rid, "reasons": e.reasons[:10]})
                self.out("refused %s: %s" % (rid, "; ".join(e.reasons)))
            except Exception as e:  # noqa: BLE001 - GitLab down, SSO expired: no answer, so the bridge asks again
                self._failed[rid] = time.time()
                self.out("could not check %s (no answer written; the bridge asks again): %s"
                         % (rid, str(e).split("\n", 1)[0]))
                continue
            else:
                self.write(os.path.join(d["signed"], name), {"req_id": rid, "voucher": v, "sig": sig})
                self.out("signed %s %s" % (v["kind"], v["voucher_id"]))
            done += 1
        self.clean()
        return done

    def clean(self):
        keep = float(self.cfg.get("keep_days", 14)) * 86400
        now = time.time()
        for k in ("signed", "refused"):
            d = self.dirs()[k]
            for name in os.listdir(d) if os.path.isdir(d) else []:
                p = os.path.join(d, name)
                try:
                    if now - os.lstat(p).st_mtime > keep:
                        os.unlink(p)
                except OSError:
                    pass

    def write(self, path, obj):
        self.common.write_json(path, obj, mode=0o640)

    # ---------- checks ----------

    def when(self, v, k):
        """A time as brain-kit writes it (2026-11-09T01:00:00Z), nothing else."""
        try:
            t = self.common.parse_iso(str(v.get(k)))
        except ValueError:
            raise Refuse("%s 不是时间" % k)
        if self.common.iso(t) != v.get(k):
            raise Refuse("%s 不是 brain-kit 写的时间格式" % k)
        return t

    def handle(self, rid, req):
        sign = self.sign
        if not isinstance(req, dict) or not is_int(req.get("schema")) or req["schema"] != 1 \
                or req.get("req_id") != rid:
            raise Refuse("请求不是 brain-kit SpoolSigner 的格式（schema 1，req_id 是文件名）")
        v = req.get("voucher")
        if not isinstance(v, dict):
            raise Refuse("请求里没有凭证")
        if sign.SpoolSigner.req_id(v) != rid or req.get("kind") != v.get("kind"):
            raise Refuse("请求号和凭证对不上")
        if not is_int(v.get("schema")) or v["schema"] != 1 or v.get("issuer") != sign.PRINCIPAL:
            raise Refuse("凭证的 schema 或 issuer 不对")
        if not is_int(v.get("mr_iid")) or v["mr_iid"] <= 0:
            raise Refuse("mr_iid 要是正整数")
        for k in ("run_id", "project", "sha", "issued_at"):
            if not is_str(v.get(k), 200):
                raise Refuse("%s 要是一行字" % k)
        if not re.match(r"^%s$" % self.decisions.RUN_ID, v["run_id"]):
            raise Refuse("run_id 不是 RUN-<需求号>-<n>")
        if not self.common.SHA_RE.match(v["sha"]):
            raise Refuse("sha 要是 40 位提交号")
        if v["project"] not in self.projects:
            raise Refuse("项目 %s 不归这个签名服务" % v["project"])
        if v.get("voucher_id") != "V-" + sign.digest({k: x for k, x in v.items() if k != "voucher_id"})[:10]:
            raise Refuse("voucher_id 不是凭证的摘要")
        issued = self.when(v, "issued_at")
        if abs((self.common.utcnow() - issued).total_seconds()) > float(self.cfg.get("max_clock_skew_s", 600)):
            raise Refuse("issued_at 和这台机器的时间差太多")
        if v.get("kind") == "handoff":
            sig = self.handoff(v, issued)
        elif v.get("kind") == "answer":
            sig = self.answer(v)
        else:
            raise Refuse("只签 handoff 和 answer")
        self.write(os.path.join(self.cfg["vouchers_dir"], v["run_id"], v["voucher_id"] + ".json"),
                   {"voucher": v, "sig": sig})
        if self.cfg.get("publish_vouchers"):
            self.br.publish(v["run_id"], v["voucher_id"])
        return v, sig

    def same(self, v, want):
        """The voucher asked for is exactly the one rebuilt from GitLab (canonical bytes: types count too)."""
        want = dict(want, voucher_id="V-" + self.sign.digest(want)[:10])
        if self.sign.digest(v) == self.sign.digest(want):
            return
        c = self.common.canonical
        keys = sorted(k for k in set(v) | set(want) if k not in v or k not in want or c(v[k]) != c(want[k]))
        shown = [k for k in keys if k != "voucher_id"] or keys
        raise Refuse("凭证和签名服务按 GitLab 重建的不一样：%s%s" % (
            "、".join(shown), "（answerer 不同：两边的 pseudonym_salt 要一样）" if "answerer" in keys else ""))

    def _mr(self, v):
        mr = self.gl.mr(v["project"], int(v["mr_iid"]))
        if (mr or {}).get("state") != "opened":
            raise Refuse("MR !%s 不是打开的" % v["mr_iid"])
        if mr.get("sha") != v["sha"]:
            raise Refuse("MR 的最新提交不是凭证里的 %s" % str(v["sha"])[:12])
        return mr

    def _close_finished(self, key):
        """This requirement's runs whose MR was merged or closed are closed here too (else a new hand-over of it would
        find an open run)."""
        for row in self.ledger.runs_in(*self.open_states):
            if row["req"] != key:
                continue
            mr = self.gl.mr(row["project"], row["iid"])
            if (mr or {}).get("state") in ("merged", "closed"):
                self.ledger.set_run(row["run_id"], row["state"], mr["state"])

    def handoff(self, v, issued):
        for k in ("key", "expires_at"):
            if not is_str(v.get(k), 200):
                raise Refuse("%s 要是一行字" % k)
        if not self.common.JIRA_RE.match(v["key"]) or \
                not re.match(r"^RUN-%s-[1-9][0-9]{0,5}$" % re.escape(v["key"]), v["run_id"]):
            raise Refuse("run id %s 和需求 %s 对不上" % (v["run_id"], v["key"]))
        ttl = self.when(v, "expires_at") - issued
        if ttl <= timedelta(0) or ttl > timedelta(hours=float(self.cfg.get("contract_ttl_hours", 72))):
            raise Refuse("合同的有效期超出 contract_ttl_hours")
        mr = self._mr(v)
        kit = self.br.kit(v["project"])
        self._close_finished(v["key"])
        led = self.ledger
        with led.lock:
            old = led.run(v["run_id"])
            reissue = None
            if old is not None:
                if (old["project"], int(old["iid"]), old["sha"]) != (v["project"], v["mr_iid"], v["sha"]):
                    raise Refuse("run id %s 已经签给别的交接了" % v["run_id"])
                if old["state"] not in self.open_states:
                    raise Refuse("run %s 已经结束（%s）" % (v["run_id"], old["state"]))
                # the app asked again (it did not get the first answer): not "another open run" (reissue is not an
                # open state for Bridge.verify)
                reissue = old["state"]
                led.set_run(v["run_id"], old["state"], "reissue")
        try:
            probs, facts = self.br.verify(v["project"], kit, mr)
            if probs:
                raise Refuse(*probs)
            self.same(v, handoff_voucher(v, mr, facts, self.sign.PRINCIPAL))
            sig = self.key.sign(v)
            with led.lock:
                if reissue is not None:
                    led.db.execute("UPDATE runs SET voucher_id=?, voucher=?, state=? WHERE run_id=?",
                                   (v["voucher_id"], json.dumps(v, ensure_ascii=False), reissue, v["run_id"]))
                else:
                    led.add_run(v["run_id"], v["project"], v["key"], v["mr_iid"], v["sha"], v["voucher_id"],
                                paths=facts.get("expected_paths") or [], owner=v["owner"], voucher=v)
            return sig
        except BaseException:
            if reissue is not None:  # whatever went wrong, the earlier contract stays open (never "reissue")
                led.set_run(v["run_id"], "reissue", reissue)
            raise

    def answer(self, v):
        for k in ("decision", "park_hash", "decision_kind", "choice", "answerer"):
            if not is_str(v.get(k), 100):
                raise Refuse("%s 要是一行字" % k)
        if not self.decisions.DECISION_ID_RE.match(v["decision"]):
            raise Refuse("decision 不是 D-<n>")
        led = self.ledger
        run = led.run(v["run_id"])
        if run is None:
            raise Refuse("这个签名服务没签过 %s 的接手合同" % v["run_id"])
        if run["state"] not in self.open_states:
            raise Refuse("run %s 已经结束（%s）" % (v["run_id"], run["state"]))
        if (run["project"], int(run["iid"])) != (v["project"], v["mr_iid"]):
            raise Refuse("回答的 MR 不是这个 run 的")
        mr = self._mr(v)
        project, iid, did = v["project"], v["mr_iid"], v["decision"]
        kit = self.br.kit(project)
        bridge = str(kit.get("bridge_user") or "").lower()
        if not bridge:
            raise Refuse("默认分支的 .brain/kit.json 没写 bridge_user：分不出哪些评论是桥发的，不签回答")
        if self.bridge_users and bridge not in self.bridge_users:
            raise Refuse("kit.json 的 bridge_user %s 不在这个签名服务的 bridge_users 里" % bridge)
        raw = self.gl.file_raw(project, "%s/%s/park.json" % (kit["runs_dir"], run["req"]), v["sha"])
        pushed = self.rest.head_pushed_at(self.gl.mr_versions(project, iid), v["sha"])
        notes = self.gl.mr_notes(project, iid)               # all of them, or an error (a flood is not decided)
        got = self.decisions.check_answer(
            {"id": did, "run_id": v["run_id"], "sha": v["sha"], "park_hash": v["park_hash"],
             "kind": v["decision_kind"], "lean_request": v.get("lean_request")},
            raw, notes, kit, self.br.roles, run["owner"], mr["sha"], pushed)
        if not got.ok:
            raise Refuse(VERDICT.get(got.status, "%s 不签") % did + ("（%s）" % got.reason if got.reason else ""))
        self.same(v, answer_voucher(v, run, got, self.br.pseudonym(got.author), self.sign.PRINCIPAL))
        answer = json.dumps({"decision": did, "choice": got.choice, "rejected": list(got.items),
                             "answerer": v["answerer"]}, sort_keys=True)
        with led.lock:   # read what was signed, sign, record: one step
            bound = led.db.execute("SELECT * FROM bound_decisions WHERE run_id=? AND decision=?",
                                   (v["run_id"], did)).fetchone()
            if bound is not None and (bound["sha"], bound["park_hash"]) != (v["sha"], v["park_hash"]):
                raise Refuse("%s 已经是另一个问题（%s）的号了" % (did, bound["sha"][:12]))
            had = led.db.execute("SELECT * FROM signed_answers WHERE run_id=? AND sha=? AND park_hash=?",
                                 (v["run_id"], v["sha"], v["park_hash"])).fetchone()
            if had is not None and (had["decision"] != did or (had["answer"] or None) not in (None, answer)
                                    or had["choice"] != got.choice):
                raise Refuse("这个问题已经签过另一个回答（%s）" % had["voucher_id"])
            sig = self.key.sign(v)
            led.db.execute("INSERT OR IGNORE INTO bound_decisions(run_id,decision,sha,park_hash) VALUES (?,?,?,?)",
                           (v["run_id"], did, v["sha"], v["park_hash"]))
            led.db.execute("INSERT OR REPLACE INTO signed_answers(run_id,sha,park_hash,decision,voucher_id,choice,"
                           "created,answer) VALUES (?,?,?,?,?,?,?,?)", (v["run_id"], v["sha"], v["park_hash"], did,
                                                                         v["voucher_id"], got.choice, v["issued_at"],
                                                                         answer))
        return sig

    def close(self, run_id):
        row = self.ledger.run(run_id)
        if row is None:
            raise SystemExit("brain-signer: no run %s" % run_id)
        self.ledger.set_run(run_id, row["state"], "closed")
        print("closed %s (was %s)" % (run_id, row["state"]))


def build(cfg, transport=None):
    from brainkit.rest import DEFAULT_TOKEN_FILE, GitLab, Jira, read_token
    g = cfg.get("gitlab") or {}
    tok = read_token(g.get("token_env", "SIGNER_GITLAB_TOKEN"), default_file=g.get("token_file", DEFAULT_TOKEN_FILE))
    if not g.get("base") or not tok:
        raise SystemExit("brain-signer: gitlab.base or the GitLab token is missing")
    gl = GitLab(g["base"], tok, transport)
    jc = cfg.get("jira") or {}
    jira = Jira(jc["base"], os.environ.get(jc.get("token_env", "SIGNER_JIRA_TOKEN"), ""), jc.get("api", "2"), transport,
                basic_user=os.environ.get(jc.get("user_env", ""), "") or None) if jc.get("base") else None
    return Signer(cfg, gl, jira)


def main(argv=None):
    ap = argparse.ArgumentParser(prog="brain-signer")
    ap.add_argument("--config", required=True)
    ap.add_argument("cmd", choices=("once", "loop", "close"))
    ap.add_argument("run_id", nargs="?")
    a = ap.parse_args(argv)
    with open(a.config, encoding="utf-8") as f:
        cfg = json.load(f)
    for k in ("spool", "signing_key", "identities", "ledger", "vouchers_dir", "projects"):
        if not cfg.get(k):
            raise SystemExit("brain-signer: config %s is required" % k)
    load_brainkit(cfg.get("brainkit"))
    s = build(cfg)
    if a.cmd == "close":
        s.close(a.run_id or "")
        return 0
    while True:
        s.once()
        if a.cmd == "once":
            return 0
        time.sleep(float(cfg.get("interval", 2)))


if __name__ == "__main__":
    sys.exit(main())
