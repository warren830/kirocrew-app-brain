"""交付总览's three numbers (Overview.cto), from brainkit.evaluate's data: how many hand-over runs ran unattended, how
many times a person stepped in (at the judgment points and outside them), credits per requirement, and the merges per
week by how they went. Pure: evaluate's data is made here in its own shape (brainkit/evaluate.py collect)."""

import time

from appkit import mod

D = mod("deliveries")


def trace(key, *, handed=True, merged_at=None, humans=(), credits=None):
    return {"key": key, "outcome": {"handed_over": {"value": handed}, "merged_at": {"value": merged_at}},
            "humans": [{"kind": k, "what": w, "judgment_point": p} for k, w, p in humans],
            "cost": {"credits": credits}}


def data():
    now = time.time()
    iso = lambda t: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t))  # noqa: E731
    return {
        "ref": "origin/main",
        "autonomy": {"value": [2, 3], "runs": [
            {"key": "PAY-1", "status": "counted", "autonomous": True, "correct": "correct", "beyond": []},
            {"key": "PAY-2", "status": "counted", "autonomous": True, "correct": "correct", "beyond": []},
            {"key": "PAY-3", "status": "counted", "autonomous": False, "correct": "correct",
             "beyond": ["push_after_handover code"]},
            {"key": "PAY-4", "status": "pending", "correct": "pending", "beyond": []},
            {"key": "PAY-5", "status": "local only"}]},
        "judgment": {"value": [5, 6], "by_kind": {"approval（判断点）": 4, "answer（判断点）": 1,
                                                  "push_after_handover（判断点之外）": 1}},
        "traces": [
            trace("PAY-1", merged_at=iso(now - 20 * 86400), humans=[("approval", "REQUIREMENTS", True)], credits=21.5),
            trace("PAY-2", merged_at=iso(now - 3 * 86400), humans=[("approval", "RELEASE", True)], credits=14.25),
            trace("PAY-3", merged_at=iso(now - 2 * 86400), humans=[("approval", "REQUIREMENTS", True),
                                                                   ("push_after_handover", "code", False)]),
            trace("PAY-4", merged_at=iso(now - 1 * 86400)),
            trace("PAY-5", handed=False, merged_at=iso(now - 9 * 86400)),
            trace("PAY-6", handed=True)],
    }


def test_one_repos_part_says_how_each_run_went():
    p = D.cto_part(data())
    assert p["unattended"] == [2, 3] and p["judgment"] == [5, 6]
    runs = {r["key"]: r for r in p["runs"]}
    assert runs["PAY-1"]["how"] == "unattended" and runs["PAY-3"]["how"] == "people"
    assert runs["PAY-3"]["beyond"] == ["交接后推代码"] and runs["PAY-3"]["outside"] == 1 and runs["PAY-3"]["at_points"] == 1
    assert runs["PAY-4"]["how"] == "pending" and runs["PAY-5"]["how"] == "local" and runs["PAY-6"]["how"] == "pending"
    assert runs["PAY-1"]["credits"] == 21.5 and runs["PAY-6"]["merged_at"] is None
    # the acts by kind, the judgment points first
    assert p["kinds"][0] == {"label": "批准", "n": 4, "point": True}
    assert {"label": "交接后推代码", "n": 1, "point": False} in p["kinds"]


def test_the_numbers_add_up_over_repos_and_the_weeks_say_how_merges_went():
    now = time.time()
    rows = [{"repo": "r1", "key": "PAY-1", "state": "merged", "credits": 21.5, "updated_at": now - 20 * 86400},
            {"repo": "r1", "key": "PAY-7", "state": "merged", "credits": None, "updated_at": now - 4 * 86400},
            {"repo": "r1", "key": "PAY-8", "state": "local", "credits": 10.0, "updated_at": now}]
    c = D.cto_numbers([("r1", D.cto_part(data())), ("r2", D.cto_part(data()))], rows, available=True, now=now)
    assert c["available"] and c["unattended"] == [4, 6]
    assert c["stepped_in"]["at_points"] == 10 and c["stepped_in"]["outside"] == 2
    assert c["credits"] == {"per_req": 15.8, "total": 31.5, "reqs": 2}
    assert len(c["weekly"]) == 12 and c["weekly"][-1]["week"] <= time.strftime("%Y-%m-%d", time.gmtime(now))
    total = {k: sum(w[k] for w in c["weekly"]) for k in ("unattended", "people", "local", "pending")}
    # each repo's PAY-1 … PAY-5 merged in the last 12 weeks; PAY-7 is merged but not judged: pending
    assert total == {"unattended": 4, "people": 2, "local": 2, "pending": 2 + 1}
    assert {r["repo"] for r in c["runs"]} == {"r1", "r2"}
    assert "4 个交接以后没人插手就做完了" in c["sentence"] and "人介入 12 次，10 次落在判断点上" in c["sentence"]
    assert "每个需求平均 15.8 credits" in c["sentence"]


def test_without_evaluate_the_rows_still_give_credits_and_merges():
    now = time.time()
    rows = [{"repo": "r1", "key": "PAY-1", "state": "merged", "credits": 12.0, "updated_at": now - 86400}]
    c = D.cto_numbers([], rows, available=False, now=now)
    assert c["available"] is False and c["unattended"] is None and c["stepped_in"] is None
    assert c["credits"]["per_req"] == 12.0 and sum(w["pending"] for w in c["weekly"]) == 1
    assert c["sentence"].startswith("每个需求平均 12.0 credits")
