#!/usr/bin/env python3
"""brain-signer: the bridge's signing key, kept away from the Brain app (and from the agents' OS user).

  python3 -I brain_signer.py --config /etc/brain-kit/signer.json once|loop
  python3 -I brain_signer.py --config /etc/brain-kit/signer.json close RUN-PAY-3-1    (a run that will never finish)

Runs as its own OS user (``brainbridge`` in brain-kit's layout), stdlib + brain-kit only, outbound only (GitLab, Jira),
listens on nothing. The Brain app writes signature requests into ``<spool>/requests/`` (spoolsigner.py); this
process re-checks each one against GitLab with brain-kit's own code, signs with ``ssh-keygen -Y`` (brainkit.sign) and
answers in ``<spool>/signed/`` or ``<spool>/refused/``. Nothing in a request is trusted:

hand-over contract  the MR is open and its head is the voucher's sha; ``Bridge.verify`` passes with this signer's own
                    identities, Jira, intake clone and the kit config from the default branch (branch name, label added by
                    the owner, the claim, run.json, the Lean note, the Brain commit, the materials' hashes, no other open
                    run); every fact in the voucher equals what verify found; the run id fits the key; the expiry is
                    within contract_ttl_hours.
answer              the run's contract was signed here; the MR is open and still at the question's sha; park.json at that
                    sha has the voucher's park_hash, is a valid waiting question of the voucher's kind (Lean request,
                    review items); the bridge account posted the question; the first valid ``answer D-n …`` after it is by
                    a person allowed for that kind (this signer's identities + decision_roles from main), has the
                    voucher's choice, rejected items and pseudonym, and no other allowed person answered differently;
                    one answer per question.
both                only the fields this signer knows; voucher_id is the digest; issued within max_clock_skew_s.

What it signs is copied into vouchers_dir (brain-intake) and published there: the signer is that repo's only writer.

config (signer.json):
  {"brainkit": "/opt/brain-kit", "spool": "/srv/brain-signer", "signing_key": "/etc/brain-kit/bridge_ed25519",
   "projects": ["grp/repo"], "gitlab": {"base": "https://gitlab.example", "token_env": "SIGNER_GITLAB_TOKEN",
   "token_file": "~/.brain/signer-gitlab-token"}, "jira": {"base": "", "token_env": "SIGNER_JIRA_TOKEN"},
   "identities": "/srv/brain-authz/identities.json", "intake_dir": "/srv/brain-intake",
   "vouchers_dir": "/srv/brain-intake/vouchers", "publish_vouchers": true, "ledger": "/var/lib/brain-signer/ledger.sqlite",
   "contract_ttl_hours": 72, "pseudonym_salt": "<same as the app's bridge.json>", "bridge_users": ["brain-bridge"],
   "max_clock_skew_s": 600, "interval": 2, "keep_days": 14}
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
from datetime import timedelta

HANDOFF_FIELDS = {"schema", "kind", "run_id", "project", "mr_iid", "sha", "branch", "owner", "key", "intent",
                  "brain_commit", "materials", "route", "issued_at", "expires_at", "issuer", "voucher_id"}
ANSWER_FIELDS = {"schema", "kind", "decision", "run_id", "project", "mr_iid", "sha", "park_hash", "decision_kind",
                 "choice", "answerer", "issued_at", "issuer", "lean_request", "review_items", "rejected_items",
                 "voucher_id"}
OPEN = ("spooled", "ready", "dispatched", "send_unknown", "reissue")
RETRY_S = 10.0
REQ_RE = re.compile(r"^[a-z]+-[A-Za-z0-9-]{1,80}-[0-9a-f]{12}\.json$")
SIGNED_SCHEMA = """
CREATE TABLE IF NOT EXISTS signed_answers (
  run_id TEXT NOT NULL, sha TEXT NOT NULL, park_hash TEXT NOT NULL, decision TEXT NOT NULL, voucher_id TEXT NOT NULL,
  choice TEXT NOT NULL, created TEXT NOT NULL, PRIMARY KEY (run_id, sha, park_hash));
"""


def load_brainkit(path):
    path = os.path.realpath(os.path.expanduser(path or "/opt/brain-kit"))
    if not os.path.isfile(os.path.join(path, "brainkit", "__init__.py")):
        raise SystemExit("brain-signer: no brain-kit at %s" % path)
    sys.path.insert(0, path)
    import brainkit  # noqa: F401


class Refuse(Exception):
    def __init__(self, *reasons):
        super().__init__("; ".join(str(r) for r in reasons))
        self.reasons = [str(r) for r in reasons]


class Signer:
    def __init__(self, cfg, gitlab, jira, out=print):
        from brainkit import sign
        from brainkit.bridge import decisions
        from brainkit.bridge.handoff import BRIDGE_DEFAULTS, Bridge
        from brainkit.config import merged
        self.cfg, self.gl, self.out = cfg, gitlab, out
        self.sign, self.decisions = sign, decisions
        bcfg = merged(BRIDGE_DEFAULTS, {k: cfg[k] for k in (
            "projects", "identities", "ledger", "vouchers_dir", "intake_dir", "publish_vouchers", "pseudonym_salt",
            "contract_ttl_hours", "signing_key") if k in cfg})
        bcfg["spool_dir"] = cfg["spool"]
        self.br = Bridge(bcfg, gitlab, jira, None, out)
        self.db = self.br.ledger.db
        self.db.executescript(SIGNED_SCHEMA)
        self.projects = [p["project"] if isinstance(p, dict) else p for p in cfg.get("projects") or []]
        self.bridge_users = {u.lower() for u in cfg.get("bridge_users") or []}
        self._failed = {}   # req id -> when a check could not be made (GitLab down): tried again after RETRY_S

    # ---------- the spool ----------

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
            if not REQ_RE.match(name) or any(os.path.exists(os.path.join(d[k], name)) for k in ("signed", "refused")):
                continue
            rid = name[:-5]
            if time.time() - self._failed.get(rid, 0) < RETRY_S:
                continue
            try:
                with open(os.path.join(d["requests"], name), encoding="utf-8") as f:
                    req = json.load(f)
            except (OSError, ValueError):
                continue  # half written, or the app took it back
            try:
                v, sig = self.handle(rid, req)
            except Refuse as e:
                self.write(os.path.join(d["refused"], name), {"req_id": rid, "reasons": e.reasons[:10]})
                self.out("refused %s: %s" % (rid, "; ".join(e.reasons)))
            except Exception as e:  # noqa: BLE001 - GitLab down, SSO expired: no answer, so the app tries again
                self._failed[rid] = time.time()
                self.out("could not check %s (no answer written; the app retries): %s" % (rid, str(e).split("\n", 1)[0]))
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
                    if now - os.path.getmtime(p) > keep:
                        os.unlink(p)
                except OSError:
                    pass

    @staticmethod
    def write(path, obj):
        from brainkit.common import write_json
        write_json(path, obj, mode=0o640)

    # ---------- checks ----------

    def handle(self, rid, req):
        v = req.get("voucher") if isinstance(req, dict) else None
        if not isinstance(v, dict):
            raise Refuse("请求里没有凭证")
        want = "%s-%s-%s" % (re.sub(r"[^a-z]", "", str(v.get("kind") or "x")) or "x",
                             re.sub(r"[^A-Za-z0-9-]", "", str(v.get("run_id") or "x"))[:60] or "x",
                             self.sign.digest(v)[:12])
        if rid != want:
            raise Refuse("请求号和凭证对不上")
        if v.get("schema") != 1 or v.get("issuer") != self.sign.PRINCIPAL:
            raise Refuse("凭证的 schema 或 issuer 不对")
        if v.get("project") not in self.projects:
            raise Refuse("项目 %s 不归这个签名服务" % v.get("project"))
        body = {k: x for k, x in v.items() if k != "voucher_id"}
        if v.get("voucher_id") != "V-" + self.sign.digest(body)[:10]:
            raise Refuse("voucher_id 不是凭证的摘要")
        from brainkit.common import parse_iso, utcnow
        try:
            issued = parse_iso(str(v.get("issued_at")))
        except ValueError:
            raise Refuse("issued_at 不是时间")
        skew = float(self.cfg.get("max_clock_skew_s", 600))
        if abs((utcnow() - issued).total_seconds()) > skew:
            raise Refuse("issued_at 和这台机器的时间差太多")
        if v.get("kind") == "handoff":
            self.check_handoff(v, issued)
        elif v.get("kind") == "answer":
            self.check_answer(v)
        else:
            raise Refuse("只签 handoff 和 answer")
        sig = self.sign.sign(v, self.cfg["signing_key"])
        if v["kind"] == "handoff":
            self.record_handoff(v)
        else:
            self.db.execute("INSERT OR REPLACE INTO signed_answers(run_id,sha,park_hash,decision,voucher_id,choice,created)"
                            " VALUES (?,?,?,?,?,?,?)", (v["run_id"], v["sha"], v["park_hash"], v["decision"],
                                                        v["voucher_id"], v["choice"], v["issued_at"]))
        self.write(os.path.join(self.cfg["vouchers_dir"], v["run_id"], v["voucher_id"] + ".json"),
                   {"voucher": v, "sig": sig})
        if self.cfg.get("publish_vouchers"):
            self.br.publish(v["run_id"], v["voucher_id"])
        return v, sig

    def _mr(self, v):
        mr = self.gl.mr(v["project"], int(v["mr_iid"]))
        if (mr or {}).get("state") != "opened":
            raise Refuse("MR !%s 不是打开的" % v["mr_iid"])
        if mr.get("sha") != v["sha"]:
            raise Refuse("MR 的最新提交不是凭证里的 %s" % str(v["sha"])[:12])
        return mr

    def _close_finished(self, key):
        for row in self.db.execute("SELECT * FROM runs WHERE req=? AND state IN (%s)" % ",".join("?" * len(OPEN)),
                                   (key,) + OPEN).fetchall():
            mr = self.gl.mr(row["project"], row["iid"])
            if (mr or {}).get("state") in ("merged", "closed"):
                self.br.ledger.set_run(row["run_id"], row["state"], mr["state"])

    def check_handoff(self, v, issued):
        unknown = set(v) - HANDOFF_FIELDS
        if unknown:
            raise Refuse("凭证里有这个签名服务不认识的字段：%s" % ", ".join(sorted(unknown)))
        key = str(v.get("key") or "")
        if not re.match(r"^RUN-%s-[1-9][0-9]{0,5}$" % re.escape(key), str(v.get("run_id") or "")):
            raise Refuse("run id %s 和需求 %s 对不上" % (v.get("run_id"), key))
        if v.get("route") != "recheck":
            raise Refuse("route 必须是 recheck")
        from brainkit.common import parse_iso
        try:
            ttl = parse_iso(str(v.get("expires_at"))) - issued
        except ValueError:
            raise Refuse("expires_at 不是时间")
        if ttl <= timedelta(0) or ttl > timedelta(hours=float(self.cfg.get("contract_ttl_hours", 72))):
            raise Refuse("合同的有效期超出 contract_ttl_hours")
        mr = self._mr(v)
        kit = self.br.kit(v["project"])
        self._close_finished(key)
        old = self.br.ledger.run(v["run_id"])
        reissue = None
        if old is not None:
            if (old["project"], int(old["iid"]), old["sha"]) != (v["project"], int(v["mr_iid"]), v["sha"]):
                raise Refuse("run id %s 已经签给别的交接了" % v["run_id"])
            if old["state"] not in OPEN:
                raise Refuse("run %s 已经结束（%s）" % (v["run_id"], old["state"]))
            reissue = old["state"]  # the app asked again (it did not get the first answer): it is not "another run"
            self.br.ledger.set_run(v["run_id"], old["state"], "reissue")
        try:
            probs, f = self.br.verify(v["project"], kit, mr)
            if reissue is not None:
                probs = [p for p in probs if "already has an open run" not in p]
            if probs:
                raise Refuse(*probs)
            for k in ("branch", "owner", "key", "intent", "brain_commit", "materials"):
                if f.get(k) != v.get(k):
                    raise Refuse("凭证的 %s 和 GitLab 上的不一样" % k)
        except Refuse:
            if reissue is not None:
                self.br.ledger.set_run(v["run_id"], "reissue", reissue)
            raise
        self._facts = f

    def record_handoff(self, v):
        f = getattr(self, "_facts", {}) or {}
        if self.br.ledger.run(v["run_id"]) is not None:
            self.db.execute("UPDATE runs SET voucher_id=?, voucher=?, state='spooled' WHERE run_id=?",
                            (v["voucher_id"], json.dumps(v, ensure_ascii=False), v["run_id"]))
        else:
            self.br.ledger.add_run(v["run_id"], v["project"], v["key"], int(v["mr_iid"]), v["sha"], v["voucher_id"],
                                   paths=f.get("expected_paths") or [], owner=v["owner"], voucher=v)

    def check_answer(self, v):
        unknown = set(v) - ANSWER_FIELDS
        if unknown:
            raise Refuse("凭证里有这个签名服务不认识的字段：%s" % ", ".join(sorted(unknown)))
        run = self.br.ledger.run(str(v.get("run_id") or ""))
        if run is None:
            raise Refuse("这个签名服务没签过 %s 的接手合同" % v.get("run_id"))
        if run["state"] not in OPEN:
            raise Refuse("run %s 已经结束（%s）" % (v["run_id"], run["state"]))
        if (run["project"], int(run["iid"])) != (v["project"], int(v["mr_iid"])):
            raise Refuse("回答的 MR 不是这个 run 的")
        self._mr(v)
        kit = self.br.kit(v["project"])
        raw = self.gl.file_raw(v["project"], "%s/%s/park.json" % (kit["runs_dir"], run["req"]), v["sha"])
        if raw is None or hashlib.sha256(raw).hexdigest() != v.get("park_hash"):
            raise Refuse("park.json 在 %s 上不是问题发出时的那份" % str(v["sha"])[:12])
        try:
            park = json.loads(raw.decode("utf-8"))
        except ValueError:
            raise Refuse("park.json 不是 JSON")
        probs = self.decisions.validate_park(park)
        if probs:
            raise Refuse(*probs)
        if park.get("status") != "waiting":
            raise Refuse("park.json 不在等回答")
        kind = self.br.effective_kind(park.get("kind"), park.get("lean_request"))
        if kind != v.get("decision_kind"):
            raise Refuse("问题的种类是 %s，不是 %s" % (kind, v.get("decision_kind")))
        if (park.get("lean_request") or None) != (v.get("lean_request") or None):
            raise Refuse("Lean 审批请求和 park.json 的不一样")
        review = [i["id"] for i in park.get("review_items") or [] if isinstance(i, dict) and "id" in i] \
            if kind == "acceptance" else []
        if list(v.get("review_items") or []) != review:
            raise Refuse("待审项和 park.json 的不一样")
        choice = v.get("choice")
        if park.get("lean_request"):
            if choice not in ("approve", "reject"):
                raise Refuse("Lean 审批只能 approve 或 reject")
        elif choice not in {o.get("id") for o in park.get("options") or []}:
            raise Refuse("没有选项 %s" % choice)
        notes = self.gl.mr_notes(v["project"], int(v["mr_iid"]))
        did = str(v.get("decision") or "")
        q = None
        for n in notes:
            author = ((n.get("author") or {}).get("username") or "").lower()
            first = (n.get("body") or "").split("\n", 1)[0]
            if first.startswith("**%s · " % did) and v["run_id"] in first and (author in self.bridge_users):
                q = n
                break
        if q is None:
            raise Refuse("MR 上找不到桥发的 %s（bridge_users 要写桥的 GitLab 账号）" % did)
        allowed = self.br.allowed(kit, kind, run["owner"])
        valid = {}
        items_re = getattr(self.decisions, "ITEMS_RE", None)
        for n in notes:
            nid = int(n.get("id", 0))
            if nid <= int(q.get("id", 0)) or n.get("system"):
                continue
            m = self.decisions.ANSWER_RE.match((n.get("body") or "").split("\n", 1)[0])
            if not m or m.group(1).upper() != did:
                continue
            author = ((n.get("author") or {}).get("username") or "").lower()
            c = m.group(2)
            c = c.lower() if c.lower() in ("approve", "reject") else c.upper()
            if author not in allowed:
                continue
            if park.get("lean_request") and c not in ("approve", "reject"):
                continue
            if not park.get("lean_request") and c not in {o.get("id") for o in park.get("options") or []}:
                continue
            items = ()
            if c == "reject" and review and items_re is not None:
                im = items_re.match(m.group(3) or "")
                if im:
                    listed = [x.upper() for x in re.split(r"[\s,，、]+", im.group(1)) if x]
                    if any(i not in review for i in listed):
                        continue
                    items = tuple(i for i in review if i in listed)
            valid.setdefault(author, (c, items, nid))
        if not valid:
            raise Refuse("MR 上没有可以回答 %s 的人的有效回答" % did)
        if len({(c, items) for c, items, _ in valid.values()}) > 1:
            raise Refuse("%s 收到不同的回答，不签" % did)
        author, (c, items, _) = sorted(valid.items(), key=lambda kv: kv[1][2])[0]
        if c != choice or list(items) != list(v.get("rejected_items") or []):
            raise Refuse("凭证的回答和 MR 上第一条有效回答不一样")
        if self.br.pseudonym(author) != v.get("answerer"):
            raise Refuse("答复人的代号对不上（两边的 pseudonym_salt 要一样）")
        had = self.db.execute("SELECT * FROM signed_answers WHERE run_id=? AND sha=? AND park_hash=?",
                              (v["run_id"], v["sha"], v["park_hash"])).fetchone()
        if had is not None and (had["decision"], had["choice"]) != (did, choice):
            raise Refuse("这个问题已经签过一个回答（%s）" % had["voucher_id"])

    def close(self, run_id):
        row = self.br.ledger.run(run_id)
        if row is None:
            raise SystemExit("brain-signer: no run %s" % run_id)
        self.br.ledger.set_run(run_id, row["state"], "closed")
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
