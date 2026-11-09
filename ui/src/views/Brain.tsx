/**
 * Brain: the shared knowledge on the default branch (brain/PRODUCT.md, TECH.md, IMPROVEMENT.md, PROJECT.md) of one
 * repo, read from GET /brain. A tab per file, its sections and entries (text filter, type filter); the entry the URL
 * names (`id`) is picked out and scrolled to. Beside it: brain lint's findings, how useful the entries are (usage), and
 * reflect — a finished run's proposals previewed, then written to a new branch (and an MR) after a confirm step.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppApi } from '@kirocrew/app-sdk'
import { paths, useAction, usePoll } from '../api'
import { useReducedMotion } from '../hooks'
import { fileOfEntry, type BrainEntryRef, type BrainFile } from '../nav'
import { STATE_LABEL, type BrainEntry, type BrainFileView, type BrainView, type ReflectApplyBody, type ReflectApplyResult, type ReflectPreview } from '../types'
import { Icon, LoadState, Rate } from '../ui'
import type { ViewProps } from './props'

const FILE_LABEL: Record<string, string> = { PRODUCT: '产品', TECH: '技术', IMPROVEMENT: '改进', PROJECT: '项目' }
export const TYPE_LABEL: Record<string, string> = {
  principle: '原则', correction: '纠正', decision: '决定', model: '模型', guideline: '准则', pitfall: '坑', process: '流程',
}
const SIDE_LABEL: Record<string, string> = { product: '产品', builder: '开发', shared: '共用' }
const REL_LABEL: Record<string, string> = { new: '新', same: '只加来源', 'adds-to': '补充', replaces: '取代', repeats: '又出现', withdraws: '撤回' }
const relLabel = (rel: string) => {
  const [head, ...rest] = rel.split(' ')
  return REL_LABEL[head] ? [REL_LABEL[head], ...rest].join(' ') : rel
}

const hasEntry = (f: BrainFileView, id: string) => f.sections.some((s) => s.entries.some((e) => e.id === id))

function matches(e: BrainEntry, text: string, type: string): boolean {
  if (type && e.type !== type) return false
  if (!text) return true
  const t = text.toLowerCase()
  return [e.id, e.text, e.type, e.side, ...e.src].some((x) => x.toLowerCase().includes(t))
}

export function BrainPage({ entry, ...props }: { entry: BrainEntryRef } & ViewProps) {
  const api = useAppApi()
  const reduced = useReducedMotion()
  const repos = (props.status?.repos ?? []).filter((r) => r.ok)
  const [repoPick, setRepoPick] = useState(entry.repo ?? '')
  const repo = repoPick && (!props.status || repos.some((r) => r.id === repoPick)) ? repoPick : repos[0]?.id ?? ''
  const brain = usePoll<BrainView>(repo ? paths.brain(repo) : null, props.pollMs ?? 0)
  const data = brain.data

  const [filePick, setFilePick] = useState<BrainFile | undefined>(entry.file ?? (entry.id ? fileOfEntry(entry.id) : undefined))
  const [id, setId] = useState<string | undefined>(entry.id)
  const [reflectPick, setReflectPick] = useState<string | undefined>(entry.reflect)
  const [text, setText] = useState('')
  const [type, setType] = useState('')

  const file: BrainFileView | undefined = data
    ? data.files.find((f) => f.key === filePick) ?? (id ? data.files.find((f) => hasEntry(f, id)) : undefined) ?? data.files[0]
    : undefined
  const reflectKey = reflectPick && data?.reflect.some((r) => r.key === reflectPick) ? reflectPick : data?.reflect[0]?.key

  const write = (patch: Partial<BrainEntryRef>) => {
    const v = { repo: repo || undefined, file: (file?.key as BrainFile | undefined) ?? filePick, id, reflect: reflectPick, ...patch }
    props.replace({ kind: 'brain', ...v })
  }
  const pickRepo = (r: string) => {
    setRepoPick(r)
    setId(undefined)
    setReflectPick(undefined)
    setFilePick(undefined)
    props.replace({ kind: 'brain', repo: r })
  }
  const pickFile = (f: BrainFile) => {
    setFilePick(f)
    setType('')
    const keep = id && fileOfEntry(id) === f ? id : undefined
    setId(keep)
    write({ file: f, id: keep })
  }
  /** pick out an entry (a chip in usage or the per-run table): its file, highlighted, scrolled to */
  const pickEntry = (eid: string) => {
    const f = (data?.files.find((x) => hasEntry(x, eid))?.key as BrainFile | undefined) ?? fileOfEntry(eid)
    setFilePick(f)
    setId(eid)
    write({ file: f, id: eid })
  }

  // the entry picked out is scrolled into view once (per id), once it is on the page
  const rootRef = useRef<HTMLElement | null>(null)
  const scrolled = useRef<string | null>(null)
  useEffect(() => {
    if (!id || !data || scrolled.current === id) return
    const el = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[data-entry-id]') ?? []).find((x) => x.dataset.entryId === id)
    if (!el) return
    scrolled.current = id
    el.scrollIntoView?.({ behavior: reduced ? 'auto' : 'smooth', block: 'center' })
  }, [id, data, file?.key, reduced])

  const shown = useMemo(() => {
    if (!file) return []
    return file.sections
      .map((s) => ({ title: s.title, entries: s.entries.filter((e) => e.id === id || matches(e, text.trim(), type)) }))
      .filter((s) => s.entries.length > 0)
  }, [file, id, text, type])
  const total = file ? file.sections.reduce((n, s) => n + s.entries.length, 0) : 0
  const showing = shown.reduce((n, s) => n + s.entries.length, 0)
  const idMissing = !!(id && data && !data.files.some((f) => hasEntry(f, id)))

  return (
    <main className="br-view" data-testid="br-brain" ref={rootRef}>
      <div className="br-row">
        <h2>Brain</h2>
        <label className="br-row br-small" htmlFor="brain-repo" style={{ gap: 6 }}>
          <span className="br-dim">仓库</span>
          <select id="brain-repo" value={repo} onChange={(e) => pickRepo(e.target.value)}>
            {repos.map((r) => <option key={r.id} value={r.id}>{r.name}（{r.id}）</option>)}
          </select>
        </label>
        {data?.ref && <span className="br-dim br-small">读的是 <span className="br-mono">{data.ref}</span></span>}
        <span className="br-grow" />
        <button type="button" className="br-btn is-small" onClick={brain.reload} disabled={!repo}>
          <Icon name="RefreshCw" size={13} />重新读取
        </button>
      </div>
      {props.status && repos.length === 0 && <div className="br-banner is-error" role="alert">没有能用的仓库：去设置里加一个。</div>}
      <LoadState loading={brain.loading} error={brain.error} has={!!data} />
      {data?.error && <div className="br-banner is-error" role="alert">{data.error}</div>}

      {data && (
        <>
          <div className="br-files" role="group" aria-label="Brain 文件">
            {data.files.map((f) => (
              <button key={f.key} type="button" className="br-btn" aria-pressed={file?.key === f.key} onClick={() => pickFile(f.key as BrainFile)}>
                {f.key} <span className="br-dim">{FILE_LABEL[f.key] ?? f.letter}</span> <b className="br-strong">{f.count}</b>
              </button>
            ))}
          </div>

          {file && (
            <section className="br-card" aria-label={`${file.key}.md`}>
              <header>
                <h3>{file.key}.md</h3>
                <span className="br-dim br-small">{SIDE_LABEL[file.side] ?? file.side} · 显示 {showing}/{total} 条</span>
              </header>
              <div className="br-row">
                <label className="br-sr" htmlFor="brain-text">按文字筛</label>
                <input id="brain-text" type="text" placeholder="按 id、文字、来源筛" value={text} onChange={(e) => setText(e.target.value)} />
                <label className="br-sr" htmlFor="brain-type">按类型筛</label>
                <select id="brain-type" value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="">全部类型</option>
                  {file.types.map((t) => <option key={t} value={t}>{TYPE_LABEL[t] ?? t}（{t}）</option>)}
                </select>
              </div>
              {idMissing && <p className="br-note">Brain 里没有 <span className="br-mono">{id}</span>：可能已经撤回、归档，或者写错了。</p>}
              {shown.length === 0 && <p className="br-empty">{total ? '没有符合筛选的条目。' : '这个文件还没有条目。'}</p>}
              {shown.map((s, i) => (
                <div key={`${s.title}-${i}`} className="br-section">
                  <h3>{s.title}</h3>
                  {s.entries.map((e) => <EntryCard key={e.id} e={e} hl={e.id === id} />)}
                </div>
              ))}
            </section>
          )}

          <div className="br-cards">
            <LintCard lint={data.lint} />
            <UsageCard usage={data.usage} onEntry={pickEntry} onItem={(key) => props.go({ kind: 'item', repo, key, from: 'brain' })} />
          </div>
          <ReflectCard
            key={repo}
            repo={repo}
            items={data.reflect}
            pick={reflectKey}
            onPick={(k) => {
              setReflectPick(k)
              write({ reflect: k })
            }}
            onItem={(key) => props.go({ kind: 'item', repo, key, from: 'brain' })}
            onApplied={brain.reload}
            post={{
              preview: (key) => api.post<ReflectPreview>(paths.reflectPreview(), { repo, key }),
              apply: (body) => api.post<ReflectApplyResult>(paths.reflectApply(), body),
            }}
          />
        </>
      )}
    </main>
  )
}

function EntryCard({ e, hl }: { e: BrainEntry; hl: boolean }) {
  return (
    <article className={`br-entry${hl ? ' is-hl' : ''}`} data-entry-id={e.id} aria-current={hl ? 'true' : undefined} aria-label={e.id}>
      <div className="br-row">
        <b className="br-key">{e.id}</b>
        <span className="br-chip tone-info" title={e.type}>{TYPE_LABEL[e.type] ?? e.type}</span>
        <span className="br-tag">{SIDE_LABEL[e.side] ?? e.side}</span>
        <span className="br-tag" title={e.rel}>{relLabel(e.rel)}</span>
        {e.repeats > 0 && <span className={`br-chip tone-${e.repeats >= 2 ? 'bad' : 'warn'}`}>重复 {e.repeats} 次</span>}
        {e.candidate && <span className="br-chip tone-warn" title="被够多的运行加载过，一次也没被引用">撤回候选</span>}
      </div>
      <p className="br-text">{e.text}</p>
      <div className="br-row br-small br-dim">
        {e.src.length > 0 && (
          <span className="br-row" style={{ gap: 4 }}>
            来源 {e.src.map((s) => <span key={s} className="br-tag br-mono">{s}</span>)}
          </span>
        )}
        <span>引用 {e.cites} 次（{e.runs} 次运行）· 被 {e.loaded_by} 次运行加载</span>
      </div>
    </article>
  )
}

function LintCard({ lint }: { lint: BrainView['lint'] }) {
  const clean = lint.errors.length === 0 && lint.warnings.length === 0
  return (
    <section className={`br-card${lint.errors.length ? ' is-bad' : ''}`} aria-label="检查">
      <header><h3>检查（brain lint）</h3></header>
      {clean && <p className="br-ok-text">没有问题。</p>}
      {lint.errors.length > 0 && (
        <ul className="br-list" data-testid="lint-errors">
          {lint.errors.map((x, i) => <li key={i} className="br-bad-text br-pre">{x}</li>)}
        </ul>
      )}
      {lint.warnings.length > 0 && (
        <ul className="br-list" data-testid="lint-warnings">
          {lint.warnings.map((x, i) => <li key={i} className="br-warn-text br-pre">{x}</li>)}
        </ul>
      )}
    </section>
  )
}

function IdChips({ ids, onEntry, tone = 'idle' }: { ids: string[]; onEntry: (id: string) => void; tone?: string }) {
  if (!ids.length) return <span className="br-dim">—</span>
  return (
    <span className="br-row" style={{ gap: 4 }}>
      {ids.map((x) => <button key={x} type="button" className={`br-chip tone-${tone}`} onClick={() => onEntry(x)}>{x}</button>)}
    </span>
  )
}

function UsageCard({ usage, onEntry, onItem }: { usage: BrainView['usage']; onEntry: (id: string) => void; onItem: (key: string) => void }) {
  return (
    <section className="br-card" aria-label="用处">
      <header><h3>用处</h3></header>
      <dl className="br-facts">
        <dt>知识有用率</dt>
        <dd data-testid="usage-useful"><Rate value={usage.useful} /> <span className="br-hint">加载的条目里被引用的</span></dd>
        <dt>重复纠正率</dt>
        <dd data-testid="usage-repeat"><Rate value={usage.repeat_rate} /> <span className="br-hint">同样的纠正又出现的</span></dd>
        <dt>归档</dt><dd>{usage.archived} 条</dd>
        <dt>清除</dt><dd>{usage.purged} 条</dd>
      </dl>
      {usage.runs.length > 0 && (
        <div className="br-scroll">
          <table className="br-table" aria-label="每次运行">
            <thead><tr><th>需求</th><th>intent</th><th className="is-num">加载</th><th>引用</th><th>过时</th><th>不认识</th></tr></thead>
            <tbody>
              {usage.runs.map((r) => (
                <tr key={`${r.key}-${r.intent}`}>
                  <td><button type="button" className="br-link br-key" onClick={() => onItem(r.key)}>{r.key}</button></td>
                  <td className="br-mono">{r.intent}</td>
                  <td className="is-num">{r.loaded ?? '—'}</td>
                  <td><IdChips ids={r.cited} onEntry={onEntry} tone="ok" /></td>
                  <td><IdChips ids={r.stale} onEntry={onEntry} tone="warn" /></td>
                  <td><IdChips ids={r.unknown} onEntry={onEntry} tone="bad" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="br-row"><span className="br-dim">从没被引用</span><IdChips ids={usage.never_cited} onEntry={onEntry} /></div>
      {usage.repeats_any.length > 0 && (
        <ul className="br-plain" data-testid="usage-repeats">
          {usage.repeats_any.map(([x, n]) => (
            <li key={x} className="br-row">
              <button type="button" className="br-chip tone-idle" onClick={() => onEntry(x)}>{x}</button>
              <span>重复 {n} 次</span>
              {n >= 2 && <span className="br-chip tone-bad">该改成 gate 了</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ReflectCard({ repo, items, pick, onPick, onItem, onApplied, post }: {
  repo: string
  items: BrainView['reflect']
  pick: string | undefined
  onPick: (key: string) => void
  onItem: (key: string) => void
  onApplied: () => void
  post: { preview: (key: string) => Promise<ReflectPreview>; apply: (body: ReflectApplyBody) => Promise<ReflectApplyResult> }
}) {
  const preview = useAction(post.preview)
  const apply = useAction(post.apply)
  const [confirm, setConfirm] = useState<boolean | null>(null) // the push the confirm step is about
  const p = preview.result && preview.result.key === pick ? preview.result : null
  const blocked = !p || p.problems.length > 0 || !!p.error || !p.substantive
  const doApply = async (push: boolean) => {
    if (!pick) return
    const r = await apply.run({ repo, key: pick, push })
    setConfirm(null)
    if (r) onApplied()
  }
  return (
    <section className="br-card" aria-label="回收">
      <header>
        <h3>回收（brain reflect）</h3>
        <span className="br-hint">把一次运行 decisions.md 里的提议写进 Brain：先预览，再写进新分支。</span>
      </header>
      {items.length === 0 ? <p className="br-empty">还没有能回收的运行（要有 decisions.md）。</p> : (
        <div className="br-row">
          <label className="br-sr" htmlFor="reflect-key">选一个需求</label>
          <select id="reflect-key" value={pick ?? ''} onChange={(e) => {
            onPick(e.target.value)
            preview.reset()
            apply.reset()
            setConfirm(null)
          }}>
            {items.map((r) => <option key={r.key} value={r.key}>{r.key} · {r.title} · {STATE_LABEL[r.state] ?? r.state}</option>)}
          </select>
          <button type="button" className="br-btn" disabled={!pick || preview.busy} onClick={() => {
            apply.reset()
            setConfirm(null)
            if (pick) void preview.run(pick)
          }}>
            <Icon name="Eye" size={14} />{preview.busy ? '正在预览…' : '预览'}
          </button>
          {pick && <button type="button" className="br-link" onClick={() => onItem(pick)}>看需求详情</button>}
        </div>
      )}
      {preview.error && <p className="br-error" role="alert">{preview.error}</p>}
      {p && (
        <div className="br-stack" data-testid="reflect-preview">
          {p.source && <p className="br-note">读的是 <span className="br-mono">{p.source}</span></p>}
          {p.error && <p className="br-error br-pre" role="alert">{p.error}</p>}
          {p.ops.length > 0 && (
            <div className="br-scroll">
              <table className="br-table" aria-label="要写的改动">
                <thead><tr><th>动作</th><th>目标</th><th>文件</th><th>类型</th><th>小节</th><th>来源</th><th>文字</th></tr></thead>
                <tbody>
                  {p.ops.map((o, i) => (
                    <tr key={i}>
                      <td><span className="br-tag">{relLabel(o.kind)}</span></td>
                      <td className="br-mono">{o.target ?? '—'}</td>
                      <td>{o.file ?? '—'}</td>
                      <td>{o.type ? TYPE_LABEL[o.type] ?? o.type : '—'}</td>
                      <td>{o.section ?? '—'}</td>
                      <td>{o.src.length ? <span className="br-row" style={{ gap: 4 }}>{o.src.map((s) => <span key={s} className="br-tag br-mono">{s}</span>)}</span> : '—'}</td>
                      <td className="br-pre">{o.text || <span className="br-dim">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {p.ops.length === 0 && !p.error && <p className="br-empty">没有要写的改动。</p>}
          {p.gaps.length > 0 && (
            <div>
              <b className="br-strong">Brain 里缺的</b>
              <ul className="br-list">{p.gaps.map((g, i) => <li key={i}><b>{g.title}</b> <span className="br-tag">{g.kind}</span> {g.what}</li>)}</ul>
            </div>
          )}
          {p.notes.length > 0 && <ul className="br-list br-dim">{p.notes.map((x, i) => <li key={i}>{x}</li>)}</ul>}
          {p.warnings.length > 0 && <ul className="br-list">{p.warnings.map((x, i) => <li key={i} className="br-warn-text">{x}</li>)}</ul>}
          {p.problems.length > 0 && (
            <ul className="br-list" data-testid="reflect-problems">{p.problems.map((x, i) => <li key={i} className="br-bad-text">{x}</li>)}</ul>
          )}
          {!p.substantive && !p.error && <p className="br-note">这次只是给已有条目加来源，不用开分支。</p>}
          <div className="br-row">
            <button type="button" className="br-btn" disabled={blocked || apply.busy} aria-pressed={confirm === false} onClick={() => setConfirm(false)}>
              <Icon name="GitBranch" size={14} />写入新分支
            </button>
            <button type="button" className="br-btn" disabled={blocked || apply.busy} aria-pressed={confirm === true} onClick={() => setConfirm(true)}>
              <Icon name="GitPullRequest" size={14} />写入并开 MR
            </button>
          </div>
          {confirm !== null && !blocked && (
            <div className="br-confirm" role="group" aria-label="确认写入">
              <p className="br-note" style={{ color: 'var(--text)' }}>
                {confirm
                  ? `在 main 上开一个新分支写入 ${pick} 的 ${p.ops.length} 处改动，推到远端并开 MR。你现在的工作目录不动。`
                  : `在 main 上开一个新分支写入 ${pick} 的 ${p.ops.length} 处改动，只在本机，不推。你现在的工作目录不动。`}
              </p>
              <div className="br-row">
                <button type="button" className="br-btn is-primary" disabled={apply.busy} onClick={() => void doApply(confirm)}>{apply.busy ? '正在写…' : '确定写入'}</button>
                <button type="button" className="br-btn" disabled={apply.busy} onClick={() => setConfirm(null)}>取消</button>
              </div>
            </div>
          )}
        </div>
      )}
      {apply.error && <p className="br-error" role="alert">{apply.error}</p>}
      {apply.result && (
        <div className="br-stack" data-testid="reflect-applied">
          <p className={apply.result.ok ? 'br-ok-text' : 'br-error'} role="status">
            {apply.result.ok ? `写好了${apply.result.branch ? `：分支 ${apply.result.branch}` : ''}` : '没写成，看下面的输出。'}
          </p>
          {apply.result.worktree && <p className="br-note" data-testid="reflect-worktree">工作区：<span className="br-mono">{apply.result.worktree}</span></p>}
          {apply.result.output && <pre className="br-findings">{apply.result.output}</pre>}
        </div>
      )}
    </section>
  )
}
