"""Agents as Kiro Crew chat sessions, opened by this app through Kiro Crew's HTTP API (``gateway.py``); the app never
reaches into the Crew process. Kept from the aidlc-team sample (its session runner was proven live on Kiro Crew 0.11.2)
and extended for brain-kit:

- a requirement's ``brain-dev`` session on this machine sits in a folder of the requirement under 「Brain 需求」, with
  the requirement's worktree as its project directory; a team-runner ``brain-run`` session (dispatched by the bridge
  through ``KiroCrewAdapter`` in team/crewadapter.py) sits under 「Brain 运行机」 and keeps the slot name the bridge
  chose (the run id);
- *strict_agent*: the session boots exactly that template of ~/.kiro/agents (brain-dev / brain-run carry Lean's hooks)
  or is not opened at all: Crew's default agent would run without the hooks;
- *resend* / *nudge*: a bridge message is delivered once (no automatic resend), and a brain session is never told to
  "carry on" by the app (the sample's team-engine nudge text means nothing to it);
- per-slot stats (``slot_stats``): credits summed over the whole transcript (people type into a brain-dev session
  directly, not only the turns the app sent), turns, busy, awaiting approval.

``SessionManager`` keeps the sample's surface (``spawn_session``, ``get``, ``all_agents``, ``cancel``,
``continue_conversation_async``, ``recent``, ``history``, ``credits_of`` …). What a session takes:
``POST /api/chat/slots`` in its folder, then its project directory, then ``trust`` for that one slot (the app holds
``permissions.sessionApproval``, granted by the owner), then the first message. A turn is over when the slot is idle
twice in a row and the transcript has the reply. State lives in ``sessions.json`` in the app's data dir.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import secrets
import tempfile
import time
from pathlib import Path
from typing import Any, Callable

from .gateway import GatewayError

PREFIX = "s-"
ROOT_FOLDER = "Brain 需求"  # the default root folder (constants.LOCAL_FOLDER)
IDLE_POLLS = 2          # idle this many polls in a row (after the reply is in) = the turn is over
MISSING_POLLS = 3       # gone from this many listings in a row = closed or deleted by someone
RESENDS = 2             # a turn KiroCrew refused to start is sent again at most this often
NO_START_S = 90.0       # sent, idle and nothing in the transcript for this long: send again
STALL_S = 180.0         # busy with no new transcript row for this long: shown as 卡住
STUCK_S = 60.0          # busy with nothing new for this long: the turn is stopped and the agent told to carry on (K3 demo: 60 s)
TEMPLATE_SUFFIX = "-template"  # the member templates scripts/install-example.sh writes (<member>-template)
NUDGES = 4              # a turn cut short (a transient model error, or stuck) is continued at most this often
TRANSIENT = re.compile(r"transient|5\d\d|runtime failed|timed? ?out|overloaded|rate.?limit|throttl|temporarily|unavailable",
                       re.I)
HISTORY = 400
STATS_EVERY = 5         # a tracked slot's whole transcript (credits, turns) is read every this many polls
STATS_LIMIT = 1000      # rows read for a slot's stats
_FIELDS = ("id", "task", "parent_session_key", "slot", "title", "folder", "cwd", "model", "conv_root", "send_ids",
           "requested", "started", "sent_at", "done", "queued", "queued_reason", "result", "streaming_text", "error",
           "user_stopped", "turns", "tool_count", "last_tool", "last_activity", "stalled", "credits", "calls",
           "resends", "seen_busy", "idle", "missing", "sig", "agent", "agent_kind", "nudges", "root_folder",
           "project_dir", "slot_name", "first_send_id", "strict_agent", "resend_ok", "nudge_ok", "trust_ok", "kind",
           "key", "memory_mode")
KNOWLEDGE_TOOL = "local_knowledge_search"  # kirocrew-core's knowledge search: shown as 查知识库


def _num(val: Any, default: float = 0) -> float:
    return val if isinstance(val, (int, float)) and not isinstance(val, bool) else default


def first_line(text: Any) -> str:
    return str(text or "").split("\n", 1)[0].strip()


def find_agent(mgr: Any, agent_id: str | None) -> Any | None:
    """A role's agent by id, else None."""
    if mgr is None or not agent_id:
        return None
    try:
        return mgr.get(agent_id)
    except Exception:  # noqa: BLE001
        return None


def find_by_tag(mgr: Any, parent: str, match: Callable[[str], bool]) -> Any | None:
    """The newest agent of *parent* whose task's first line passes *match*: finds one whose id never reached run.json
    (the app stopped between the start and the save), so it is adopted instead of started twice."""
    try:
        infos = list(mgr.all_agents)
    except Exception:  # noqa: BLE001
        infos = []
    hits = [i for i in infos if getattr(i, "parent_session_key", "") == parent and match(first_line(getattr(i, "task", "")))]
    return max(hits, key=lambda i: _num(getattr(i, "started", 0))) if hits else None


async def cancel(mgr: Any, agent_id: str) -> bool:
    try:
        return bool(await mgr.cancel(agent_id))
    except Exception:  # noqa: BLE001
        return False


async def cancel_parent(mgr: Any, parent: str) -> None:
    """Every agent of *parent* still going (catches one started while the run was being stopped)."""
    try:
        await mgr.cancel_for_parent(parent)
    except Exception:  # noqa: BLE001
        pass


def agent_fields(info: Any) -> dict[str, Any]:
    """What the sequencer and the board read of a role's agent, read defensively."""
    def g(name: str, default: Any = None) -> Any:
        return getattr(info, name, default)

    error, stopped = str(g("error", "") or ""), bool(g("user_stopped", False))
    queued = bool(g("queued", False))
    return {
        "id": str(g("id", "") or ""), "done": bool(g("done", False)), "queued": queued,
        "queued_reason": str(g("queued_reason", "") or "") or ("在排队，等 Kiro Crew 开始这个会话" if queued else "") or None,
        "result": str(g("result", "") or ""), "text": str(g("streaming_text", "") or ""), "error": error or None,
        "outcome": "stopped" if stopped else ("failed" if error else "completed"),
        "turns": int(_num(g("turns"))), "tool_count": int(_num(g("tool_count"))), "last_tool": str(g("last_tool", "") or ""),
        "last_activity": _num(g("last_activity"), 0) or None, "started": _num(g("started"), 0) or None,
        "stalled": bool(g("stalled", False)), "awaiting": bool(g("_awaiting_approval", False)),
    }


class SessionInfo:
    """What ``agent_fields`` reads of a role's agent, plus what a session needs."""

    conversation_key = ""
    result_path = ""
    _awaiting_approval = False

    def __init__(self, **kw: Any) -> None:
        self.id = ""
        self.task = ""
        self.parent_session_key = ""
        self.slot: str | None = None
        self.title = ""
        self.folder = ""
        self.cwd = ""
        self.model = ""
        self.conv_root: str | None = None  # the session's first info: what a fix round continues
        self.send_ids: list[str] = []
        self.requested = time.time()
        self.started: float | None = None
        self.sent_at: float | None = None
        self.done = False
        self.queued = True
        self.queued_reason: str | None = "正在开 Crew 会话"
        self.result = ""
        self.streaming_text = ""
        self.error: str | None = None
        self.user_stopped = False
        self.turns = 0
        self.tool_count = 0
        self.last_tool = ""
        self.last_activity: float | None = None
        self.stalled = False
        self.credits: float | None = None
        self.calls: list[dict[str, Any]] = []
        self.resends = 0
        self.seen_busy = False
        self.idle = 0
        self.missing = 0
        self.sig = ""
        self.agent = ""        # the Crew member asked for
        self.agent_kind = ""   # what the session got: member, template, or "" (Crew's default agent)
        self.nudges = 0        # times a cut-short turn was continued
        self.root_folder = ROOT_FOLDER  # the sidebar folder its requirement's folder goes under
        self.project_dir: str | None = None  # the folder's project directory (default: the session's cwd)
        self.slot_name = ""    # an exact slot name (the bridge names runner slots after the run id)
        self.first_send_id = ""  # the first message's sendId (the bridge uses the voucher id)
        self.strict_agent = False  # boot exactly this template of ~/.kiro/agents, or fail
        self.resend_ok = True  # a turn Kiro Crew refused to start may be sent again
        self.nudge_ok = True   # a cut-short turn may be told to carry on (the sample's team engine only)
        self.trust_ok = True   # set the slot to trust (permissions.sessionApproval)
        self.kind = ""         # local | runner (brain sessions)
        self.key = ""          # the requirement key or run id it belongs to
        self.memory_mode = "incognito"
        for k, v in kw.items():
            setattr(self, k, v)

    def to_dict(self) -> dict[str, Any]:
        return {k: getattr(self, k) for k in _FIELDS}

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "SessionInfo":
        return cls(**{k: d[k] for k in _FIELDS if k in d})


def _tool_call(m: dict[str, Any], scrub: Callable[[str], str]) -> dict[str, Any]:
    meta = m.get("meta") if isinstance(m.get("meta"), dict) else {}
    name = str(meta.get("tool_name") or "") or "tool"
    detail = str(m.get("content") or "").replace("🔧", "").strip()
    raw = meta.get("input")
    try:
        args = json.loads(raw) if isinstance(raw, str) and raw.strip().startswith("{") else raw
    except ValueError:
        args = None
    if isinstance(args, dict):
        for k in ("command", "path", "file_path", "pattern", "query"):
            if isinstance(args.get(k), str) and args[k].strip():
                detail = args[k]
                break
    tool = {"shell": "Running", "execute_bash": "Running", "write": "Writing", "fs_write": "Writing", "read": "Reading",
            "fs_read": "Reading", "glob": "Finding", "grep": "Searching", KNOWLEDGE_TOOL: "查知识库",
            "knowledge_list_sources": "看知识库来源"}.get(name, name[:1].upper() + name[1:])
    for word in (tool, name):  # KiroCrew's row text often starts with the tool's own word ("Reading a.md:1")
        if detail.lower().startswith(word.lower() + " "):
            detail = detail[len(word) + 1:]
            break
    detail = " ".join(scrub(detail).split())
    return {"at": _epoch(m.get("ts")), "tool": tool, "kind": str(meta.get("kind") or "") or None,
            "detail": (detail[:119] + "…") if len(detail) > 120 else (detail or None)}


def _epoch(stamp: Any) -> float:
    from datetime import datetime

    try:
        return datetime.fromisoformat(str(stamp).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0.0


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9-]+", "-", text.lower()).strip("-")[:40] or "run"


class SessionManager:
    sessions = True

    def __init__(self, gw: Any, *, app: str, state_file: Path, log: Any, now: Callable[[], float] = time.time,
                 scrub: Callable[[str], str] = lambda s: s) -> None:
        self.gw, self.app, self.state_file, self.log, self.now, self.scrub = gw, app, Path(state_file), log, now, scrub
        self._infos: dict[str, SessionInfo] = {}
        self._folders: dict[str, dict[str, Any]] = {}  # parent → {"id", "name", "root"}
        self._stats: dict[str, dict[str, Any]] = {}    # slot → what slot_stats() answers
        self._folder_lock: asyncio.Lock | None = None  # made on the loop (Python 3.9 binds a Lock at creation)
        self._tasks: set[asyncio.Task[Any]] = set()
        self._dirty = False
        self._polls = 0
        self.max_concurrent = 16

    # ---- persistence ----------------------------------------------------------------------------------- #

    def load(self) -> None:
        try:
            data = json.loads(self.state_file.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return
        for d in data.get("infos", []):
            if isinstance(d, dict) and str(d.get("id", "")).startswith(PREFIX):
                info = SessionInfo.from_dict(d)
                if not info.done and info.queued and not info.slot:  # it was being opened when the app stopped
                    info.done, info.error = True, "app 重启时这个会话还没开好"
                self._infos[info.id] = info
        self._folders = {k: v for k, v in (data.get("folders") or {}).items() if isinstance(v, dict)}
        self._stats = {k: v for k, v in (data.get("stats") or {}).items() if isinstance(v, dict)}

    def _save_now(self) -> None:
        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        keep = sorted(self._infos.values(), key=lambda i: i.requested)[-400:]
        slots = {i.slot for i in keep if i.slot}
        text = json.dumps({"infos": [i.to_dict() for i in keep], "folders": self._folders,
                           "stats": {k: v for k, v in self._stats.items() if k in slots}}, ensure_ascii=False)
        fd, tmp = tempfile.mkstemp(dir=self.state_file.parent, prefix=".sessions.")
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(text)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, self.state_file)

    async def save(self) -> None:
        if self._dirty:
            self._dirty = False
            await asyncio.to_thread(self._save_now)

    # ---- the agent manager surface ----------------------------------------------------------------------- #

    def get(self, agent_id: str) -> SessionInfo | None:
        return self._infos.get(agent_id)

    @property
    def all_agents(self) -> list[SessionInfo]:
        return list(self._infos.values())

    @property
    def running_count(self) -> int:
        return sum(1 for i in self._infos.values() if not i.done and not i.queued)

    @property
    def queued_count(self) -> int:
        return sum(1 for i in self._infos.values() if not i.done and i.queued)

    def spawn_session(self, task: str, *, parent_session_key: str, cwd: str, model: str | None = None, title: str = "",
                      folder: str = "", agent: str = "", **opts: Any) -> SessionInfo:
        """A new session (synchronous: it is opened in the background, on the next poll). *opts*: SessionInfo fields
        (root_folder, project_dir, strict_agent, resend_ok, nudge_ok, trust_ok, kind, key …)."""
        info = self._new_info(task, parent_session_key, cwd, model, title, folder, agent, opts)
        self._background(self._open(info))
        return info

    async def open_session(self, task: str, *, parent_session_key: str, cwd: str, model: str | None = None,
                           title: str = "", folder: str = "", agent: str = "", **opts: Any) -> SessionInfo:
        """Like spawn_session, but opened now: the answer has the slot key (or the error)."""
        info = self._new_info(task, parent_session_key, cwd, model, title, folder, agent, opts)
        await self._open(info)
        return info

    def _new_info(self, task: str, parent: str, cwd: str, model: str | None, title: str, folder: str, agent: str,
                  opts: dict[str, Any]) -> SessionInfo:
        known = set(_FIELDS)
        info = SessionInfo(id=PREFIX + secrets.token_hex(5), task=task, parent_session_key=parent, cwd=cwd,
                           model=model or "", title=title or "agent", folder=folder or parent,
                           requested=self.now(), agent=agent or "", **{k: v for k, v in opts.items() if k in known})
        info.conv_root = info.id
        self._infos[info.id] = info
        self._dirty = True
        return info

    async def continue_conversation_async(self, conv_id: str, task: str, *, parent_session_key: str, **_: Any) -> SessionInfo:
        """The next turn in the session of *conv_id* (a later message keeps the session's whole conversation)."""
        root = self._infos.get(conv_id)
        info = SessionInfo(id=PREFIX + secrets.token_hex(5), task=task, parent_session_key=parent_session_key,
                           requested=self.now(), conv_root=conv_id)
        self._infos[info.id] = info
        self._dirty = True
        if root is None or not root.slot:
            info.done, info.error = True, "conversation_gone: 找不到这个会话"
            return info
        busy = [i for i in self._infos.values() if i.slot == root.slot and not i.done and i is not info]
        if busy:
            info.done, info.error = True, "conversation_busy: 这个会话还有一轮没结束"
            return info
        self._inherit(info, root)
        try:
            await self._send(info)
        except Exception as exc:  # noqa: BLE001
            info.done, info.error = True, f"发不出去：{exc}"[:300]
            return info
        info.queued, info.queued_reason, info.started = False, None, self.now()
        return info

    @staticmethod
    def _inherit(info: SessionInfo, root: SessionInfo) -> None:
        info.slot, info.title, info.folder, info.cwd, info.model = root.slot, root.title, root.folder, root.cwd, root.model
        info.agent, info.agent_kind = root.agent, root.agent_kind
        info.resend_ok, info.nudge_ok, info.kind, info.key = root.resend_ok, root.nudge_ok, root.kind, root.key
        info.root_folder, info.strict_agent = root.root_folder, root.strict_agent

    async def cancel(self, agent_id: str) -> bool:
        info = self._infos.get(agent_id)
        if info is None or info.done:
            return False
        if info.slot:
            try:
                await self.gw.stop(info.slot)
            except Exception as exc:  # noqa: BLE001
                self.log.info(self.app + ": stopping session %s: %s", info.slot, exc)
        info.done, info.user_stopped = True, True
        self._dirty = True
        return True

    async def cancel_for_parent(self, parent: str) -> None:
        await asyncio.gather(*(self.cancel(i.id) for i in list(self._infos.values()) if i.parent_session_key == parent))

    # ---- what the views read --------------------------------------------------------------------------- #

    def credits_of(self, agent_id: str) -> float | None:
        info = self._infos.get(agent_id)
        return info.credits if info is not None else None

    def slot_of(self, agent_id: str | None) -> str | None:
        info = self._infos.get(agent_id or "")
        return info.slot if info is not None else None

    def recent(self, agent_id: str | None) -> list[dict[str, Any]]:
        info = self._infos.get(agent_id or "")
        return list(info.calls[-8:]) if info is not None else []

    def history(self, agent_id: str) -> list[dict[str, Any]]:
        info = self._infos.get(agent_id)
        return list(info.calls) if info is not None else []

    def folder_of(self, parent: str) -> dict[str, Any] | None:
        return self._folders.get(parent)

    def roots(self, *, key: str | None = None, kind: str | None = None) -> list[SessionInfo]:
        """The sessions this app opened (their first info), newest last; of one requirement / run, of one kind."""
        out = [i for i in self._infos.values() if i.conv_root == i.id and (key is None or i.key == key)
               and (kind is None or i.kind == kind)]
        return sorted(out, key=lambda i: i.requested)

    def slot_stats(self, slot: str | None) -> dict[str, Any] | None:
        """{credits, turns, busy, awaiting, last_activity, missing, error} of a slot this app opened (None: unknown)."""
        return dict(self._stats[slot]) if slot and slot in self._stats else None

    def credits_by_key(self) -> dict[str, float]:
        """Credits per requirement key / run id over every slot this app opened for it (each slot counted once)."""
        out: dict[str, float] = {}
        seen: set[str] = set()
        for i in self._infos.values():
            if not i.key or not i.slot or i.slot in seen:
                continue
            seen.add(i.slot)
            st = self._stats.get(i.slot) or {}
            c = st.get("credits")
            if c is None:
                c = sum(float(x.credits) for x in self._infos.values() if x.slot == i.slot and x.credits is not None) \
                    if any(x.credits is not None for x in self._infos.values() if x.slot == i.slot) else None
            if c is not None:
                out[i.key] = round(out.get(i.key, 0.0) + float(c), 3)
        return out

    # ---- opening, sending, watching -------------------------------------------------------------------- #

    def _background(self, coro: Any) -> None:
        task = asyncio.get_running_loop().create_task(coro)
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _folder_for(self, info: SessionInfo) -> str:
        if self._folder_lock is None:
            self._folder_lock = asyncio.Lock()
        async with self._folder_lock:
            have = self._folders.get(info.parent_session_key)
            if have and have.get("id"):
                return str(have["id"])
            root_name = info.root_folder or ROOT_FOLDER
            folders = await self.gw.folders()
            root = next((f for f in folders if f.get("name") == root_name and not f.get("parent_id")
                         and f.get("owner_app") in (self.app, None, "")), None)
            if root is None:
                root = await self.gw.create_folder(root_name)
            if info.project_dir is not None:
                project_dir = info.project_dir or None
            else:  # the sample's layout: <run>/wt/<role> → the run's folder
                run_dir = str(Path(info.cwd).parents[1]) if info.cwd and len(Path(info.cwd).parents) > 1 else None
                project_dir = run_dir
            sub = await self.gw.create_folder(info.folder[:60], parent_id=str(root.get("id") or ""),
                                              project_dir=project_dir if project_dir and Path(project_dir).is_dir() else None)
            self._folders[info.parent_session_key] = {"id": str(sub.get("id") or ""), "name": info.folder[:60],
                                                      "root": str(root.get("id") or ""), "root_name": root_name}
            self._dirty = True
            return self._folders[info.parent_session_key]["id"]

    async def _open(self, info: SessionInfo) -> None:
        try:
            folder_id = await self._folder_for(info)
            if info.slot_name:
                name = info.slot_name
            else:
                n = sum(1 for i in self._infos.values() if i.parent_session_key == info.parent_session_key and i.slot) + 1
                name = f"{self.app}-{_slug(info.parent_session_key.split(':')[-1])}-{n}-{secrets.token_hex(2)}"
            row = await self._create(info, name, folder_id)
            key = str(row.get("key") or row.get("name") or "")
            if not key:
                raise GatewayError(0, "创建会话没有返回 key", "no_key")
            info.slot = key
            self._stats.setdefault(key, {"credits": None, "turns": 0, "busy": False, "awaiting": False,
                                         "last_activity": None, "missing": False, "error": None,
                                         "opened_at": self.now()})
            if info.cwd:
                await self.gw.set_project(key, info.cwd)
            if info.trust_ok:
                await self.gw.trust(key)
            if info.task:
                await self._send(info)
                info.queued, info.queued_reason, info.started = False, None, self.now()
            else:  # opened without a first message: nothing to wait for
                info.queued, info.queued_reason, info.started, info.done = False, None, self.now(), True
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            info.done, info.error = True, f"开 Crew 会话失败：{exc}"[:300]
            self.log.warning(self.app + ": opening a session for %s failed: %s", info.title, exc)
        self._dirty = True

    async def _create(self, info: SessionInfo, name: str, folder_id: str) -> dict[str, Any]:
        """The slot. *strict_agent*: exactly the template ``info.agent`` of ~/.kiro/agents, or an error (a brain
        session must not fall back to an agent without Lean's hooks). Otherwise the sample's order: the member template
        ``<member>-template``, the Crew member, its template file of the same name, Crew's default agent."""
        if info.strict_agent:
            try:
                row = await self.gw.create_slot(name=name, title=info.title, folder_id=folder_id, model=info.model,
                                                memory_mode=info.memory_mode or "incognito", agent=info.agent,
                                                agent_kind="template")
            except GatewayError as exc:
                if exc.status in (400, 404, 409):
                    raise GatewayError(exc.status, f"Kiro Crew 里没有 agent {info.agent}（~/.kiro/agents/{info.agent}.json）",
                                       exc.code or "agent_choice_unavailable", exc.path) from None
                raise
            info.agent_kind = "template"
            return row
        tries = ([("template", info.agent + TEMPLATE_SUFFIX), ("member", info.agent), ("template", info.agent)]
                 if info.agent else []) + [("", "")]
        for kind, agent in tries:
            try:
                row = await self.gw.create_slot(name=name, title=info.title, folder_id=folder_id, model=info.model,
                                                agent=agent, agent_kind=kind)
            except GatewayError as exc:
                if kind and exc.status in (400, 404, 409):
                    self.log.info(self.app + ": %s as a %s is not there (%s), trying the next", agent, kind, exc.code)
                    continue
                raise
            info.agent_kind = kind
            return row
        raise GatewayError(409, f"开不了 {info.agent} 的会话", "agent_choice_unavailable")  # pragma: no cover

    def knowledge_hits(self, agent_id: str | None) -> list[dict[str, Any]]:
        info = self._infos.get(agent_id or "")
        return [c for c in (info.calls if info is not None else []) if c.get("tool") == "查知识库"]

    def agent_of(self, agent_id: str | None) -> dict[str, str] | None:
        info = self._infos.get(agent_id or "")
        return {"name": info.agent, "kind": info.agent_kind} if info is not None and info.agent else None

    async def _send(self, info: SessionInfo) -> None:
        sid = info.first_send_id if info.first_send_id and not info.send_ids else f"{info.id}-{len(info.send_ids)}"
        info.send_ids.append(sid)
        info.sent_at, info.idle, info.seen_busy, info.sig = self.now(), 0, False, ""
        info.last_activity = info.sent_at
        self._dirty = True
        await self.gw.send(str(info.slot), info.task, sid)

    async def _nudge(self, info: SessionInfo, why: str) -> None:
        """The sample's team engine only (``nudge_ok``): a cut-short turn is told to carry on."""
        info.nudges += 1
        sid = f"{info.id}-{len(info.send_ids)}"
        info.send_ids.append(sid)
        info.sent_at, info.idle, info.seen_busy, info.sig = self.now(), 0, False, ""
        info.last_activity = info.sent_at
        info.last_tool = f"中断了（{why}），编排器让它接着做（第 {info.nudges} 次）"
        self._dirty = True
        self.log.info(self.app + ": session %s was cut short (%s), continuing (%d)", info.slot, why, info.nudges)
        await self.gw.send(str(info.slot), "（编排器）你上一轮被中断了：" + why + "。你已经做的改动都在工作目录里：先 `git status`、"
                           "`git log --oneline -3` 看一眼做到哪了，再接着把原来的任务做完；做完照原来的要求提交，最后一条回复的第一行写 `DONE: ` 加一句话总结。", sid)

    async def poll(self) -> None:
        """One look: a single listing, then the transcript of each live turn; every STATS_EVERY polls also the whole
        transcript of every slot this app opened (credits, turns)."""
        self._polls += 1
        live = [i for i in self._infos.values() if not i.done and i.slot and not i.queued]
        tracked = [k for k, st in self._stats.items() if not st.get("missing")]
        deep = bool(tracked) and self._polls % STATS_EVERY == 1
        if live or deep:
            try:
                rows = {str(r.get("key") or ""): r for r in await self.gw.slots()}
            except Exception as exc:  # noqa: BLE001
                self.log.info(self.app + ": listing sessions failed: %s", exc)
                rows = None
            if rows is not None:
                await asyncio.gather(*(self._update(i, rows.get(str(i.slot))) for i in live), return_exceptions=True)
                if deep:
                    await asyncio.gather(*(self._stat(k, rows.get(k)) for k in tracked), return_exceptions=True)
        await self.save()

    async def _stat(self, slot: str, row: dict[str, Any] | None) -> None:
        st = self._stats.setdefault(slot, {})
        if row is None:
            st["misses"] = int(st.get("misses") or 0) + 1
            if st["misses"] >= MISSING_POLLS:
                st["missing"], st["busy"] = True, False
            self._dirty = True
            return
        st["misses"] = 0
        st["busy"] = bool(row.get("running") or row.get("pending_approval") or int(row.get("queue_depth") or 0))
        st["awaiting"] = bool(row.get("pending_approval"))
        try:
            msgs = await self.gw.messages(slot, limit=STATS_LIMIT)
        except Exception as exc:  # noqa: BLE001
            st["error"] = f"{exc}"[:200]
            self._dirty = True
            return
        replies = [m for m in msgs if m.get("role") == "assistant" and str(m.get("content") or "").strip()]
        spent = [((m.get("meta") or {}).get("turn_stats") or {}).get("credits") for m in replies]
        vals = [float(v) for v in spent if isinstance(v, (int, float)) and not isinstance(v, bool)]
        stamps = [_epoch(m.get("ts")) for m in msgs if m.get("ts")]
        st.update(credits=round(sum(vals), 3) if vals else st.get("credits"), turns=len(replies),
                  last_activity=max(stamps) if stamps else st.get("last_activity"), error=None)
        self._dirty = True

    async def _update(self, info: SessionInfo, row: dict[str, Any] | None) -> None:
        now = self.now()
        if row is None:
            info.missing += 1
            if info.missing >= MISSING_POLLS:
                info.done, info.error = True, "Crew 里找不到这个会话了（被关掉或删除了）"
                self._dirty = True
            return
        info.missing = 0
        busy = bool(row.get("running") or row.get("pending_approval") or int(row.get("queue_depth") or 0))
        info._awaiting_approval = bool(row.get("pending_approval"))
        try:
            msgs = await self.gw.messages(str(info.slot), limit=300)
        except Exception as exc:  # noqa: BLE001
            self.log.info(self.app + ": reading session %s failed: %s", info.slot, exc)
            return
        mine = None
        for idx in range(len(msgs) - 1, -1, -1):
            meta = msgs[idx].get("meta") if isinstance(msgs[idx].get("meta"), dict) else {}
            if msgs[idx].get("role") == "user" and meta.get("sendId") in info.send_ids:
                mine = idx
                break
        after = msgs[mine + 1:] if mine is not None else []
        calls = [_tool_call(m, self.scrub) for m in after if m.get("role") == "tool"]
        replies = [m for m in after if m.get("role") == "assistant" and str(m.get("content") or "").strip()]
        errors = [m for m in after if m.get("role") == "error"]
        info.calls, info.tool_count, info.turns = calls[-HISTORY:], len(calls), len(replies)
        if calls:
            info.last_tool = f"{calls[-1]['tool']} {calls[-1]['detail'] or ''}".strip()
        spent = [((m.get("meta") or {}).get("turn_stats") or {}).get("credits") for m in replies]
        vals = [float(v) for v in spent if isinstance(v, (int, float))]
        info.credits = round(sum(vals), 3) if vals else info.credits
        sig = f"{len(after)}:{len(str(after[-1].get('content') or '')) if after else 0}"
        if sig != info.sig:
            info.sig, info.last_activity = sig, now
        info.stalled = busy and now - float(info.last_activity or now) > STALL_S
        self._dirty = True
        quiet = now - float(info.last_activity or now)
        if info.nudge_ok and busy and quiet > STUCK_S and info.nudges < NUDGES:  # hung: stop the turn, then carry on
            try:
                await self.gw.stop(str(info.slot))
            except Exception as exc:  # noqa: BLE001
                self.log.info(self.app + ": stopping stuck session %s: %s", info.slot, exc)
            await self._nudge(info, f"{int(quiet)} 秒没有任何动静")
            return
        last = after[-1] if after else None
        if (info.nudge_ok and not busy and last is not None and last.get("role") == "error" and (calls or replies)
                and info.nudges < NUDGES
                and TRANSIENT.search(f"{last.get('content') or ''} {(last.get('meta') or {}).get('code') or ''}")):
            await self._nudge(info, "模型后端临时出错")
            return
        if errors and not replies and not calls and not busy:
            if info.resend_ok and info.resends < RESENDS:  # Kiro Crew did not start the turn (memory_unavailable …)
                info.resends += 1
                self.log.info(self.app + ": session %s refused the turn (%s), sending again", info.slot,
                              ((errors[-1].get("meta") or {}).get("code") or "error"))
                await self._send(info)
                return
        if (not after and not busy and now - float(info.sent_at or now) > NO_START_S and info.resend_ok
                and info.resends < RESENDS):
            info.resends += 1
            await self._send(info)
            return
        if busy:
            info.seen_busy, info.idle = True, 0
            return
        info.idle += 1
        if info.idle < IDLE_POLLS or not (replies or errors or (info.seen_busy and info.idle >= IDLE_POLLS + 1)):
            return
        if replies:
            info.result = str(replies[-1].get("content") or "")
            info.streaming_text = "\n\n".join(str(m.get("content") or "") for m in replies)[-20000:]
        elif errors:
            info.error = (str(errors[-1].get("content") or "") or "KiroCrew 报错")[:300]
        else:
            info.error = "这一轮结束了，但没有回复"
        info.done = True

    # ---- the bridge's KiroCrew surface (team/crewadapter.py calls these on the event loop) ----------------- #

    def by_slot(self, slot: str) -> SessionInfo | None:
        """The first info of the session in *slot*."""
        hits = [i for i in self._infos.values() if i.slot == slot and i.conv_root == i.id]
        return min(hits, key=lambda i: i.requested) if hits else None

    async def adapter_create(self, name: str, *, agent: str, model: str, memory_mode: str, title: str, folder: str,
                             parent: str, key: str, root_folder: str) -> dict[str, Any]:
        """Create the slot *name* (exactly) booting the template *agent*, in *folder* under *root_folder*; no message
        yet (the bridge sets the project, then sends). Raises GatewayError."""
        if self.by_slot(name) is not None:
            raise GatewayError(409, f"会话 {name} 已经开过了", "slot_exists")
        info = self._new_info("", parent, "", model, title, folder, agent,
                              {"slot_name": name, "strict_agent": True, "resend_ok": False, "nudge_ok": False,
                               "trust_ok": False, "kind": "runner", "key": key, "root_folder": root_folder,
                               "project_dir": "", "memory_mode": memory_mode or "incognito"})
        await self._open(info)
        if info.error:
            self._infos.pop(info.id, None)
            raise GatewayError(0, info.error, "open_failed")
        return {"key": info.slot}

    async def adapter_set_project(self, name: str, path: str) -> dict[str, Any]:
        """The project directory, then trust for this one slot: nobody is at the runner to approve tool calls."""
        info = self.by_slot(name)
        await self.gw.set_project(name, path)
        await self.gw.trust(name)
        if info is not None:
            info.cwd = path
            self._dirty = True
        return {"ok": True}

    async def adapter_send(self, name: str, message: str, send_id: str) -> dict[str, Any]:
        """One message, delivered once (no automatic resend): a new turn of the slot, its sendId the bridge's."""
        root = self.by_slot(name)
        info = SessionInfo(id=PREFIX + secrets.token_hex(5), task=message, parent_session_key=root.parent_session_key
                           if root else f"{self.app}:{name}", requested=self.now(),
                           conv_root=root.id if root else None, first_send_id=send_id)
        if root is not None:
            self._inherit(info, root)
        else:
            info.slot, info.resend_ok, info.nudge_ok, info.kind = name, False, False, "runner"
        info.resend_ok, info.nudge_ok = False, False
        self._infos[info.id] = info
        self._dirty = True
        await self._send(info)
        info.queued, info.queued_reason, info.started = False, None, self.now()
        return {"ok": True}

    async def adapter_stop(self, name: str) -> dict[str, Any]:
        await self.gw.stop(name)
        for i in self._infos.values():
            if i.slot == name and not i.done:
                i.done, i.user_stopped = True, True
        self._dirty = True
        return {"ok": True}

    async def adapter_slot(self, name: str) -> dict[str, Any]:
        return {"key": name, "messages": await self.gw.messages(name, limit=STATS_LIMIT)}

    # ---- cleaning up ----------------------------------------------------------------------------------- #

    async def cleanup(self, keep_parents: set[str]) -> dict[str, int]:
        """Delete every session this app opened, except those of *keep_parents*, and hide the folders they leave empty
        under this app's root folders: Kiro Crew lets only a person delete a folder."""
        keep_slots = {i.slot for i in self._infos.values() if i.parent_session_key in keep_parents and i.slot}
        keep_folders = {str(v.get("id")) for k, v in self._folders.items() if k in keep_parents}
        roots = {v.get("root_name") or ROOT_FOLDER for v in self._folders.values()} | {ROOT_FOLDER}
        slots = [r for r in await self.gw.slots() if r.get("app") == self.app and str(r.get("key")) not in keep_slots]
        deleted = 0
        for r in slots:
            try:
                await self.gw.delete_slot(str(r.get("key")))
                deleted += 1
            except Exception as exc:  # noqa: BLE001
                self.log.info(self.app + ": deleting session %s: %s", r.get("key"), exc)
        folders = await self.gw.folders()
        root_ids = {str(f.get("id")) for f in folders if f.get("name") in roots and not f.get("parent_id")}
        gone = 0
        for f in folders:
            fid = str(f.get("id"))
            if (str(f.get("parent_id") or "") in root_ids and fid not in keep_folders and f.get("owner_app") == self.app
                    and not f.get("hidden")):
                try:
                    await self.gw.hide_folder(fid)
                    gone += 1
                except Exception as exc:  # noqa: BLE001
                    self.log.info(self.app + ": hiding folder %s: %s", fid, exc)
        for parent in [k for k in self._folders if k not in keep_parents]:
            self._folders.pop(parent, None)
        for info in self._infos.values():
            if info.parent_session_key not in keep_parents and info.slot:
                if not info.done:
                    info.done, info.user_stopped = True, True
                self._stats.pop(info.slot, None)
                info.slot = None
        self._dirty = True
        await self.save()
        return {"sessions": deleted, "folders": gone}
