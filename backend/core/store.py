"""What this app itself did for a requirement (开需求, 开会话, an answer sent), on disk: ``events/<scope>.jsonl``,
appended, read back for the timeline. Kept from the sample's store (append-only JSONL, written off the event loop,
a torn line skipped on reading); the run state it also kept is brain-kit's now (run.json, the Lean ledger).

A scope is ``<repo id>-<KEY>`` (``r1-PAY-3``) or a run id (``RUN-PAY-3-1``). No document text, no tokens: an event
carries ids, paths and the app's own sentences only.
"""

from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path
from typing import Any

TRUSTED = "工具调用不用逐个批准"     # a session opened trusted (KiroCrew's trust: no approval per tool call)
# what an older version of this app wrote, said the way it is written now (a command and a session's slot name are
# nobody's words)
OLD_LABEL = ((re.compile(r"^brain reflect --apply --push[：:]"), "回写 Brain 并推送："),
             (re.compile(r"^brain reflect --apply[：:]"), "回写 Brain："),
             (re.compile(r"^开了 brain-dev 会话$"), "开了本机会话"))
SCOPE_RE = re.compile(r"^(?:r[1-9][0-9]{0,2}|runner)-[A-Z][A-Z0-9]{0,9}-[1-9][0-9]{0,6}$|^RUN-[A-Z0-9-]{3,40}$")
KEEP = 500


class Store:
    def __init__(self, root: Path) -> None:
        self.root = Path(root)

    def append(self, scope: str, kind: str, label: str, detail: str | None = None, at: float | None = None) -> dict:
        """Blocking: call it in a thread."""
        if not SCOPE_RE.match(scope):
            raise ValueError("bad scope %r" % scope)
        ev = {"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(at or time.time())), "kind": kind,
              "label": str(label)[:200], "detail": (str(detail)[:300] if detail else None)}
        self.root.mkdir(parents=True, exist_ok=True)
        with (self.root / (scope + ".jsonl")).open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(ev, ensure_ascii=False) + "\n")
        return ev

    def events(self, scope: str) -> list[dict[str, Any]]:
        """The scope's events, oldest first, as timeline items (kind app). Blocking."""
        if not SCOPE_RE.match(scope):
            return []
        try:
            with (self.root / (scope + ".jsonl")).open("rb") as fh:
                fh.seek(0, os.SEEK_END)
                fh.seek(max(0, fh.tell() - 500_000))
                lines = fh.read().decode("utf-8", "replace").splitlines()
        except OSError:
            return []
        out = []
        for line in lines[-KEEP:]:
            try:
                ev = json.loads(line)
            except ValueError:
                continue  # a torn line
            if isinstance(ev, dict) and ev.get("label"):
                label, detail = str(ev["label"]), ev.get("detail")
                for rx, now in OLD_LABEL:
                    if rx.match(label):
                        label = rx.sub(now, label)
                        if now == "开了本机会话":   # its detail was the slot's name, then 「，信任这个会话」
                            detail = TRUSTED if "信任" in str(detail or "") else None
                out.append({"at": ev.get("at"), "kind": "app", "label": label, "detail": detail, "who": None,
                            "src": "app"})
        return out
