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

The rules are brain-kit's own (commit 9935b11 or newer), run with this signer's identities, ledger, GitLab token and
Jira, and the kit config read from the default branch (never anything from the app):
hand-over  ``Bridge.verify`` for the MR as GitLab shows it now: branch, the label added by the owner after GitLab
           recorded the head as pushed (MR versions), the head is the hand-over commit itself (one parent, and it
           changes run.json: what ``brain handoff`` commits; a commit pushed on top of it was not handed over), claim,
           run.json, the Lean note, the Brain commit, materials, no other open run.
answer     ``decisions.check_answer`` on the MR, bound to the question note the voucher names (``question_note``: the
           note id brain-kit's ledger recorded when the bridge posted it; a voucher without one is refused). That note
           is on the MR (deleted: the decision is void), by kit.json ``bridge_user``, the unedited text the bridge
           posts for park.json at that commit, posted after GitLab recorded the push, its D-n bound to nothing else;
           the first valid reply after it (or after the bridge's last conflict note) is by a person allowed for that
           kind (decision_roles from main, this signer's roles; never a bot or the bridge account) and was never
           edited (updated_at after created_at); no other allowed person answered differently; the MR head has not
           moved. A question without options is answered approve / reject; a batch review's item list is whole.
What this signer adds, because brain-kit cannot know it or does not offer it:
- the voucher is rebuilt from what those checks found and must be the one asked for, byte for byte (canonical JSON).
  brain-kit has no public voucher builder, so ``handoff_voucher`` / ``answer_voucher`` below copy the layout of
  ``Bridge._process`` and ``DecisionLoop.deliver`` (9935b11: an answer names its ``question_note``): a field
  brain-kit adds is refused until they are updated;
- the projects it serves; ``issued_at`` within max_clock_skew_s; a contract's expiry within contract_ttl_hours;
- a hand-over's run id is reserved in this signer's ledger before it is checked, in brain-kit's own reservation state
  (``ledger.RESERVED``, "signing"), as one step with "this requirement has no other open run": two hand-overs of one
  requirement never both get a contract. A contract asked for again for the same MR and commit (the bridge got no
  answer, or its waiting voucher grew old) is signed again: its run is a reservation while it is checked, so
  ``Bridge.verify`` (``Ledger.is_reservation_for``) does not count it as another open run;
- an answer only for a run whose contract this signer signed, still open, on that MR, with that run's owner;
- in its own ledger: one answer per question (run, commit, park.json), and a D-n never bound to a second question or a
  second question note. check_answer sees the MR as it is now, and whoever holds the bridge account's token (the
  agents' OS user can read the app's bridge.json) can delete, edit and post the bridge's notes: what was signed is
  remembered here. On the MR it also refuses a question note that an allowed person's reply to its D-n comes before:
  that reply answered an earlier copy of the question (deleted, or still there), and check_answer counts only the
  replies after the note it is bound to, so a copy posted later would drop it. (brain-kit posts a second copy itself
  only when GitLab took a post without returning its id, or when it asks again a question an older bridge asked in
  the old layout; if someone had replied in between, the signer refuses rather than drop that reply.)
A late answer is used as it is: brain-kit's bridge asks for the very same voucher again (its pending voucher, one per
hand-over check or decision), which is the same request, and a request that has its answer in signed/ or refused/ is
not looked at again.

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
STALE_RESERVATION_S = 900  # brain-kit's Bridge drops its own reservations after max(900 s, 4 x the signer's timeout)
SIGNED_SCHEMA = """
CREATE TABLE IF NOT EXISTS signed_answers (
  run_id TEXT NOT NULL, sha TEXT NOT NULL, park_hash TEXT NOT NULL, decision TEXT NOT NULL, voucher_id TEXT NOT NULL,
  choice TEXT NOT NULL, created TEXT NOT NULL, PRIMARY KEY (run_id, sha, park_hash));
CREATE TABLE IF NOT EXISTS bound_decisions (
  run_id TEXT NOT NULL, decision TEXT NOT NULL, sha TEXT NOT NULL, park_hash TEXT NOT NULL,
  PRIMARY KEY (run_id, decision));
"""
ADDED_COLUMNS = (("signed_answers", "answer", "TEXT"), ("bound_decisions", "question_note", "INTEGER"))
VERDICT = {"none": "MR 上没有可以回答 %s 的人的有效回答", "conflict": "%s 收到不同的回答，不签",
           "stale": "%s 作废：问题发出后分支又有了新推送", "void": "%s 作废：问题没有绑在这次推送和 park.json 上"}
# what a brain-kit checkout must offer (9935b11: the hand-over commit rule, run reservations, answers bound to their
# question note)
NEEDS = (("bridge.decisions", "check_answer"), ("bridge.decisions", "VOUCHER_TIME_FIELDS"), ("sign", "SpoolSigner"),
         ("bridge.ledger", "RESERVED"), ("bridge.ledger", "Ledger.is_reservation_for"),
         ("bridge.handoff", "Bridge.handoff_commit_problems"), ("rest", "GitLab.commit"))


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
    import importlib
    import brainkit  # noqa: F401
    lacking = []
    for mod, attr in NEEDS:
        obj = importlib.import_module("brainkit." + mod)
        for part in attr.split("."):
            obj = getattr(obj, part, None)
        if obj is None:
            lacking.append("%s.%s" % (mod, attr))
    if lacking:
        raise SystemExit("brain-signer: brain-kit at %s is too old (needs %s: commit 9935b11 or newer)"
                         % (path, ", ".join(lacking)))


def _nid(note):
    try:
        return int(note.get("id") or 0)
    except (TypeError, ValueError):
        return 0


def _author(note):
    return str(((note.get("author") or {}).get("username")) or "").lower()


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
    park.json it is bound to, and the time, from the request): the question note is the one check_answer bound the
    answer to."""
    out = {"schema": 1, "kind": "answer", "decision": v["decision"], "run_id": v["run_id"], "project": run["project"],
           "mr_iid": int(run["iid"]), "sha": v["sha"], "park_hash": v["park_hash"], "decision_kind": verdict.kind,
           "choice": verdict.choice, "answerer": answerer, "issued_at": v["issued_at"], "issuer": principal,
           "question_note": _nid(verdict.question or {})}
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
        from brainkit.bridge.ledger import OPEN_RUN_STATES, RESERVED
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
            for table, col, kind in ADDED_COLUMNS:
                if col not in {r[1] for r in self.ledger.db.execute("PRAGMA table_info(%s)" % table)}:
                    try:
                        self.ledger.db.execute("ALTER TABLE %s ADD COLUMN %s %s" % (table, col, kind))
                    except sqlite3.OperationalError:
                        pass
            # an earlier version of this signer parked a contract it was signing again as 'reissue' (and put it back
            # after): one left by a stop in between is the open run it was
            self.ledger.db.execute("UPDATE runs SET state='spooled' WHERE state='reissue'")
        self.OPEN, self.RESERVED = tuple(OPEN_RUN_STATES), RESERVED
        # a run this signer signed a contract for: open, or being signed again right now (its voucher stays on the row)
        self.open_states = self.OPEN + (RESERVED,)
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

    def _reserve(self, v):
        """The run id the request names, taken for this hand-over in brain-kit's reservation state before anything is
        checked, as brain-kit's ``Ledger.reserve_run`` takes the bridge's (one step: the requirement has no other
        open run, or nothing is reserved). Returns (mode, prior):
          ("new", None)      the run id is reserved for this hand-over; released again unless it is signed
          ("again", state)   this signer signed this very hand-over (same project, MR and commit) under this run id
                             before and is asked again: the run is a reservation while it is checked, then back to
                             `state`, with the new voucher
          ("none", None)     the requirement has another open run: nothing reserved (Bridge.verify says so)
        Another hand-over under this run id, or a run that has ended, is refused. A reservation left by a signer that
        stopped while checking is dropped after STALE_RESERVATION_S, as brain-kit's are."""
        led, R, now = self.ledger, self.RESERVED, self.common.utcnow()
        run_id, key = v["run_id"], v["key"]
        this = (v["project"], int(v["mr_iid"]), v["sha"])
        with led.lock:
            led.db.execute("BEGIN IMMEDIATE")   # one step for another process on this ledger (`close`), too
            try:
                led.db.execute("DELETE FROM runs WHERE req=? AND state=? AND voucher_id='' AND updated<?",
                               (key, R, self.common.iso(now - timedelta(seconds=STALE_RESERVATION_S))))
                old = led.run(run_id)
                if old is None:
                    if led.open_run_for(key) is not None:
                        mode, prior = "none", None
                    else:
                        led.db.execute("INSERT INTO runs(run_id,project,req,iid,sha,voucher_id,state,created,updated) "
                                       "VALUES (?,?,?,?,?,?,?,?,?)", (run_id, v["project"], key, int(v["mr_iid"]),
                                                                      v["sha"], "", R, self.common.iso(now),
                                                                      self.common.iso(now)))
                        mode, prior = "new", None
                elif (old["project"], int(old["iid"]), old["sha"]) != this:
                    raise Refuse("run id %s 已经签给别的交接了" % run_id)
                elif old["state"] == R:
                    # left by a signer that stopped while checking it: a contract it had signed before stays open
                    mode, prior = ("again", "spooled") if old["voucher_id"] else ("new", None)
                elif old["state"] not in self.OPEN:
                    raise Refuse("run %s 已经结束（%s）" % (run_id, old["state"]))
                else:
                    led.db.execute("UPDATE runs SET state=?, updated=? WHERE run_id=?", (R, self.common.iso(now), run_id))
                    mode, prior = "again", old["state"]
                led.db.execute("COMMIT")
                return mode, prior
            except BaseException:
                try:
                    led.db.execute("ROLLBACK")
                except sqlite3.Error:
                    pass
                raise

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
        led, R = self.ledger, self.RESERVED
        mode, prior = self._reserve(v)
        try:
            probs, facts = self.br.verify(v["project"], kit, mr)
            if probs:
                raise Refuse(*probs)
            if mode == "none":   # verify let another open run pass (a reservation of this hand-over under another id)
                raise Refuse("%s 在签名服务这边还有一个没结束的 run，不再签第二个" % v["key"])
            self.same(v, handoff_voucher(v, mr, facts, self.sign.PRINCIPAL))
            sig = self.key.sign(v)
            with led.lock:
                if mode == "again":
                    led.db.execute("UPDATE runs SET voucher_id=?, voucher=?, state=?, updated=? WHERE run_id=? AND "
                                   "state=?", (v["voucher_id"], json.dumps(v, ensure_ascii=False), prior,
                                               self.common.iso(self.common.utcnow()), v["run_id"], R))
                else:            # brain-kit's add_run: the reservation becomes the 'spooled' run
                    led.add_run(v["run_id"], v["project"], v["key"], v["mr_iid"], v["sha"], v["voucher_id"],
                                paths=facts.get("expected_paths") or [], owner=v["owner"], voucher=v)
            return sig
        except BaseException:
            # whatever went wrong: a new reservation is given back, an earlier contract stays open as it was
            if mode == "new":
                led.release_run(v["run_id"])
            elif mode == "again":
                led.set_run(v["run_id"], R, prior)
            raise

    def earlier_reply(self, notes, did, qid, bridge, who):
        """The first reply to `did` by a person allowed to answer it that is older than its question note `qid`, or
        None. check_answer counts the replies after the note it is bound to: such a reply answered an earlier copy of
        the question (one that was deleted, or that is still there), and binding the answer to this later copy would
        drop it (whoever holds the bridge account's token can post a copy, and delete the first)."""
        for n in sorted((n for n in notes or [] if isinstance(n, dict)), key=_nid):
            nid = _nid(n)
            if nid >= qid:
                return None
            if n.get("system") or _author(n) == bridge:
                continue
            m = self.decisions.ANSWER_RE.match(str(n.get("body") or "").split("\n", 1)[0])
            if m and m.group(1).upper() == did and _author(n) in who:
                return nid
        return None

    def answer(self, v):
        for k in ("decision", "park_hash", "decision_kind", "choice", "answerer"):
            if not is_str(v.get(k), 100):
                raise Refuse("%s 要是一行字" % k)
        if not self.decisions.DECISION_ID_RE.match(v["decision"]):
            raise Refuse("decision 不是 D-<n>")
        qn = v.get("question_note")
        if not is_int(qn) or qn <= 0:
            raise Refuse("question_note 要是正整数：回答凭证要写明它回答的是 MR 上哪一条问题评论（brain-kit 9935b11 起）")
        led = self.ledger
        run = led.run(v["run_id"])
        if run is None or not run["voucher_id"]:
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
        # bound to the question note the voucher names (an answer voucher's question_note, as brain-kit's ledger
        # recorded it): only that note counts, and when it is gone the decision is void
        got = self.decisions.check_answer(
            {"id": did, "run_id": v["run_id"], "sha": v["sha"], "park_hash": v["park_hash"],
             "kind": v["decision_kind"], "lean_request": v.get("lean_request"), "question_note": qn},
            raw, notes, kit, self.br.roles, run["owner"], mr["sha"], pushed)
        if not got.ok:
            raise Refuse(VERDICT.get(got.status, "%s 不签") % did + ("（%s）" % got.reason if got.reason else ""))
        self.same(v, answer_voucher(v, run, got, self.br.pseudonym(got.author), self.sign.PRINCIPAL))
        answer = json.dumps({"decision": did, "choice": got.choice, "rejected": list(got.items),
                             "answerer": v["answerer"]}, sort_keys=True)
        with led.lock:   # read what was signed, sign, record: one step
            why = []
            bound = led.db.execute("SELECT * FROM bound_decisions WHERE run_id=? AND decision=?",
                                   (v["run_id"], did)).fetchone()
            if bound is not None and (bound["sha"], bound["park_hash"]) != (v["sha"], v["park_hash"]):
                why.append("%s 已经是另一个问题（%s）的号了" % (did, bound["sha"][:12]))
            elif bound is not None and bound["question_note"] not in (None, qn):
                why.append("%s 绑在问题评论 %s 上，不是 %d：问题被重新贴过，不签" % (did, bound["question_note"], qn))
            had = led.db.execute("SELECT * FROM signed_answers WHERE run_id=? AND sha=? AND park_hash=?",
                                 (v["run_id"], v["sha"], v["park_hash"])).fetchone()
            if had is not None and (had["decision"] != did or (had["answer"] or None) not in (None, answer)
                                    or had["choice"] != got.choice):
                why.append("这个问题已经签过另一个回答（%s）" % had["voucher_id"])
            early = self.earlier_reply(notes, did, qn, bridge, got.who)
            if early is not None:
                why.append("%s 在问题评论 %d 之前已经有人回答过（评论 %d）：这条问题是后来又贴的一份（原来的被删了或还在），"
                           "绑在它上面会丢掉之前的回答，不签" % (did, qn, early))
            if why:
                raise Refuse(*why)
            sig = self.key.sign(v)
            led.db.execute("INSERT OR IGNORE INTO bound_decisions(run_id,decision,sha,park_hash,question_note) "
                           "VALUES (?,?,?,?,?)", (v["run_id"], did, v["sha"], v["park_hash"], qn))
            led.db.execute("UPDATE bound_decisions SET question_note=? WHERE run_id=? AND decision=? AND "
                           "question_note IS NULL", (qn, v["run_id"], did))
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
