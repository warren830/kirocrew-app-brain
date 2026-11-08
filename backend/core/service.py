"""The app's single service object per enable: settings, brain-kit, the repos, the sessions, team mode, and every
view the routes answer. Built by ``register_routes`` (no I/O), started by ``on_startup``, stopped by ``on_shutdown``.

Repo reads, brain-kit calls and git run in worker threads (``asyncio.to_thread``); the session manager is only touched
on the event loop (a snapshot of it goes into the thread).
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import threading
import time
from pathlib import Path
from typing import Any, Callable

from . import bk, brainview, crewcheck, deliveries, detail, intake, lean_view, mrinfo, settings as settings_mod
from . import todo as todo_mod
from .constants import APP_NAME, APP_ROOT, KEY_RE, LOCAL_AGENT, LOCAL_FOLDER, REPO_ID_RE, TICK_S, VERSION
from .gateway import Gateway
from .httpkit import AppError
from .repo import Repo, Source, read_facts
from .sessions import SessionManager
from .store import Store

_REGISTRY: dict[str, "Service"] = {}
_SECRETS = re.compile(r"(?i)((?:password|passwd|secret|token|api[_-]?key|authorization)\s*[=:]\s*|bearer\s+)\S+"
                      r"|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|glpat-[A-Za-z0-9_-]{16,}")
EVAL_TTL_S = 120.0
MR_EVERY_S = 30.0
CREW_EVERY_S = 300.0
TRACE_TTL_S = 15.0


def basic_scrub(text: str) -> str:
    return _SECRETS.sub(lambda m: (m.group(1) or "") + "[已隐去]", text)


def scope_of(rid: str, key: str) -> str:
    return "%s-%s" % (rid, key)


SCRUB_KEYS = ("text", "why", "question", "label", "detail", "status", "next", "open_questions", "output", "reasons",
              "findings", "blocking", "error", "session_error", "notes", "warnings", "problems")


def scrub_tree(obj: Any, scrub: Callable[[str], str], key: str = "") -> Any:
    """Agent- and tool-written text on its way to the page goes through the scrubber (KiroCrew's own when it has one):
    decisions, Session notes, questions, timeline lines, command output. Ids, paths and numbers are left alone."""
    if isinstance(obj, dict):
        return {k: scrub_tree(v, scrub, k) for k, v in obj.items()}
    if isinstance(obj, list):
        return [scrub_tree(v, scrub, key) for v in obj]
    if isinstance(obj, str) and key in SCRUB_KEYS and obj:
        return scrub(obj)
    return obj


class Service:
    def __init__(self, ctx: Any, *, sessions: Any = None, transport: Any = None, now: Callable[[], float] = time.time,
                 signer_kick: Callable[[], Any] | None = None, sign_timeout: float | None = None) -> None:
        self.ctx = ctx
        self.name = getattr(ctx, "name", APP_NAME) or APP_NAME
        self.log = getattr(ctx, "logger", None) or logging.getLogger(APP_NAME)
        self.data_dir = Path(getattr(ctx, "data_dir", ".") or ".")
        self.now = now
        self.transport = transport  # GitLab / Jira transport (tests); None: brain-kit's own
        # tests: run the signer while brain-kit's SpoolSigner waits, and wait less than bridge.json says
        self.signer_kick, self.sign_timeout = signer_kick, sign_timeout
        self.started = False
        self.settings = settings_mod.load(self.data_dir / "settings.json")
        self.sessions = sessions or SessionManager(Gateway(self.name, APP_ROOT / ".app_secret"), app=self.name,
                                                   state_file=self.data_dir / "sessions.json", log=self.log,
                                                   scrub=self.scrub)
        self.store = Store(self.data_dir / "events")
        self.mr = mrinfo.MrCache()
        self.repos: dict[str, Repo] = {}
        self.repo_errors: dict[str, tuple[str, str]] = {}
        self.crew: dict[str, Any] = {"rows": [], "fix": {"agent": False, "engine": False}, "checked_at": None}
        self.team: Any = None
        self._tasks: list[asyncio.Task] = []
        self._mr_wanted: dict[tuple, tuple[str, str]] = {}   # (base, project, branch) -> (scope, kit bridge_user)
        self._eval: dict[str, tuple] = {}
        self._eval_running: set[str] = set()
        self._trace: dict[tuple, tuple] = {}
        self._me: str | None = None

    # ---- lifecycle ------------------------------------------------------------------------------------ #

    def scrub(self, text: str) -> str:
        """KiroCrew's own outbound redaction (``ctx.scrub``) when there is one, else a few obvious patterns."""
        if not text:
            return ""
        sdk = getattr(self.ctx, "scrub", None)
        if sdk is not None:
            try:
                return sdk.outbound(text).text
            except Exception:  # noqa: BLE001
                pass
        return basic_scrub(text)

    async def start(self) -> None:
        if self.started:
            return
        self.data_dir.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(self.sessions.load)
        await asyncio.to_thread(self.reload_sync)
        await self._start_team()
        self.started = True
        loop = asyncio.get_running_loop()
        self._tasks = [loop.create_task(self._forever()), loop.create_task(self._slow())]
        if self.team is not None:
            self._tasks.append(loop.create_task(self._team_forever()))
        self.log.info("brain: started, brain-kit %s, %d repos, team %s", bk.info().get("version"), len(self.repos),
                      "on" if self.team is not None else "off")

    async def stop(self) -> None:
        self.started = False
        for t in self._tasks:
            t.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks = []
        if self.team is not None:
            await asyncio.to_thread(self.team.stop)
            self.team = None
        if hasattr(self.sessions.gw, "close"):
            await self.sessions.gw.close()
        bk.unload()

    def reload_sync(self) -> None:
        """brain-kit from settings.brainkit, then the repos (their kit.json through brain-kit)."""
        bk.load(self.settings["brainkit"])
        self.repos, self.repo_errors = {}, {}
        for i, path in enumerate(self.settings["repos"], 1):
            rid = "r%d" % i
            try:
                if not bk.ok():
                    raise RuntimeError("brain-kit 没装载")
                if not os.path.isdir(path):
                    raise RuntimeError("找不到这个目录")
                cfg = bk.m("config").load(path)
                self.repos[rid] = Repo(rid, path, cfg)
            except Exception as exc:  # noqa: BLE001
                self.repo_errors[rid] = (path, str(exc).split("\n", 1)[0][:300])
        self._eval.clear()
        self._trace.clear()
        self.crew = crewcheck.checks([r.path for r in self.repos.values()])

    async def _start_team(self) -> None:
        team = self.settings["team"]
        if self.team is not None:
            await asyncio.to_thread(self.team.stop)
            self.team = None
        if not team.get("enabled") or not bk.ok():
            return
        from .team.bridgehost import TeamRuntime
        loop = asyncio.get_running_loop()
        rt = TeamRuntime(team, loop, self.sessions, self.log, transport=self.transport, kick=self.signer_kick,
                         sign_timeout=self.sign_timeout, scrub=self.scrub)
        await loop.run_in_executor(rt.executor, rt.start)
        self.team = rt

    async def _in_team(self, fn: Callable[[], Any]) -> Any:
        """Run on the team runtime's own worker: one round at a time, off the event loop and the default pool (a round
        waits on GitLab, KiroCrew and the signer). The ledger itself may be read from any thread."""
        return await asyncio.get_running_loop().run_in_executor(self.team.executor, fn)

    async def _forever(self) -> None:
        while True:
            try:
                await self.sessions.poll()
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001
                self.log.exception("brain: polling the sessions failed")
            await asyncio.sleep(TICK_S)

    async def refresh_mrs(self) -> None:
        """The MRs of handed-over runs (person mode), each at most every mrinfo.TTL_S. Only the notes of the account
        the repo's kit.json names as bridge_user are the bridge's (when it names one)."""
        for (base, project, branch), (_, bridge_user) in list(self._mr_wanted.items()):
            if self.mr.due(project, branch):
                await asyncio.to_thread(self.mr.refresh, base, project, branch, transport=self.transport,
                                        bridge_user=bridge_user or None)

    async def _slow(self) -> None:
        """MRs of handed-over runs (person mode), and the KiroCrew checks now and then."""
        last_crew = time.monotonic()
        while True:
            try:
                await asyncio.sleep(MR_EVERY_S)
                await self.refresh_mrs()
                if time.monotonic() - last_crew > CREW_EVERY_S:
                    last_crew = time.monotonic()
                    self.crew = await asyncio.to_thread(crewcheck.checks, [r.path for r in self.repos.values()])
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001
                self.log.exception("brain: background refresh failed")

    async def _team_forever(self) -> None:
        while True:
            try:
                if self.team is not None and self.team.host is not None:
                    await self._in_team(self.team.loop_once)
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001
                self.log.exception("brain: the bridge loop failed")
            await asyncio.sleep(self.team.interval() if self.team is not None else 60)

    # ---- small helpers -------------------------------------------------------------------------------- #

    def _repo(self, rid: str) -> Repo:
        if not REPO_ID_RE.match(rid or "") or rid not in self.repos:
            raise AppError("没有这个仓库", "no_repo", 404)
        return self.repos[rid]

    def me(self) -> str | None:
        """Who this machine says the person is: $BRAIN_USER, else git config brain.user of a repo (never a token)."""
        who = os.environ.get("BRAIN_USER", "").strip().lower()
        if not who:
            for r in self.repos.values():
                who = r.git.out("config", "brain.user").strip().lower()
                if who:
                    break
        return who or None

    def _sessions_snapshot(self) -> dict[str, Any]:
        """{scope: [session rows]} and credits per scope, read on the event loop."""
        by: dict[str, list[dict[str, Any]]] = {}
        for info in self.sessions.roots():
            if not info.key or not info.slot:
                continue
            st = self.sessions.slot_stats(info.slot) or {}
            by.setdefault(info.key, []).append({
                "slot": info.slot, "title": info.title, "agent": info.agent, "kind": info.kind or "local",
                "credits": st.get("credits") if st.get("credits") is not None else info.credits,
                "turns": int(st.get("turns") or info.turns or 0), "busy": bool(st.get("busy")),
                "awaiting": bool(st.get("awaiting")), "last_activity": st.get("last_activity") or info.last_activity,
                "opened_at": st.get("opened_at") or info.started, "project": info.cwd or None,
                "url": "/chat?sid=%s" % info.slot, "error": info.error, "missing": bool(st.get("missing")),
                "id": info.id})
        return {"by": by, "credits": self.sessions.credits_by_key()}

    @staticmethod
    def _live(rows: list[dict[str, Any]]) -> dict[str, Any] | None:
        live = [r for r in rows if not r.get("missing") and r["kind"] == "local"]
        return live[-1] if live else None

    def _gitlab_of(self, repo: Repo) -> tuple[str, str]:
        g = repo.cfg.get("gitlab") or {}
        return str(g.get("base") or ""), str(g.get("project") or "")

    def _token_present(self) -> bool:
        try:
            return bool(bk.m("rest").read_token())
        except Exception:  # noqa: BLE001 - a token file others can read is refused, as brain-kit does
            return False

    # ---- 交付总览 ------------------------------------------------------------------------------------- #

    def _row(self, repo: Repo, f: dict[str, Any], snap: dict[str, Any]) -> dict[str, Any]:
        row = deliveries.base_row(repo.id, f)
        scope = scope_of(repo.id, f["key"])
        sess = snap["by"].get(scope, [])
        live = self._live(sess)
        base, project = self._gitlab_of(repo)
        run = f.get("run") or {}
        mr = None
        if run.get("handoff") and f.get("branch") and base and project:
            self._mr_wanted[(base, project, f["branch"])] = (scope, str(repo.cfg.get("bridge_user") or ""))
            mr = self.mr.get(project, f["branch"])
        bot = 0
        if run.get("handoff") and not mr:
            bot = repo.bot_commits_since((run.get("handoff") or {}).get("local_head"), f.get("origin_sha"))
        deliveries.classify(row, f, mr=mr, slot=live, cfg=repo.cfg, bot_commits=bot)
        row["credits"] = snap["credits"].get(scope)
        row["sessions"] = len(sess)
        row["updated_at"] = deliveries.updated_at(f, live)
        if mr:
            row["mr"] = {"iid": mr["iid"], "url": mr.get("url") or mrinfo.mr_url(base, project, mr["iid"]),
                         "state": mr.get("state")}
            row["open_questions"] = [q["id"] for q in mr.get("questions") or [] if q.get("state") == "open"]
            row["run_ids"] = sorted({q["run_id"] for q in mr.get("questions") or [] if q.get("run_id")})
        return row

    def _team_rows(self, snap: dict[str, Any]) -> list[tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]]]]:
        """(row, facts, decisions) per requirement the team runner has (its latest run)."""
        if self.team is None or self.team.host is None:
            return []
        led = self.team.ledger()
        latest: dict[str, dict[str, Any]] = {}
        all_ids: dict[str, list[str]] = {}
        for r in led["runs"]:
            all_ids.setdefault(r["req"], []).append(r["run_id"])
            latest[r["req"]] = r
        out = []
        for key, r in sorted(latest.items()):
            facts = {"key": key, "claim": None, "where": "runner", "branch": None, "owner": r.get("owner"),
                     "worktree": None, "stages": [], "events": [], "approvals": [], "run": None, "park": None}
            path = r.get("path")
            if path and os.path.isdir(path):
                from .repo import Git
                got = read_facts(Source(Git(path), path=path), key, "runs")
                facts.update(got, worktree=path, stages=lean_view.stages(got["events"]))
                facts["branch"] = (got["run"] or {}).get("branch")
            row = deliveries.base_row("runner", facts)
            row["where"] = "runner"
            decs = [d for d in led["decisions"] if d["run_id"] in all_ids[key]]
            deliveries.team_classify(row, r, decs, facts.get("park"))
            if r.get("state") in ("merged", "closed"):
                row["state"] = "merged" if r["state"] == "merged" else "closed"
                row["state_label"] = deliveries.STATE_LABEL[row["state"]]
            row["run_ids"] = all_ids[key]
            row["credits"] = round(sum(snap["credits"].get(x, 0.0) for x in all_ids[key]), 3) or None
            row["sessions"] = sum(len(snap["by"].get(x, [])) for x in all_ids[key])
            row["mr"] = {"iid": int(r["iid"]), "url": self.team.mr_url(r["project"], r["iid"]), "state": None}
            row["updated_at"] = lean_view.epoch(r.get("updated"))
            out.append((row, facts, decs))
        return out

    def _overview_sync(self, which: str, snap: dict[str, Any]) -> dict[str, Any]:
        rows, errors, all_decisions, q_counts = [], [], [], {"asked": 0, "answered": 0, "delivered": 0}
        for rid, repo in self.repos.items():
            if which not in ("all", rid):
                continue
            try:
                facts = repo.scan()
            except Exception as exc:  # noqa: BLE001
                errors.append({"repo": rid, "error": str(exc)[:300]})
                continue
            for f in facts:
                row = self._row(repo, f, snap)
                rows.append(row)
                all_decisions += detail.decisions(f.get("decisions_text"), "decisions.md", repo.cfg.get("bot_users") or [])
        for rid, (path, err) in self.repo_errors.items():
            if which in ("all", rid):
                errors.append({"repo": rid, "error": "%s：%s" % (path, err)})
        if which in ("all", "runner"):
            for row, _, decs in self._team_rows(snap):
                rows.append(row)
                for d in decs:
                    if d.get("state") in ("invalid", "posting"):     # never on the MR (yet)
                        continue
                    q_counts["asked"] += 1
                    q_counts["answered"] += d.get("state") in ("answered", "delivered", "delivery_unknown", "refused")
                    q_counts["delivered"] += d.get("state") == "delivered"
        overlaps = deliveries.overlaps(rows)
        view, funnel = self._eval_view(which, snap)
        if funnel is None:
            funnel = deliveries.funnel_app(all_decisions, q_counts)
        else:
            funnel["questions"] = q_counts
        return {"at": self.now(), "rows": rows, "overlaps": overlaps, "funnel": funnel, "eval": view,
                "counts": deliveries.counts(rows), "errors": errors}

    def _eval_view(self, which: str, snap: dict[str, Any]) -> tuple[dict[str, Any], dict | None]:
        """Eval from the cache (computed in the background, at most every EVAL_TTL_S per repo and main sha)."""
        ids = [rid for rid in self.repos if which in ("all", rid)]
        if not bk.has("evaluate"):
            return deliveries.evaluate("", {}, None, None)
        views, funnels, stale = [], [], []
        for rid in ids:
            repo = self.repos[rid]
            sha = repo.git.out("rev-parse", "-q", "--verify", (repo.main_ref() or "HEAD") + "^{commit}")
            got = self._eval.get(rid)
            if not got or got[0] != sha or time.monotonic() - got[1] > EVAL_TTL_S:
                stale.append((rid, sha))
            if got:
                views.append(got[2])
                if got[3]:
                    funnels.append(got[3])
        for rid, sha in stale:
            if rid not in self._eval_running:
                self._eval_running.add(rid)
                credits = {"runs": {k.split("-", 1)[1]: {"credits": v} for k, v in snap["credits"].items()
                                    if k.startswith(rid + "-")}}
                threading_start(self._eval_compute, rid, sha, credits)
        if not views:
            return {"available": False, "error": "正在算 Eval…" if ids else "没有仓库", "ref": None, "metrics": [],
                    "queue": []}, None
        if len(views) == 1:
            return views[0], (dict(funnels[0]) if funnels else None)
        merged = {"available": any(v["available"] for v in views), "error": "；".join(v["error"] for v in views if v["error"]),
                  "ref": None, "metrics": [], "queue": [q for v in views for q in v["queue"]]}
        for m in views[0]["metrics"]:
            vals = [next((x["value"] for x in v["metrics"] if x["id"] == m["id"]), None) for v in views]
            pairs = [x for x in vals if isinstance(x, list)]
            merged["metrics"].append({**m, "value": [sum(p[0] for p in pairs), sum(p[1] for p in pairs)] if pairs else None})
        funnel = None
        if funnels:
            funnel = dict(funnels[0])
            funnel["rows"] = [{**r, "count": sum(next((x["count"] for x in f["rows"] if x["id"] == r["id"]), 0)
                                                 for f in funnels)} for r in funnels[0]["rows"]]
            funnel["total"] = sum(f["total"] for f in funnels)
        return merged, funnel

    def _eval_compute(self, rid: str, sha: str, credits: dict[str, Any]) -> None:
        try:
            repo = self.repos.get(rid)
            if repo is None:
                return
            view, funnel = deliveries.evaluate(repo.path, repo.cfg, repo.main_ref(), credits)
            self._eval[rid] = (sha, time.monotonic(), view, funnel)
        except Exception as exc:  # noqa: BLE001
            self._eval[rid] = (sha, time.monotonic(), {"available": False, "error": "Eval 算不出来：%s" % str(exc)[:200],
                                                        "ref": None, "metrics": [], "queue": []}, None)
        finally:
            self._eval_running.discard(rid)

    async def overview(self, which: str = "all") -> dict[str, Any]:
        if which != "all" and not REPO_ID_RE.match(which or ""):
            raise AppError("repo 只能是 all、r1、r2 … 或 runner", "invalid_repo")
        snap = self._sessions_snapshot()
        return scrub_tree(await asyncio.to_thread(self._overview_sync, which, snap), self.scrub)

    async def refresh(self, rid: str) -> dict[str, Any]:
        ok, text = await asyncio.to_thread(self._repo(rid).fetch)
        return {"ok": ok, "text": text}

    # ---- 需求详情 ------------------------------------------------------------------------------------- #

    def _facts(self, repo: Repo, key: str) -> dict[str, Any]:
        if not KEY_RE.match(key or ""):
            raise AppError("需求号不对", "invalid_key")
        f = next((x for x in repo.scan() if x["key"] == key), None)
        if f is None:
            raise AppError("这个仓库里没有 %s" % key, "not_found", 404)
        return f

    def _vouchers_dir(self, repo: Repo) -> str | None:
        s = os.environ.get("BRAIN_INTAKE_DIR") or repo.git.out("config", "brain.intake") or "~/.brain/intake"
        d = os.path.join(os.path.abspath(os.path.expanduser(s)), "vouchers")
        return d if os.path.isdir(d) else None

    def _detail_sync(self, rid: str, key: str, snap: dict[str, Any]) -> dict[str, Any]:
        if rid == "runner":
            return self._team_detail(key, snap)
        repo = self._repo(rid)
        f = self._facts(repo, key)
        row = self._row(repo, f, snap)
        scope = scope_of(rid, key)
        run = f.get("run") or {}
        me = self.me()
        own = bool(me) and me == (f.get("owner") or "")
        base, project = self._gitlab_of(repo)
        mr = self.mr.get(project, f["branch"]) if (base and project and f.get("branch")) else None
        can_post = own and bool(base and project) and self._token_present()
        questions = []
        pq = detail.park_question(f.get("park"), answerable=own and not run.get("handoff") and bool(
            self._live(snap["by"].get(scope, []))), via="session")
        if pq:
            questions.append(pq)
        questions += detail.mr_questions(mr, own=own, can_post=can_post)
        tl = self._timeline(repo, f, snap, scope)
        return {
            "row": row, "where_label": self._where_label(f),
            "run": {"owner": run.get("owner"), "branch": run.get("branch"), "intent": run.get("intent"),
                    "brain_commit": run.get("brain_commit"), "origin": run.get("origin"),
                    "created_at": run.get("created_at"),
                    "materials": [str(m.get("package")) for m in run.get("materials") or [] if isinstance(m, dict)],
                    "handoff": ({"requested_at": run["handoff"].get("requested_at"), "by": run["handoff"].get("by")}
                                if isinstance(run.get("handoff"), dict) else None)} if f.get("run") else None,
            "claim": self._claim_view(f.get("claim")),
            "lean": {"stages": f.get("stages") or lean_view.stages([]),
                     "approvals": [{k: a[k] for k in ("kind", "state", "sha8", "at", "line", "path")}
                                   for a in f.get("approvals") or []],
                     **lean_view.notes(f.get("state_text"))},
            "decisions": detail.decisions(f.get("decisions_text"), "aidlc-docs/%s/decisions.md" % run.get("intent"),
                                          repo.cfg.get("bot_users") or []),
            "questions": questions,
            "timeline": {k: tl[k] for k in ("source", "items", "missing", "error")},
            "sessions": [{k: s[k] for k in ("slot", "title", "agent", "kind", "credits", "turns", "busy", "awaiting",
                                             "last_activity", "opened_at", "project", "url", "error")}
                         for s in snap["by"].get(scope, [])],
            "credits": {"total": snap["credits"].get(scope), "note": detail.NO_TOKENS},
            "brain": detail.brain_block(tl.get("brain"), None, f.get("decisions_text")),
        }

    def _timeline(self, repo: Repo, f: dict[str, Any], snap: dict[str, Any], scope: str) -> dict[str, Any]:
        sig = (scope, f.get("tip"), f.get("worktree"), len(f.get("events") or []), f.get("park_sha"))
        got = self._trace.get(sig)
        if got and time.monotonic() - got[0] < TRACE_TTL_S:
            tl = dict(got[1])
        else:
            src_repo, ref = (f["worktree"], None) if f.get("worktree") else (repo.path, f.get("ref"))
            c = snap["credits"].get(scope)
            tl = detail.timeline(src_repo, repo.cfg, f["key"], ref=ref, events=f.get("events") or [],
                                 credits={"runs": {f["key"]: {"credits": c}}} if c is not None else None,
                                 vouchers_dir=self._vouchers_dir(repo))
            self._trace = {k: v for k, v in self._trace.items() if time.monotonic() - v[0] < TRACE_TTL_S}
            self._trace[sig] = (time.monotonic(), dict(tl))
        tl["items"] = sorted(tl["items"] + self.store.events(scope), key=lambda x: (x["at"] or "", x["kind"]))
        return tl

    def _team_detail(self, key: str, snap: dict[str, Any]) -> dict[str, Any]:
        hit = next(((r, f, d) for r, f, d in self._team_rows(snap) if r["key"] == key), None)
        if hit is None:
            raise AppError("运行机上没有 %s" % key, "not_found", 404)
        row, f, decs = hit
        run = f.get("run") or {}
        path = f.get("worktree")
        tl = {"source": "app", "items": lean_view.stage_events(f.get("events") or []), "missing": [], "error": "",
              "brain": None}
        if path:
            try:
                cfg = bk.m("config").load(path)
            except Exception:  # noqa: BLE001
                cfg = dict(bk.m("config").DEFAULTS)
            c = sum(snap["credits"].get(x, 0.0) for x in row["run_ids"]) or None
            tl = detail.timeline(path, cfg, key, ref=None, events=f.get("events") or [],
                                 credits={"runs": {x: {"credits": snap["credits"].get(x)} for x in row["run_ids"]
                                                   if snap["credits"].get(x) is not None}} if c else None,
                                 ledger_path=self.team.cfg.get("ledger"), vouchers_dir=self.team.cfg.get("vouchers_dir"),
                                 allowed_signers=self.team.allowed_signers or None)
        for rid in row["run_ids"]:
            tl["items"] += self.store.events(rid)
        tl["items"].sort(key=lambda x: (x["at"] or "", x["kind"]))
        sess = [s for x in row["run_ids"] for s in snap["by"].get(x, [])]
        return {
            "row": row, "where_label": "运行机工作区 %s" % (path or "（还没建）"),
            "run": {"owner": run.get("owner"), "branch": run.get("branch"), "intent": run.get("intent"),
                    "brain_commit": run.get("brain_commit"), "origin": run.get("origin"), "created_at": run.get("created_at"),
                    "materials": [str(m.get("package")) for m in run.get("materials") or [] if isinstance(m, dict)],
                    "handoff": ({"requested_at": run["handoff"].get("requested_at"), "by": run["handoff"].get("by")}
                                if isinstance(run.get("handoff"), dict) else None)} if run else None,
            "claim": None,
            "lean": {"stages": f.get("stages") or lean_view.stages([]),
                     "approvals": [dict({k: a[k] for k in ("kind", "state", "sha8", "at", "path")}, line=None)
                                   for a in f.get("approvals") or []],
                     **lean_view.notes(f.get("state_text"))},
            "decisions": detail.decisions(f.get("decisions_text"), "decisions.md", []),
            "questions": detail.ledger_questions(decs, row["mr"]["url"] if row.get("mr") else None),
            "timeline": {k: tl[k] for k in ("source", "items", "missing", "error")},
            "sessions": [{k: s[k] for k in ("slot", "title", "agent", "kind", "credits", "turns", "busy", "awaiting",
                                             "last_activity", "opened_at", "project", "url", "error")} for s in sess],
            "credits": {"total": row["credits"], "note": detail.NO_TOKENS},
            "brain": detail.brain_block(tl.get("brain"), None, f.get("decisions_text")),
        }

    @staticmethod
    def _claim_view(c: Any) -> dict[str, Any] | None:
        if not isinstance(c, dict):
            return None
        closed = c.get("closed")
        return {"owner": c.get("owner"), "title": str(c.get("title") or "")[:200], "created_at": c.get("created_at"),
                "source": str(c.get("source") or "product"),
                "closed": (str((closed or {}).get("reason") or "已关闭")[:200] if closed else None)}

    @staticmethod
    def _where_label(f: dict[str, Any]) -> str:
        return {"worktree": "这台机器的工作区 %s" % f.get("worktree"), "branch": "分支 %s（没在这台机器上检出）" % (f.get("ref") or ""),
                "main": "默认分支（已合并）", "claim": "只有认领（claim/%s）" % f["key"], "runner": "运行机"}.get(f.get("where"), "")

    async def requirement(self, rid: str, key: str) -> dict[str, Any]:
        snap = self._sessions_snapshot()
        return scrub_tree(await asyncio.to_thread(self._detail_sync, rid, key, snap), self.scrub)

    # ---- sessions and answers ------------------------------------------------------------------------- #

    async def open_session(self, rid: str, key: str, trust: bool = True, kickoff: bool = True) -> dict[str, Any]:
        repo = self._repo(rid)
        f = await asyncio.to_thread(self._facts, repo, key)
        run = f.get("run") or {}
        if not run or run.get("handoff") or f.get("merged"):
            raise AppError("只有本地开发中的需求能在这里开 brain-dev 会话", "not_local", 409)
        if not f.get("worktree"):
            raise AppError("这台机器上没有检出 %s 的分支：先 git worktree add 或在开需求里开工" % f.get("branch"), "no_worktree", 409)
        return await self._open_local(repo, key, f["branch"], f["worktree"], run, trust=trust, kickoff=kickoff)

    async def _open_local(self, repo: Repo, key: str, branch: str, wt: str, run: dict[str, Any], *, trust: bool,
                          kickoff: bool) -> dict[str, Any]:
        self.crew = await asyncio.to_thread(crewcheck.checks, [r.path for r in self.repos.values()])
        if not crewcheck.agent_ok(self.crew["rows"]):
            raise AppError("brain-dev 还没带上 Lean 的 hook：先在设置里修好（KiroCrew 检查）", "agent_not_ready", 409)
        scope = scope_of(repo.id, key)
        live = [i for i in self.sessions.roots(key=scope, kind="local") if i.slot and not
                (self.sessions.slot_stats(i.slot) or {}).get("missing")]
        if live:
            return {"ok": True, "slot": live[-1].slot, "url": "/chat?sid=%s" % live[-1].slot}
        task = intake.kickoff(key, branch, run.get("intent"),
                              [str(m.get("package")) for m in run.get("materials") or [] if isinstance(m, dict)]) \
            if kickoff else ""
        slug = branch.rsplit("/", 1)[-1][len(key) + 1:] or key.lower()
        info = await self.sessions.open_session(
            task, parent_session_key="%s:%s" % (self.name, scope), cwd=wt, title="%s · 本地开发" % key,
            folder="%s · %s" % (key, slug), agent=LOCAL_AGENT, root_folder=LOCAL_FOLDER, project_dir=wt,
            strict_agent=True, resend_ok=True, nudge_ok=False, trust_ok=bool(trust), kind="local", key=scope)
        if info.error or not info.slot:
            raise AppError(info.error or "会话没开成", "session_failed", 502)
        await asyncio.to_thread(self.store.append, scope, "app", "开了 brain-dev 会话",
                                "%s%s" % (info.slot, "，信任这个会话" if trust else ""))
        await self.sessions.save()
        return {"ok": True, "slot": info.slot, "url": "/chat?sid=%s" % info.slot}

    async def answer(self, rid: str, key: str, choice: Any, note: Any, did: Any = None) -> dict[str, Any]:
        """A clarify question of the person's own run: into its local session, or as their own MR comment. Never a Lean
        approval: a question with a lean_request is not answerable here."""
        if not isinstance(choice, str) or not re.fullmatch(r"[A-H]", choice.strip().upper()):
            raise AppError("回答选一个选项（A–H）", "invalid_choice")
        choice = choice.strip().upper()
        note = " ".join(str(note or "").split())[:300]
        repo = self._repo(rid)
        f = await asyncio.to_thread(self._facts, repo, key)
        me = self.me()
        if not me or me != f.get("owner"):
            raise AppError("只有需求负责人本人能在这里回答（git config brain.user）", "not_owner", 403)
        run = f.get("run") or {}
        scope = scope_of(rid, key)
        park = f.get("park")
        if not run.get("handoff"):
            if not deliveries.park_waiting(park) or park.get("kind") != "clarify" or park.get("lean_request"):
                raise AppError("这个需求没有等你回答的澄清问题", "no_question", 409)
            if choice not in {str(o.get("id")) for o in park.get("options") or [] if isinstance(o, dict)}:
                raise AppError("没有选项 %s" % choice, "invalid_choice")
            live = [i for i in self.sessions.roots(key=scope, kind="local") if i.slot]
            if not live:
                raise AppError("先开这个需求的 brain-dev 会话", "no_session", 409)
            text = local_answer(choice, note)
            turn = await self.sessions.continue_conversation_async(live[-1].id, text,
                                                                   parent_session_key=live[-1].parent_session_key)
            if turn.error:
                raise AppError(turn.error, "send_failed", 502)
            await asyncio.to_thread(self.store.append, scope, "app", "在 app 里回答了澄清问题：%s" % choice, None)
            return {"ok": True, "via": "session", "text": "回答已送进会话"}
        base, project = self._gitlab_of(repo)
        mr = self.mr.get(project, f.get("branch") or "") if base and project else None
        open_q = [q for q in (mr or {}).get("questions") or [] if q.get("state") == "open" and q.get("kind") == "clarify"
                  and not q.get("lean_request") and (not did or q.get("id") == did)]
        if not mr or not open_q:
            raise AppError("MR 上没有等你回答的澄清问题", "no_question", 409)
        q = open_q[-1]
        if q.get("options") and choice not in {o["id"] for o in q["options"]}:
            raise AppError("没有选项 %s" % choice, "invalid_choice")
        try:
            await asyncio.to_thread(self.mr.post_answer, base, project, mr["iid"], q["id"], choice, note,
                                    transport=self.transport)
        except Exception as exc:  # noqa: BLE001
            raise AppError("发不到 MR 上：%s" % str(exc).split("\n", 1)[0][:200], "post_failed", 502)
        await asyncio.to_thread(self.store.append, scope, "app", "在 MR 上回答了 %s：%s" % (q["id"], choice), None)
        return {"ok": True, "via": "mr", "text": "已经以你的 GitLab 身份发在 MR 上：桥核对后送回运行机"}

    # ---- 开需求 --------------------------------------------------------------------------------------- #

    async def intake_next(self, rid: str) -> dict[str, Any]:
        return await asyncio.to_thread(intake.next_key, self._repo(rid))

    async def intake_check(self, body: dict[str, Any]) -> dict[str, Any]:
        repo = self._repo(str(body.get("repo") or ""))
        return scrub_tree(await asyncio.to_thread(intake.check, repo, body, self.me()), self.scrub)

    async def intake_start(self, body: dict[str, Any]) -> dict[str, Any]:
        repo = self._repo(str(body.get("repo") or ""))
        try:
            out = await asyncio.to_thread(intake.start, repo, body, self.settings["work_root"])
        except intake.IntakeError as exc:
            raise AppError(str(exc), "invalid_intake")
        out = scrub_tree(out, self.scrub)
        if not out["ok"]:
            return out
        scope = scope_of(repo.id, out["key"])
        await asyncio.to_thread(self.store.append, scope, "app", "在 app 里开工",
                                "工作区 %s，分支 %s" % (out["worktree"], out["branch"]))
        if body.get("open_session", True):
            f = await asyncio.to_thread(self._facts, repo, out["key"])
            try:
                got = await self._open_local(repo, out["key"], out["branch"], out["worktree"], f.get("run") or {},
                                             trust=body.get("trust", True) is not False, kickoff=True)
                out.update(slot=got["slot"], url=got["url"])
            except AppError as exc:
                out["session_error"] = str(exc)
        return out

    # ---- KiroCrew checks ------------------------------------------------------------------------------ #

    async def crew_checks(self) -> dict[str, Any]:
        self.crew = await asyncio.to_thread(crewcheck.checks, [r.path for r in self.repos.values()])
        return self.crew

    async def crew_fix(self, what: Any) -> dict[str, Any]:
        if what not in ("agent", "engine"):
            raise AppError("what 只能是 agent 或 engine", "invalid_fix")
        try:
            text = await asyncio.to_thread(crewcheck.fix_agent if what == "agent" else crewcheck.fix_engine)
            ok = True
        except Exception as exc:  # noqa: BLE001
            text, ok = str(exc)[:300], False
        self.crew = await asyncio.to_thread(crewcheck.checks, [r.path for r in self.repos.values()])
        return {"ok": ok, "text": text, "rows": self.crew["rows"]}

    # ---- Brain ---------------------------------------------------------------------------------------- #

    def _reflectable(self, repo: Repo) -> list[dict[str, Any]]:
        out = []
        for f in repo.scan():
            t = f.get("decisions_text") or ""
            if "brain-proposal" in t or "brain-gap" in t:
                row = deliveries.base_row(repo.id, f)
                deliveries.classify(row, f, mr=None, slot=None, cfg=repo.cfg)
                out.append({"key": f["key"], "title": row["title"], "state": row["state"]})
        return out

    async def brain(self, rid: str) -> dict[str, Any]:
        repo = self._repo(rid)
        return await asyncio.to_thread(lambda: brainview.view(repo, self._reflectable(repo)))

    async def reflect_preview(self, rid: str, key: str) -> dict[str, Any]:
        repo = self._repo(rid)
        f = await asyncio.to_thread(self._facts, repo, key)
        return scrub_tree(await asyncio.to_thread(brainview.preview, repo, f, self._vouchers_dir(repo)), self.scrub)

    async def reflect_apply(self, rid: str, key: str, push: bool) -> dict[str, Any]:
        repo = self._repo(rid)
        f = await asyncio.to_thread(self._facts, repo, key)
        out = scrub_tree(await asyncio.to_thread(brainview.apply, repo, f, push), self.scrub)
        await asyncio.to_thread(self.store.append, scope_of(rid, key), "app",
                                "brain reflect --apply%s：%s" % (" --push" if push else "", "成功" if out["ok"] else "失败"),
                                out.get("branch"))
        return out

    # ---- 待办 ----------------------------------------------------------------------------------------- #

    def _todo_sync(self, snap: dict[str, Any]) -> dict[str, Any]:
        entries = []
        me = self.me()
        token = self._token_present()
        for rid, repo in self.repos.items():
            try:
                facts = repo.scan()
            except Exception:  # noqa: BLE001
                continue
            base, project = self._gitlab_of(repo)
            for f in facts:
                row = self._row(repo, f, snap)
                if row["state"] in ("merged", "closed"):
                    continue
                live = self._live(snap["by"].get(scope_of(rid, f["key"]), []))
                own = bool(me) and me == f.get("owner")
                entries.append({"row": row, "facts": f, "own": own, "has_session": bool(live),
                                "can_post": own and bool(base and project) and token,
                                "mr": self.mr.get(project, f.get("branch") or "") if base and project else None,
                                "session": {"slot": live["slot"], "title": live["title"], "url": live["url"]} if live else None})
        out = todo_mod.build(entries, team=False, crew_rows=self.crew["rows"])
        if self.team is not None and self.team.host is not None:
            team_entries = [{"row": row, "decisions": decs, "mr_url": (row.get("mr") or {}).get("url")}
                            for row, _, decs in self._team_rows(snap)]
            t = todo_mod.build(team_entries, team=True, crew_rows=[])
            out["items"] += t["items"]
            out["team"] = True
        return out

    async def todo(self) -> dict[str, Any]:
        snap = self._sessions_snapshot()
        return scrub_tree(await asyncio.to_thread(self._todo_sync, snap), self.scrub)

    # ---- status, settings ----------------------------------------------------------------------------- #

    def _team_status(self) -> dict[str, Any]:
        if self.team is None:
            on = bool(self.settings["team"].get("enabled"))
            return {"enabled": on, "ok": False, "error": "运行机模式没打开" if not on else "brain-kit 没装载",
                    "last_loop_at": None, "loop_error": "", "same_user": False, "signer": {"pending": 0, "refused": 0}}
        return self.team.status()

    async def status(self) -> dict[str, Any]:
        info = bk.info()
        repos = []
        for i, path in enumerate(self.settings["repos"], 1):
            rid = "r%d" % i
            r = self.repos.get(rid)
            if r is not None:
                g = r.cfg.get("gitlab") or {}
                repos.append({"id": rid, "path": r.path, "name": r.name, "ok": True, "error": "",
                              "kit": {"tracker": r.cfg["tracker"], "req_prefix": r.cfg["req_prefix"],
                                      "default_branch": r.cfg["default_branch"], "gitlab_base": str(g.get("base") or ""),
                                      "gitlab_project": str(g.get("project") or "")}})
            else:
                p, err = self.repo_errors.get(rid, (path, "没装载"))
                repos.append({"id": rid, "path": p, "name": os.path.basename(p), "ok": False, "error": err, "kit": None})
        todo = await self.todo()
        token = await asyncio.to_thread(self._token_present)
        me = await asyncio.to_thread(self.me)
        return {"app": {"name": self.name, "version": VERSION, "team": self.team is not None},
                "brainkit": {"path": info["path"], "ok": info["ok"], "version": info["version"], "error": info["error"],
                             "modules": info["modules"]},
                "repos": repos, "crew": self.crew,
                "me": {"user": me, "token": token,
                       "how": "GitLab token（%s）" % ("有" if token else "没有") + ("；git config brain.user = %s" % me if me else "")},
                "team": self._team_status(), "counts": {"todo": len(todo["items"])}}

    def settings_view(self) -> dict[str, Any]:
        return {**self.settings, "team": dict(self.settings["team"])}

    async def save_settings(self, body: Any) -> dict[str, Any]:
        clean, probs = settings_mod.check(body)
        if probs:
            raise AppError("；".join(probs), "invalid_settings")
        await asyncio.to_thread(settings_mod.save, self.data_dir / "settings.json", clean)
        self.settings = clean
        if self.team is not None:
            await asyncio.to_thread(self.team.stop)
            self.team = None
        await asyncio.to_thread(bk.unload)
        await asyncio.to_thread(self.reload_sync)
        if self.started:
            await self._start_team()
            if self.team is not None and not any(getattr(t, "_brain_team", False) for t in self._tasks if not t.done()):
                t = asyncio.get_running_loop().create_task(self._team_forever())
                t._brain_team = True  # type: ignore[attr-defined]
                self._tasks.append(t)
        return {"ok": True, "settings": self.settings_view(), "status": await self.status()}

    # ---- team mode ------------------------------------------------------------------------------------ #

    async def team_view(self) -> dict[str, Any]:
        if self.team is None:
            return {"status": self._team_status(), "ledger": {"runs": {}, "decisions": {}, "handoffs": {}}, "runs": [],
                    "signer": {"pending": [], "refused": []}}
        led = await asyncio.to_thread(self.team.ledger)
        return {"status": self.team.status(), "ledger": self.team.counts(led),
                "runs": [{"run_id": r["run_id"], "req": r["req"], "project": r["project"], "iid": int(r["iid"]),
                          "state": r["state"], "slot": r.get("slot"), "mr_url": self.team.mr_url(r["project"], r["iid"]),
                          "updated": r.get("updated")} for r in led["runs"]],
                "signer": await asyncio.to_thread(self.team.signer_view)}

    async def team_loop(self) -> dict[str, Any]:
        if self.team is None or self.team.host is None:
            raise AppError((self.team.error if self.team else "") or "运行机模式没打开", "team_off", 409)
        try:
            summary = await self._in_team(self.team.loop_once)
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "summary": {}, "error": str(exc)[:300]}
        return {"ok": not self.team.loop_error, "summary": summary, "error": self.team.loop_error}


def local_answer(choice: str, note: str) -> str:
    """The person's answer to their local agent's clarify question: the choice and a neutralized one-line note (a line
    that reads like an approval or an instruction is quoted, as brain-kit's bridge does)."""
    n = note
    try:
        neutral = bk.m("bridge.decisions")._neutral_note
        n = neutral(note)
    except Exception:  # noqa: BLE001
        if re.match(r"(?i)^\s*(approve|approved|批准|同意|reject|驳回)\b", n):
            n = "> " + n
    lines = ["（本地）澄清问题已答：%s。" % choice]
    if n:
        lines.append("说明：%s" % n)
    lines.append("把 park.json 的 status 改成 answered，按这个回答继续。")
    return "\n".join(lines)


def threading_start(fn: Callable[..., Any], *args: Any) -> None:
    threading.Thread(target=fn, args=args, daemon=True, name="brain-eval").start()


def get_or_build(ctx: Any) -> Service:
    name = getattr(ctx, "name", APP_NAME) or APP_NAME
    svc = _REGISTRY.get(name)
    if svc is None:
        svc = Service(ctx)
        _REGISTRY[name] = svc
    elif ctx is not svc.ctx:
        svc.ctx = ctx
    return svc


def current(name: str = APP_NAME) -> Service | None:
    return _REGISTRY.get(name)


def discard(name: str = APP_NAME) -> Service | None:
    return _REGISTRY.pop(name, None)

