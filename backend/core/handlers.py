"""HTTP routes, served under ``/api/apps/brain/`` on the loopback gateway. All but ``/health`` are for the dashboard
owner only (``Kit.guarded``: a signed-in owner request, never an app token): they open sessions, spend credits, run
git and brain-kit on this machine. No route returns a token, a secret or a key."""

from __future__ import annotations

import re
from typing import Any

from .constants import KEY_RE, REPO_ID_RE
from .httpkit import AppError, Kit

try:  # always there in the gateway; plain pytest passes a fake web module
    from aiohttp import web as _web
except ImportError:  # pragma: no cover
    _web = None


def _rid(request: Any) -> str:
    rid = str(request.match_info.get("repo", ""))
    if not REPO_ID_RE.match(rid):
        raise AppError("没有这个仓库", "no_repo", 404)
    return rid


def _key(request: Any) -> str:
    key = str(request.match_info.get("key", ""))
    if not KEY_RE.match(key):
        raise AppError("需求号不对", "invalid_key")
    return key


def build_routes(svc: Any, AppRoute: Any, *, web: Any = None, is_owner: Any = None) -> list[Any]:
    web = web if web is not None else _web
    if web is None:
        raise RuntimeError("aiohttp is not installed: pass web=")
    kit = Kit(web, is_owner=is_owner)

    async def health(request: Any, ctx: Any) -> Any:
        return kit.json({"ok": True, "started": svc.started})

    async def status(request: Any) -> Any:
        return kit.json(await svc.status())

    async def get_settings(request: Any) -> Any:
        return kit.json(svc.settings_view())

    async def post_settings(request: Any) -> Any:
        return kit.json(await svc.save_settings(await kit.body(request)))

    async def refresh(request: Any) -> Any:
        body = await kit.body(request)
        rid = str(body.get("repo") or "")
        if not REPO_ID_RE.match(rid):
            raise AppError("repo 要写仓库号（r1 …）", "invalid_repo")
        return kit.json(await svc.refresh(rid))

    async def overview(request: Any) -> Any:
        return kit.json(await svc.overview(str(request.query.get("repo") or "all")))

    async def requirement(request: Any) -> Any:
        return kit.json(await svc.requirement(_rid(request), _key(request)))

    async def open_session(request: Any) -> Any:
        body = await kit.body(request)
        return kit.json(await svc.open_session(_rid(request), _key(request), trust=body.get("trust", True) is not False,
                                               kickoff=body.get("kickoff", True) is not False))

    async def answer(request: Any) -> Any:
        body = await kit.body(request)
        did = body.get("id")
        if did is not None and (not isinstance(did, str) or not re.fullmatch(r"D-[1-9][0-9]{0,6}", did)):
            raise AppError("id 是问题号 D-<n>", "invalid_id")
        note = body.get("note")
        if note is not None and not isinstance(note, str):
            raise AppError("note 是一句话", "invalid_note")
        return kit.json(await svc.answer(_rid(request), _key(request), body.get("choice"), note, did))

    async def intake_next(request: Any) -> Any:
        rid = str(request.query.get("repo") or "")
        if not REPO_ID_RE.match(rid):
            raise AppError("repo 要写仓库号（r1 …）", "invalid_repo")
        return kit.json(await svc.intake_next(rid))

    async def intake_check(request: Any) -> Any:
        return kit.json(await svc.intake_check(await kit.body(request)))

    async def intake_start(request: Any) -> Any:
        return kit.json(await svc.intake_start(await kit.body(request)))

    async def crew(request: Any) -> Any:
        return kit.json(await svc.crew_checks())

    async def crew_fix(request: Any) -> Any:
        return kit.json(await svc.crew_fix((await kit.body(request)).get("what")))

    async def brain(request: Any) -> Any:
        rid = str(request.query.get("repo") or "")
        if not REPO_ID_RE.match(rid):
            raise AppError("repo 要写仓库号（r1 …）", "invalid_repo")
        return kit.json(await svc.brain(rid))

    def _rk(body: dict[str, Any]) -> tuple[str, str]:
        rid, key = str(body.get("repo") or ""), str(body.get("key") or "")
        if not REPO_ID_RE.match(rid) or not KEY_RE.match(key):
            raise AppError("要写 repo（r1 …）和需求号 key", "invalid_body")
        return rid, key

    async def reflect_preview(request: Any) -> Any:
        return kit.json(await svc.reflect_preview(*_rk(await kit.body(request))))

    async def reflect_apply(request: Any) -> Any:
        body = await kit.body(request)
        return kit.json(await svc.reflect_apply(*_rk(body), push=body.get("push") is True))

    async def todo(request: Any) -> Any:
        return kit.json(await svc.todo())

    async def team(request: Any) -> Any:
        return kit.json(await svc.team_view())

    # 导入仓库: every path in a body is checked by the service (absolute, a real directory, no planted symlink)
    async def import_defaults(request: Any) -> Any:
        return kit.json(await svc.import_defaults())

    async def import_inspect(request: Any) -> Any:
        return kit.json(await svc.import_inspect(await kit.body(request)))

    async def import_clone(request: Any) -> Any:
        return kit.json(await svc.import_clone(await kit.body(request)))

    async def import_install(request: Any) -> Any:
        return kit.json(await svc.import_install(await kit.body(request)))

    async def import_job(request: Any) -> Any:
        jid = str(request.match_info.get("job", ""))
        if not re.fullmatch(r"[0-9a-f]{12}", jid):
            raise AppError("没有这个任务", "no_job", 404)
        return kit.json(svc.import_job(jid))

    async def import_commit(request: Any) -> Any:
        return kit.json(await svc.import_commit(await kit.body(request)))

    async def import_publish(request: Any) -> Any:
        body = await kit.body(request)
        if body.get("confirm") is not True:
            raise AppError("推送要你先确认：哪个分支推到哪里", "not_confirmed")
        return kit.json(await svc.import_publish(body))

    async def import_add(request: Any) -> Any:
        return kit.json(await svc.import_add(await kit.body(request)))

    async def repo_remove(request: Any) -> Any:
        return kit.json(await svc.repo_remove(await kit.body(request)))

    async def team_loop(request: Any) -> Any:
        return kit.json(await svc.team_loop())

    return [
        AppRoute("GET", "/health", health),
        AppRoute("GET", "/status", kit.guarded(status)),
        AppRoute("GET", "/settings", kit.guarded(get_settings)),
        AppRoute("POST", "/settings", kit.guarded(post_settings)),
        AppRoute("POST", "/refresh", kit.guarded(refresh)),
        AppRoute("GET", "/overview", kit.guarded(overview)),
        AppRoute("GET", "/requirements/{repo}/{key}", kit.guarded(requirement)),
        AppRoute("POST", "/requirements/{repo}/{key}/session", kit.guarded(open_session)),
        AppRoute("POST", "/requirements/{repo}/{key}/answer", kit.guarded(answer)),
        AppRoute("GET", "/intake/next", kit.guarded(intake_next)),
        AppRoute("POST", "/intake/check", kit.guarded(intake_check)),
        AppRoute("POST", "/intake/start", kit.guarded(intake_start)),
        AppRoute("GET", "/crew", kit.guarded(crew)),
        AppRoute("POST", "/crew/fix", kit.guarded(crew_fix)),
        AppRoute("GET", "/brain", kit.guarded(brain)),
        AppRoute("POST", "/brain/reflect/preview", kit.guarded(reflect_preview)),
        AppRoute("POST", "/brain/reflect/apply", kit.guarded(reflect_apply)),
        AppRoute("GET", "/todo", kit.guarded(todo)),
        AppRoute("GET", "/team", kit.guarded(team)),
        AppRoute("POST", "/team/loop", kit.guarded(team_loop)),
        AppRoute("GET", "/import/defaults", kit.guarded(import_defaults)),
        AppRoute("POST", "/import/inspect", kit.guarded(import_inspect)),
        AppRoute("POST", "/import/clone", kit.guarded(import_clone)),
        AppRoute("POST", "/import/install", kit.guarded(import_install)),
        AppRoute("GET", "/import/jobs/{job}", kit.guarded(import_job)),
        AppRoute("POST", "/import/commit", kit.guarded(import_commit)),
        AppRoute("POST", "/import/publish", kit.guarded(import_publish)),
        AppRoute("POST", "/import/add", kit.guarded(import_add)),
        AppRoute("POST", "/repos/remove", kit.guarded(repo_remove)),
    ]
