"""The MR's 变更说明 of a requirement (brain-kit's ``brain mr-desc``, 72b278e): runs/<KEY>/MR.md as committed when the
branch has it (brain-kit 48b6b97: `brain handoff` writes it into the hand-over commit and the bridge posts it before
the acceptance question), else ``brainkit.mrdesc.build`` / ``render`` from the run's records at that commit.

Always from a commit, never from a worktree's files: build() at a commit runs nothing of the project (in the working
tree it would run the project's own Lean, which is agent-writable, for its code fingerprint), and a commit's MR.md
cannot be a symlink to some file on this machine. MR.md is agent-written text: it goes through
``brainkit.mrdesc.inert`` (no @mention, HTML, image, quick action, approval or answer line acts when it is pasted into
GitLab) and is cut to DESC_MAX_CHARS, as the bridge does; render()'s own output is inert already.

``DescCache`` keeps each result by what it was made from (the repo folder, the commit, the default branch's commit,
the credits): a commit's MR.md never changes, a build only with the default branch (its merge base) and the credits.
The overview shows each row's first line from it and makes what is missing in one background thread.
"""

from __future__ import annotations

import collections
import re
import threading
from typing import Any, Callable

from . import bk
from .repo import Git

DESC_MAX_CHARS = 60000      # brain-kit's bridge.decisions.DESC_MAX_CHARS: what it posts of an MR.md
MAX_RAW = 4 * 1024 * 1024
ONE_LINE = "**一句话**："      # render()'s summary line
TREE_RE = re.compile(r"^(100644|100755) blob ([0-9a-f]{40,64})\s+([0-9]+)\t")


def empty(error: str = "") -> dict[str, Any]:
    return {"available": bk.has("mrdesc"), "text": "", "first": None, "source": None, "path": None, "ref": None,
            "error": error}


def target(git: Git, rev: str | None) -> str | None:
    """The commit *rev* names in *git*'s repo, or None."""
    if not rev:
        return None
    sha = git.out("rev-parse", "-q", "--verify", rev + "^{commit}")
    return sha if re.match(r"^[0-9a-f]{40,64}$", sha or "") else None


def committed_file(git: Git, sha: str, rel: str) -> bytes | None:
    """*rel* at commit *sha*: a regular file of at most MAX_RAW bytes, or None (a symlink in the tree is not read)."""
    line = git.out("ls-tree", "-l", sha, "--", rel)
    m = TREE_RE.match(line)
    if not m or int(m.group(3)) > MAX_RAW:
        return None
    p = git.run("cat-file", "blob", m.group(2), text=False)
    return p.stdout if p.returncode == 0 else None


def first_line(text: str) -> str | None:
    """The 变更说明's first line: render()'s 一句话 (without its label), else the first line that is not a heading,
    a table, a list or a note in brackets."""
    lines = [x.strip() for x in str(text or "").splitlines() if x.strip()]
    for x in lines:
        if x.startswith(ONE_LINE):
            return x[len(ONE_LINE):].strip()[:300] or None
    for x in lines:
        if not x.startswith(("#", "|", "-", ">", "（", "(", "*", "`")):
            return x[:300]
    return None


SIZE_WORD = {"small": "小", "s": "小", "xs": "很小", "medium": "中", "m": "中", "large": "大", "l": "大", "xl": "很大"}
# a 变更说明 line's parts that are for the records, not for a person: a source document's section and hash
# 「（D01#S002 · 097f2e9e）」, a package 「PKG-…」
REF_RE = re.compile(r"[（(]\s*D[0-9]{2}#S[0-9]{3}[^（）()]*[）)]")
SIZE_RE = re.compile(r"[（(]规模\s*([A-Za-z]+)[）)]")
NOW_RE = re.compile(r"[。.]?\s*现在[：:].*$")


def plain_line(line: str | None) -> str | None:
    """The 变更说明's first line as the overview shows it under a requirement: what it is, in plain words. Markdown
    marks go, the records' own references go (the full text keeps them), 「（规模 small）」 reads 「（规模小）」, and the
    「现在：…」 tail goes (the row says where the requirement is, the one way the app says it)."""
    if not line:
        return line
    s = NOW_RE.sub("", line)
    s = REF_RE.sub("", s)
    s = SIZE_RE.sub(lambda m: "（规模%s）" % SIZE_WORD.get(m.group(1).lower(), m.group(1)), s)
    s = re.sub(r"\*\*|__|`", "", s).strip()
    if s and not s.endswith(("。", "！", "？", ".", "!", "?")):
        s += "。"
    return s or None


def describe(path: str, cfg: dict[str, Any], key: str, sha: str, credits: Any = None) -> dict[str, Any]:
    """The 变更说明 of *key* at commit *sha* of the repo at *path* (blocking: call it in a thread)."""
    if not bk.has("mrdesc"):
        why = bk.info()["module_errors"].get("mrdesc") or "没有这个模块"
        return empty("brain-kit 的 mrdesc 用不了（%s）：要 72b278e 或更新的 brain-kit" % why)
    M = bk.m("mrdesc")
    out = empty()
    rel = "%s/%s/%s" % (cfg.get("runs_dir") or "runs", key, getattr(M, "MR_FILE", "MR.md"))
    out.update(path=rel, ref=sha[:12])
    raw = committed_file(Git(path), sha, rel)
    if raw is not None:
        text = raw.decode("utf-8", "replace").replace("\r\n", "\n").strip("\n")
        cut = ""
        if len(text) > DESC_MAX_CHARS:
            text, cut = text[:DESC_MAX_CHARS], "\n\n（MR.md 太长，这里只显示前 %d 个字，全文见文件。）" % DESC_MAX_CHARS
        text = M.inert(text) + cut + "\n"
        out.update(text=text, first=first_line(text), source="file")
        return out
    try:
        from .deliveries import _call
        text = M.render(_call(M.build, path, cfg, key, ref=sha, credits=credits))
    except Exception as exc:  # noqa: BLE001 - a run without records, or a module still growing: said, not raised
        out["error"] = "变更说明生成不了：%s" % str(exc).replace(path, ".").split("\n", 1)[0][:300]
        return out
    out.update(text=text, first=first_line(text), source="records")
    return out


class DescCache:
    """Results of ``describe`` by signature (path, commit, default branch commit, key, credits)."""

    MAX = 300

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._done: "collections.OrderedDict[tuple, dict[str, Any]]" = collections.OrderedDict()
        self._base: dict[tuple, tuple] = {}            # sig without the credits -> the newest full sig
        self._todo: "collections.OrderedDict[tuple, Callable[[], dict[str, Any]]]" = collections.OrderedDict()
        self._worker: threading.Thread | None = None

    def get(self, sig: tuple) -> dict[str, Any] | None:
        with self._lock:
            got = self._done.get(sig)
            if got is not None:
                self._done.move_to_end(sig)
            return got

    def put(self, sig: tuple, result: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self._done[sig] = result
            self._done.move_to_end(sig)
            self._base[sig[:-1]] = sig
            while len(self._done) > self.MAX:
                old, _ = self._done.popitem(last=False)
                if self._base.get(old[:-1]) == old:
                    del self._base[old[:-1]]
            return result

    def get_or_make(self, sig: tuple, make: Callable[[], dict[str, Any]]) -> dict[str, Any]:
        """The result for *sig*, made now (blocking) when there is none."""
        got = self.get(sig)
        return got if got is not None else self.put(sig, make())

    def first(self, sig: tuple, make: Callable[[], dict[str, Any]]) -> str | None:
        """The first line for *sig* when a result made from the same commits is there (whatever its credits);
        otherwise None now, and it is made in the background."""
        with self._lock:
            full = self._base.get(sig[:-1])
            got = self._done.get(full) if full else None
            if got is not None:
                return got.get("first")
            if sig[:-1] not in {s[:-1] for s in self._todo}:
                self._todo[sig] = make
            if self._worker is None or not self._worker.is_alive():
                self._worker = threading.Thread(target=self._drain, daemon=True, name="brain-mrdesc")
                self._worker.start()
        return None

    def _drain(self) -> None:
        while True:
            with self._lock:
                if not self._todo:
                    self._worker = None
                    return
                sig, make = self._todo.popitem(last=False)
            try:
                result = make()
            except Exception as exc:  # noqa: BLE001
                result = empty("变更说明生成不了：%s" % str(exc)[:200])
            self.put(sig, result)
