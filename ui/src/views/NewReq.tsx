/**
 * 开需求: claim a requirement and start it. Repo, title, slug, key (prefilled from GET /intake/next), the paths it is
 * expected to change, and its documents through the five gates. 「先检查（不写入）」 runs the gates as a dry run
 * (POST /intake/check); 「开工」 (POST /intake/start) is on only after a check that stopped nothing, of exactly what
 * the form says now. Without documents there is nothing to check. What brain-kit could not tell from a plain word (a
 * name or a password?) is listed under 「请你确认」: not masked, and not stopping the start.
 *
 * KiroCrew's failing or doubtful checks (GET /crew) are listed above the form with their fix buttons: a start that
 * opens a session needs them.
 */
import { useState } from 'react'
import { useAppApi, useNavigate } from '@kirocrew/app-sdk'
import { paths, useAction, usePoll } from '../api'
import { lines, splitPaths } from '../format'
import { KEY_RE, type NewEntry } from '../nav'
import { CLASS_LABEL, type Classification, type CrewChecks, type IntakeBody, type IntakeCheck, type IntakeNext, type StartBody, type StartResult } from '../types'
import { CheckRows, Icon } from '../ui'
import type { ViewProps } from './props'

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,39}$/
export const REVIEW_HINT = '这些没打码，也不拦开工：可能是人名或密码，也可能只是普通的词。是人名或密码的话，先改原文，再检查一遍。'
export const GATE45 = '个人信息打码：证件号、电话、卡号、邮箱在整份材料里都打码；标签后面、姓名列里的人名只在找到的地方打码；看不准是人名（或密码）还是普通词的不打码，列在「请你确认」里。密钥打码，私钥和云访问密钥整份不收。'
const CLASSES = Object.keys(CLASS_LABEL) as Classification[]

export function NewView({ entry, ...props }: { entry: NewEntry } & ViewProps) {
  const api = useAppApi()
  const navigate = useNavigate()
  const repos = (props.status?.repos ?? []).filter((r) => r.ok)
  const [repoPick, setRepoPick] = useState(entry.repo ?? '')
  const repo = repoPick && (!props.status || repos.some((r) => r.id === repoPick)) ? repoPick : repos[0]?.id ?? ''
  const repoInfo = repos.find((r) => r.id === repo)

  const next = usePoll<IntakeNext>(repo ? paths.intakeNext(repo) : null, 0)
  const crew = usePoll<CrewChecks>(paths.crew(), 0)
  const [crewOk, setCrewOk] = useState('')

  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
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

  const nextKey = next.data && next.data.repo === repo ? next.data.key ?? '' : ''
  const keyValue = keyEdited ? key : nextKey
  const tracker = (next.data?.repo === repo ? next.data.tracker : '') || repoInfo?.kit?.tracker || 'none'

  const body: IntakeBody = {
    repo, key: keyValue.trim(), slug: slug.trim(), title: title.trim(), docs: lines(docs), consent, classification, business, exclude: lines(exclude),
  }
  // what a check is valid for: the IntakeBody only. Expected paths, open_session and trust are not part of the gates,
  // so changing them does not need a new check.
  const print = JSON.stringify(body)

  const [checked, setChecked] = useState<{ print: string; result: IntakeCheck } | null>(null)
  const check = useAction((b: IntakeBody) => api.post<IntakeCheck>(paths.intakeCheck(), b))
  const start = useAction((b: StartBody) => api.post<StartResult>(paths.intakeStart(), b))
  const started = start.result

  const runCheck = async () => {
    const at = print
    setChecked(null)
    const r = await check.run(body)
    if (r) setChecked({ print: at, result: r })
  }
  const runStart = async () => {
    const r = await start.run({ ...body, paths: splitPaths(expected), open_session: openSession, trust })
    if (r) props.reloadStatus()
  }

  const slugBad = slug.trim() !== '' && !SLUG_RE.test(slug.trim())
  const keyBad = keyValue.trim() !== '' && !KEY_RE.test(keyValue.trim())
  const keyMissing = tracker === 'jira' && keyValue.trim() === ''
  const clean = (c: IntakeCheck) => c.ok && c.blocking.length === 0 && !c.error
  const why = !repo ? '先选一个仓库'
    : !body.title ? '先写标题'
      : !SLUG_RE.test(body.slug) ? 'slug 不对'
        : keyMissing ? '这个仓库用 Jira：要填需求号'
          : keyBad ? '需求号的格式不对'
            : started?.ok ? '已经开工了'
              : body.docs.length === 0 ? ''
                : !checked ? '有文档：先检查一遍（不写入）'
                  : checked.print !== print ? '表单改过了：再检查一遍'
                    : !clean(checked.result) ? '检查没过：先处理红色的几行'
                      : ''
  const canStart = why === '' && !start.busy
  const canCheck = !!repo && body.docs.length > 0 && !check.busy

  const crewRows = crew.data?.rows.filter((r) => r.level === 'FAIL' || r.level === 'WARN') ?? []
  const onFixed = (rows: CrewChecks['rows']) => {
    if (crew.data) crew.set({ ...crew.data, rows })
    setCrewOk(rows.some((r) => r.level === 'FAIL' || r.level === 'WARN') ? '' : 'KiroCrew 的检查都过了。')
    props.reloadStatus()
  }

  const c = checked?.result ?? null
  return (
    <main className="br-view" data-testid="br-new">
      <h2>开需求</h2>
      {crew.error && <p className="br-note">读不到 KiroCrew 的检查：{crew.error}</p>}
      {crewRows.length > 0 && crew.data && (
        <section className="br-card is-bad" aria-label="KiroCrew 的检查">
          <header><h3>开会话之前，KiroCrew 这边要先处理</h3></header>
          <CheckRows rows={crew.data.rows} only={['FAIL', 'WARN']} fix={crew.data.fix} onFixed={onFixed} />
        </section>
      )}
      {crewOk && <div className="br-banner is-ok" role="status">{crewOk}</div>}
      {props.status && repos.length === 0 && (
        <div className="br-banner is-error" role="alert">
          <div className="br-row">
            <span>没有能用的仓库。</span>
            <button type="button" className="br-btn is-small" onClick={() => props.go({ kind: 'settings' })}>去设置</button>
          </div>
        </div>
      )}

      <form className="br-form" aria-label="开需求" onSubmit={(e) => e.preventDefault()}>
        <section className="br-card" aria-label="需求">
          <header><h3>需求</h3></header>
          <div className="br-field">
            <label htmlFor="new-repo">仓库</label>
            <select id="new-repo" value={repo} onChange={(e) => {
              setRepoPick(e.target.value)
              setKeyEdited(false)
              setKey('')
              props.replace({ kind: 'new', repo: e.target.value })
            }}>
              {repos.map((r) => <option key={r.id} value={r.id}>{r.name}（{r.id}）</option>)}
            </select>
          </div>
          <div className="br-field">
            <label htmlFor="new-title">标题</label>
            <input id="new-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="br-field">
            <label htmlFor="new-slug">slug</label>
            <input id="new-slug" type="text" value={slug} aria-invalid={slugBad ? true : undefined} aria-describedby="new-slug-hint"
              onChange={(e) => setSlug(e.target.value)} />
            <p className="br-hint" id="new-slug-hint">用在分支名里：英文小写、数字和 -，比如 merchant-weekly</p>
            {slugBad && <p className="br-error" role="alert">slug 只能用英文小写、数字和 -，开头不能是 -，最多 40 个字。</p>}
          </div>
          <div className="br-field">
            <label htmlFor="new-key">需求号</label>
            <input id="new-key" type="text" value={keyValue} aria-invalid={keyBad || keyMissing ? true : undefined}
              onChange={(e) => {
                setKey(e.target.value)
                setKeyEdited(true)
              }} />
            <p className="br-hint">
              {tracker === 'jira' ? '这个仓库用 Jira：填 Jira 上的需求号（必填）。' : '不填就用下一个空号。'}
              {nextKey && !keyEdited ? `下一个空号是 ${nextKey}。` : ''}
            </p>
            {next.error && <p className="br-note">读不到下一个空号：{next.error}</p>}
            {next.data?.error && <p className="br-note">{next.data.error}</p>}
            {keyBad && <p className="br-error" role="alert">需求号的格式像 PAY-12。</p>}
          </div>
          <div className="br-field">
            <label htmlFor="new-paths">预计会改的路径（用逗号、空格或换行分开）</label>
            <textarea id="new-paths" rows={3} value={expected} placeholder="src/refund/" onChange={(e) => setExpected(e.target.value)} />
            <p className="br-hint">用来提醒和别的需求改到同一处。</p>
          </div>
        </section>

        <section className="br-card" aria-label="文档">
          <header><h3>文档过五关</h3></header>
          <div className="br-field">
            <label htmlFor="new-docs">文档（一行一个路径）</label>
            <textarea id="new-docs" rows={3} value={docs} placeholder="/Users/alice/Downloads/结算周报需求" onChange={(e) => setDocs(e.target.value)} />
            <p className="br-hint">这台机器上的文件或文件夹，飞书 / Lark 导出的文件夹也行。原件不进任何仓库。</p>
            {body.docs.length === 0 && <p className="br-hint">没有文档时下面几关不用填，也不用检查。</p>}
          </div>
          <fieldset className="br-fieldset">
            <legend>第 1 关：同意</legend>
            <label className="br-check">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>我是作者，或已取得作者同意</span>
            </label>
          </fieldset>
          <fieldset className="br-fieldset">
            <legend>第 2 关：密级</legend>
            <div className="br-row">
              {CLASSES.map((k) => (
                <label key={k} className="br-check">
                  <input type="radio" name="new-class" value={k} checked={classification === k} onChange={() => setClassification(k)} />
                  <span>{CLASS_LABEL[k]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="br-fieldset">
            <legend>第 3 关：金额、公司名、合同号</legend>
            <div className="br-row">
              <label className="br-check">
                <input type="radio" name="new-business" value="keep" checked={business === 'keep'} onChange={() => setBusiness('keep')} />
                <span>原样保留</span>
              </label>
              <label className="br-check">
                <input type="radio" name="new-business" value="mask" checked={business === 'mask'} onChange={() => setBusiness('mask')} />
                <span>换成占位符</span>
              </label>
            </div>
          </fieldset>
          <fieldset className="br-fieldset">
            <legend>第 4、5 关：自动</legend>
            <p className="br-note">{GATE45}</p>
          </fieldset>
          <div className="br-field">
            <label htmlFor="new-exclude">不收这些文件（glob，一行一个）</label>
            <textarea id="new-exclude" rows={2} value={exclude} placeholder="*合作方*" onChange={(e) => setExclude(e.target.value)} />
          </div>
          <div className="br-row">
            <button type="button" className="br-btn" disabled={!canCheck} onClick={() => void runCheck()}>
              <Icon name="SearchCheck" size={14} />{check.busy ? '正在检查…' : '先检查（不写入）'}
            </button>
            {checked && checked.print !== print && <span className="br-hint">表单改过了，这次检查不算数了。</span>}
          </div>
          {check.error && <p className="br-error" role="alert">{check.error}</p>}
          {c && <CheckResult c={c} />}
        </section>

        <section className="br-card" aria-label="开工">
          <header><h3>开工</h3></header>
          <label className="br-check">
            <input type="checkbox" checked={openSession} onChange={(e) => setOpenSession(e.target.checked)} />
            <span>开工后在这个需求的目录里开一个 brain-dev 会话</span>
          </label>
          <label className="br-check">
            <input type="checkbox" checked={trust} disabled={!openSession} onChange={(e) => setTrust(e.target.checked)} />
            <span>这个会话的工具调用不用逐个批准</span>
          </label>
          <div className="br-row">
            <button type="button" className="br-btn is-primary" disabled={!canStart} onClick={() => void runStart()}>
              <Icon name="Rocket" size={14} />{start.busy ? '正在开工…' : '开工'}
            </button>
            {why && <span className="br-hint" data-testid="start-why">{why}</span>}
          </div>
          {start.error && <p className="br-error" role="alert">{start.error}</p>}
          {started && <StartOut r={started} repo={repo} onOpen={navigate} onItem={(k) => props.go({ kind: 'item', repo, key: k })} />}
        </section>
      </form>
    </main>
  )
}

/**
 * A dry run's answer: 请你确认 (brain-kit's review findings, per file), brain-kit's findings verbatim, the gates that
 * would stop (red), the files refused, the summary.
 */
function CheckResult({ c }: { c: IntakeCheck }) {
  const extraBlocking = c.blocking.filter((b) => !c.findings.includes(b))
  const passed = c.ok && c.blocking.length === 0 && !c.error
  return (
    <div className="br-stack" data-testid="check-result">
      {c.error && <p className="br-error br-pre" role="alert">{c.error}</p>}
      {c.review.length > 0 && (
        <div className="br-stack" style={{ gap: 4 }} data-testid="review">
          <b className="br-strong">请你确认</b>
          <ul className="br-list br-warn-text">{c.review.map((r, i) => <li key={i}>{r}</li>)}</ul>
          <p className="br-hint">{REVIEW_HINT}</p>
        </div>
      )}
      {(c.findings.length > 0 || extraBlocking.length > 0) && (
        <div className="br-findings" data-testid="findings">
          {c.findings.map((l, i) => <div key={`f${i}`} className={c.blocking.includes(l) ? 'is-blocking' : undefined}>{l}</div>)}
          {extraBlocking.map((l, i) => <div key={`b${i}`} className="is-blocking">{l}</div>)}
        </div>
      )}
      {c.refused.length > 0 && (
        <div>
          <b className="br-strong">没收的文件</b>
          <ul className="br-list">
            {c.refused.map((r) => <li key={r.id}><span className="br-mono">{r.id}</span> {r.name}：{r.reason}</li>)}
          </ul>
        </div>
      )}
      {!c.error && (
        <p className="br-note" data-testid="check-summary">
          文档包 {c.package ?? '—'} · 密级 {c.classification ?? '—'} · {c.sources} 份来源 · {c.segments} 段{c.key ? ` · ${c.key}` : ''}
        </p>
      )}
      {passed ? <p className="br-ok-text" role="status">检查过了：可以开工。</p>
        : !c.error && <p className="br-bad-text" role="status">有关卡没过：先处理红色的几行。</p>}
    </div>
  )
}

function StartOut({ r, repo, onOpen, onItem }: { r: StartResult; repo: string; onOpen: (url: string) => void; onItem: (key: string) => void }) {
  return (
    <div className="br-stack" data-testid="start-result">
      <p className={r.ok ? 'br-ok-text' : 'br-error'} role="status">{r.ok ? '开工了。' : '没开成，看下面的输出。'}</p>
      {r.output && <pre className="br-findings">{r.output}</pre>}
      <dl className="br-facts">
        <dt>需求号</dt><dd className="br-mono">{r.key ?? '—'}</dd>
        <dt>分支</dt><dd className="br-mono">{r.branch ?? '—'}</dd>
        <dt>工作目录</dt><dd className="br-mono">{r.worktree ?? '—'}</dd>
        {r.intent && <><dt>Lean intent</dt><dd className="br-mono">{r.intent}</dd></>}
      </dl>
      <div className="br-row">
        {r.url && (
          <button type="button" className="br-btn is-primary" onClick={() => onOpen(r.url as string)}>
            <Icon name="MessageSquare" size={14} />打开会话
          </button>
        )}
        {r.key && repo && <button type="button" className="br-link" onClick={() => onItem(r.key as string)}>看这个需求</button>}
      </div>
      {!r.url && r.session_error && <p className="br-error br-pre" role="alert">会话没开成：{r.session_error}</p>}
    </div>
  )
}
