"""A project repo with brain-kit installed, read the way brain-kit writes it (read only: nothing here changes the repo).

Each requirement key is found in up to four places, and the facts are read where the newest state is:
  claim/<KEY>                       the claim (or intent): owner, title, source, closed
  <prefix>/<owner>/<KEY>-<slug>     the run branch: a worktree on this machine that has it checked out (its files,
                                    committed or not), else the newer of the local branch and origin's
  runs/<KEY>/run.json on main       merged: the default branch has it
In each place: runs/<KEY>/run.json, runs/<KEY>/park.json, aidlc-docs/<intent>/aidlc-state.md and decisions.md, and
the Lean ledger aidlc-docs/audit/*.jsonl.

``scan()`` is cached per key on a signature (the refs' shas, the worktree files' mtimes), so a poll that finds
nothing new costs two git calls. Network: never, except ``fetch()`` (the page's 「从远端取最新」).
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import threading
import time
from pathlib import Path
from typing import Any

from . import lean_view
from .constants import GIT_BIN, KEY_RE

GIT_ENV = {"GIT_TERMINAL_PROMPT": "0", "GIT_OPTIONAL_LOCKS": "0", "LC_ALL": "C"}
BRANCH_RE = re.compile(r"^(?P<prefix>[a-z]+)/(?P<owner>[a-z0-9][a-z0-9._-]{0,63})/"
                       r"(?P<key>[A-Z][A-Z0-9]{0,9}-[1-9][0-9]{0,6})(?:-(?P<slug>[a-z0-9][a-z0-9-]{0,39}))?$")
MAX_FILE = 4 * 1024 * 1024


class Git:
    def __init__(self, repo: str | Path) -> None:
        self.repo = str(repo)

    def run(self, *args: str, timeout: float = 30, text: bool = True, cwd: str | None = None,
            env: dict | None = None) -> subprocess.CompletedProcess:
        e = dict(os.environ)
        e.update(GIT_ENV)
        e.update(env or {})
        try:
            return subprocess.run([GIT_BIN, "-C", cwd or self.repo, *args], capture_output=True, text=text,
                                  timeout=timeout, env=e)
        except (OSError, subprocess.TimeoutExpired) as exc:
            return subprocess.CompletedProcess(args, 124, "" if text else b"", str(exc) if text else str(exc).encode())

    def out(self, *args: str) -> str:
        p = self.run(*args)
        return p.stdout.strip() if p.returncode == 0 else ""

    def ok(self, *args: str) -> bool:
        return self.run(*args).returncode == 0

    def show(self, ref: str, path: str) -> bytes | None:
        p = self.run("cat-file", "blob", "%s:%s" % (ref, path), text=False)
        return p.stdout[:MAX_FILE] if p.returncode == 0 else None

    def ls(self, ref: str, prefix: str) -> list[str]:
        p = self.run("ls-tree", "-r", "-z", "--name-only", ref, "--", prefix)
        return sorted(x for x in p.stdout.split("\0") if x) if p.returncode == 0 else []

    def refs(self, *prefixes: str) -> dict[str, str]:
        p = self.run("for-each-ref", "--format=%(refname) %(objectname)", *prefixes)
        out = {}
        for line in p.stdout.splitlines() if p.returncode == 0 else []:
            name, _, sha = line.partition(" ")
            out[name] = sha
        return out

    def worktrees(self) -> list[dict[str, Any]]:
        p = self.run("worktree", "list", "--porcelain")
        out, cur = [], {}
        for line in (p.stdout.splitlines() if p.returncode == 0 else []) + [""]:
            if not line:
                if cur.get("path"):
                    out.append(cur)
                cur = {}
            elif line.startswith("worktree "):
                cur["path"] = line[9:]
            elif line.startswith("HEAD "):
                cur["head"] = line[5:]
            elif line.startswith("branch "):
                cur["branch"] = line[7:]
        return out

    def commit_time(self, rev: str) -> float | None:
        s = self.out("log", "-1", "--format=%ct", rev)
        return float(s) if s.isdigit() else None

    def has_origin(self) -> bool:
        return self.ok("remote", "get-url", "origin")


class Source:
    """Files of one place: a worktree's files, or a git ref."""

    def __init__(self, git: Git, *, ref: str | None = None, path: str | None = None) -> None:
        self.git, self.ref, self.path = git, ref, path

    @property
    def label(self) -> str:
        return self.path if self.path else (self.ref or "")

    def read(self, rel: str) -> bytes | None:
        if self.path:
            p = os.path.join(self.path, rel)
            try:
                if not os.path.isfile(p) or os.path.getsize(p) > MAX_FILE:
                    return None
                with open(p, "rb") as f:
                    return f.read()
            except OSError:
                return None
        return self.git.show(self.ref or "HEAD", rel)

    def text(self, rel: str) -> str | None:
        raw = self.read(rel)
        return raw.decode("utf-8", "replace") if raw is not None else None

    def json(self, rel: str) -> Any:
        raw = self.read(rel)
        if raw is None:
            return None
        try:
            return json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return None

    def ls(self, prefix: str) -> list[str]:
        if self.path:
            out = []
            for d, dirs, names in os.walk(os.path.join(self.path, prefix)):
                dirs.sort()
                out += [os.path.relpath(os.path.join(d, n), self.path).replace(os.sep, "/") for n in names]
            return sorted(out)
        return self.git.ls(self.ref or "HEAD", prefix)

    def sig(self, rels: list[str]) -> tuple:
        """What changes when a worktree's files change (a ref's files only change with its sha)."""
        if not self.path:
            return ()
        out = []
        for rel in rels:
            p = os.path.join(self.path, rel)
            try:
                if os.path.isdir(p):
                    out += [(rel + "/" + n, os.stat(os.path.join(p, n)).st_mtime_ns, os.stat(os.path.join(p, n)).st_size)
                            for n in sorted(os.listdir(p))]
                else:
                    st = os.stat(p)
                    out.append((rel, st.st_mtime_ns, st.st_size))
            except OSError:
                out.append((rel, 0, 0))
        return tuple(out)


def empty_facts() -> dict[str, Any]:
    return {"run": None, "park": None, "park_sha": None, "state_text": None, "decisions_text": None, "events": [],
            "approvals": []}


def read_facts(src: Source, key: str, runs_dir: str) -> dict[str, Any]:
    """run.json, park.json, the Lean note, decisions.md and ledger of one requirement in one place."""
    out = empty_facts()
    run = src.json("%s/%s/run.json" % (runs_dir, key))
    out["run"] = run if isinstance(run, dict) else None
    raw_park = src.read("%s/%s/park.json" % (runs_dir, key))
    if raw_park is not None:
        out["park_sha"] = hashlib.sha256(raw_park).hexdigest()
        try:
            park = json.loads(raw_park.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            park = None
        out["park"] = park if isinstance(park, dict) else {"invalid": True}
    intent = out["run"].get("intent") if out["run"] and isinstance(out["run"].get("intent"), str) else None
    if intent and re.match(r"^[0-9]{6}-[a-z0-9][a-z0-9-]{0,80}$", intent):
        out["state_text"] = src.text("%s/%s/aidlc-state.md" % (lean_view.DOCS, intent))
        out["decisions_text"] = src.text("%s/%s/decisions.md" % (lean_view.DOCS, intent))
        out["events"] = lean_view.events(src.read, src.ls, intent)
        out["approvals"] = lean_view.approvals(out["events"], src.read)
    return out


def parse_branch(name: str, prefix: str) -> dict[str, str] | None:
    m = BRANCH_RE.match(name or "")
    if not m or m.group("prefix") != prefix:
        return None
    return {"owner": m.group("owner"), "key": m.group("key"), "slug": m.group("slug") or ""}


class Repo:
    """One project repo: its kit config (from brain-kit) and the requirements found in it."""

    def __init__(self, rid: str, path: str, cfg: dict[str, Any]) -> None:
        self.id, self.path, self.cfg = rid, os.path.realpath(path), cfg
        self.git = Git(self.path)
        self.name = os.path.basename(self.path)
        self._lock = threading.Lock()
        self._facts: dict[str, tuple[tuple, dict[str, Any]]] = {}
        self._scan: tuple[float, tuple, list[dict[str, Any]]] | None = None

    # ---- where things are ---------------------------------------------------------------------------- #

    def main_ref(self) -> str | None:
        d = self.cfg["default_branch"]
        for r in ("refs/remotes/origin/" + d, "refs/heads/" + d):
            if self.git.ok("rev-parse", "-q", "--verify", r + "^{commit}"):
                return r
        return None

    def _places(self) -> dict[str, Any]:
        pre = self.cfg["branch_prefix"]
        d = self.cfg["default_branch"]
        refs = self.git.refs("refs/heads/claim/", "refs/remotes/origin/claim/", "refs/heads/%s/" % pre,
                             "refs/remotes/origin/%s/" % pre, "refs/heads/" + d, "refs/remotes/origin/" + d)
        wts = self.git.worktrees()
        return {"refs": refs, "worktrees": wts}

    def scan(self, ttl: float = 4.0) -> list[dict[str, Any]]:
        """The facts of every requirement key in the repo (see the module doc)."""
        with self._lock:
            now = time.monotonic()
            if self._scan and now - self._scan[0] < ttl:
                return self._scan[2]
            places = self._places()
            refs, wts = places["refs"], places["worktrees"]
            pre, d = self.cfg["branch_prefix"], self.cfg["default_branch"]
            main = ("refs/remotes/origin/" + d) if ("refs/remotes/origin/" + d) in refs else (
                ("refs/heads/" + d) if ("refs/heads/" + d) in refs else None)
            checked_out = {w.get("branch"): w["path"] for w in wts if w.get("branch")}
            claims: dict[str, str] = {}
            for name in refs:
                for p in ("refs/remotes/origin/claim/", "refs/heads/claim/"):
                    if name.startswith(p) and KEY_RE.match(name[len(p):]):
                        claims.setdefault(name[len(p):], name)  # origin first: it is the shared truth
            branches: dict[str, dict[str, Any]] = {}
            for name, sha in refs.items():
                for p, kind in (("refs/heads/", "local"), ("refs/remotes/origin/", "origin")):
                    if name.startswith(p):
                        short = name[len(p):]
                        b = parse_branch(short, pre)
                        if b:
                            row = branches.setdefault(b["key"], {"branch": short, "owner": b["owner"], "slug": b["slug"]})
                            if row["branch"] == short:
                                row[kind] = name
                                row[kind + "_sha"] = sha
            merged = set()
            if main:
                for path in self.git.ls(main, self.cfg["runs_dir"]):
                    parts = path.split("/")
                    if len(parts) == 3 and parts[2] == "run.json" and KEY_RE.match(parts[1]):
                        merged.add(parts[1])
            keys = sorted(set(claims) | set(branches) | merged, key=_key_order)
            out = []
            for key in keys:
                b = branches.get(key)
                wt = checked_out.get("refs/heads/" + b["branch"]) if b and b.get("local") else None
                sig = (claims.get(key), refs.get(claims.get(key) or ""), json.dumps(b, sort_keys=True) if b else None,
                       wt, key in merged, refs.get(main or "") if key in merged else None)
                facts = self._key_facts(key, claims.get(key), b, wt, main if key in merged else None, sig)
                out.append(facts)
            self._scan = (now, (), out)
            return out

    def _key_facts(self, key: str, claim_ref: str | None, b: dict[str, Any] | None, wt: str | None,
                   main: str | None, sig: tuple) -> dict[str, Any]:
        if main:
            src, where, ref = Source(self.git, ref=main), "main", main
        elif wt:
            src, where, ref = Source(self.git, path=wt), "worktree", None
        elif b:
            ref = b.get("local") or b.get("origin")
            if b.get("local") and b.get("origin") and b["local_sha"] != b["origin_sha"] and \
                    self.git.ok("merge-base", "--is-ancestor", b["local_sha"], b["origin_sha"]):
                ref = b["origin"]  # the runner pushed more than this machine has
            src, where = Source(self.git, ref=ref), "branch"
        else:
            src, where, ref = None, "claim", None
        runs = self.cfg["runs_dir"]
        rels = ["%s/%s" % (runs, key), lean_view.DOCS + "/audit"]
        cached = self._facts.get(key)
        fsig = sig + (src.sig(rels) if src else ())
        if cached and cached[0] == fsig:
            run = cached[1].get("run") or {}
            intent = run.get("intent")
            if not (src and src.path and intent) or cached[1].get("_isig") == src.sig(
                    ["%s/%s" % (lean_view.DOCS, intent)]):
                return cached[1]
        claim = None
        if claim_ref:
            raw = self.git.show(claim_ref, "claim.json")
            try:
                claim = json.loads(raw.decode("utf-8")) if raw else None
            except (ValueError, UnicodeDecodeError):
                claim = None
            if not isinstance(claim, dict):
                claim = None
        got = read_facts(src, key, runs) if src is not None else empty_facts()
        run, park, park_sha = got["run"], got["park"], got["park_sha"]
        state_text, decisions_text, evs, approvals = (got["state_text"], got["decisions_text"], got["events"],
                                                       got["approvals"])
        tip = None
        if b:
            tip = b.get("local_sha") if where == "worktree" else (b.get("origin_sha") if ref == b.get("origin") else
                                                                     b.get("local_sha"))
        facts = {
            "key": key, "claim": claim, "claim_ref": claim_ref, "where": where, "ref": ref,
            "worktree": wt, "branch": (b or {}).get("branch") or ((run or {}).get("branch") if run else None),
            "owner": (b or {}).get("owner") or (run or {}).get("owner") or (claim or {}).get("owner"),
            "local": (b or {}).get("local"), "origin": (b or {}).get("origin"),
            "local_sha": (b or {}).get("local_sha"), "origin_sha": (b or {}).get("origin_sha"),
            "tip": tip, "tip_at": self.git.commit_time(tip) if tip else None,
            "merged": where == "main", "run": run, "park": park, "park_sha": park_sha,
            "state_text": state_text, "decisions_text": decisions_text, "events": evs, "approvals": approvals,
            "stages": lean_view.stages(evs),
        }
        if src is not None and src.path and run and run.get("intent"):
            facts["_isig"] = src.sig(["%s/%s" % (lean_view.DOCS, run["intent"])])
        self._facts[key] = (fsig, facts)
        return facts

    def source_for(self, facts: dict[str, Any]) -> Source | None:
        if facts.get("worktree"):
            return Source(self.git, path=facts["worktree"])
        if facts.get("ref"):
            return Source(self.git, ref=facts["ref"])
        return None

    def bot_commits_since(self, base: str | None, tip: str | None) -> int:
        """Commits on the run branch after the hand-over that the team runner's bot made (kit bot_emails)."""
        if not base or not tip or base == tip:
            return 0
        emails = {e.lower() for e in self.cfg.get("bot_emails") or []}
        out = self.git.out("log", "--format=%ae", "%s..%s" % (base, tip))
        return sum(1 for e in out.splitlines() if e.strip().lower() in emails)

    def fetch(self) -> tuple[bool, str]:
        if not self.git.has_origin():
            return False, "这个仓库没有 origin"
        p = self.git.run("fetch", "--prune", "-q", "origin", timeout=120)
        with self._lock:
            self._scan = None
        if p.returncode != 0:
            return False, (p.stderr or p.stdout).strip()[:300] or "git fetch 失败"
        return True, "已从 origin 取到最新"

    def invalidate(self) -> None:
        with self._lock:
            self._scan = None


def _key_order(key: str) -> tuple:
    pre, _, n = key.rpartition("-")
    return (pre, int(n) if n.isdigit() else 0)
