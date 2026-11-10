"""大需求拆成小需求, pure (backend/core/family.py): each row's family and what this person can do on it, from this
machine's claims before brain-kit's listing answered, the rows' words for who a family member waits on, and brain-kit
0d52e97's split, claim, start --key and sync words (split_cmd.py, split.py, claims.py) in plain Chinese."""

import pytest

from appkit import mod

deliveries, problems, family = mod("deliveries"), mod("problems"), mod("family")


def chinese_row(r):
    assert set(r) == {"level", "text", "todo", "fix", "repo", "raw"}, r
    assert problems.chinese(r["text"]) or len(problems.WORD_RE.findall(r["text"])) <= 3, r["text"]
    return r


# ---- the family rows ----------------------------------------------------------------------------------------------- #

def claim(key, **kw):
    return dict({"key": key, "title": key, "created_at": "2026-11-09T01:00:00Z", "source": "split", "parent": "PAY-1"}, **kw)


def fact(key, c=None, **kw):
    return dict({"key": key, "claim": c, "run": None, "branch": None, "owner": (c or {}).get("owner"), "merged": False,
                 "worktree": None, "approvals": []}, **kw)


SPLIT = {"branch": "ai/alice/PAY-1-big", "commit": "e" * 40, "intent": "261109-big"}


def test_the_family_from_this_machines_claims_before_brain_kit_answered():
    facts = [fact("PAY-1", {"key": "PAY-1", "title": "退款大需求", "owner": "alice"}, owner="alice",
                  run={"intent": "261109-big"}, worktree="/w/big", approvals=[{"kind": "DESIGN", "state": "approved"}]),
             fact("PAY-2", claim("PAY-2", unit="api", owner="bob", split=SPLIT), branch="ai/bob/PAY-2-api", owner="bob"),
             fact("PAY-3", claim("PAY-3", unit="web", owner=None, depends_on=["PAY-2"], split=SPLIT)),
             fact("PAY-4", claim("PAY-4", unit="jobs", owner="alice", split=SPLIT))]
    fams = family.families(facts, None, me="alice", cfg={"tracker": "none"}, can_split=True, big=set(), at=None)
    p, api, web, jobs = fams["PAY-1"], fams["PAY-2"], fams["PAY-3"], fams["PAY-4"]
    assert (p["role"], p["source"], p["branch"]) == ("parent", "local", "ai/alice/PAY-1-big")
    assert p["progress"] == {"merged": 0, "total": 3, "unclaimed": 1, "claimed": 1, "in_progress": 1, "closed": 0,
                             "text": "0/3 merged"}
    assert p["acts"]["split"] == {"ok": True, "why": ""} and p["family_label"] == "小需求在做"
    assert (api["state"], api["state_label"]) == ("in_progress", "bob 在做")
    assert web["blocked_by"] == ["PAY-2"] and web["depends_on"][0]["text"] == "PAY-2（api，bob 在做）"
    assert web["acts"]["claim"] == {"ok": True, "why": ""} and web["acts"]["start"]["ok"] is False
    assert web["acts"]["start"]["why"] == "要等 PAY-2（api，bob 在做）合进大需求的分支（ai/alice/PAY-1-big）"
    assert web["acts"]["start_on"] == "PAY-2"                 # its only unmerged dependency, and bob has its branch
    assert jobs["acts"]["release"] == {"ok": True, "why": ""} and jobs["acts"]["start"] == {"ok": True, "why": ""}
    assert jobs["acts"]["claim"] is None and api["acts"]["start"] is None   # bob's: nothing for alice to do on it
    old = family.families(facts, None, me="alice", cfg={"tracker": "none"}, can_split=False, big=set(), at=None)
    assert old["PAY-3"]["acts"]["claim"]["ok"] is False and "还不会拆小需求" in old["PAY-3"]["acts"]["claim"]["why"]
    jira = family.families(facts, None, me="alice", cfg={"tracker": "jira"}, can_split=True, big=set(), at=None)
    assert jira["PAY-1"]["acts"]["split"]["why"].startswith("这个仓库用 Jira")


def test_the_rows_of_a_family_say_who_it_waits_on():
    deliveries_mod = deliveries

    def row_of(key, state="claimed", **waits):
        r = deliveries_mod.base_row("r1", {"key": key})
        r["state"] = state
        r["waits"] = dict({"who": "you", "text": "认领了，还没开工", "line": None, "raw": ""}, **waits)
        return r

    child = {"role": "child", "parent": "PAY-1", "unit": "web", "state": "unclaimed", "owner": None, "branch": "b",
             "blocked_by": ["PAY-2"], "depends_on": [{"key": "PAY-2", "text": "PAY-2（api，bob 在做）"}]}
    r = row_of("PAY-3")
    family.classify(r, child, {}, "alice")
    assert (r["state"], r["state_label"], r["waits"]["who"], r["waits"]["do"]) == ("unclaimed", "待认领", "people", "start")
    assert r["waits"]["text"] == "待认领：谁做都可以认领（开工要等 PAY-2（api，bob 在做）合进大需求）"
    r = row_of("PAY-3")
    family.classify(r, dict(child, state="claimed", owner="bob"), {}, "alice")
    assert r["waits"] == {"who": "people", "do": "start", "text": "等 bob 开工", "line": None, "raw": "", "since": None,
                          "where": "app", "review": False, "todo": ""}
    r = row_of("PAY-3")
    family.classify(r, dict(child, state="claimed", owner="alice", blocked_by=[]), {}, "alice")
    assert (r["waits"]["who"], r["waits"]["do"], r["waits"]["text"]) == ("you", "start", "认领了，依赖都合进来了：可以开工")
    r = row_of("PAY-3", "local", who="agent", text="agent 在做")
    family.classify(r, dict(child, state="merged", owner="alice"), {}, "alice")
    assert (r["state"], r["state_label"], r["waits"]["who"], r["waits"]["do"]) == ("merged_into_parent", "已合进大需求",
                                                                               "nobody", "none")
    r = row_of("PAY-3", "local", who="you", text="会话空着：轮到你回话")
    family.classify(r, dict(child, state="in_progress", owner="alice"), {"run": {"mr": {"by": "alice"}}}, "alice")
    assert (r["waits"]["who"], r["waits"]["text"], r["waits"]["where"]) == ("people", "交了 MR：等大需求的负责人合进 b", "mr")
    parent = {"role": "parent", "owner": "alice", "family_state": "in_progress",
              "progress": {"merged": 1, "total": 3, "unclaimed": 1, "claimed": 0, "in_progress": 1}}
    r = row_of("PAY-1", "local", who="you", text="会话空着：轮到你回话")
    family.classify(r, parent, {}, "alice")
    assert r["waits"]["text"] == "等小需求合进来：已合并 1/3（1 个待认领，1 个在做）"
    r = row_of("PAY-1", "local", who="you", text="等你批准设计", line="approve DESIGN 1234abcd")
    family.classify(r, parent, {}, "alice")
    assert r["waits"]["line"] == "approve DESIGN 1234abcd"   # an approval line stays what it waits on
    r = row_of("PAY-1", "local", who="agent", text="agent 在做")
    family.classify(r, dict(parent, family_state="ready_to_release"), {}, "alice")
    assert (r["waits"]["who"], r["waits"]["do"]) == ("you", "reply") and r["waits"]["text"] == "小需求都合进来了：评审，再批发布（或者交给运行机）"


@pytest.mark.parametrize("raw, text, todo", [
    ("brain: PAY-2 is claimed by alice", "晚了一步：PAY-2 已经被 alice 认领了", "换一个"),
    ("PAY-2 was just claimed by bob: their claim reached the server first", "晚了一步：bob 先认领了 PAY-2", "换一个"),
    ("PAY-2 is claimed by alice; only they may release it", "PAY-2 是 alice 认领的：只有 alice 能放回", ""),
    ("PAY-2 has your run branch ai/alice/PAY-2-api: hand the run over or delete the branch first (here and on origin), then "
     "release it", "已经开工了（分支 ai/alice/PAY-2-api）：不能放回", "删掉这个分支"),
    ("--on PAY-2: it has no run branch of its owner (alice) yet, here or on origin", "PAY-2 还没人开工（alice）：不能在它的分支上先做", "等"),
    ("commit Lean's records first: the split is read from the committed branch", "Lean 的记录还没提交", "让 AI 提交"),
    ("application-design.md is draft: it needs a current DESIGN (or INCEPTION) approval", "设计还没批", "批设计"),
    ("unit-of-work.md changed after `lean stage done units` recorded it (sha 1234 now): record it again", "单元记下以后又改过",
     "重新记下拆单元这一步"),
    ("PAY-1's run belongs to alice; only its owner splits it", "只有 PAY-1 的负责人 alice 能拆它", "alice"),
    ("tracker is jira: children are claims (tracker none)", "这个仓库用 Jira：大需求只在不用 Jira 的仓库里拆", "Jira"),
    ("commit or stash your changes first:\n  M src/x.py", "还有没提交的改动", "收起来"),
    ("unit web is no longer in PAY-1's unit split (unit-of-work.md 1234abcd on ai/alice/PAY-1-big): ask alice",
     "单元 web 已经不在 PAY-1 的拆法里了", "关掉"),
])
def test_brain_kits_split_claim_start_and_sync_words_in_plain_chinese(raw, text, todo):
    r = chinese_row(family.say(raw))
    assert r["text"] == text and todo in r["todo"], r


def test_a_refused_start_names_its_dependencies():
    deps, branch = family.blocked_deps("PAY-5 depends on PAY-2 (unit api, bob is building it), PAY-3 (unit web, claimed by "
                                       "carol), which have not merged into ai/alice/PAY-1-big yet. Wait for them to merge.")
    assert branch == "ai/alice/PAY-1-big"
    assert [(d["key"], d["unit"], d["state"], d["owner"], d["text"]) for d in deps] == [
        ("PAY-2", "api", "in_progress", "bob", "PAY-2（api，bob 在做）"), ("PAY-3", "web", "claimed", "carol", "PAY-3（web，carol 认领了）")]
    assert family.worktree_for("/w/brain-app", "pay", "PAY-3", "web").endswith("/w/brain-app/pay/pay-3-web")


def test_todo_lists_a_small_one_you_can_start_and_a_big_one_ready_to_release():
    """待办: a small one claimed by the person whose dependencies all merged (开工 now), a big one of theirs whose small
    ones all merged (review and release); not someone else's, not one still held, not a big one still in progress."""
    todo = mod("todo")

    def entry(key, state, fam, own=True, who="people", do="none"):
        # waits as family.classify leaves them: only the person's own turn reaches the family's items
        row = {"repo": "r1", "key": key, "title": key, "mr": None, "updated_at": None, "state": state,
               "waits": {"who": who, "do": do, "text": ""}, "family": fam}
        return {"row": row, "facts": {"approvals": [], "park": None}, "session": None, "mr": None, "own": own,
                "has_session": False, "can_post": False}

    ok, held = {"start": {"ok": True, "why": ""}}, {"start": {"ok": False, "why": "要等 PAY-2 合进大需求的分支"}}
    child = lambda acts: {"role": "child", "parent": "PAY-1", "unit": "web", "acts": acts}
    parent = lambda st: {"role": "parent", "family_state": st, "progress": {"merged": 3, "total": 3}, "acts": {}}
    got = todo.build([entry("PAY-3", "claimed", child(ok), who="you", do="start"),
                      entry("PAY-4", "claimed", child(held)),                 # held by a dependency
                      entry("PAY-5", "claimed", child(ok), own=False, do="start"),        # someone else's
                      entry("PAY-6", "unclaimed", child(ok), do="start"),     # nobody's yet
                      entry("PAY-1", "local", parent("ready_to_release"), who="you", do="reply"),
                      entry("PAY-7", "local", parent("in_progress")),
                      entry("PAY-8", "local", parent("ready_to_release"), own=False)], team=False, crew_rows=[])
    items = [(i["kind"], i["key"]) for i in got["items"]]
    assert items == [("child_start", "PAY-3"), ("parent_release", "PAY-1")], items
    texts = {i["key"]: i["text"] for i in got["items"]}
    assert texts["PAY-3"] == "PAY-1 的小需求（web）你认领了，依赖都合进来了：可以开工"
    assert texts["PAY-1"] == "小需求都合进来了（3/3）：在大需求的分支上评审，再批发布；或者交给运行机"


def test_todo_a_closed_requirement_whose_branch_or_mr_is_still_there():
    """The user's decision (2026-11-10): a requirement closed with `brain intent close` is closed; its owner is told
    that its run branch / MR is still there. Not for someone else's, not when nothing is left, not for an MR closed."""
    todo = mod("todo")

    def entry(key, where, mr=None, own=True, closed=True):
        row = {"repo": "r1", "key": key, "title": key, "mr": mr, "updated_at": None, "state": "closed", "waits": {},
               "family": None, "branch": "ai/alice/%s-x" % key}
        f = {"approvals": [], "park": None, "where": where, "claim": {"closed": {"reason": "不做了"}} if closed else {}}
        return {"row": row, "facts": f, "session": None, "mr": mr, "own": own, "has_session": False, "can_post": False}

    got = todo.build([entry("PAY-1", "branch"),
                      entry("PAY-2", "claim", mr={"iid": 7, "state": "opened", "url": "u"}),
                      entry("PAY-3", "worktree", mr={"iid": 8, "state": "opened", "url": "u"}),
                      entry("PAY-4", "claim"),                               # nothing left
                      entry("PAY-5", "branch", own=False),                   # someone else's
                      entry("PAY-6", "branch", closed=False)], team=False, crew_rows=[])   # MR closed, not the claim
    texts = {i["key"]: i["text"] for i in got["items"] if i["kind"] == "closed_leftover"}
    assert set(texts) == {"PAY-1", "PAY-2", "PAY-3"}, texts
    assert texts["PAY-1"] == "需求关了，分支 ai/alice/PAY-1-x 还在：用不着就删掉这个分支（本机的和远端的）"
    assert texts["PAY-2"] == "需求关了，MR !7 还在：用不着就关掉 MR"
    assert texts["PAY-3"].startswith("需求关了，分支 ai/alice/PAY-3-x、MR !8 还在：")
