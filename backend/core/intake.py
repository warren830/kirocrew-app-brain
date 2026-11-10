"""开需求: claim a key, take documents through brain-kit's five gates, start the run, open its brain-dev session.

- ``next_key``: the key a start would claim (tracker none), from the claims this machine has seen; GitLab decides at
  the start (brain-kit pushes claim/<KEY>; two people racing get two keys).
- ``check``: brain-kit's dry run in this process (intake.package.build, dry_run=True): every finding, every gate
  that would stop it, verbatim; nothing is written (the intake store folder is created if missing, as brain does).
  brain-kit 72b278e's "review" findings (请你确认: may be a name or a password, may as well be a word: neither masked
  nor refused) are also listed on their own, per file, for the person to check before the start.
- ``start``: ``brain start`` itself, run as a command in a fresh worktree of the repo (one folder per requirement
  under work_root, so several requirements can be open at once and each session has its own directory); its output
  verbatim. Materials go to the person's intake store, never into a repo.
"""

from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path
from typing import Any

from . import bk, lean_view, problems
from .constants import KEY_RE, PYTHON_BIN, SLUG_RE
from .repo import Repo, parse_branch

CLASSES = ("public", "internal", "confidential", "secret", "unsure")
KIT = ".brain/kit.json"
CLASS_ZH = {"public": "公开", "internal": "内部", "confidential": "机密", "secret": "绝密", "unsure": "不确定"}
# brain-kit's finding kinds (intake/checks.py), as a person says them
KIND_ZH = {"hkid": "香港身份证号", "cnid": "身份证号", "phone": "电话", "email": "邮箱", "card": "卡号", "person": "人名",
           "private_key": "私钥", "cloud_key": "云访问密钥", "bearer": "令牌", "token": "令牌", "kv_secret": "密码",
           "secret": "密码", "amount": "金额", "company": "公司名", "contract": "合同号", "url": "链接",
           "approval_line": "像审批的行", "injection": "像指令的句子"}
# a finding part's label (intake/package.py build) → what happened to it
PART_ZH = {"个人信息": "已打码", "密钥": "已打码，请换一把新的", "像指令的行": "已标成引用，不会被当成指令",
           "链接": "只收了地址，没收链接里的内容"}
PART_RE = re.compile(r"^(?P<label>[^（\s]+)（(?P<how>[^）]*)）\s*(?P<kinds>.+)$")
KINDS_RE = re.compile(r"(?P<k>[a-z_:]+)×(?P<n>\d+)")
LINE_RE = re.compile(r"^- \*\*(?P<id>D\d+) (?P<name>.+?)\*\*：(?P<rest>.*)$")
# gates that stop (blocking) and hard stops (error) as brain-kit says them → what to do on this page
GATE_ZH: list[tuple["re.Pattern[str]", Any]] = []
# brain-kit's review part of a file's finding line (intake.package.build, 72b278e): 请你确认 N 处（…）：「…」、「…」
REVIEW_RE = re.compile(r"请你确认 [0-9]+ 处（[^）]*）：「.*?」(?:、「.*?」)*(?=；|$)")
FILE_RE = re.compile(r"^- \*\*(.+?)\*\*：")
MAX_DOCS = 50
START_TIMEOUT_S = 900
MAX_OUT = 20000


class IntakeError(Exception):
    pass


def next_key(repo: Repo) -> dict[str, Any]:
    """What 开需求 needs to know about *repo* before a start: the key a start would claim (tracker none), whether gate 2
    takes confidential material here (kit.json intake.allow_confidential), and *push*: the default branch has
    brain-kit in this checkout only, not on origin, where `brain start` makes the requirement's branch from (an in-place
    install not pushed yet): {branch, remote_url} for 「推送」, None when nothing waits."""
    cfg = repo.cfg
    out = {"repo": repo.id, "key": None, "tracker": cfg["tracker"], "prefix": cfg["req_prefix"], "error": "",
           "allow_confidential": bool((cfg.get("intake") or {}).get("allow_confidential")), "push": unpushed(repo)}
    if cfg["tracker"] != "none":
        return out
    rx = re.compile(r"^refs/(?:heads|remotes/origin)/claim/%s-([1-9][0-9]*)$" % re.escape(cfg["req_prefix"]))
    taken = {int(m.group(1)) for m in (rx.match(r) for r in repo.git.refs("refs/heads/claim/",
                                                                          "refs/remotes/origin/claim/")) if m}
    out["key"] = "%s-%d" % (cfg["req_prefix"], max(taken or {0}) + 1)
    return out


def unpushed(repo: Repo) -> dict[str, str] | None:
    d = repo.cfg["default_branch"]
    url = repo.git.out("remote", "get-url", "origin")
    if not url or not repo.git.ok("rev-parse", "-q", "--verify", "refs/remotes/origin/%s^{commit}" % d):
        return None
    if repo.git.ok("cat-file", "-e", "refs/remotes/origin/%s:%s" % (d, KIT)):
        return None
    if not repo.git.ok("cat-file", "-e", "refs/heads/%s:%s" % (d, KIT)):
        return None
    return {"branch": d, "remote_url": url}


def _lines(v: Any, limit: int = MAX_DOCS) -> list[str]:
    if isinstance(v, str):
        v = v.splitlines()
    if not isinstance(v, list):
        return []
    return [str(x).strip() for x in v if isinstance(x, str) and str(x).strip()][:limit]


PATH_SEP_RE = re.compile(r"[\s,，、；;]+")
MAX_PATHS = 50


def expected_paths(v: Any) -> list[str]:
    """The expected paths of the form or the API: a list (one path per item, as given), or one string of paths
    separated by commas, spaces or new lines (``"calc.py,tests"``, ``"src/pay tests"``). Anything else is an
    IntakeError. brain-kit's ``brain start --paths`` takes them comma separated."""
    if v is None or v == "":
        return []
    if isinstance(v, str):
        items = PATH_SEP_RE.split(v)
    elif isinstance(v, list) and all(isinstance(x, str) for x in v):
        items = v
    else:
        raise IntakeError("预计改动的路径要写成一串，用逗号或空格分开")
    out = []
    for p in (x.strip() for x in items):
        if p and p not in out:
            out.append(p)
    if len(out) > MAX_PATHS:
        raise IntakeError("预计改动的路径最多 %d 个" % MAX_PATHS)
    return out


def clean_body(repo: Repo, body: dict[str, Any], *, start: bool) -> dict[str, Any]:
    """The form, checked; IntakeError says what is wrong (in Chinese)."""
    cfg = repo.cfg
    slug = str(body.get("slug") or "").strip().lower()
    if not SLUG_RE.match(slug):
        raise IntakeError("英文短名只能是小写字母、数字和 -（最多 40 个字）")
    title = " ".join(str(body.get("title") or "").split())[:200]
    if start and not title:
        raise IntakeError("写一个需求标题")
    key = str(body.get("key") or "").strip().upper()
    if key and not KEY_RE.match(key):
        raise IntakeError("需求号要像 %s-12" % cfg["req_prefix"])
    if key and cfg["tracker"] == "none" and not key.startswith(cfg["req_prefix"] + "-"):
        raise IntakeError("这个仓库的需求号以 %s- 开头" % cfg["req_prefix"])
    if cfg["tracker"] == "jira" and not key:
        raise IntakeError("这个仓库接 Jira：要写 Jira 的需求号")
    docs = _lines(body.get("docs"))
    for d in docs:
        p = os.path.expanduser(d)
        if not os.path.isabs(p):
            raise IntakeError("文档要写这台电脑上的绝对路径：%s" % d)
        if not os.path.exists(p):
            raise IntakeError("找不到：%s" % d)
    cls = str(body.get("classification") or "")
    if docs and cls not in CLASSES:
        raise IntakeError("第 2 关：选一个密级（公开、内部、机密、绝密、不确定）")
    business = str(body.get("business") or "")
    if business not in ("", "keep", "mask"):
        raise IntakeError("第 3 关：金额、公司名、合同号选「原样保留」或「换成占位符」")
    if docs and body.get("consent") is not True:
        raise IntakeError("第 1 关：勾上「我是作者，或已取得作者同意」")
    exclude = _lines(body.get("exclude"), 30)
    paths = expected_paths(body.get("paths"))
    for p in paths:
        if not re.match(r"^[A-Za-z0-9_./*-][A-Za-z0-9_./* -]{0,199}$", p) or ".." in p or p.startswith("/"):
            raise IntakeError("预计改动的路径要是仓库里的相对路径（列表，或用逗号、空格分开的一串）：%s" % p)
    return {"slug": slug, "title": title, "key": key, "docs": [os.path.expanduser(d) for d in docs],
            "classification": cls, "business": business, "consent": body.get("consent") is True,
            "exclude": exclude, "paths": paths}


def store_path(repo: Repo) -> str:
    """Where brain-kit keeps material packages on this machine, as cli._store finds it, without making the folder: a
    dry run only reads it (the next package id), so 先检查 creates nothing (BRAINKIT_REQUESTS.md 35)."""
    s = os.environ.get("BRAIN_INTAKE_DIR") or repo.git.out("config", "brain.intake") or "~/.brain/intake"
    return os.path.abspath(os.path.expanduser(s))


def check(repo: Repo, body: dict[str, Any], me: str | None) -> dict[str, Any]:
    """brain-kit's dry run of the five gates (blocking: call it in a thread)."""
    out = {"ok": False, "key": None, "package": None, "classification": None, "segments": 0, "sources": 0,
           "findings": [], "review": [], "blocking": [], "blocking_raw": [], "files": [], "refused": [], "error": ""}
    try:
        b = clean_body(repo, body, start=False)
    except IntakeError as exc:
        out["error"] = str(exc)
        return out
    key = b["key"] or next_key(repo)["key"]
    out["key"] = key
    if not b["docs"]:
        out["error"] = "没有文档：不用检查，可以直接开工"
        return out
    pkg = bk.m("intake.package")
    try:
        store = store_path(repo)
        rep = pkg.build(b["docs"], key, store, submitter=me or "unknown", consent=b["consent"],
                        classification=b["classification"], business=b["business"] or None,
                        kit_intake=repo.cfg["intake"], dry_run=True, exclude=b["exclude"])
    except bk.brain_error() as exc:
        out["error"] = gate_text(str(exc))
        out["blocking_raw"] = [str(exc)]
        return out
    except (OSError, ValueError) as exc:
        out["error"] = "读不了文档：%s" % str(exc)[:300]
        return out
    raw = [str(x) for x in rep.get("blocking") or []]
    out.update(ok=not raw, package=rep.get("package"), classification=rep.get("classification"),
               segments=int(rep.get("segments") or 0), sources=int(rep.get("sources") or 0),
               findings=[str(x) for x in rep.get("findings") or []], blocking=[gate_text(x) for x in raw],
               blocking_raw=raw,
               refused=[{"id": str(r.get("id")), "name": str(r.get("name")), "reason": refused_text(str(r.get("reason"))),
                         "raw": str(r.get("reason"))} for r in rep.get("refused") or []])
    out["review"] = review_items(out["findings"])
    out["files"] = file_items(out["findings"], b["business"])
    return out


def _kinds(text: str) -> str:
    """'phone×2, email×1' → '电话 2 处、邮箱 1 处'; {'amount': 4} (brain-kit's summary) too."""
    pairs = [(m.group("k"), m.group("n")) for m in KINDS_RE.finditer(text)] or \
        re.findall(r"'([a-z_]+)': (\d+)", text)
    return "、".join("%s %s 处" % (KIND_ZH.get(k, k), n) for k, n in pairs) or text


def _what(text: str) -> str:
    """brain-kit's 「D03.pdf=confidential」 / 「你选的是 unsure」 said plainly."""
    out = []
    for part in [x.strip() for x in text.split(",") if x.strip()]:
        m = re.match(r"^(?P<f>.+)=(?P<c>[a-z]+)$", part)
        if m:
            out.append("%s 标着%s" % (m.group("f"), CLASS_ZH.get(m.group("c"), m.group("c"))))
            continue
        m = re.match(r"^你选的是 (?P<c>[a-z]+)$", part)
        out.append("你选的是「%s」" % CLASS_ZH.get(m.group("c"), m.group("c")) if m else part)
    return "、".join(out)


GATE_ZH += [(re.compile(rx), fn) for rx, fn in (
    (r"^门 2：材料按机密处理（(?P<w>.*)），而 intake\.allow_confidential 是 false",
     lambda g: "第 2 关：这个仓库不收机密材料（%s）。请产品写一份脱敏摘要再交，或者把这份写进「不收这些文件」" % _what(g["w"])),
    (r"^门 2：材料是绝密（(?P<w>.*)），不收", lambda g: "第 2 关：绝密材料不收（%s）：只交脱敏摘要" % _what(g["w"])),
    (r"^门 2：--classification", lambda g: "第 2 关：选一个密级"),
    (r"^门 3：找到商业敏感内容 (?P<s>.*?)，请选 --business",
     lambda g: "第 3 关：找到%s：在第 3 关选「原样保留」或「换成占位符」；不想交的文件写进「不收这些文件」" % _kinds(g["s"])),
    (r"^门 5：(?P<f>.+?) 里有私钥或云访问密钥", lambda g: "第 5 关：%s 里有私钥或云访问密钥，整份不收：先从文档里删掉，再换一把新密钥"
     % g["f"]),
    (r"^门 1：确认你是作者", lambda g: "第 1 关：勾上「我是作者，或已取得作者同意」"),
    (r"^没有可收的文件$", lambda g: "没有可收的文件：文档是空的，或者都被「不收这些文件」排除了"),
)]


def gate_text(line: str) -> str:
    """One of brain-kit's gate lines (or hard stops) as the page action; a line nobody mapped as it is."""
    s = str(line or "")
    for rx, fn in GATE_ZH:
        m = rx.match(s)
        if m:
            return fn({k: (v or "") for k, v in m.groupdict().items()})
    return s


# why brain-kit did not take a file (intake/convert.py's Refused), said as what to do; its own words stay in findings
REFUSED_ZH = [(re.compile(rx), say) for rx, say in (
    (r"^图片(?:文件)?不(?:单独)?收（没有 OCR）", "图片里的字读不出来，这份不收：把图里的文字写进文档再交"),
    (r"^PDF 几乎没有文字", "这份 PDF 几乎没有文字（像是扫描件），读不出来：请交文字版"),
    (r"^PDF 需要 MarkItDown", "这台机器读不了 PDF：请另存为 docx 再交"),
    (r"^PDF 转换失败", "这份 PDF 读不出来：请另存为 docx 再交"),
    (r"^文本编码无法识别", "文字的编码认不出来：请另存为 UTF-8 的文本再交"),
    (r"^文件里有 XML DOCTYPE", "文件里有不安全的声明，不收：另存一份再交"),
    (r"^XML 损坏", "文件里的内容坏了：另存一份再交"),
    (r"^不是有效的 (?:xlsx|docx)", "这份文件不完整：另存一份再交"),
    (r"^解压后过大", "解开以后太大，不收"),
    (r"^文件内容损坏或格式不对", "文件内容坏了或格式不对：另存一份再交"),
    (r"^看起来不是文本文件", "看起来不是文本文件，不收"),
)]


def refused_text(reason: str) -> str:
    """brain-kit's reason a file was not taken, in words (REFUSED_ZH); one nobody mapped as it is."""
    for rx, say in REFUSED_ZH:
        if rx.match(reason):
            return say
    return reason


def file_items(findings: list[str], business: str) -> list[dict[str, Any]]:
    """brain-kit's finding lines, one per file, said plainly: {id, name, items (what was found and what happened to
    it), review (请你确认: '' when none), refused (why the file was not taken: '' when it was)}."""
    out = []
    for line in findings:
        m = LINE_RE.match(line)
        if not m:
            continue
        rest = m.group("rest")
        f = {"id": m.group("id"), "name": m.group("name"), "items": [], "review": "", "refused": ""}
        if rest.startswith("没收——"):
            f["refused"] = refused_text(rest[len("没收——"):])
            out.append(f)
            continue
        rv = REVIEW_RE.search(rest)
        if rv:
            f["review"] = rv.group(0)
            rest = rest[:rv.start()] + rest[rv.end():]
        for part in [x.strip() for x in rest.split("；") if x.strip() and x.strip() != "无"]:
            pm = PART_RE.match(part)
            if pm and pm.group("label") in PART_ZH:
                f["items"].append("%s：%s" % (_kinds(pm.group("kinds")), PART_ZH[pm.group("label")]))
            elif pm and pm.group("label") == "商业敏感":
                f["items"].append("%s：%s" % (_kinds(pm.group("kinds")), "已换成占位符" if business == "mask" else "原样保留"))
            elif re.match(r"^隐藏内容 \d+ 处", part):
                f["items"].append("看不见的内容 %s 处：单独放着，不当需求用" % re.findall(r"\d+", part)[0])
            elif re.match(r"^图片 \d+ 张", part):
                f["items"].append("图片 %s 张：图片里的字读不出来，涉及图片的地方要你确认" % re.findall(r"\d+", part)[0])
            else:
                f["items"].append(part)
        out.append(f)
    return out


def review_items(findings: list[str]) -> list[str]:
    """brain-kit's 请你确认 parts of the finding lines, one per file, with the file they are in: what may be a name or a
    password but may as well be a word (not masked; if it is one, the person changes the document and checks again)."""
    out = []
    for line in findings:
        m = REVIEW_RE.search(line)
        if m:
            f = FILE_RE.match(line)
            out.append(("%s：" % f.group(1) if f else "") + m.group(0))
    return out


def _worktree_for(repo: Repo, work_root: str, slug: str) -> Path:
    base = Path(work_root).expanduser() / repo.name
    for n in range(1, 100):
        p = base / (slug if n == 1 else "%s-%d" % (slug, n))
        if not p.exists():
            return p
    raise IntakeError("工作区目录名都被占用了：%s" % base)


def brain_cmd() -> list[str]:
    return [PYTHON_BIN, "-I", str(bk.root() / "bin" / "brain")]


def start(repo: Repo, body: dict[str, Any], work_root: str) -> dict[str, Any]:
    """``brain start`` in a new worktree (blocking: call it in a thread)."""
    out = {"ok": False, "key": None, "branch": None, "intent": None, "worktree": None, "output": "", "slot": None,
           "url": None, "session_error": "", "problem": None, "me": None}
    b = clean_body(repo, body, start=True)
    if b["docs"] and not b["consent"]:
        raise IntakeError("第 1 关：勾上「我是作者，或已取得作者同意」")
    wt = _worktree_for(repo, work_root, b["slug"])
    wt.parent.mkdir(parents=True, exist_ok=True)
    d = repo.cfg["default_branch"]
    base = next((r for r in ("refs/remotes/origin/" + d, "refs/heads/" + d, "HEAD")
                 if repo.git.ok("rev-parse", "-q", "--verify", r + "^{commit}")), "HEAD")
    p = repo.git.run("worktree", "add", "-q", "--detach", str(wt), base, timeout=120)
    if p.returncode != 0:
        raise IntakeError("建工作区失败：%s" % (p.stderr or p.stdout).strip()[:300])
    args = ["start", b["slug"], "--title", b["title"]]
    preview = next_key(repo)["key"]
    if b["key"] and not (repo.cfg["tracker"] == "none" and b["key"] == preview):
        args += ["--key", b["key"]]  # the next free key is taken by brain-kit itself (it asks GitLab, this did not)
    if b["paths"]:
        args += ["--paths", ",".join(b["paths"])]
    if b["docs"]:
        args += ["--classification", b["classification"], "--consent"]
        if b["business"]:
            args += ["--business", b["business"]]
        for g in b["exclude"]:
            args += ["--exclude", g]
        args += ["--doc", *b["docs"]]
    env = dict(os.environ)
    env.update({"GIT_TERMINAL_PROMPT": "0", "PYTHONIOENCODING": "utf-8"})
    try:
        r = subprocess.run(brain_cmd() + args, cwd=str(wt), capture_output=True, text=True, timeout=START_TIMEOUT_S,
                           env=env)
        text = ((r.stdout or "") + (("\n" + r.stderr) if r.stderr else "")).strip()
        code = r.returncode
    except subprocess.TimeoutExpired:
        text, code = "brain start 超过 %d 秒没结束" % START_TIMEOUT_S, 124
    except OSError as exc:
        text, code = "跑不了 brain：%s" % exc, 127
    out["output"] = text[-MAX_OUT:]
    branch = repo.git.run("rev-parse", "--abbrev-ref", "HEAD", cwd=str(wt)).stdout.strip()
    parsed = parse_branch(branch, repo.cfg["branch_prefix"])
    if code != 0 or not parsed:
        if not parsed:  # nothing was started in it: no worktree is left behind
            repo.git.run("worktree", "remove", "--force", str(wt))
        out["output"] = out["output"] or "brain start 失败（退出码 %d）" % code
        out["problem"] = problems.start_row(out["output"], repo=repo.path)
        repo.invalidate()
        return out
    key = parsed["key"]
    rec = None
    try:
        import json
        rec = json.loads((wt / repo.cfg["runs_dir"] / key / "run.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        rec = None
    out.update(ok=True, key=key, branch=branch, intent=(rec or {}).get("intent"), worktree=str(wt))
    repo.invalidate()
    return out


INTENT_RE = lean_view.INTENT_RE
PKG_RE = re.compile(r"^PKG-[A-Z][A-Z0-9]{0,9}-[1-9][0-9]{0,6}-[1-9][0-9]{0,4}$")
APPROVAL_LINE_RE = re.compile(r"(?im)^[ \t>*-]*(approve|approved|reject|批准|同意|驳回|拒绝)\b")


def kickoff(key: str, branch: str, intent: str | None, materials: list[str]) -> str:
    """The first message to a requirement's brain-dev session: ids only, each checked against its format (run.json is
    agent-writable: an "intent" with a line break must not smuggle an approval line in), no requirement text, nothing a
    person typed; a line that reads like an approval is dropped whatever happens."""
    key = key if KEY_RE.match(key or "") else "?"
    branch = branch if parse_branch(branch or "", branch.split("/", 1)[0] if branch else "ai") else "?"
    intent = intent if isinstance(intent, str) and INTENT_RE.match(intent) else None
    pkgs = [p for p in materials if isinstance(p, str) and PKG_RE.match(p)]
    lines = ["这是需求 %s 的本地开发会话。分支 %s%s。" % (key, branch, "，Lean intent %s" % intent if intent else ""),
             "按 brain-dev 的步骤开始：先读 AGENTS.md 和 brain/ 下的四个文件，再读 runs/%s/run.json" % key
             + ("" if not pkgs else "，然后读材料包 .brain-materials/%s/toc.md" % pkgs[0]) + "。",
             "有问题一次问完，每题带推荐答案。"]
    return "\n".join(l for l in lines if not APPROVAL_LINE_RE.match(l))


def review_task(key: str, branch: str, intent: str | None) -> str:
    """The first message to a requirement's review session: Lean's review line for its intent (lean_view.review_line),
    ids only, checked like kickoff's (no approval line can get in). '' when run.json names no usable intent."""
    line = lean_view.review_line(intent)
    if not line:
        return ""
    key = key if KEY_RE.match(key or "") else "?"
    branch = branch if parse_branch(branch or "", branch.split("/", 1)[0] if branch else "ai") else "?"
    lines = ["这是需求 %s 的审查会话：新开的，没写过这次的代码。分支 %s，Lean intent %s。" % (key, branch, intent), line]
    return "\n".join(l for l in lines if not APPROVAL_LINE_RE.match(l))
