/**
 * 开需求: claim a requirement and start it, in the sample's empty state + start form look. A hero says what happens
 * (认领 → 文档过五关 → 开工 → Lean 推进 → 交给运行机) as a Flow whose steps follow the form. Then three numbered cards:
 *
 *   1 认领      repo, title, 英文短名 (suggested from the title), key (prefilled from GET /intake/next), the paths it is
 *              expected to change: a grid. Opened for a requirement claimed already (?key=&title=): its key is fixed and
 *              its title filled; 开工 starts that claim (`brain start --key`).
 *   2 文档过五关  the documents and the files left out, then the five gates as five cards whose state shows (green:
 *              done, magenta: waits for you, red: stopped, the check's or this repo's rule). Without documents they are
 *              one line. Gate 2 says up front when the repo takes no confidential material (kit.json
 *              intake.allow_confidential), and a refused pick says what this repo refuses. 「先检查」 runs the gates as a
 *              dry run (POST /intake/check: nothing claimed, no document taken in); its answer: what stops it said as
 *              what to do on this page (the field it names marked), the counts, a card per file (what was found and
 *              what happened to it), 请你确认 by file name, brain-kit's own words folded under 细节.
 *   3 开工      the session options, 「开工」 (POST /intake/start), big, with why it is off next to it: KiroCrew cannot
 *              open the session (a ✗ above), the default branch not on origin yet (推送 right there), the form, a check
 *              of exactly what the form says now. The answer: a success card (branch, worktree) saying what happens in
 *              the session, with 打开会话, 需求看板, 需求详情; a failure says why in words and what to do.
 *
 * KiroCrew's failing or doubtful checks are listed above the form with their fix buttons: /status has them at once,
 * GET /crew checks again. Without a usable repo there is no form: 导入仓库, or the way forward of a repo on its way;
 * without brain-kit none can be used, and the one way forward is its place in 设置 (去填位置, as the banner says).
 */
import { useState, type ReactNode } from 'react'
import { useAppApi, useNavigate } from '@kirocrew/app-sdk'
import { paths, useAction, usePoll } from '../api'
import { lines, splitPaths } from '../format'
import { KEY_RE, type NewEntry } from '../nav'
import type { Tone } from '../styles'
import { CLASS_LABEL, type CheckRow, type Classification, type CrewChecks, type IntakeBody, type IntakeCheck, type IntakeNext, type MeNameResult, type StartBody, type StartResult } from '../types'
import { CheckRows, Flow, Icon, ImportCta, MeLine, PendingRepo, PushBox, RoleIcon, brainkitProblem, repoLabel, type FlowStep } from '../ui'
import { ACT, CLASS_NAME } from '../vocab'
import type { ViewProps } from './props'

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,39}$/
export const REVIEW_HINT = '这些没打码，也不拦开工：可能是人名或密码，也可能只是普通的词。是人名或密码的话，先改原文，再检查一遍。'
/** 第 4 关 and 第 5 关: what brain-kit masks by itself */
export const GATE4 = '证件号、电话、卡号、邮箱：整份打码。标签后面、姓名列里的人名：在找到的地方打码。看不准是人名（或密码）还是普通词的不打码，列在「请你确认」里。'
export const GATE5 = '密钥打码。私钥和云访问密钥：整份不收。'
const HERO_HEAD = '认领一个需求，带上它的文档开工。文档先过五关，原件不进任何仓库。开工时在它自己的工作目录里开一个 AI 开发会话（brain-dev），按 AI-DLC Lean 的步骤（需求 → 设计 → 代码 → 测试 → 发布）一步步做，需求和设计由你批准'
export const HERO_TEXT = `${HERO_HEAD}；团队仓库做完可以交给运行机（团队的服务器）接着跑。`
/** a repo without a remote is done only on this machine: no word of the runner */
export const HERO_LOCAL = `${HERO_HEAD}，做完在这台机器上发布、合并。`
export const NO_CONFIDENTIAL = '这个仓库不收机密材料：机密、绝密和「不确定」的文档，要先请产品写一份脱敏摘要，交摘要。'
export const NO_SECRET = '绝密材料不收：先请产品写一份脱敏摘要，交摘要。'
export const CHECK_HINT = '只检查：不认领，文档也不收进任何地方。'
export const CREW_OK = 'KiroCrew 的检查都过了：开工以后能开会话。'
export const STARTED_NEXT = '打开会话：AI 先写需求文档；写好会请你批准（待办和需求看板会提醒，批准那一行要你在会话里自己打）。'
const CLASSES = Object.keys(CLASS_LABEL) as Classification[]

/** A gate's state: ok (done), wait (waits for you), bad (stopped: the check, or this repo's rule), warn (请你确认),
 * auto (brain-kit does it), off (no documents: not needed). */
export type GateState = 'ok' | 'wait' | 'bad' | 'warn' | 'auto' | 'off'
const GATE_META: Record<GateState, { tone: Tone; glyph: string }> = {
  ok: { tone: 'ok', glyph: '✓' },
  wait: { tone: 'wait', glyph: '✋' },
  bad: { tone: 'bad', glyph: '✕' },
  warn: { tone: 'warn', glyph: '!' },
  auto: { tone: 'info', glyph: '●' },
  off: { tone: 'idle', glyph: '–' },
}

/** The gate a line is about: 「第 2 关：…」 (the app's words) or brain-kit's 「门 2：…」 → 2. */
function gateOf(line: string): number | null {
  const m = /^\s*(?:第\s*(\d)\s*关|门\s*(\d))/.exec(line)
  return m ? Number(m[1] ?? m[2]) : null
}

/** Why gate 2 refuses *c* in this repo, '' when it takes it: 绝密 never (brain-kit's rule); 机密 and 不确定 (taken
 * as 机密) when the repo's kit.json does not allow confidential material. */
export function classRefusal(c: Classification, allowConfidential: boolean): string {
  if (c === 'secret') return NO_SECRET
  if (allowConfidential || (c !== 'confidential' && c !== 'unsure')) return ''
  return `这个仓库不收机密材料（你选的是「${c === 'unsure' ? '不确定' : '机密'}」）：先请产品写一份脱敏摘要，交摘要。`
}

/** What a person checks in a 请你确认 line: the quoted words (「对接人：张三李四」); else the line without its document
 * code (「D01 」) and without brain-kit's explanation in brackets, which REVIEW_HINT says once. */
export function reviewWords(text: string): string {
  const quotes = [...text.matchAll(/「([^」]*)」/g)].map((m) => `「${m[1]}」`)
  if (quotes.length) return quotes.join('、')
  return text.replace(/^\s*D\d+\s+/, '').replace(/（[^）]*）/g, '').trim()
}

/** The 英文短名 a title suggests: its English words, else req-<the key's number>. */
export function slugFrom(title: string, key: string): string {
  const words = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '')
  if (SLUG_RE.test(words)) return words
  const n = /-(\d+)$/.exec(key)?.[1]
  return n ? `req-${n}` : ''
}

/** The name of the fix a failing KiroCrew row points at (its 做什么's 点「…」). */
const fixOfRow = (r: CheckRow) => /点「([^」]{2,20})」/.exec(r.todo ?? '')?.[1] ?? ''

export function NewView({ entry, ...props }: { entry: NewEntry } & ViewProps) {
  const api = useAppApi()
  const navigate = useNavigate()
  const repos = (props.status?.repos ?? []).filter((r) => r.ok)
  const [repoPick, setRepoPick] = useState(entry.repo ?? '')
  const repo = repoPick && (!props.status || repos.some((r) => r.id === repoPick)) ? repoPick : repos[0]?.id ?? ''
  const picked = repos.find((r) => r.id === repo) ?? null
  const me = picked?.me ?? null     // who brain-kit will say claims it (认领人)
  const localOnly = picked?.remote === false
  // a requirement claimed already (from 需求看板 / 需求详情): its key is fixed, in its own repo only
  const claimed = !!entry.key && (!entry.repo || entry.repo === repo) ? entry.key : ''

  const next = usePoll<IntakeNext>(repo ? paths.intakeNext(repo) : null, 0)
  const crew = usePoll<CrewChecks>(paths.crew(), 0)
  const [crewOk, setCrewOk] = useState('')

  const [title, setTitle] = useState(entry.title ?? '')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [key, setKey] = useState('')
  const [keyEdited, setKeyEdited] = useState(false)
  const [expected, setExpected] = useState('')
  const [docs, setDocs] = useState('')
  const [consent, setConsent] = useState(false)
  const [classification, setClassification] = useState<Classification | ''>('')
  const [business, setBusiness] = useState<'keep' | 'mask' | ''>('')
  const [exclude, setExclude] = useState('')
  const [openSession, setOpenSession] = useState(true)
  const [trust, setTrust] = useState(true)

  const info = next.data && next.data.repo === repo ? next.data : null
  const nextKey = info?.key ?? ''
  const keyValue = claimed || (keyEdited ? key : nextKey)
  const slugValue = slugEdited ? slug : slugFrom(title, keyValue)
  const tracker = info?.tracker || picked?.kit?.tracker || 'none'
  // an older backend does not say: brain-kit's own rule only (绝密)
  const allowConfidential = info?.allow_confidential !== false
  const refusedClasses = CLASSES.filter((k) => classRefusal(k, allowConfidential))

  const body: IntakeBody = {
    repo, key: keyValue.trim(), slug: slugValue.trim(), title: title.trim(), docs: lines(docs), consent, classification, business, exclude: lines(exclude),
  }
  // what a check is valid for: the IntakeBody only. Expected paths, open_session and trust are not part of the gates,
  // so changing them does not need a new check.
  const print = JSON.stringify(body)

  const [checked, setChecked] = useState<{ print: string; result: IntakeCheck } | null>(null)
  const [failedAt, setFailedAt] = useState('')
  const check = useAction((b: IntakeBody) => api.post<IntakeCheck>(paths.intakeCheck(), b))
  const start = useAction((b: StartBody) => api.post<StartResult>(paths.intakeStart(), b))
  const started = start.result

  const runCheck = async () => {
    const at = print
    setChecked(null)
    setFailedAt('')
    const r = await check.run(body)
    if (r) setChecked({ print: at, result: r })
    else setFailedAt(at)
  }
  const runStart = async () => {
    const r = await start.run({ ...body, paths: splitPaths(expected), open_session: openSession, trust })
    if (r) props.reloadStatus()
  }

  // KiroCrew's doubtful rows for this requirement: the machine's, and the chosen repo's own (another repo's stay in 设置)
  const crewData = crew.data ?? props.status?.crew ?? null
  const repoPath = picked?.path
  const doubtful = (rows: CheckRow[]) => rows.filter((r) => (r.level === 'FAIL' || r.level === 'WARN') && (!r.repo || r.repo === repoPath))
  const crewRows = crewData ? doubtful(crewData.rows) : []
  const crewBad = crewRows.some((r) => r.level === 'FAIL')
  const crewFix = crewRows.filter((r) => r.level === 'FAIL').map(fixOfRow).find(Boolean)
  // the card above goes once this requirement's rows are fine (another repo's stay in 设置): say so where it was
  const onFixed = (rows: CrewChecks['rows']) => {
    if (crew.data) crew.set({ ...crew.data, rows })
    setCrewOk(doubtful(rows).length ? '' : CREW_OK)
    props.reloadStatus()
  }

  const slugBad = slugValue.trim() !== '' && !SLUG_RE.test(slugValue.trim())
  const keyBad = keyValue.trim() !== '' && !KEY_RE.test(keyValue.trim())
  const keyMissing = tracker === 'jira' && keyValue.trim() === ''
  const clean = (c: IntakeCheck) => c.ok && c.blocking.length === 0 && !c.error
  const noDocs = body.docs.length === 0
  const classRefused = !noDocs && !!classification && refusedClasses.includes(classification)
  const current = checked && checked.print === print ? checked.result : null
  const why = !repo ? '先选一个仓库'
    : !body.title ? '先写标题'
      : !SLUG_RE.test(body.slug) ? '英文短名不对：英文小写、数字和 -'
        : keyMissing ? '这个仓库用 Jira：要填需求号'
          : keyBad ? '需求号的格式不对'
            : me?.ask ? `先在上面「${me.label}」旁点「保存」${me.suggest ? `（确认是 ${me.suggest}）` : ''}`
              : started?.ok ? '已经开工了'
                : info?.push ? `先推送 ${info.push.branch}：开工从远端的 ${info.push.branch} 建分支，那里还没有 brain-kit`
                  : openSession && crewBad ? `KiroCrew 这边有问题，开不了会话：先点上面的${crewFix ? `「${crewFix}」` : '修复按钮'}，或者不勾「开工后开会话」`
                    : classRefused ? classRefusal(classification, allowConfidential)
                      : noDocs ? ''
                        : !checked ? '有文档：先检查一遍（不写入）'
                          : checked.print !== print ? '表单改过了：再检查一遍'
                            : !clean(checked.result) ? '检查没过：照红色那几行改'
                              : ''
  const canStart = why === '' && !start.busy
  const canCheck = !!repo && !noDocs && !check.busy
  const needCheck = !noDocs && !current && !started?.ok

  // ---- the five gates
  const stopLines = current ? [...current.blocking, current.error] : failedAt === print ? [check.error] : []
  const stopped = new Set<number>()
  for (const l of stopLines) {
    const n = gateOf(l)
    if (n) stopped.add(n)
  }
  if (classRefused) stopped.add(2)
  const markExclude = stopLines.some((l) => l.includes('不收这些文件'))
  const passed = !!current && clean(current)
  const own = (n: number, done: boolean): GateState => (noDocs ? 'off' : stopped.has(n) ? 'bad' : done ? 'ok' : 'wait')
  const auto = (n: number, warn = false): GateState => (noDocs ? 'off' : stopped.has(n) ? 'bad' : warn ? 'warn' : passed ? 'ok' : 'auto')
  const gates: GateState[] = [own(1, consent), own(2, !!classification), own(3, !!business), auto(4, !!current?.review.length), auto(5)]
  const word = (s: GateState, waiting: string) =>
    s === 'ok' ? (passed ? '过了' : '好了') : s === 'wait' ? waiting : s === 'bad' ? '拦下了' : s === 'warn' ? '请你确认' : s === 'auto' ? '自动' : '不用'

  // ---- the flow
  const basicsOk = !!repo && !!body.title && SLUG_RE.test(body.slug) && !keyMissing && !keyBad && !me?.ask
  const ok = !!started?.ok
  const docsBad = (!!current && !clean(current)) || failedAt === print || classRefused
  const flow: FlowStep[] = [
    { icon: 'new', title: '认领', text: claimed ? `${claimed} 已经认领了` : '仓库、标题、需求号', state: ok || basicsOk ? 'done' : 'now' },
    {
      icon: 'security', title: '文档过五关', text: noDocs ? '没有文档：不用过' : '原件不进任何仓库',
      state: noDocs ? 'off' : ok || passed ? 'done' : docsBad ? 'bad' : basicsOk ? 'now' : undefined,
    },
    { icon: 'laptop', title: '开工', text: '在它自己的工作目录里开 AI 开发会话', state: ok ? 'done' : started ? 'bad' : canStart ? 'now' : undefined },
    { icon: 'req', title: 'Lean 推进', text: '需求和设计由你批准', state: ok ? 'now' : undefined },
    localOnly ? { icon: 'runner', title: '交给运行机', text: '这次不需要：这个仓库只在本机做', state: 'off' } : { icon: 'runner', title: '交给运行机', text: '团队仓库：交接以后它接着做' },
  ]
  const stepOf = (i: number) => flow[i].state

  if (props.status && repos.length === 0) {
    const waiting = props.status.repos.filter((r) => r.pending)
    const broken = props.status.repos.filter((r) => !r.ok && !r.pending)
    const kit = props.status.brainkit
    const kitFix = kit.ok ? null : brainkitProblem(kit.error, kit.path)
    return (
      <main className="kt-root br-view nr-root" data-testid="br-new">
        <style>{NR_CSS}</style>
        {props.status.repos.length === 0 ? (
          <ImportCta title="开需求之前，先导入一个仓库" punch="导入以后，就能在这里认领需求、开工。" onImport={() => props.go({ kind: 'import' })} />
        ) : kitFix ? (
          <section className="br-card nr-sec" aria-label="还没有能用的仓库" data-testid="no-usable-repo">
            <header className="nr-head">
              <RoleIcon role="blocked" size={20} className="nr-bad-icon" />
              <h3>开不了需求：app 读不了 brain-kit</h3>
              <small>{props.status.repos.map((r) => r.name).join('、')} 都在等它</small>
            </header>
            <p className="nr-kit-todo" data-testid="no-kit-todo">
              <b>做什么</b>{kitFix.kind === 'missing' ? '先在设置里写对 brain-kit 的位置，点「保存」，这些仓库就能用了' : kitFix.todo}
            </p>
            <div className="br-row">
              <button type="button" className="br-btn is-primary" onClick={() => props.go({ kind: 'settings' })}>
                <RoleIcon role="settings" size={15} />{kitFix.kind === 'missing' ? '去填位置' : '去设置'}
              </button>
            </div>
          </section>
        ) : (
          <section className="br-card nr-sec" aria-label="还没有能用的仓库" data-testid="no-usable-repo">
            <header className="nr-head">
              <RoleIcon role="blocked" size={20} className="nr-wait-icon" />
              <h3>还没有能开需求的仓库</h3>
              <small>做完下面这一步，就能在这里开需求</small>
            </header>
            <ul className="nr-waiting">
              {waiting.map((r) => (
                <li key={r.id} data-repo={r.id}>
                  <b>{r.name}</b>
                  <span className="br-chip tone-wait">{r.pending?.word || '在路上'}</span>
                  <PendingRepo repo={r} onOpen={() => props.go({ kind: 'import', path: r.path })} onDone={props.reloadStatus} />
                </li>
              ))}
              {broken.map((r) => (
                <li key={r.id} data-repo={r.id}>
                  <b>{r.name}</b>
                  <span className="br-chip tone-bad">用不了</span>
                  <span className="br-small">{r.error}</span>
                  <button type="button" className="br-btn is-small nr-waiting-go" onClick={() => props.go({ kind: 'import', path: r.path })}>去导入仓库检查</button>
                </li>
              ))}
            </ul>
            <div className="br-row">
              <button type="button" className="br-btn" onClick={() => props.go({ kind: 'import' })}><RoleIcon role="import" size={15} />导入别的仓库</button>
            </div>
          </section>
        )}
      </main>
    )
  }

  return (
    <main className="kt-root br-view nr-root" data-testid="br-new">
      <style>{NR_CSS}</style>
      <section className="br-hero nr-hero" aria-label="开需求">
        <div>
          <h2>{claimed ? `开工：${claimed}` : '开需求'}</h2>
          <p>{claimed ? `${claimed} 已经认领了，还没开工。看一眼英文短名，有文档的话填上，点「开工」。` : localOnly ? HERO_LOCAL : HERO_TEXT}</p>
        </div>
        <Flow steps={flow} label="开需求的步骤" />
      </section>

      {crew.error && !crewData && <p className="br-note">读不到 KiroCrew 的检查：{crew.error}</p>}
      {!crewData && crew.loading && <p className="br-note nr-crew-wait" role="status">正在查 KiroCrew…</p>}
      {crewRows.length > 0 && crewData && (
        <section className={`br-card nr-crew ${crewBad ? 'is-bad' : 'is-warn'}`} aria-label="KiroCrew 的检查">
          <header className="nr-head">
            {crewBad ? <RoleIcon role="blocked" size={20} className="nr-bad-icon" /> : <span className="br-prob-glyph tone-warn" aria-hidden="true">!</span>}
            <h3>{crewBad ? '开会话之前，KiroCrew 这边要先处理' : `KiroCrew 这边有 ${crewRows.length} 个提醒，不挡开工`}</h3>
          </header>
          <CheckRows rows={crewRows} fix={crewData.fix} onFixed={onFixed} />
        </section>
      )}
      {crewOk && <div className="br-banner is-ok" role="status">{crewOk}</div>}

      <form className="nr-form" aria-label="开需求" onSubmit={(e) => e.preventDefault()}>
        <section className="br-card nr-sec" aria-label="需求">
          <StepHead n={1} title="认领" state={stepOf(0)} sub={claimed ? `${claimed} 已经认领了：需求号不能改` : '这个需求叫什么、放在哪个仓库'} />
          <div className="nr-grid">
            <div className="br-field is-2">
              <label htmlFor="new-repo">仓库</label>
              <select id="new-repo" value={repo} disabled={!!claimed} onChange={(e) => {
                setRepoPick(e.target.value)
                setKeyEdited(false)
                setKey('')
                props.replace({ kind: 'new', repo: e.target.value })
              }}>
                {repos.map((r) => <option key={r.id} value={r.id}>{repoLabel(r, repos)}</option>)}
              </select>
            </div>
            <div className="br-field is-4">
              <label htmlFor="new-title">标题</label>
              <input id="new-title" type="text" value={title} placeholder="商户结算周报" onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="br-field">
              <label htmlFor="new-slug">英文短名（用在分支名里）</label>
              <input id="new-slug" type="text" className="br-mono" value={slugValue} placeholder="merchant-weekly" aria-invalid={slugBad ? true : undefined}
                aria-describedby="new-slug-hint" onChange={(e) => {
                  setSlug(e.target.value)
                  setSlugEdited(true)
                }} />
              <p className="br-hint" id="new-slug-hint">{slugEdited ? '英文小写、数字和 -' : '按标题给了一个，可以改：英文小写、数字和 -'}</p>
              {slugBad && <p className="br-error" role="alert">英文短名只能用英文小写、数字和 -，开头不能是 -，最多 40 个字。</p>}
            </div>
            <div className="br-field">
              <label htmlFor="new-key">需求号</label>
              <input id="new-key" type="text" className="br-mono" value={keyValue} readOnly={!!claimed} aria-invalid={keyBad || keyMissing ? true : undefined}
                onChange={(e) => {
                  setKey(e.target.value)
                  setKeyEdited(true)
                }} />
              <p className="br-hint">
                {claimed ? '已经认领的需求：开工就用这个号。'
                  : tracker === 'jira' ? '这个仓库用 Jira：填 Jira 上的需求号（必填）。' : '不填就用下一个空号。'}
                {!claimed && nextKey && !keyEdited ? `下一个空号是 ${nextKey}。` : ''}
              </p>
              {next.error && <p className="br-note">读不到下一个空号：{next.error}</p>}
              {info?.error && <p className="br-note">{info.error}</p>}
              {keyBad && <p className="br-error" role="alert">需求号的格式像 PAY-12。</p>}
            </div>
            <div className="br-field is-full">
              <label htmlFor="new-paths">预计会改的路径（用逗号、空格或换行分开）</label>
              <textarea id="new-paths" rows={2} value={expected} placeholder="src/refund/" onChange={(e) => setExpected(e.target.value)} />
              <p className="br-hint">别的需求也改到这里时会提醒你。</p>
            </div>
            {picked && me && (
              <div className="br-field is-full" data-testid="new-me">
                {!me.ask && <span className="br-label">认领人</span>}
                <MeLine key={picked.id} path={picked.path} me={me} onSaved={(x) => props.setStatus(x.status)} />
              </div>
            )}
          </div>
        </section>

        <section className={`br-card nr-sec${noDocs ? ' is-quiet' : ''}`} aria-label="文档">
          <StepHead n={2} title="文档过五关" state={stepOf(1)} sub={noDocs ? '没有文档：五关都不用过，也不用检查' : '前三关你来定，后两关自动'} />
          <div className="nr-grid">
            <div className="br-field is-4">
              <label htmlFor="new-docs">文档（一行一个路径）</label>
              <textarea id="new-docs" rows={2} value={docs} placeholder="/Users/alice/Downloads/结算周报需求" onChange={(e) => setDocs(e.target.value)} />
              <p className="br-hint">这台机器上的文件或文件夹，飞书 / Lark 导出的文件夹也行。{noDocs ? '填了文档，下面就展开五关。' : ''}</p>
            </div>
            <div className={`br-field is-2${markExclude ? ' nr-hl' : ''}`} data-marked={markExclude || undefined}>
              <label htmlFor="new-exclude">不收这些文件（按文件名，可以用 *，一行一个）</label>
              <textarea id="new-exclude" rows={2} value={exclude} placeholder="*合作方*" onChange={(e) => setExclude(e.target.value)} />
            </div>
          </div>

          {noDocs ? (
            <p className="nr-nodocs" data-testid="no-docs"><RoleIcon role="security" size={16} />没有文档：五关（同意、密级、金额公司名、个人信息、密钥）都不用过，可以直接开工。</p>
          ) : (
            <>
              <ol className="nr-gates" aria-label="五关">
                <Gate n={1} icon="sign" title="同意" state={gates[0]} word={word(gates[0], '等你勾')}>
                  <label className={`nr-opt${consent ? ' is-on' : ''}`}>
                    <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                    <span>我是作者，或已取得作者同意</span>
                  </label>
                </Gate>
                <Gate n={2} icon="security" title="密级" state={gates[1]} word={word(gates[1], '等你选')}>
                  {refusedClasses.includes('confidential') && <p className="nr-gate-rule" data-testid="gate2-rule">{NO_CONFIDENTIAL}</p>}
                  <div className="nr-opts" role="radiogroup" aria-label="第 2 关：密级">
                    {CLASSES.map((k) => (
                      <label key={k} className={`nr-opt${classification === k ? ' is-on' : ''}${refusedClasses.includes(k) ? ' is-refused' : ''}`}>
                        <input type="radio" name="new-class" value={k} checked={classification === k} onChange={() => setClassification(k)} />
                        <span>{CLASS_LABEL[k]}</span>
                        {refusedClasses.includes(k) && <small className="nr-no">不收</small>}
                      </label>
                    ))}
                  </div>
                </Gate>
                <Gate n={3} icon="feasibility" title="金额、公司名、合同号" state={gates[2]} word={word(gates[2], '等你选')}>
                  <div className="nr-opts" role="radiogroup" aria-label="第 3 关：金额、公司名、合同号">
                    <label className={`nr-opt${business === 'keep' ? ' is-on' : ''}`}>
                      <input type="radio" name="new-business" value="keep" checked={business === 'keep'} onChange={() => setBusiness('keep')} />
                      <span>原样保留</span>
                    </label>
                    <label className={`nr-opt${business === 'mask' ? ' is-on' : ''}`}>
                      <input type="radio" name="new-business" value="mask" checked={business === 'mask'} onChange={() => setBusiness('mask')} />
                      <span>换成占位符</span>
                    </label>
                  </div>
                </Gate>
                <Gate n={4} icon="person" title="个人信息：自动打码" state={gates[3]} word={word(gates[3], '')}>
                  <p>{GATE4}</p>
                </Gate>
                <Gate n={5} icon="signer" title="密钥：自动打码" state={gates[4]} word={word(gates[4], '')}>
                  <p>{GATE5}</p>
                </Gate>
              </ol>

              <div className="nr-go-row">
                <button type="button" className={`br-btn${needCheck ? ' is-primary' : ''}`} disabled={!canCheck} onClick={() => void runCheck()}>
                  <RoleIcon role="lint" size={16} />{check.busy ? '正在检查…' : '先检查'}
                </button>
                <span className="br-hint">{checked && checked.print !== print ? '表单改过了，这次检查不算数了。' : CHECK_HINT}</span>
              </div>
              {check.error && <p className="br-error" role="alert">{check.error}</p>}
              {checked && <CheckResult c={checked.result} stale={checked.print !== print} />}
            </>
          )}
        </section>

        <section className={`br-card nr-sec${ok ? ' is-ok' : ''}`} aria-label="开工">
          <StepHead n={3} title="开工" state={stepOf(2)} sub={claimed ? '建分支和工作目录、开会话' : '认领、建分支和工作目录、开会话'} />
          <div className="nr-toggles">
            <label className={`nr-toggle${openSession ? ' is-on' : ''}`}>
              <input type="checkbox" checked={openSession} onChange={(e) => setOpenSession(e.target.checked)} />
              <RoleIcon role="laptop" size={18} />
              <span>开工后开会话：在这个需求的目录里开一个 AI 开发会话（brain-dev）</span>
            </label>
            <label className={`nr-toggle${openSession && trust ? ' is-on' : ''}${openSession ? '' : ' is-disabled'}`}>
              <input type="checkbox" checked={trust} disabled={!openSession} onChange={(e) => setTrust(e.target.checked)} />
              <RoleIcon role="approved" size={18} />
              <span>这个会话的工具调用不用逐个批准</span>
            </label>
          </div>
          {info?.push && picked && (
            <div className="nr-push" data-testid="new-push">
              <PushBox path={picked.path} branch={info.push.branch} remoteUrl={info.push.remote_url} target={info.push.branch} onDone={() => next.reload()} />
            </div>
          )}
          <div className="nr-go-row">
            <button type="button" className="br-btn is-primary nr-go-btn" disabled={!canStart} onClick={() => void runStart()}>
              <RoleIcon role="deploy" size={20} />{start.busy ? '正在开工…' : ACT.start}
            </button>
            {why ? (
              <span className={`nr-why${ok ? ' is-ok' : ''}`} data-testid="start-why"><i aria-hidden="true">{ok ? '✓' : '✋'}</i>{why}</span>
            ) : !start.busy && <span className="nr-why is-ok" data-testid="start-ready"><i aria-hidden="true">✓</i>可以开工了</span>}
          </div>
          {start.error && <p className="br-error" role="alert">{start.error}</p>}
          {started && (
            <StartOut r={started} onOpen={navigate} path={picked?.path ?? ''} onMe={(x) => props.setStatus(x.status)}
              onBoard={(k) => props.go({ kind: 'board', repo, key: k })}
              onItem={(k) => props.go({ kind: 'item', repo, key: k })} />
          )}
        </section>
      </form>
    </main>
  )
}

/** A card's head: its step number (✓ when done), its title and one line. */
function StepHead({ n, title, state, sub }: { n: number; title: string; state?: FlowStep['state']; sub?: string }) {
  return (
    <header className="nr-head" data-step={n} data-state={state}>
      <span className={`nr-n${state ? ` is-${state}` : ''}`} aria-hidden="true">{state === 'done' ? '✓' : n}</span>
      <h3>{title}</h3>
      {sub && <small>{sub}</small>}
    </header>
  )
}

function Gate({ n, icon, title, state, word, children }: { n: number; icon: string; title: string; state: GateState; word: string; children: ReactNode }) {
  const m = GATE_META[state]
  return (
    <li className={`nr-gate is-${state}`} data-testid={`gate-${n}`} data-state={state}>
      <div className="nr-gate-top">
        <RoleIcon role={icon} size={20} />
        <span className="nr-gate-n">第 {n} 关</span>
        <span className={`br-chip kt-pill tone-${m.tone}`}><i aria-hidden="true">{m.glyph}</i>{word}</span>
      </div>
      <b className="nr-gate-title">{title}</b>
      {children}
    </li>
  )
}

/**
 * A dry run's answer: whether it passed, what stops it (as what to do on this page), the counts as cells, the
 * classification and size, one card per file (what was found and what happened to it, or why it was not taken),
 * 请你确认, and brain-kit's own words folded under 细节.
 */
function CheckResult({ c, stale }: { c: IntakeCheck; stale: boolean }) {
  const passed = c.ok && c.blocking.length === 0 && !c.error
  const raw = [...(c.blocking_raw ?? []), ...c.findings]
  // by the file's name, as its card above says it (not brain-kit's line with the document's code); an older backend: its lines
  const byFile = (c.files ?? []).filter((f) => f.review)
  const review: [string, string][] = byFile.length ? byFile.map((f) => [f.name, reviewWords(f.review)]) : c.review.map((r) => ['', reviewWords(r)])
  return (
    <div className={`nr-result${stale ? ' is-stale' : ''}`} data-testid="check-result">
      {c.error ? <p className="br-error br-pre" role="alert">{c.error}</p> : (
        <div className={`nr-verdict ${passed ? 'is-ok' : 'is-bad'}`} role="status">
          <RoleIcon role={passed ? 'approved' : 'blocked'} size={22} />
          <b>{passed ? '检查过了：可以开工。' : '有关卡没过：照下面红色那几行改，再检查一遍。'}</b>
        </div>
      )}
      {c.blocking.length > 0 && (
        <ul className="nr-stops" data-testid="blocking">
          {c.blocking.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      )}
      {!c.error && (
        <>
          <div className="nr-cells">
            <Cell n={c.blocking.length} label="拦下" tone={c.blocking.length ? 'bad' : 'ok'} />
            <Cell n={c.review.length} label="请你确认" tone={c.review.length ? 'warn' : 'ok'} />
            <Cell n={c.sources} label="份收下" />
            <Cell n={c.refused.length} label="份没收" tone={c.refused.length ? 'warn' : undefined} />
          </div>
          <ul className="nr-pkg" data-testid="check-summary" aria-label="文档包">
            <li><small>密级</small><b>{c.classification ? CLASS_NAME[c.classification] ?? c.classification : '—'}</b></li>
            <li><b>{c.segments}</b><small>段</small></li>
            {c.key && <li><small>需求号</small><b className="br-mono">{c.key}</b></li>}
          </ul>
        </>
      )}
      {(c.files?.length ?? 0) > 0 && (
        <ul className="nr-files" data-testid="check-files">
          {c.files?.map((f) => (
            <li key={f.id} className={`nr-file${f.refused ? ' is-refused' : ''}`} data-file={f.id}>
              <b><RoleIcon role="file" size={15} />{f.name}</b>
              {f.refused ? <span className="nr-file-no"><span className="br-chip tone-warn">没收</span>{f.refused}</span>
                : f.items.length > 0 ? <ul>{f.items.map((t, i) => <li key={i}>{t}</li>)}</ul>
                  : <span className="br-dim br-small">没找到要处理的</span>}
            </li>
          ))}
        </ul>
      )}
      {review.length > 0 && (
        <div className="nr-review" data-testid="review">
          <span className="nr-review-head"><i aria-hidden="true">!</i><b className="br-strong">请你确认</b></span>
          <ul>{review.map(([name, words], i) => <li key={i}>{name && <b>{name}：</b>}{words}</li>)}</ul>
          <p>{REVIEW_HINT}</p>
        </div>
      )}
      {(raw.length > 0 || c.package) && (
        <details className="br-raw nr-raw">
          <summary>细节：brain-kit 的原话</summary>
          <pre data-testid="findings">{[...(c.package ? [`文档包 ${c.package}`] : []), ...raw].join('\n')}</pre>
        </details>
      )}
    </div>
  )
}

function Cell({ n, label, tone }: { n: number; label: string; tone?: 'ok' | 'bad' | 'warn' }) {
  return (
    <div className={`nr-cell${tone ? ` is-${tone}` : ''}`}>
      <b>{n}</b>
      <small>{label}</small>
    </div>
  )
}

function StartOut({ r, path, onOpen, onBoard, onItem, onMe }: {
  r: StartResult
  path: string
  onOpen: (url: string) => void
  onBoard: (key: string) => void
  onItem: (key: string) => void
  onMe: (x: MeNameResult) => void
}) {
  return (
    <div className={`nr-started ${r.ok ? 'is-ok' : 'is-bad'}`} data-testid="start-result">
      <div className="nr-started-head">
        <span className="nr-started-mark" aria-hidden="true">{r.ok ? '✓' : '✕'}</span>
        <div>
          <b role="status">{r.ok ? `开工了${r.key ? `：${r.key}` : ''}` : r.problem ? `没开成：${r.problem.text}` : '没开成'}</b>
          <small>{r.ok ? (r.url ? STARTED_NEXT : `分支和工作目录都好了。要开会话时，在${ACT.openDetail}里点「${ACT.openSession}」。`)
            : r.problem?.todo || '原因在下面「细节」里（开工时 brain-kit 的原话）：照它改好，再点「开工」。'}</small>
        </div>
      </div>
      {r.ok && (
        <dl className="nr-facts">
          <div><dt>分支</dt><dd>{r.branch ?? '—'}</dd></div>
          <div className="is-wide"><dt>工作目录</dt><dd>{r.worktree ?? '—'}</dd></div>
        </dl>
      )}
      <div className="br-row">
        {r.url && (
          <button type="button" className="br-btn is-primary is-big" onClick={() => onOpen(r.url as string)}>
            <RoleIcon role="laptop" size={18} />{ACT.openSession}
          </button>
        )}
        {r.key && r.ok && (
          <>
            <button type="button" className="br-btn" onClick={() => onBoard(r.key as string)}><Icon name="LayoutDashboard" size={15} />{ACT.openBoard}</button>
            <button type="button" className="br-btn" onClick={() => onItem(r.key as string)}><RoleIcon role="file" size={16} />{ACT.openDetail}</button>
          </>
        )}
      </div>
      {!r.ok && r.problem?.fix === 'me' && r.me && path && (
        <div className="br-banner is-error nr-who" role="alert" data-testid="start-who">
          <MeLine path={path} me={r.me} onSaved={onMe} />
        </div>
      )}
      {!r.url && r.session_error && <p className="br-error br-pre" role="alert">会话没开成：{r.session_error}</p>}
      {r.output && (
        <details className="br-raw nr-out" open={!r.ok && !r.problem}>
          <summary>细节：开工时 brain-kit 的原话</summary>
          <pre>{r.output}</pre>
        </details>
      )}
    </div>
  )
}

/** 开需求's own look: the hero, the field grid, the five gate cards, the check's cells and cards, 开工 and its card. Its
 * breakpoints follow the view's own width (a container), not the window: the app sits next to KiroCrew's sidebar. */
const NR_CSS = `
.nr-root { --nr-gap: 16px; container: nr / inline-size; }
.nr-hero { gap: 16px; padding: 22px 26px; }
.nr-hero h2 { margin-bottom: 4px; }
.nr-form { display: grid; gap: var(--nr-gap); }
.nr-sec { gap: 14px; }
.nr-head { display: flex; align-items: center; gap: 6px 12px; flex-wrap: wrap; }
.nr-head h3 { font-size: 1.15em; font-weight: 800; color: var(--text-strong); margin: 0; }
.nr-head small { color: var(--muted); font-size: .88em; }
.nr-bad-icon { color: var(--kt-bad); }
.nr-wait-icon { color: var(--kt-approve); }
.nr-n { display: inline-grid; place-items: center; width: 1.75em; height: 1.75em; border-radius: 50%; font-size: .88em; font-weight: 850;
  background: color-mix(in srgb, var(--muted) 24%, transparent); color: var(--text-strong); }
.nr-n.is-done { background: var(--kt-ok-solid); color: #fff; }
.nr-n.is-now { background: var(--accent); color: var(--accent-fg, #fff); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent); }
.nr-n.is-bad { background: var(--kt-bad-solid); color: #fff; }
.nr-n.is-off { background: transparent; border: 1px dashed var(--border-strong, var(--border)); color: var(--muted); }
.nr-sec.is-ok { border-color: var(--kit-ok); }
.nr-crew-wait { min-height: 1.6em; }
.nr-waiting { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.nr-waiting > li { display: grid; grid-template-columns: auto auto minmax(0, 1fr); align-items: start; gap: 6px 10px; padding: 10px 14px; border-radius: 12px;
  border: 1px solid var(--border); background: var(--kt-glass); }
.nr-waiting > li > b { color: var(--text-strong); }
.nr-waiting > li > :nth-child(n+3) { grid-column: 1 / -1; }
.nr-waiting > li > .nr-waiting-go { justify-self: start; }
.nr-kit-todo { margin: 0; }
.nr-kit-todo b { color: var(--muted); font-weight: 650; margin-right: .5em; }

/* the fields: a grid of six columns */
.nr-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px 16px; align-items: start; }
.nr-grid > * { grid-column: span 3; min-width: 0; }
.nr-grid > .is-2 { grid-column: span 2; }
.nr-grid > .is-4 { grid-column: span 4; }
.nr-grid > .is-full { grid-column: 1 / -1; }
@container nr (max-width: 820px) { .nr-grid > * { grid-column: 1 / -1 !important; } }
.nr-grid :is(input[type="text"], input:not([type]), select, textarea) { width: 100%; }
.nr-grid > .br-field { align-content: start; }
.nr-grid textarea { min-height: 2.9em; }
.nr-grid input[readonly] { opacity: .8; cursor: not-allowed; }
.nr-hl { padding: 6px 8px; margin: -6px -8px; border-radius: 10px; box-shadow: 0 0 0 2px var(--kt-bad); background: color-mix(in srgb, var(--kt-bad) 7%, transparent); }
.nr-who { display: grid; gap: 6px; }
.nr-nodocs { margin: 0; display: flex; align-items: center; gap: 8px; padding: 9px 14px; border-radius: 12px; border: 1px dashed var(--border-strong, var(--border));
  color: var(--muted); font-size: .92em; }

/* the five gates: a row of cards, arrows between them (the board's team introduction) */
.nr-gates { list-style: none; margin: 0; padding: 0; display: grid; gap: 20px;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.45fr) minmax(0, 1.1fr) minmax(0, 1.35fr) minmax(0, 1fr); align-items: stretch; }
@container nr (max-width: 1180px) { .nr-gates { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; } .nr-gate::after { display: none; } }
@container nr (max-width: 560px) { .nr-gates { grid-template-columns: minmax(0, 1fr); } }
.nr-gate { position: relative; display: flex; flex-direction: column; gap: 8px; min-width: 0; padding: 12px 14px 14px; border-radius: 14px;
  border: 1px solid var(--border); background: var(--bg-elevated, var(--card)); transition: border-color .2s, background .2s; }
.nr-gate:not(:last-child)::after { content: '→'; position: absolute; right: -16px; top: 50%; transform: translateY(-50%); color: var(--kt-handoff); font-weight: 900; font-size: 1.1em; }
.nr-gate.is-ok { border-color: var(--kit-ok); background: color-mix(in srgb, var(--kt-ok) 7%, var(--card)); }
.nr-gate.is-wait { border-color: var(--kit-wait); background: color-mix(in srgb, var(--kt-approve) 6%, var(--card)); }
.nr-gate.is-bad { border-color: var(--kt-bad); box-shadow: 0 0 0 1px var(--kt-bad); background: color-mix(in srgb, var(--kt-bad) 9%, var(--card)); }
.nr-gate.is-warn { border-color: color-mix(in srgb, var(--kt-warn) 60%, var(--border)); background: color-mix(in srgb, var(--kt-warn) 7%, var(--card)); }
.nr-gate.is-auto { border-color: color-mix(in srgb, var(--kt-info) 38%, var(--border)); }
.nr-gate-top { display: flex; align-items: center; gap: 8px; }
.nr-gate-top .kt-role-icon { color: var(--text-strong); opacity: .9; }
.nr-gate.is-ok .nr-gate-top .kt-role-icon { color: var(--kt-ok); opacity: 1; }
.nr-gate.is-wait .nr-gate-top .kt-role-icon { color: var(--kt-approve); opacity: 1; }
.nr-gate.is-bad .nr-gate-top .kt-role-icon { color: var(--kt-bad); opacity: 1; }
.nr-gate-n { font-size: .84em; font-weight: 800; color: var(--muted); letter-spacing: .04em; white-space: nowrap; }
.nr-gate-top .kt-pill { margin-left: auto; }
.nr-gate.is-wait .kt-pill i { animation: kt-blink 1.6s ease-in-out infinite; }
.nr-gate-title { font-size: 1.06em; font-weight: 800; color: var(--text-strong); }
.nr-gate p { margin: 0; font-size: .86em; color: var(--text); line-height: 1.55; }
.nr-gate p.nr-gate-rule { color: var(--kt-warn); font-weight: 650; }
.nr-opts { display: flex; flex-wrap: wrap; gap: 6px; }
.nr-opt { display: inline-flex; align-items: center; gap: 6px; padding: 4px 11px 4px 8px; border-radius: 999px; cursor: pointer; font-size: .9em; font-weight: 650;
  border: 1px solid var(--border-strong, var(--border)); background: var(--card); color: var(--text); }
.nr-opt input { margin: 0; accent-color: var(--accent); }
.nr-opt:hover { border-color: var(--accent); }
.nr-opt.is-on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 17%, var(--card)); color: var(--text-strong); }
.nr-opt.is-refused { border-style: dashed; }
.nr-opt.is-refused.is-on { border-color: var(--kt-bad); background: color-mix(in srgb, var(--kt-bad) 12%, var(--card)); }
.nr-opt .nr-no { font-size: .8em; color: var(--kt-bad); font-weight: 750; }
.nr-opt:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
.nr-gate > .nr-opt { align-self: flex-start; border-radius: 12px; white-space: normal; }

/* the check's answer */
.nr-result { display: grid; gap: 12px; }
.nr-result.is-stale { opacity: .55; }
.nr-verdict { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 12px; font-size: 1.04em; }
.nr-verdict.is-ok { border: 1px solid var(--kit-ok); background: color-mix(in srgb, var(--kt-ok) 9%, var(--card)); color: var(--kt-ok); }
.nr-verdict.is-bad { border: 1px solid var(--kt-bad); background: color-mix(in srgb, var(--kt-bad) 9%, var(--card)); color: var(--kt-bad); }
.nr-verdict b { font-weight: 800; }
.nr-stops { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.nr-stops li { padding: 8px 12px; border-radius: 10px; border-left: 3px solid var(--kt-bad); background: color-mix(in srgb, var(--kt-bad) 9%, transparent);
  color: var(--text-strong); font-weight: 650; }
.nr-cells { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
@container nr (max-width: 820px) { .nr-cells { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.nr-cell { display: flex; align-items: baseline; gap: 8px; padding: 10px 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--kt-glass); }
.nr-cell b { font-size: 1.9em; font-weight: 800; line-height: 1.1; letter-spacing: -.02em; font-variant-numeric: tabular-nums; color: var(--text-strong); }
.nr-cell small { color: var(--muted); font-weight: 700; font-size: .9em; }
.nr-cell.is-ok { border-color: var(--kit-ok); } .nr-cell.is-ok b { color: var(--kt-ok); }
.nr-cell.is-bad { border-color: var(--kt-bad); background: color-mix(in srgb, var(--kt-bad) 9%, transparent); } .nr-cell.is-bad b { color: var(--kt-bad); }
.nr-cell.is-warn { border-color: color-mix(in srgb, var(--kt-warn) 60%, var(--border)); background: color-mix(in srgb, var(--kt-warn) 8%, transparent); } .nr-cell.is-warn b { color: var(--kt-warn); }
.nr-pkg { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.nr-pkg li { display: inline-flex; align-items: baseline; gap: 6px; padding: 4px 11px; border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--kt-info) 50%, var(--border)); background: color-mix(in srgb, var(--kt-info) 9%, transparent); }
.nr-pkg small { color: var(--muted); font-size: .84em; font-weight: 650; }
.nr-pkg b { color: var(--text-strong); font-weight: 750; }
.nr-files { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 17em), 1fr)); gap: 8px; }
.nr-file { display: grid; gap: 6px; align-content: start; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--border); background: var(--kt-glass); min-width: 0; }
.nr-file > b { display: flex; align-items: center; gap: 6px; color: var(--text-strong); word-break: break-all; }
.nr-file ul { margin: 0; padding-left: 1.2em; display: grid; gap: 2px; font-size: .88em; color: var(--text); }
.nr-file.is-refused { border-style: dashed; border-color: color-mix(in srgb, var(--kt-warn) 60%, var(--border)); }
.nr-file-no { display: flex; align-items: baseline; gap: 6px; font-size: .88em; color: var(--kt-warn); font-weight: 650; }
.nr-file-no > .br-chip { flex: none; }
.nr-review { display: grid; gap: 6px; padding: 10px 14px; border-radius: 12px; border: 1px solid color-mix(in srgb, var(--kt-warn) 60%, var(--border));
  background: color-mix(in srgb, var(--kt-warn) 8%, var(--card)); }
.nr-review-head { display: inline-flex; align-items: center; gap: 8px; }
.nr-review-head i { font-style: normal; display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 7px; font-weight: 900; font-size: .85em;
  color: var(--kt-warn); border: 2px solid var(--kt-warn); background: color-mix(in srgb, var(--kt-warn) 14%, transparent); }
.nr-review ul { margin: 0; padding-left: 1.3em; color: var(--text-strong); }
.nr-review li b { font-weight: 700; }
.nr-review p { margin: 0; font-size: .86em; color: var(--muted); }
.nr-raw pre { white-space: pre-wrap; word-break: break-word; max-height: 16em; overflow: auto; }

/* 开工 */
.nr-toggles { display: flex; flex-wrap: wrap; gap: 8px; }
.nr-toggle { display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 12px; cursor: pointer; font-weight: 650;
  border: 1px solid var(--border); background: var(--kt-glass); color: var(--text); }
.nr-toggle input { margin: 0; accent-color: var(--accent); }
.nr-toggle.is-on { border-color: color-mix(in srgb, var(--accent) 60%, var(--border)); background: color-mix(in srgb, var(--accent) 10%, var(--card)); color: var(--text-strong); }
.nr-toggle.is-disabled { opacity: .55; cursor: not-allowed; }
.nr-toggle:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
.nr-push { padding: 10px 14px; border-radius: 12px; border: 1px solid var(--kit-wait); background: color-mix(in srgb, var(--kt-approve) 6%, var(--card)); }
.nr-go-row { display: flex; align-items: center; gap: 10px 16px; flex-wrap: wrap; }
.nr-go-btn { font-size: 1.14em; padding: 12px 34px; border-radius: 14px; font-weight: 800; }
.nr-go-btn:not(:disabled) { box-shadow: 0 10px 30px -12px var(--accent); }
.nr-why { display: inline-flex; align-items: center; gap: 7px; padding: 5px 13px; border-radius: 999px; font-weight: 700; min-width: 0;
  color: var(--kt-approve); background: color-mix(in srgb, var(--kt-approve) 11%, transparent); border: 1px solid color-mix(in srgb, var(--kt-approve) 42%, transparent); }
.nr-why i { font-style: normal; }
.nr-why.is-ok { color: var(--kt-ok); background: color-mix(in srgb, var(--kt-ok) 11%, transparent); border-color: color-mix(in srgb, var(--kt-ok) 42%, transparent); }
.nr-started { display: grid; gap: 14px; padding: 16px 20px; border-radius: 16px; border: 1px solid var(--kit-ok);
  background: radial-gradient(70% 120% at 0% 0%, color-mix(in srgb, var(--kt-ok) 14%, transparent), transparent 60%), var(--card); }
.nr-started.is-bad { border-color: var(--kit-bad); background: radial-gradient(70% 120% at 0% 0%, color-mix(in srgb, var(--kt-bad) 12%, transparent), transparent 60%), var(--card); }
.nr-started-head { display: flex; align-items: center; gap: 14px; }
.nr-started-head > div { display: grid; gap: 2px; }
.nr-started-head b { font-size: 1.35em; font-weight: 850; color: var(--text-strong); }
.nr-started-head small { color: var(--text); font-size: .95em; }
.nr-started-mark { flex: none; width: 42px; height: 42px; border-radius: 13px; display: grid; place-items: center; font-weight: 900; font-size: 1.35em;
  background: var(--kt-ok-solid); color: #fff; box-shadow: 0 0 24px -6px var(--kt-ok); }
.nr-started.is-bad .nr-started-mark { background: var(--kt-bad-solid); box-shadow: none; }
.nr-facts { display: grid; grid-template-columns: repeat(2, minmax(0, auto)); justify-content: start; gap: 8px 28px; margin: 0; }
@container nr (max-width: 1000px) { .nr-facts { grid-template-columns: minmax(0, 1fr); } }
.nr-facts dt { font-size: .82em; color: var(--muted); font-weight: 700; }
.nr-facts dd { margin: 2px 0 0; font-family: var(--mono, ui-monospace, monospace); font-size: .95em; color: var(--text-strong); word-break: break-all; }
.nr-out pre { max-height: 16em; overflow: auto; }
`
