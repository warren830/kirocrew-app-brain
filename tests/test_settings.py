"""设置: saved settings reload brain-kit and the repos; a repo that is not a brain-kit repo is reported, not fatal."""

import json

from appkit import BRAINKIT
from brainfix import make_project, make_service, needs_brainkit, run

pytestmark = needs_brainkit


def test_saving_settings_reloads_repos_and_reports_bad_ones(tmp_path, home):
    repo = make_project(tmp_path)
    plain = tmp_path / "plain"
    plain.mkdir()
    svc = make_service(tmp_path, [])

    async def go():
        await svc.start()
        try:
            first = await svc.status()
            saved = await svc.save_settings({"brainkit": str(BRAINKIT), "repos": [str(repo), str(plain)],
                                             "work_root": str(home / "workplace" / "brain-app"), "team": {"enabled": False}})
            view = await svc.overview("all")
            return first, saved, view
        finally:
            await svc.stop()

    first, saved, view = run(go())
    assert first["repos"] == [] and first["brainkit"]["ok"] and first["brainkit"]["modules"]["trace"] is True
    st = saved["status"]
    assert [r["ok"] for r in st["repos"]] == [True, False] and st["repos"][0]["kit"]["req_prefix"] == "PAY"
    assert "还没装 brain-kit" in st["repos"][1]["error"] and "导入仓库" in st["repos"][1]["error"]
    assert json.loads((tmp_path / "data" / "settings.json").read_text())["repos"][1] == str(plain.resolve())
    assert view["errors"] and view["errors"][0]["repo"] == "r2"


def test_a_wrong_brainkit_path_turns_the_app_off_politely(tmp_path, home):
    repo = make_project(tmp_path)
    svc = make_service(tmp_path, [repo])
    (tmp_path / "data" / "settings.json").write_text(json.dumps({"brainkit": str(tmp_path / "nowhere"),
                                                                 "repos": [str(repo)]}))
    svc.settings = __import__("appkit").mod("settings").load(tmp_path / "data" / "settings.json")

    async def go():
        await svc.start()
        try:
            return await svc.status(), await svc.crew_checks()
        finally:
            await svc.stop()

    st, crew = run(go())
    assert st["brainkit"]["ok"] is False and "brain-kit" in st["brainkit"]["error"]
    assert st["repos"][0]["ok"] is False and crew["rows"][0]["level"] == "FAIL"
