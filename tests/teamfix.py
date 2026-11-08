"""The team runner, offline: a fake GitLab served from a bare repo, a project handed over by alice, the separate signer
(signer/brain_signer.py with its own identities and ledger) and the bridge.json the app hosts, with brain-kit's spool
signer and no key.

GitLab's notes, labels and MR versions are in memory; authors come from the token (the bridge's, the signer's, a
person's). A note can be edited or deleted in place, as whoever holds the account's token can on GitLab.
"""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
from urllib.parse import parse_qsl, unquote, urlsplit

import pytest

from appkit import BRAINKIT, ROOT, sh
from brainfix import brain, make_project, start_in_worktree

P = "grp/repo"
BRANCH = "ai/alice/PAY-1-refund"
PARK = {"schema": 1, "status": "waiting", "kind": "clarify", "ask": "owner", "question": "退款要不要人工审核？",
        "options": [{"id": "A", "text": "要"}, {"id": "B", "text": "不要"}], "recommend": "A"}


class GitLab:
    """GitLab REST v4 for one project (MR !5 of BRANCH)."""

    def __init__(self, bare):
        self.bare = str(bare)
        self.labels = ["ai-handoff"]
        self.state = "opened"
        self.notes = []
        self.versions = []  # GitLab's MR versions: one per new head commit, newest first in the API
        self.t = 0
        self.sync()  # the hand-over commit was pushed ...
        self.events = [{"id": 101, "action": "add", "label": {"name": "ai-handoff"}, "user": {"username": "alice"},
                        "created_at": self.tick()}]  # ... and then the owner added the label
        self.who = {"bridge-tok": "brain-bridge", "signer-tok": "brain-signer"}
        self.next_note = 1000

    def tick(self):
        self.t += 1
        return "2026-11-08T12:%02d:%02d.000Z" % (self.t // 60, self.t % 60)

    def sync(self):
        """GitLab records a new MR version once it sees a new head (here: at the next request after a push)."""
        head = self.head()
        if head and (not self.versions or self.versions[-1]["head_commit_sha"] != head):
            self.versions.append({"id": len(self.versions) + 1, "head_commit_sha": head, "created_at": self.tick()})

    def head(self):
        return subprocess.run(["git", "-C", self.bare, "rev-parse", "refs/heads/" + BRANCH], capture_output=True,
                              text=True).stdout.strip()

    def mr(self):
        return {"iid": 5, "source_branch": BRANCH, "target_branch": "main", "sha": self.head(), "state": self.state,
                "source_project_id": 7, "target_project_id": 7, "labels": list(self.labels),
                "web_url": "https://gl.example/grp/repo/-/merge_requests/5"}

    def note(self, author, body):
        self.sync()
        n = {"id": self.next_note, "body": body, "author": {"username": author}, "system": False,
             "created_at": self.tick()}
        self.next_note += 1  # GitLab never reuses a note id
        self.notes.append(n)
        return n

    def label(self, user, action="add", name="ai-handoff"):
        self.sync()
        self.events.append({"id": 100 + len(self.events) + 1, "action": action, "label": {"name": name},
                            "user": {"username": user}, "created_at": self.tick()})
        if action == "add" and name not in self.labels:
            self.labels.append(name)

    def bodies(self):
        return [n["body"] for n in self.notes]

    @staticmethod
    def page(rows, q):
        n, p = int(q.get("per_page", 20)), int(q.get("page", 1))
        return rows[(p - 1) * n: p * n]

    def __call__(self, method, url, headers, body):
        self.sync()
        u = urlsplit(url)
        path, q = unquote(u.path), dict(parse_qsl(u.query))
        data = json.loads(body.decode()) if body else None
        pre = "/api/v4/projects/" + P
        ok = lambda o, s=200: (s, json.dumps(o).encode())  # noqa: E731
        if path == "/api/v4/user":
            return ok({"username": self.who.get(headers.get("PRIVATE-TOKEN"), "someone")})
        if path == pre:
            return ok({"default_branch": "main"})
        if path == pre + "/merge_requests" and method == "GET":
            want = q.get("labels")
            return ok([self.mr()] if self.state == "opened" and (not want or want in self.labels) else [])
        if path == pre + "/merge_requests/5" and method == "GET":
            return ok(self.mr())
        if path == pre + "/merge_requests/5" and method == "PUT":
            for l in (data.get("remove_labels") or "").split(","):
                if l in self.labels:
                    self.labels.remove(l)
            for l in (data.get("add_labels") or "").split(","):
                if l and l not in self.labels:
                    self.labels.append(l)
            return ok(self.mr())
        if path == pre + "/merge_requests/5/versions":
            return ok(self.page(list(reversed(self.versions)), q))
        if path == pre + "/merge_requests/5/resource_label_events":
            return ok(self.page(self.events, q))
        if path == pre + "/merge_requests/5/notes" and method == "GET":
            return ok(self.page(self.notes, q))
        if path == pre + "/merge_requests/5/notes" and method == "POST":
            return ok(self.note(self.who.get(headers.get("PRIVATE-TOKEN"), "someone"), data["body"]), 201)
        m = re.match(re.escape(pre) + r"/repository/files/(.+)/raw$", path)
        if m:
            p = subprocess.run(["git", "-C", self.bare, "show", "%s:%s" % (q.get("ref"), m.group(1))], capture_output=True)
            return (200, p.stdout) if p.returncode == 0 else ok({"message": "404"}, 404)
        m = re.match(re.escape(pre) + r"/repository/commits/(.+)$", path)
        if m:
            e = subprocess.run(["git", "-C", self.bare, "cat-file", "-e", m.group(1) + "^{commit}"]).returncode
            return ok({"id": m.group(1)}) if e == 0 else ok({}, 404)
        return ok({"message": "404 (fake)"}, 404)


def load_signer():
    sys.path.insert(0, str(ROOT / "signer"))
    import brain_signer
    brain_signer.load_brainkit(str(BRAINKIT))
    return brain_signer


def keypair(d):
    key = d / "bridge_ed25519"
    sh("ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", key, "-C", "brain-bridge")
    allowed = d / "allowed_signers"
    allowed.write_text('brain-bridge namespaces="brain-voucher" %s\n' % (d / "bridge_ed25519.pub").read_text().strip())
    return key, allowed


def make_world(tmp_path, home, monkeypatch, *, bridge_user="brain-bridge", signer_cfg=None):
    kit = {"gitlab": {"base": "https://gl.example", "project": P}, "bot_users": ["brain-bot"],
           "bot_emails": ["brain-bot@noreply.invalid"]}
    if bridge_user:
        kit["bridge_user"] = bridge_user
    repo = make_project(tmp_path, name="repo", origin=True, kit=kit)
    sh("git", "-C", repo, "push", "-q", "origin", "main")
    wt = start_in_worktree(repo, home / "workplace" / "brain-app" / "repo" / "refund", "refund", "退款")
    intent = json.loads((wt / "runs" / "PAY-1" / "run.json").read_text())["intent"]
    st = wt / "aidlc-docs" / intent / "aidlc-state.md"
    st.write_text(st.read_text().replace("Status: Inception: starting", "Status: Construction step 2 of 4"))
    sh("git", "-C", wt, "commit", "-qam", "notes")
    brain(wt, "handoff", "--no-label")
    bare = tmp_path / "repo-origin.git"
    gl = GitLab(bare)
    (tmp_path / "keys").mkdir()
    key, allowed = keypair(tmp_path / "keys")
    ids = {"users": {"alice": {}, "carol": {}}, "roles": {"product": ["carol"], "builder": ["dave"]}}
    app_ids, signer_ids = tmp_path / "app-identities.json", tmp_path / "signer-identities.json"
    app_ids.write_text(json.dumps(ids))
    signer_ids.write_text(json.dumps(ids))
    spool, sspool, runs_root = tmp_path / "spool", tmp_path / "signer-spool", tmp_path / "runs"
    runs_root.mkdir()
    bridge_cfg = tmp_path / "bridge.json"
    bridge_cfg.write_text(json.dumps({
        "projects": [P], "gitlab": {"base": "https://gl.example", "token_env": "TEST_BRIDGE_TOKEN"},
        "identities": str(app_ids),
        "signer": {"type": "spool", "spool_dir": str(sspool), "allowed_signers": str(allowed), "timeout": 5,
                   "poll": 0.02},
        "vouchers_dir": str(tmp_path / "app-vouchers"), "spool_dir": str(spool), "ledger": str(tmp_path / "ledger.sqlite"),
        "runner_runs_root": str(runs_root), "kirocrew": {"agent": "brain-run", "memory_mode": "incognito"},
        "pseudonym_salt": "s", "interval": 60}))
    runnerd_cfg = tmp_path / "runnerd.json"
    runnerd_cfg.write_text(json.dumps({"spool_dir": str(spool), "cache_dir": str(tmp_path / "cache"),
                                       "runs_root": str(runs_root), "allowed_signers": str(allowed), "clone_url": str(bare)}))
    monkeypatch.setenv("TEST_BRIDGE_TOKEN", "bridge-tok")
    bs = load_signer()
    rest = __import__("brainkit.rest", fromlist=["GitLab"])
    scfg = {"spool": str(sspool), "signing_key": str(key), "projects": [P], "identities": str(signer_ids),
            "vouchers_dir": str(tmp_path / "signer-vouchers"), "publish_vouchers": False,
            "ledger": str(tmp_path / "signer.sqlite"), "pseudonym_salt": "s", "contract_ttl_hours": 72}
    scfg.update(signer_cfg or {})
    # one signer for every thread (brain-kit's Ledger is shared safely); the app's bridge runs it while it waits
    signer = bs.Signer(scfg, rest.GitLab("https://gl.example", "signer-tok", gl), None, out=lambda *_: None)
    team = {"enabled": True, "bridge_config": str(bridge_cfg), "runnerd_config": str(runnerd_cfg),
            "dev_same_user": True}
    return {"repo": repo, "gl": gl, "signer": signer, "bs": bs, "team": team, "runs_root": runs_root,
            "app_ids": app_ids, "signer_ids": signer_ids, "tmp": tmp_path, "key": key, "allowed": allowed, "wt": wt,
            "sspool": sspool, "bridge_cfg": bridge_cfg}


@pytest.fixture
def world(tmp_path, home, monkeypatch):
    return make_world(tmp_path, home, monkeypatch)


def commit_push(path, files, msg="c", bot=True):
    for rel, text in files.items():
        p = path / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text if isinstance(text, str) else json.dumps(text, ensure_ascii=False))
    sh("git", "-C", path, "add", "-A")
    who = ["-c", "user.email=brain-bot@noreply.invalid", "-c", "user.name=bot"] if bot else []
    sh("git", "-C", path, *who, "commit", "-qm", msg)
    sh("git", "-C", path, "push", "-q", "-f", "origin", "HEAD:" + BRANCH)
    return sh("git", "-C", path, "rev-parse", "HEAD").stdout.strip()


def push_park(path, park=PARK):
    return commit_push(path, {"runs/PAY-1/park.json": park}, "park")


def spool_request(spool, v):
    """A request exactly as brain-kit's SpoolSigner writes it (what an agent with the app's OS user can also write)."""
    from brainkit import sign
    from brainkit.common import iso, utcnow, write_json
    rid = sign.SpoolSigner.req_id(v)
    write_json(str(spool / "requests" / (rid + ".json")),
               {"schema": 1, "req_id": rid, "kind": v.get("kind"), "created": iso(utcnow()), "voucher": v}, mode=0o640)
    return rid


def signer_ask(world, v, fix_id=True):
    """Write a request straight into the signer's spool and run the signer: (signed|refused|None, the answer)."""
    from brainkit import sign
    if fix_id:
        v = {k: x for k, x in v.items() if k != "voucher_id"}
        v["voucher_id"] = "V-" + sign.digest(v)[:10]
    rid = spool_request(world["sspool"], v)
    world["signer"]._failed.clear()
    world["signer"].once()
    for d in ("signed", "refused"):
        p = world["sspool"] / d / (rid + ".json")
        if p.exists():
            return d, json.loads(p.read_text())
    return None, None


def answer_voucher(sha, park_raw, did, choice, author, kind="clarify", **extra):
    """An answer voucher in brain-kit's layout (DecisionLoop.deliver), salt "s"."""
    from brainkit.common import iso, utcnow
    pseud = "P-" + hashlib.sha256(("s" + author).encode()).hexdigest()[:4].upper()
    v = {"schema": 1, "kind": "answer", "decision": did, "run_id": "RUN-PAY-1-1", "project": P, "mr_iid": 5,
         "sha": sha, "park_hash": hashlib.sha256(park_raw).hexdigest(), "decision_kind": kind, "choice": choice,
         "answerer": pseud, "issued_at": iso(utcnow()), "issuer": "brain-bridge"}
    v.update(extra)
    return v
