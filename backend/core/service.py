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

from . import (bk, brainview, crewcheck, deliveries, detail, identity, importer, inplace, installer, intake, landing,
               lean_view, mrdesc_view, mrinfo)
from . import problems
from . import board as board_mod
from . import settings as settings_mod
from . import todo as todo_mod
from .constants import APP_NAME, APP_ROOT, KEY_RE, LOCAL_AGENT, LOCAL_FOLDER, REPO_ID_RE, TICK_S, VERSION
from .gateway import Gateway
from .httpkit import AppError
from .repo import Git, Repo, Source, read_facts
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
              "findings", "review", "blocking", "error", "session_error", "notes", "warnings", "problems", "summary",
              "first", "todo", "raw", "doing", "facts", "title", "name", "checks")


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
        # listed repos whose brain-kit is on its way (the install branch, merged but not pulled): (path, state)
        self.repo_pending: dict[str, tuple[str, dict[str, Any]]] = {}
        self.imports = importer.Records(self.data_dir / "imports.json")   # what 导入仓库 installed where
        self.upgrades = importer.Records(self.data_dir / "upgrades.json")  # the kit fix's branches (apart from installs)
        self.jobs = importer.Jobs(now)                                      # clone / install in the background
        self.crew: dict[str, Any] = {"rows": [], "fix": {"agent": False, "engine": False}, "checked_at": None}
        self.team: Any = None
        self._tasks: list[asyncio.Task] = []
        self._mr_wanted: dict[tuple, tuple[str, str]] = {}   # (base, project, branch) -> (scope, kit bridge_user)
        self._eval: dict[str, tuple] = {}
        self._eval_running: set[str] = set()
        self._trace: dict[tuple, tuple] = {}
        self.desc = mrdesc_view.DescCache()     # each requirement's 变更说明, by the commits it is made from
        self._subj: dict[tuple, tuple] = {}     # the board's commit subjects and changed files, by the commits asked for
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
        """brain-kit from settings.brainkit, then the repos (their kit.json through brain-kit). A repo whose checkout
        has no kit.json yet but whose brain-kit is on its way (the install branch 导入仓库 made, or merged and not
        pulled yet) is pending, with what to do; one without any is an error that says where to install it."""
        bk.load(self.settings["brainkit"])
        self.repos, self.repo_errors, self.repo_pending = {}, {}, {}
        records = self.imports.all()
        token = None
        for i, path in enumerate(self.settings["repos"], 1):
            rid = "r%d" % i
            try:
                if not os.path.isdir(path):
                    raise RuntimeError("找不到这个目录")
                if not os.path.isfile(os.path.join(path, importer.KIT)):
                    token = self._token_present() if token is None else token
                    pend = importer.pending_state(path, records.get(path), token=token)
                    if pend:
                        self.repo_pending[rid] = (path, pend)
                        continue
                    raise RuntimeError("还没装 brain-kit：在「导入仓库」里检查它，装上就能用")
                if not bk.ok():
                    raise RuntimeError("brain-kit 没装载")
                try:
                    cfg = bk.m("config").load(path)
                except Exception as exc:  # noqa: BLE001 - brain-kit's own words: in the 检查 of 导入仓库
                    raise RuntimeError("brain-kit 读不懂这个仓库的设置：在「导入仓库」里检查它，那里会说哪里不对") from exc
                self.repos[rid] = Repo(rid, path, cfg)
            except Exception as exc:  # noqa: BLE001
                self.repo_errors[rid] = (path, str(exc).split("\n", 1)[0][:300])
        self._eval.clear()
        self._trace.clear()
        self.crew = self.crew_sync()

    def team_paths(self) -> list[str]:
        """The listed repos handed to the team runner (see runner_repo): their runner-only KiroCrew checks FAIL; for
        the others they are a reminder. A few local git reads per repo (repo.scan, cached for a few seconds)."""
        out = []
        for r in self.repos.values():
            try:
                facts = [] if r.cfg.get("bridge_user") else r.scan()
            except Exception:  # noqa: BLE001 - an unreadable repo is said by the checks themselves
                facts = []
            if runner_repo(r.cfg, facts):
                out.append(r.path)
        return out

    def crew_sync(self) -> dict[str, Any]:
        """The KiroCrew checks of the listed repos (blocking: call it in a thread off the event loop)."""
        return crewcheck.checks([r.path for r in self.repos.values()], team_paths=self.team_paths())

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
        """MRs of handed-over runs (person mode), the listed repos whose brain-kit is on its way, and the KiroCrew
        checks now and then."""
        last_crew = time.monotonic()
        while True:
            try:
                await asyncio.sleep(MR_EVERY_S)
                await self.refresh_mrs()
                cleared = await asyncio.to_thread(self._sweep)
                if (set(cleared) & set(self.settings["repos"])) or (
                        self.repo_pending and await asyncio.to_thread(self._pending_changed)):
                    await asyncio.to_thread(self.reload_sync)
                if time.monotonic() - last_crew > CREW_EVERY_S:
                    last_crew = time.monotonic()
                    self.crew = await asyncio.to_thread(self.crew_sync)
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001
                self.log.exception("brain: background refresh failed")

    def _pending_changed(self) -> bool:
        """A pending repo's checkout has kit.json now (pulled after the merge), or its state moved (merged, pushed, an
        MR, a commit): the list is read again. A few local git calls per pending repo; no network."""
        records = self.imports.all()
        token = self._token_present()
        for path, pend in list(self.repo_pending.values()):
            if os.path.isfile(os.path.join(path, importer.KIT)):
                return True
            now = importer.pending_state(path, records.get(path), token=token)
            keys = ("state", "branch", "commit", "pushed", "mr_url", "can_open_mr", "word", "next", "merge", "pull")
            if now is None or any(now.get(k) != pend.get(k) for k in keys):
                return True
        return False

    def _sweep(self) -> list[str]:
        """The install and upgrade records nothing waits for any more, cleared (landing.sweep): the repo tops."""
        return landing.sweep(self.imports, "install") + landing.sweep(self.upgrades, "upgrade")

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
        """Who this machine says the person is: $BRAIN_USER, else the name brain-kit goes by in a repo (never a token)."""
        who = os.environ.get("BRAIN_USER", "").strip().lower()
        if not who:
            for r in self.repos.values():
                who = self.me_in(r) or ""
                if who:
                    break
        return who or None

    def me_in(self, repo: Repo) -> str | None:
        """The name brain-kit goes by in *repo* (identity.of): $BRAIN_USER, git config brain.user, or the login name in
        a repo without GitLab when brain-kit falls back to it. GitLab's username (with a token) is not asked for."""
        return identity.of(repo.path, self._gitlab_of(repo)[0], token=False)["name"]

    def _me_view(self, repo: Repo, token: bool) -> dict[str, Any]:
        return identity.of(repo.path, self._gitlab_of(repo)[0], token=token)

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

    def _local_only(self, repo: Repo) -> bool:
        """Its requirements are done only on this machine: no GitLab to hand them over through (the board's rule)."""
        base, project = self._gitlab_of(repo)
        return not (base and project)

    def _row(self, repo: Repo, f: dict[str, Any], snap: dict[str, Any]) -> dict[str, Any]:
        row = deliveries.base_row(repo.id, f, local_only=self._local_only(repo))
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
        merged = bool(f.get("merged") or (mr or {}).get("state") == "merged")
        deliveries.classify(row, f, mr=mr, slot=live, cfg=repo.cfg, bot_commits=bot,
                            at_handover=bool(mr) and repo.is_handover_tip(f), me=self.me_in(repo),
                            reflected=merged and f["key"] in repo.reflected(), now=self.now())
        row["credits"] = snap["credits"].get(scope)
        row["sessions"] = len(sess)
        row["updated_at"] = deliveries.updated_at(f, live)
        row["session_url"] = live["url"] if live else None
        job = self._desc_job(repo, f, row["credits"])
        row["summary"] = mrdesc_view.plain_line(self.desc.first(*job)) if job else None
        if mr:
            row["mr"] = {"iid": mr["iid"], "url": mr.get("url") or mrinfo.mr_url(base, project, mr["iid"]),
                         "state": mr.get("state")}
            row["open_questions"] = [q["id"] for q in mr.get("questions") or [] if q.get("state") == "open"]
            row["run_ids"] = sorted({q["run_id"] for q in mr.get("questions") or [] if q.get("run_id")})
        return row

    # ---- 变更说明 (brain mr-desc) ------------------------------------------------------------------------- #

    @staticmethod
    def _desc_credits(credits: Any) -> float | None:
        return round(float(credits), 2) if isinstance(credits, (int, float)) and not isinstance(credits, bool) else None

    def _desc_job(self, repo: Repo, f: dict[str, Any], credits: Any) -> tuple[tuple, Callable[[], dict]] | None:
        """(signature, maker) of a requirement's 变更说明 on this machine: from the commit its facts are read at (the
        worktree's or branch's tip, the default branch once merged); None before it has a run."""
        if not f.get("run") or not f.get("key"):
            return None
        main = repo.main_sha()
        sha = f.get("tip") if f.get("where") in ("worktree", "branch") else (main if f.get("where") == "main" else None)
        if not sha:
            return None
        c = self._desc_credits(credits)
        key, cfg, path = f["key"], repo.cfg, repo.path
        cr = {"runs": {key: {"credits": c}}} if c is not None else None
        return (path, sha, main, key, c), (lambda: mrdesc_view.describe(path, cfg, key, sha, cr))

    def _desc_runner_job(self, path: str, cfg: dict[str, Any], key: str, credits: Any,
                         run_ids: list[str]) -> tuple[tuple, Callable[[], dict]] | None:
        """The same for a run on the team runner: its workspace's HEAD (the branch as the runner has it)."""
        git = Git(path)
        sha = mrdesc_view.target(git, "HEAD")
        if not sha:
            return None
        d = cfg.get("default_branch") or "main"
        main = mrdesc_view.target(git, "refs/remotes/origin/" + d) or mrdesc_view.target(git, "refs/heads/" + d)
        c = self._desc_credits(credits)
        cr = {"runs": {x: {"credits": c} for x in run_ids[-1:]}} if c is not None and run_ids else None
        return (path, sha, main, key, c), (lambda: mrdesc_view.describe(path, cfg, key, sha, cr))

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
            job = self._runner_desc(facts, key, row) if facts.get("run") else None
            row["summary"] = self.desc.first(*job) if job else None
            out.append((row, facts, decs))
        return out

    def _runner_desc(self, facts: dict[str, Any], key: str, row: dict[str, Any]):
        path = facts.get("worktree")
        if not path:
            return None
        try:
            cfg = bk.m("config").load(path)
        except Exception:  # noqa: BLE001
            cfg = dict(bk.m("config").DEFAULTS)
        return self._desc_runner_job(path, cfg, key, row.get("credits"), row.get("run_ids") or [])

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
            base, project = self._gitlab_of(repo)
            for f in facts:
                row = self._row(repo, f, snap)
                rows.append(row)
                mr = self.mr.get(project, f["branch"]) if base and project and f.get("branch") else None
                for k, n in deliveries.questions_asked(f, mr).items():
                    q_counts[k] += n
                intent = (f.get("run") or {}).get("intent")
                all_decisions += [dict(d, key=f["key"]) for d in detail.decisions(
                    f.get("decisions_text"), "aidlc-docs/%s/decisions.md" % intent if intent else "decisions.md",
                    repo.cfg.get("bot_users") or [])]
        for rid, (path, err) in self.repo_errors.items():
            if which in ("all", rid):
                errors.append({"repo": rid, "error": "%s：%s" % (path, err)})
        if which in ("all", "runner"):
            for row, _, decs in self._team_rows(snap):
                rows.append(row)
                for d in decs:
                    if d.get("state") == "invalid" or d.get("state") in deliveries.NOT_POSTED:   # not on the MR (yet)
                        continue
                    q_counts["asked"] += 1
                    q_counts["answered"] += d.get("state") in ("answered", "delivered", "delivery_unknown", "refused")
                    q_counts["delivered"] += d.get("state") == "delivered"
        overlaps = deliveries.overlaps(rows)
        parts: list[tuple[str, dict[str, Any]]] = []
        view, funnel = self._eval_view(which, snap, parts)
        if funnel is None:
            funnel = deliveries.funnel_app(all_decisions, q_counts)
        else:
            funnel["questions"] = q_counts
        scope = [r for rid, r in self.repos.items() if which in ("all", rid)]
        cto = deliveries.cto_numbers(parts, rows, available=bool(view.get("available")), now=self.now(),
                                     names={rid: r.name for rid, r in self.repos.items()}, repos=len(scope),
                                     local_repos=sum(1 for r in scope if self._local_only(r)))
        return {"at": self.now(), "rows": rows, "overlaps": overlaps, "funnel": funnel, "eval": view, "cto": cto,
                "counts": deliveries.counts(rows), "errors": errors}

    def _eval_view(self, which: str, snap: dict[str, Any],
                   parts: list[tuple[str, dict[str, Any]]] | None = None) -> tuple[dict[str, Any], dict | None]:
        """Eval from the cache (computed in the background, at most every EVAL_TTL_S per repo and main sha). *parts*
        gets each repo's part of the 交付总览's numbers (deliveries.cto_part)."""
        ids = [rid for rid in self.repos if which in ("all", rid)]
        if not bk.has("evaluate"):
            return deliveries.evaluate("", {}, None, None)
        views, funnels, stale, got_parts = [], [], [], []
        for rid in ids:
            repo = self.repos[rid]
            sha = repo.git.out("rev-parse", "-q", "--verify", (repo.main_ref() or "HEAD") + "^{commit}")
            got = self._eval.get(rid)
            if not got or got[0] != sha or time.monotonic() - got[1] > EVAL_TTL_S:
                stale.append((rid, sha))
            if got:
                v = dict(got[2])
                part = v.pop("_cto", None)
                if part is not None:
                    got_parts.append((rid, part))
                v["_name"] = repo.name
                views.append(v)
                if got[3]:
                    funnels.append(got[3])
        if parts is not None:
            parts.extend(got_parts)
        for rid, sha in stale:
            if rid not in self._eval_running:
                self._eval_running.add(rid)
                credits = {"runs": {k.split("-", 1)[1]: {"credits": v} for k, v in snap["credits"].items()
                                    if k.startswith(rid + "-")}}
                threading_start(self._eval_compute, rid, sha, credits)
        if not views:
            return {"available": False, "error": "正在算 Eval…" if ids else "没有仓库", "ref": None, "metrics": [],
                    "queue": [], "skipped": [], "notes": []}, None
        ref = deliveries.branch_words([(v.pop("_name"), v.get("ref")) for v in views])
        if len(views) == 1:
            return dict(views[0], ref=ref), (dict(funnels[0]) if funnels else None)
        merged = {"available": any(v["available"] for v in views), "error": "；".join(v["error"] for v in views if v["error"]),
                  "ref": ref, "metrics": [], "queue": [q for v in views for q in v["queue"]],
                  "skipped": [x for v in views for x in v.get("skipped") or []],
                  "notes": [x for v in views for x in v.get("notes") or []]}
        for m in views[0]["metrics"]:
            vals = [next((x["value"] for x in v["metrics"] if x["id"] == m["id"]), None) for v in views]
            pairs = [x for x in vals if isinstance(x, list)]
            nums = [x for x in vals if isinstance(x, (int, float)) and not isinstance(x, bool)]
            if m["id"] == "credits_per_success":   # an average: the repos' credits over their correct deliveries
                spent = [p["credits_total"] for _, p in got_parts if p.get("credits_total") is not None]
                good = sum(p.get("correct") or 0 for _, p in got_parts)
                value: Any = round(sum(spent) / good, 4) if spent and good else None
            elif pairs:
                value = [sum(p[0] for p in pairs), sum(p[1] for p in pairs)]
            else:
                value = sum(nums) if nums else None
            merged["metrics"].append({**m, "value": value})
        funnel = None
        if funnels:
            funnel = dict(funnels[0])
            funnel["rows"] = [{**r, "count": sum(next((x["count"] for x in f["rows"] if x["id"] == r["id"]), 0)
                                                 for f in funnels)} for r in funnels[0]["rows"]]
            funnel["total"] = sum(f["total"] for f in funnels)
            funnel["unclassified"] = [x for f in funnels for x in f.get("unclassified") or []]
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
                                                        "ref": None, "metrics": [], "queue": [], "skipped": [],
                                                        "notes": []}, None)
        finally:
            self._eval_running.discard(rid)

    async def overview(self, which: str = "all") -> dict[str, Any]:
        if which != "all" and not REPO_ID_RE.match(which or ""):
            raise AppError("repo 只能是 all、r1、r2 … 或 runner", "invalid_repo")
        snap = self._sessions_snapshot()
        return scrub_tree(await asyncio.to_thread(self._overview_sync, which, snap), self.scrub)

    async def refresh(self, rid: str) -> dict[str, Any]:
        return await asyncio.to_thread(self._repo(rid).fetch)

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

    def _detail_sync(self, rid: str, key: str, snap: dict[str, Any], parts: dict[str, Any] | None = None) -> dict[str, Any]:
        """需求详情. *parts*, when given, gets what the board is built from as well (facts, the raw trace, the MR)."""
        if rid == "runner":
            return self._team_detail(key, snap, parts)
        repo = self._repo(rid)
        f = self._facts(repo, key)
        row = self._row(repo, f, snap)
        scope = scope_of(rid, key)
        run = f.get("run") or {}
        me = self.me_in(repo)
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
        if parts is not None:
            parts.update(repo=repo, facts=f, trace=tl.get("trace"), mr=mr, scope=scope, decisions=[], me=me,
                         cfg=repo.cfg, path=repo.path, local_only=row["local_only"])
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
            "timeline": {"source": tl["source"], "items": tl["items"], "error": tl["error"],
                         "missing": board_mod.missing_sources(tl["missing"], local_only=row["local_only"],
                                                              handed=bool(run.get("handoff")))},
            "sessions": [{k: s[k] for k in ("slot", "title", "agent", "kind", "credits", "turns", "busy", "awaiting",
                                             "last_activity", "opened_at", "project", "url", "error")}
                         for s in snap["by"].get(scope, [])],
            "credits": {"total": snap["credits"].get(scope), "note": detail.NO_TOKENS},
            "brain": detail.brain_block(tl.get("brain"), None, f.get("decisions_text")),
            "mr_desc": self._desc_now(self._desc_job(repo, f, snap["credits"].get(scope))),
        }

    def _desc_now(self, job: tuple[tuple, Callable[[], dict]] | None) -> dict[str, Any]:
        """The 变更说明 for the detail page: from the cache, or made now (blocking: called in a thread)."""
        if job is None:
            return mrdesc_view.empty("还没开工：开工以后才有变更说明")
        return self.desc.get_or_make(*job)

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
                                 vouchers_dir=self._vouchers_dir(repo), has_run=bool(f.get("run")))
            self._trace = {k: v for k, v in self._trace.items() if time.monotonic() - v[0] < TRACE_TTL_S}
            self._trace[sig] = (time.monotonic(), dict(tl))
        tl["items"] = sorted(tl["items"] + self.store.events(scope), key=lambda x: (x["at"] or "", x["kind"]))
        return tl

    def _team_detail(self, key: str, snap: dict[str, Any], parts: dict[str, Any] | None = None) -> dict[str, Any]:
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
        if parts is not None:
            try:
                cfg_t = bk.m("config").load(path) if path else dict(bk.m("config").DEFAULTS)
            except Exception:  # noqa: BLE001
                cfg_t = dict(bk.m("config").DEFAULTS)
            parts.update(repo=None, facts=f, trace=tl.get("trace"), mr=None, scope=None, decisions=decs, me=None,
                         cfg=cfg_t, path=path, local_only=False, sessions=sess,
                         app_events=[e for rid in row["run_ids"] for e in self.store.events(rid)])
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
            "timeline": {"source": tl["source"], "items": tl["items"], "error": tl["error"],
                         "missing": board_mod.missing_sources(tl["missing"], local_only=False, handed=True)},
            "sessions": [{k: s[k] for k in ("slot", "title", "agent", "kind", "credits", "turns", "busy", "awaiting",
                                             "last_activity", "opened_at", "project", "url", "error")} for s in sess],
            "credits": {"total": row["credits"], "note": detail.NO_TOKENS},
            "brain": detail.brain_block(tl.get("brain"), None, f.get("decisions_text")),
            "mr_desc": self._desc_now(self._runner_desc(f, key, row) if run else None),
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
                "main": "默认分支（已合并）", "claim": "只有认领，还没开工", "runner": "运行机"}.get(f.get("where"), "")

    async def requirement(self, rid: str, key: str) -> dict[str, Any]:
        snap = self._sessions_snapshot()
        return scrub_tree(await asyncio.to_thread(self._detail_sync, rid, key, snap), self.scrub)

    # ---- 需求看板 ------------------------------------------------------------------------------------- #

    def _commits(self, git: Git, shas: list[str]) -> tuple[dict[str, str], dict[str, list[dict[str, Any]]]]:
        """The commits' subjects and the files each changed (one git call, board_mod.GIT_LOG; kept by the commits
        asked for)."""
        shas = [x for x in shas if re.match(r"^[0-9a-f]{40}$", x or "")][-board_mod.MAX_BELT:]
        if not shas:
            return {}, {}
        sig = (git.repo, tuple(shas))
        got = self._subj.get(sig)
        if got is None:
            p = git.run(*board_mod.GIT_LOG, *shas, timeout=20)
            out = p.stdout if p.returncode == 0 else ""
            got = (board_mod.subjects_from_log(out), board_mod.changes_from_log(out))
            if len(self._subj) > 200:
                self._subj.clear()
            self._subj[sig] = got
        return got

    @staticmethod
    def _reflect_refs(git: Git, key: str) -> list[tuple[str, float]]:
        """brain reflect's branches for *key* (brain/<KEY>-reflect-<n>, local or origin's) and when they were made."""
        out, seen = [], set()
        rx = re.compile(r"^refs/(?:heads|remotes/origin)/(brain/%s-reflect-[1-9][0-9]*)$" % re.escape(key))
        for ref in sorted(git.refs("refs/heads/brain/", "refs/remotes/origin/brain/")):
            m = rx.match(ref)
            if m and m.group(1) not in seen:
                at = git.commit_time(ref)
                if at:
                    seen.add(m.group(1))
                    out.append((m.group(1), at))
        return out

    def _board_sync(self, rid: str, key: str, snap: dict[str, Any]) -> dict[str, Any]:
        parts: dict[str, Any] = {}
        d = self._detail_sync(rid, key, snap, parts)
        f, t, cfg = parts.get("facts") or {}, parts.get("trace"), parts.get("cfg") or {}
        repo = parts.get("repo")
        git = repo.git if repo is not None else (Git(parts["path"]) if parts.get("path") else None)
        commits = ((t or {}).get("actions") or {}).get("commits") or []
        subjects, changes = self._commits(git, [str(c.get("sha") or "") for c in commits]) if git is not None else ({}, {})
        sessions = parts["sessions"] if parts.get("sessions") is not None else snap["by"].get(parts.get("scope") or "", [])
        app_events = parts["app_events"] if parts.get("app_events") is not None else (
            self.store.events(parts["scope"]) if parts.get("scope") else [])
        g = board_mod.build(
            f, d["row"], t, mr=parts.get("mr"), sessions=sessions, app_events=app_events,
            team_decisions=parts.get("decisions") or [], subjects=subjects, changes=changes,
            reflect_refs=self._reflect_refs(git, key) if git is not None else [],
            default_branch=str(cfg.get("default_branch") or "main"), local_only=bool(parts.get("local_only")),
            kit_rows=board_mod.kit_cells(self.crew.get("rows") or [], parts.get("path") or ""),
            decisions=d["decisions"], brain=d["brain"], me=parts.get("me"), now=self.now())
        return {"at": self.now(), "row": d["row"], "branch": d["row"].get("branch"),
                "base": str(cfg.get("default_branch") or "main"), "started_at": g["started_at"], "ended_at": g["ended_at"],
                "live": g["live"], "person": g["person"], "actors": g["actors"],
                "edges": [list(e) for e in board_edges([a["key"] for a in g["actors"]], g["direct"])], "direct": g["direct"],
                "events": g["events"], "belt": g["belt"], "checks": g["checks"], "accept": g["accept"],
                "brain": d["brain"], "decisions": d["decisions"], "questions": d["questions"], "mr_desc": d["mr_desc"],
                "sessions": d["sessions"], "credits": d["credits"], "source": d["timeline"]["source"],
                "missing": g["missing"], "error": d["timeline"]["error"]}

    async def board(self, rid: str, key: str) -> dict[str, Any]:
        """需求看板: polled every 2 s; the trace, the facts and the 变更说明 come from their caches."""
        snap = self._sessions_snapshot()
        return scrub_tree(await asyncio.to_thread(self._board_sync, rid, key, snap), self.scrub)

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
        self.crew = await asyncio.to_thread(self.crew_sync)
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
        approval: a question with a lean_request is not answerable here. *choice*: one of the question's options (A–H),
        or approve / reject for a question without options (brain-kit counts nothing else for one)."""
        if not isinstance(choice, str) or not re.fullmatch(r"(?i)[A-H]|approve|reject", choice.strip()):
            raise AppError("回答选一个选项（A–H）；没有选项的问题答 approve 或 reject", "invalid_choice")
        choice = choice.strip()
        choice = choice.lower() if choice.lower() in ("approve", "reject") else choice.upper()
        note = " ".join(str(note or "").split())[:300]
        repo = self._repo(rid)
        f = await asyncio.to_thread(self._facts, repo, key)
        me = await asyncio.to_thread(self.me_in, repo)
        if not me or me != f.get("owner"):
            raise AppError("只有需求负责人本人能在这里回答（git config brain.user）", "not_owner", 403)
        run = f.get("run") or {}
        scope = scope_of(rid, key)
        park = f.get("park")
        if not run.get("handoff"):
            if not deliveries.park_waiting(park) or park.get("kind") != "clarify" or park.get("lean_request"):
                raise AppError("这个需求没有等你回答的澄清问题", "no_question", 409)
            if choice not in answer_choices([str(o.get("id")) for o in park.get("options") or [] if isinstance(o, dict)]):
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
        if choice not in answer_choices([o["id"] for o in q.get("options") or []]):
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
        me = await asyncio.to_thread(self.me_in, repo)
        return scrub_tree(await asyncio.to_thread(intake.check, repo, body, me), self.scrub)

    async def intake_start(self, body: dict[str, Any]) -> dict[str, Any]:
        repo = self._repo(str(body.get("repo") or ""))
        try:
            out = await asyncio.to_thread(intake.start, repo, body, self.settings["work_root"])
        except intake.IntakeError as exc:
            raise AppError(str(exc), "invalid_intake")
        out = scrub_tree(out, self.scrub)
        if not out["ok"]:
            out["problem"] = problems.who_row(out["output"], repo=repo.path)
            if out["problem"]:
                out["me"] = await asyncio.to_thread(self._me_view, repo, await asyncio.to_thread(self._token_present))
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
        self.crew = await asyncio.to_thread(self.crew_sync)
        return self.crew

    async def crew_fix(self, what: Any) -> dict[str, Any]:
        if what not in ("agent", "engine"):
            raise AppError("what 只能是 agent 或 engine", "invalid_fix")
        try:
            text = await asyncio.to_thread(crewcheck.fix_agent if what == "agent" else crewcheck.fix_engine)
            ok = True
        except Exception as exc:  # noqa: BLE001
            text, ok = str(exc)[:300], False
        self.crew = await asyncio.to_thread(self.crew_sync)
        return {"ok": ok, "text": text, "rows": self.crew["rows"]}

    # ---- Brain ---------------------------------------------------------------------------------------- #

    def _reflectable(self, repo: Repo) -> list[dict[str, Any]]:
        out = []
        for f in repo.scan():
            t = f.get("decisions_text") or ""
            if "brain-proposal" in t or "brain-gap" in t:
                row = deliveries.base_row(repo.id, f)
                deliveries.classify(row, f, mr=None, slot=None, cfg=repo.cfg, me=self.me_in(repo), now=self.now())
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
        token = self._token_present()
        for rid, repo in self.repos.items():
            try:
                facts = repo.scan()
            except Exception:  # noqa: BLE001
                continue
            base, project = self._gitlab_of(repo)
            me = self.me_in(repo)
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
                repos.append({"id": rid, "path": r.path, "name": r.name, "ok": True, "error": "",
                              "kit": importer.kit_view(r.cfg), "pending": None, "me": None,
                              "remote": await asyncio.to_thread(r.has_origin)})
            elif rid in self.repo_pending:
                p, pend = self.repo_pending[rid]
                repos.append({"id": rid, "path": p, "name": os.path.basename(p), "ok": False, "error": "", "kit": None,
                              "pending": pend, "me": None, "remote": await asyncio.to_thread(Git(p).has_origin)})
            else:
                p, err = self.repo_errors.get(rid, (path, "没装载"))
                repos.append({"id": rid, "path": p, "name": os.path.basename(p), "ok": False, "error": err, "kit": None,
                              "pending": None, "me": None,
                              "remote": os.path.isdir(p) and await asyncio.to_thread(Git(p).has_origin)})
        todo = await self.todo()
        token = await asyncio.to_thread(self._token_present)
        loaded = {x["id"]: self.repos[x["id"]] for x in repos if x["ok"] and x["id"] in self.repos}
        mes = await asyncio.to_thread(lambda: {rid: self._me_view(r, token) for rid, r in loaded.items()})
        for x in repos:
            x["me"] = mes.get(x["id"])
        # machine-wide: $BRAIN_USER, else the name of the first repo that has one (each repo's is in its row)
        env = os.environ.get("BRAIN_USER", "").strip().lower()
        first = next((x["me"] for x in repos if x["me"] and x["me"]["name"]), None)
        me = env or (first["name"] if first else None)
        how = "GitLab token（%s）" % ("有" if token else "没有") + (
            "；环境变量 BRAIN_USER = %s" % env if env else "；%s" % first["text"] if first else "")
        return {"app": {"name": self.name, "version": VERSION, "team": self.team is not None},
                "brainkit": {"path": info["path"], "ok": info["ok"], "version": info["version"], "error": info["error"],
                             "modules": info["modules"]},
                "repos": repos, "crew": self.crew,
                "me": {"user": me, "token": token, "how": how},
                "team": self._team_status(), "counts": {"todo": len(todo["items"])}}

    def settings_view(self) -> dict[str, Any]:
        return {**self.settings, "team": dict(self.settings["team"])}

    async def save_settings(self, body: Any) -> dict[str, Any]:
        """Check, save atomically, reload. A key the body leaves out keeps its value (the 设置 form sends no repos: the
        list is changed by 导入仓库 and 移出列表 only)."""
        if isinstance(body, dict):
            body = {**self.settings_view(), **body}
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

    # ---- 导入仓库 ------------------------------------------------------------------------------------- #

    @staticmethod
    def _fail(exc: "importer.ImportFail") -> AppError:
        return AppError(str(exc), exc.code, exc.status)

    async def import_defaults(self) -> dict[str, Any]:
        token = await asyncio.to_thread(self._token_present)
        return {"clone_parent": importer.default_parent(self.settings["work_root"]), "work_root": self.settings["work_root"],
                "branch": importer.DEFAULT_BRANCH, "token": token, "brainkit_ok": bk.ok()}

    async def import_inspect(self, body: dict[str, Any]) -> dict[str, Any]:
        """检查: read only (see importer.inspect)."""
        token = await asyncio.to_thread(self._token_present)
        got = await asyncio.to_thread(importer.inspect, body.get("path"), listed=list(self.settings["repos"]),
                                      records=self.imports, token=token, team_of=runner_repo_at)
        return scrub_tree(got, self.scrub)

    def _start_job(self, kind: str, target: str, steps: tuple, work: Callable[[Callable[..., None]], Any],
                   after: Callable[[Any], Any] | None = None) -> str:
        """A clone or an install in a worker thread (never on the event loop); its steps and result in self.jobs."""
        try:
            jid = self.jobs.start(kind, target, steps)
        except importer.ImportFail as exc:
            raise self._fail(exc)

        def step(sid: str, state: str, detail: str = "") -> None:
            self.jobs.step(jid, sid, state, detail)

        async def go() -> None:
            try:
                res = await asyncio.to_thread(work, step)
                if after is not None:
                    try:
                        await after(res)
                    except Exception:  # noqa: BLE001 - the job itself is done
                        self.log.exception("brain: after the %s job", kind)
                self.jobs.finish(jid, result=res)
            except importer.ImportFail as exc:
                self.jobs.finish(jid, result=exc.result, error=str(exc))
            except Exception as exc:  # noqa: BLE001 - said on the page; the traceback goes to the log only
                self.log.exception("brain: %s job failed", kind)
                self.jobs.finish(jid, error="出错了：%s" % str(exc).split("\n", 1)[0][:300])

        self.jobs.tasks[jid] = asyncio.get_running_loop().create_task(go())
        return jid

    def import_job(self, jid: str) -> dict[str, Any]:
        got = self.jobs.view(jid)
        if got is None:
            raise AppError("没有这个任务（app 重开过？重新检查一下）", "no_job", 404)
        return scrub_tree(got, self.scrub)

    async def wait_job(self, jid: str) -> dict[str, Any]:
        """The job's end (tests, and any caller that wants it)."""
        task = self.jobs.tasks.get(jid)
        if task is not None:
            await task
        return self.import_job(jid)

    async def import_clone(self, body: dict[str, Any]) -> dict[str, Any]:
        try:
            plan = await asyncio.to_thread(importer.clone_plan, body.get("url"), body.get("parent"), body.get("name"),
                                           self.settings["work_root"])
        except importer.ImportFail as exc:
            raise self._fail(exc)
        jid = self._start_job("clone", plan["dest"], importer.CLONE_STEPS, lambda step: importer.clone(plan, step))
        return {"job": self.import_job(jid)}

    async def _import_top(self, raw: Any) -> str:
        """The repo top level a request names (checked like 检查 does)."""
        def find() -> str:
            real = importer.clean_dir(raw)
            try:
                return importer.locate(real)["top"]
            except importer.NotARepo as exc:
                raise importer.ImportFail("%s：%s" % (exc, exc.todo), "not_a_repo")
        try:
            return await asyncio.to_thread(find)
        except importer.ImportFail as exc:
            raise self._fail(exc)

    async def _mode(self, top: str, body: dict[str, Any], purpose: str) -> str:
        """The mode a request asks for ("inplace" | "branch"); none given: the recommended one (importer.choices). In
        place when it cannot be done is refused here, before any job starts, with the one line why."""
        mode = body.get("mode")
        if mode is not None and mode not in ("inplace", "branch"):
            raise AppError("mode 只能是 inplace（直接装在当前分支）或 branch（装到新分支）", "invalid_mode")
        if mode == "branch":
            return "branch"
        cfg = await asyncio.to_thread(installer._kit_of, top) if purpose == "upgrade" else None
        got = await asyncio.to_thread(lambda: importer.choices(top, purpose=purpose, cfg=cfg))
        if mode is None:
            return str(got["recommend"])
        opt = got["options"][0]
        if not opt["ok"]:
            raise AppError("不能直接装：%s。可以装到新分支" % opt["why"], "inplace_refused", 409)
        return "inplace"

    async def me_name(self, body: dict[str, Any]) -> dict[str, Any]:
        """「你的 GitLab 用户名」 (or 「你的名字」): git config brain.user <name> in the repo at body.path (identity.set_name:
        brain-kit's USER_RE, no shell). Answers who brain-kit says the person is there now, and the status."""
        top = await self._import_top(body.get("path"))
        try:
            name = await asyncio.to_thread(identity.set_name, top, body.get("name"))
        except identity.NameRefused as exc:
            raise AppError(str(exc), "invalid_name")
        rid = importer.listed_id(top, list(self.settings["repos"]))
        repo = self.repos.get(rid or "")
        token = await asyncio.to_thread(self._token_present)
        if repo is not None:
            me = await asyncio.to_thread(self._me_view, repo, token)
        else:
            base = await asyncio.to_thread(lambda: ((installer._kit_of(top) or {}).get("gitlab") or {}).get("base") or "")
            me = await asyncio.to_thread(lambda: identity.of(top, base, token=token))
        self.log.info("brain: git config brain.user set in %s", top)
        return {"ok": True, "text": "这个仓库的 git config brain.user 设成了 %s" % name, "me": me,
                "status": await self.status()}

    async def import_choices(self, body: dict[str, Any]) -> dict[str, Any]:
        """Where an install (or a kit update, purpose "upgrade") goes: in place or a new branch (importer.choices)."""
        top = await self._import_top(body.get("path"))
        purpose = body.get("purpose", "install")
        if purpose not in installer.PURPOSES:
            raise AppError("purpose 只能是 install 或 upgrade", "invalid_purpose")
        cfg = await asyncio.to_thread(installer._kit_of, top) if purpose == "upgrade" else None
        return scrub_tree(await asyncio.to_thread(lambda: importer.choices(top, purpose=purpose, cfg=cfg)), self.scrub)

    async def import_install(self, body: dict[str, Any]) -> dict[str, Any]:
        """安装: in place on the checkout's branch (the default, inplace.install) or on a new branch for an MR
        (installer.install), in the background; the page follows the job."""
        top = await self._import_top(body.get("path"))
        try:
            kit = installer.check_kit(body.get("kit"))
            mode = await self._mode(top, body, "install")
            branch = await asyncio.to_thread(installer.check_branch, body.get("branch")) if mode == "branch" else ""
        except importer.ImportFail as exc:
            raise self._fail(exc)
        work_root = self.settings["work_root"]

        async def after(_res: Any) -> None:
            if top in self.settings["repos"]:   # a listed repo that was not installed: usable now, or pending
                await asyncio.to_thread(self.reload_sync)

        if mode == "inplace":
            jid = self._start_job("install", top, inplace.INSTALL_STEPS,
                                  lambda step: inplace.install(top, kit, self.imports, step), after)
        else:
            jid = self._start_job("install", top, installer.INSTALL_STEPS,
                                  lambda step: installer.install(top, kit, branch, work_root, self.imports, step), after)
        return {"job": self.import_job(jid)}

    def _purpose(self, body: dict[str, Any]) -> tuple[str, "importer.Records"]:
        """purpose "install" (the default: imports.json) or "upgrade" (the kit fix: upgrades.json)."""
        purpose = body.get("purpose", "install")
        if purpose not in installer.PURPOSES:
            raise AppError("purpose 只能是 install 或 upgrade", "invalid_purpose")
        return purpose, (self.upgrades if purpose == "upgrade" else self.imports)

    async def _after_import(self, top: str, purpose: str) -> None:
        """After a commit or a push: a listed repo whose install moved is read again (the KiroCrew checks with it);
        else the KiroCrew checks again, so a row's state is fresh."""
        if purpose == "install" and top in self.settings["repos"]:
            await asyncio.to_thread(self.reload_sync)
        else:
            self.crew = await asyncio.to_thread(self.crew_sync)

    async def import_upgrade(self, body: dict[str, Any]) -> dict[str, Any]:
        """The 'kit' fix of a KiroCrew check row: brain install again, in place on the checkout's branch (the default,
        inplace.install with purpose "upgrade") or on a new branch (installer.upgrade), in the background; the page
        follows the job, then commits again, pushes, or publishes with purpose "upgrade"."""
        top = await self._import_top(body.get("path"))
        try:
            mode = await self._mode(top, body, "upgrade")
            branch = (await asyncio.to_thread(installer.check_branch, body.get("branch"), installer.UPGRADE_BRANCH)
                      if mode == "branch" else "")
        except importer.ImportFail as exc:
            raise self._fail(exc)
        work_root = self.settings["work_root"]
        token = await asyncio.to_thread(self._token_present)

        async def after(_res: Any) -> None:
            self.crew = await asyncio.to_thread(self.crew_sync)

        if mode == "inplace":
            jid = self._start_job("upgrade", top, inplace.UPGRADE_STEPS,
                                  lambda step: inplace.install(top, None, self.upgrades, step, purpose="upgrade",
                                                               token=token), after)
        else:
            jid = self._start_job("upgrade", top, installer.UPGRADE_STEPS,
                                  lambda step: installer.upgrade(top, branch, work_root, self.upgrades, step, token=token),
                                  after)
        return {"job": self.import_job(jid)}

    async def import_commit(self, body: dict[str, Any]) -> dict[str, Any]:
        """再提交一次: the install's (or upgrade's) commit after a hook said no (the hooks run again)."""
        top = await self._import_top(body.get("path"))
        purpose, records = self._purpose(body)
        rec = await asyncio.to_thread(records.get, top)
        mod = inplace if (rec or {}).get("mode") == "inplace" else installer
        try:
            got = await asyncio.to_thread(lambda: mod.commit(top, records, purpose=purpose))
        except importer.ImportFail as exc:
            raise self._fail(exc)
        if got["ok"]:
            await self._after_import(top, purpose)
        return scrub_tree(got, self.scrub)

    async def import_merge(self, body: dict[str, Any]) -> dict[str, Any]:
        """「合并到 <default>」: a branch install fast-forwarded into the checkout (landing.merge); a repo with a remote
        only with confirm true."""
        top = await self._import_top(body.get("path"))
        purpose, records = self._purpose(body)
        try:
            got = await asyncio.to_thread(lambda: landing.merge(top, records, confirm=body.get("confirm") is True))
        except importer.ImportFail as exc:
            raise self._fail(exc)
        await self._after_land(top)
        return scrub_tree(got, self.scrub)

    async def import_pull(self, body: dict[str, Any]) -> dict[str, Any]:
        """「拉取」: git pull --ff-only of the default branch, after the MR was merged (landing.pull)."""
        top = await self._import_top(body.get("path"))
        try:
            got = await asyncio.to_thread(landing.pull, top, self.imports)
        except importer.ImportFail as exc:
            raise self._fail(exc)
        if got["ok"]:
            await self._after_land(top)
        return scrub_tree(got, self.scrub)

    async def import_push(self, body: dict[str, Any]) -> dict[str, Any]:
        """推送 after an in-place install or a local merge: the checkout's branch to origin, only as confirmed."""
        top = await self._import_top(body.get("path"))
        confirm = {k: body.get(k) for k in ("branch", "remote_url")}
        try:
            got = await asyncio.to_thread(inplace.push, top, confirm)
        except importer.ImportFail as exc:
            raise self._fail(exc)
        return scrub_tree(got, self.scrub)

    async def _after_land(self, top: str) -> None:
        """After a merge or a pull: the list read again when the repo is listed, else the KiroCrew checks."""
        if top in self.settings["repos"]:
            await asyncio.to_thread(self.reload_sync)
        else:
            self.crew = await asyncio.to_thread(self.crew_sync)

    async def import_publish(self, body: dict[str, Any]) -> dict[str, Any]:
        """推送并开 MR: only with the branch, remote and target the person confirmed on the page."""
        top = await self._import_top(body.get("path"))
        purpose, records = self._purpose(body)
        confirm = {k: body.get(k) for k in ("branch", "target", "remote_url")}
        try:
            got = await asyncio.to_thread(lambda: installer.publish(top, records, confirm, transport=self.transport,
                                                                    purpose=purpose))
        except importer.ImportFail as exc:
            raise self._fail(exc)
        await self._after_import(top, purpose)
        return scrub_tree(got, self.scrub)

    async def import_add(self, body: dict[str, Any]) -> dict[str, Any]:
        """加入列表: through save_settings (checked, saved atomically, reloaded). A repo whose brain-kit is only on the
        install branch is added too and shows as pending; one without brain-kit anywhere is refused."""
        top = await self._import_top(body.get("path"))
        rid = importer.listed_id(top, self.settings["repos"])
        if rid:
            return {"ok": True, "id": rid, "text": "已经在列表里了（%s）" % rid, "status": await self.status()}
        token = await asyncio.to_thread(self._token_present)

        def state() -> tuple[bool, dict[str, Any] | None, str]:
            if os.path.isfile(os.path.join(top, importer.KIT)):
                if not bk.ok():
                    return False, None, "brain-kit 没装载：先在设置里写对它的位置"
                try:
                    bk.m("config").load(top)
                except Exception as exc:  # noqa: BLE001
                    return False, None, "kit.json 有问题：%s。改好再加" % str(exc).split("\n", 1)[0][:200]
                return True, None, ""
            pend = importer.pending_state(top, self.imports.get(top), token=token)
            return (True, pend, "") if pend else (False, None, "这个仓库还没装 brain-kit：先检查它，装上再加入")

        ok, pend, why = await asyncio.to_thread(state)
        if not ok:
            raise AppError(why, "not_installed", 409)
        if len(self.settings["repos"]) >= settings_mod.MAX_REPOS:
            raise AppError("最多 %d 个仓库：先移出一个" % settings_mod.MAX_REPOS, "too_many", 409)
        saved = await self.save_settings({**self.settings_view(), "repos": list(self.settings["repos"]) + [top]})
        rid = importer.listed_id(top, self.settings["repos"]) or ""
        text = "加入了（%s）" % rid + ("：%s" % pend["text"] if pend else "")
        return {"ok": True, "id": rid, "text": text, "status": saved["status"]}

    async def repo_remove(self, body: dict[str, Any]) -> dict[str, Any]:
        """移出列表: the app's list only. No file, branch or worktree is touched; a folder that is gone can be removed."""
        raw = body.get("path")
        if not isinstance(raw, str) or not raw.strip() or importer.CTRL_RE.search(raw):
            raise AppError("写要移出的仓库目录", "invalid_path")
        p = os.path.expanduser(raw.strip())
        if not os.path.isabs(p):
            raise AppError("仓库目录要写绝对路径", "invalid_path")
        real = os.path.realpath(p)
        repos = list(self.settings["repos"])
        hit = next((r for r in repos if r == p or r == real or os.path.realpath(r) == real), None)
        if hit is None:
            raise AppError("列表里没有这个仓库：%s" % raw.strip(), "not_listed", 404)
        saved = await self.save_settings({**self.settings_view(), "repos": [r for r in repos if r != hit]})
        return {"ok": True, "text": "从列表里移出了 %s（文件、分支都没动）" % os.path.basename(hit), "status": saved["status"]}

    # ---- team mode ------------------------------------------------------------------------------------ #

    async def team_view(self) -> dict[str, Any]:
        if self.team is None:
            return {"status": self._team_status(), "ledger": {"runs": {}, "decisions": {}, "handoffs": {}}, "runs": [],
                    "handovers": [], "signer": {"pending": [], "refused": [], "waiting": []}}
        led = await asyncio.to_thread(self.team.ledger)
        signer = await asyncio.to_thread(self.team.signer_view)
        signer["waiting"] = await asyncio.to_thread(self.team.pending)
        # the signer's reasons and a round's errors in short Chinese (problems.reason), their own words beside them
        signer["refused"] = [dict(x, reasons=[problems.reason(r)["text"] for r in x.get("reasons") or []],
                                  raw=[str(r) for r in x.get("reasons") or []]) for x in signer.get("refused") or []]
        handovers = []
        for h in self.team.handovers():
            row = {k: h[k] for k in ("project", "iid", "sha", "result", "error", "at", "mr_url")}
            got = problems.reason(row["error"]) if row["error"] else None
            row.update(error=got["text"] if got else "", raw=(got["raw"] or "") if got else "")
            handovers.append(row)
        return {"status": self.team.status(), "ledger": self.team.counts(led),
                "runs": [{"run_id": r["run_id"], "req": r["req"], "project": r["project"], "iid": int(r["iid"]),
                          "state": r["state"], "slot": r.get("slot"), "mr_url": self.team.mr_url(r["project"], r["iid"]),
                          "updated": r.get("updated")} for r in led["runs"]],
                "handovers": handovers, "signer": signer}

    async def team_loop(self) -> dict[str, Any]:
        if self.team is None or self.team.host is None:
            raise AppError((self.team.error if self.team else "") or "运行机模式没打开", "team_off", 409)
        try:
            summary = await self._in_team(self.team.loop_once)
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "summary": {}, "error": str(exc)[:300]}
        return {"ok": not self.team.loop_error, "summary": summary, "error": self.team.loop_error}


def runner_repo(cfg: dict[str, Any], facts: list[dict[str, Any]]) -> bool:
    """A repo handed to the team runner: its kit.json names bridge_user, or one of its requirements has a hand-over
    (run.json handoff). The checks that matter only to the runner (the hook adapter's version, Lean counting runs/**
    as code) FAIL for it; for a local-only repo they are a reminder."""
    if str(cfg.get("bridge_user") or "").strip():
        return True
    return any((f.get("run") or {}).get("handoff") for f in facts if isinstance(f, dict))


def runner_repo_at(path: str, cfg: dict[str, Any]) -> bool:
    """runner_repo for a repo that is not listed (导入仓库's 检查): its requirements read here (blocking)."""
    if str(cfg.get("bridge_user") or "").strip():
        return True
    try:
        return runner_repo(cfg, Repo("import", path, cfg).scan())
    except Exception:  # noqa: BLE001 - not known: the checks say it as brain-kit does (FAIL)
        return True


def board_edges(keys: list[str], direct: bool) -> list[tuple[str, str]]:
    """The way's edges among *keys* (the UI's board/layout.ts edgesOf draws the same)."""
    have = set(keys)
    all_ = [("local", "req"), ("local", "design"), ("req", "handover"), ("design", "handover"), ("handover", "bridge"),
            ("bridge", "signer"), ("signer", "runner"), ("runner", "ci"), ("ci", "release"), ("release", "reflect")]
    if direct:
        all_.append(("design", "ci"))
    return [(a, b) for a, b in all_ if a in have and b in have]


def answer_choices(options: list[str]) -> set[str]:
    """What counts as an answer (brain-kit's check_answer): one of the options; approve / reject when there are none."""
    return set(options) if options else {"approve", "reject"}


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

