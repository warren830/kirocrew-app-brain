/**
 * Brain: the shared knowledge on the default branch (brain/PRODUCT.md, TECH.md, IMPROVEMENT.md, PROJECT.md) of one
 * repo, read from GET /brain, in the sample board's look. A header (the repo, the branch read, 重新读取); counter cards
 * (条目 per file, 知识有用率, 重复纠正率, 撤回候选 with what to do, Brain 检查); the four files as tabs (产品 技术 改进
 * 项目), each entry a card (type, side, how it relates to another entry, repeats, 撤回候选, sources, how often runs
 * load and cite it; `code` in its text in monospace), filtered by text and type; the entry the URL names (`id`) is
 * picked out and scrolled to. Beside it the Brain's check and what is never cited or keeps coming back; below, every
 * run's use of the Brain (the numbers count the runs merged into the default branch: a run not merged yet is listed on
 * its own, with what 需求详情 says for it), and 回写 as steps: pick a requirement → 预览 → the changes → confirm →
 * written on a new branch (and an MR, linked). An empty Brain says what fills it and leads to 开需求; no repo leads to
 * 导入仓库. Breakpoints follow the view's own width (its root is the `kt-root` container), not the window: inside
 * KiroCrew the dashboard's sidebar takes ~230 px of it.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppApi } from '@kirocrew/app-sdk'
import { paths, useAction, usePoll } from '../api'
import { fmtRate } from '../format'
import { useReducedMotion } from '../hooks'
import { fileOfEntry, type BrainEntryRef, type BrainFile } from '../nav'
import type { BrainEntry, BrainFileView, BrainView, CheckRow, ReflectApplyBody, ReflectApplyResult, ReflectPreview } from '../types'
import { CheckRows, EmptyHero, ExtLink, Icon, Kpi, LoadState, RoleIcon, Segs, StateChip, brainkitProblem, repoLabel, type FlowStep } from '../ui'
import { ACT, GAP_KIND_NAME } from '../vocab'
import type { ViewProps } from './props'

const FILE_LABEL: Record<string, string> = { PRODUCT: '产品', TECH: '技术', IMPROVEMENT: '改进', PROJECT: '项目' }
export const TYPE_LABEL: Record<string, string> = {
  principle: '原则', correction: '纠正', decision: '决定', model: '模型', guideline: '准则', pitfall: '坑', process: '流程',
}
const SIDE_LABEL: Record<string, string> = { product: '产品', builder: '开发', shared: '共用' }
const REL_LABEL: Record<string, string> = { new: '新', same: '只加来源', 'adds-to': '补充', replaces: '取代', repeats: '又出现', withdraws: '撤回' }
/** the relations an entry card shows: one that tells a reader something about the entry (not 新, not 只加来源) */
const REL_ON_CARD = new Set(['adds-to', 'replaces', 'repeats', 'withdraws'])
const REL_TONE: Record<string, string> = { new: 'ok', same: 'idle', 'adds-to': 'info', replaces: 'warn', repeats: 'warn', withdraws: 'bad' }
const relLabel = (rel: string) => {
  const [head, ...rest] = rel.split(' ')
  return REL_LABEL[head] ? [REL_LABEL[head], ...rest].join(' ') : rel
}
const relTone = (rel: string) => REL_TONE[rel.split(' ')[0]] ?? 'idle'

const hasEntry = (f: BrainFileView, id: string) => f.sections.some((s) => s.entries.some((e) => e.id === id))
const entriesOf = (f: BrainFileView) => f.sections.flatMap((s) => s.entries)

function matches(e: BrainEntry, text: string, type: string): boolean {
  if (type && e.type !== type) return false
  if (!text) return true
  const t = text.toLowerCase()
  return [e.id, e.text, e.type, e.side, ...e.src].some((x) => x.toLowerCase().includes(t))
}

/** brain lint's findings as problem rows: the errors (FAIL), then the warnings (WARN). */
const lintRows = (lint: BrainView['lint']): CheckRow[] => [...lint.errors, ...lint.warnings]

/** An entry's text with its `code` spans in monospace (plain text otherwise: never rendered as HTML). */
export function InlineCode({ text }: { text: string }) {
  const parts = text.split(/(`[^`\n]+`)/)
  return <>{parts.map((x, i) => (x.length > 2 && x.startsWith('`') && x.endsWith('`') ? <code key={i} className="bv-code">{x.slice(1, -1)}</code> : x))}</>
}

/** What fills an empty Brain. */
const FILL_FLOW: FlowStep[] = [
  { icon: 'release', title: '做完一个需求', text: 'AI 记下决定和学到的' },
  { icon: 'merge', title: '合并', text: '进默认分支' },
  { icon: 'brain', title: '回写', text: '先预览，再写进新分支' },
  { icon: 'laptop', title: '下一次用上', text: '运行加载它，用上了就引用' },
]

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
  const openItem = (key: string) => props.go({ kind: 'item', repo, key, from: 'brain' })
  const repoInfo = repos.find((r) => r.id === repo)
  const branch = repoInfo?.kit?.default_branch || (data?.ref && data.ref !== '工作区' ? data.ref.split('@')[0] : '') || 'main'

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
  const total = file ? entriesOf(file).length : 0
  const showing = shown.reduce((n, s) => n + s.entries.length, 0)
  const idMissing = !!(id && data && !data.files.some((f) => hasEntry(f, id)))
  const empty = !!data && data.files.every((f) => entriesOf(f).length === 0)
  const lint = data ? lintRows(data.lint) : []

  const reflect = data && (
    <ReflectCard
      key={repo}
      repo={repo}
      branch={branch}
      items={data.reflect}
      pick={reflectKey}
      onPick={(k) => {
        setReflectPick(k)
        write({ reflect: k })
      }}
      onItem={openItem}
      onApplied={brain.reload}
      post={{
        preview: (key) => api.post<ReflectPreview>(paths.reflectPreview(), { repo, key }),
        apply: (body) => api.post<ReflectApplyResult>(paths.reflectApply(), body),
      }}
    />
  )

  return (
    <main className="kt-root br-view bv-root" data-testid="br-brain" ref={rootRef}>
      <style>{BV_CSS}</style>
      <header className="bv-top">
        <RoleIcon role="brain" size={26} className="bv-top-icon" />
        <div className="br-view-head">
          <h2>Brain</h2>
          <p>仓库里的共享知识：运行加载它，用上了就引用</p>
        </div>
        <span className="br-grow" />
        {repos.length > 0 && (
          <>
            <label className="bv-repo" htmlFor="brain-repo">
              <span className="br-dim">仓库</span>
              <select id="brain-repo" value={repo} onChange={(e) => pickRepo(e.target.value)}>
                {repos.map((r) => <option key={r.id} value={r.id}>{repoLabel(r, repos)}</option>)}
              </select>
            </label>
            {data?.ref && <span className="bv-ref" title={`Brain 读的是默认分支上的这个版本：${data.ref}`}>读的是 <code>{data.ref.split('@')[0]}</code></span>}
            <button type="button" className="br-btn" onClick={brain.reload} disabled={!repo}>
              <Icon name="RefreshCw" size={14} />重新读取
            </button>
          </>
        )}
      </header>
      {props.status && repos.length === 0 && props.status.repos.length > 0 && (props.status.brainkit.ok ? (
        <EmptyHero testid="repos-unusable" title="列表里的仓库现在都读不了"
          text={props.status.repos.map((r) => `${r.name}：${r.pending ? r.pending.text : r.error || '读不了'}`)}
          punch="按上面的提示修好以后，这里就能看到它的 Brain。">
          <button type="button" className="br-btn is-primary is-big" onClick={() => props.go({ kind: 'import' })}>
            <RoleIcon role="import" size={17} />去导入仓库检查
          </button>
        </EmptyHero>
      ) : (
        <NoKit status={props.status} onSettings={() => props.go({ kind: 'settings' })} />
      ))}
      {props.status && props.status.repos.length === 0 && (
        <EmptyHero testid="import-cta" label="导入仓库" title="还没有能用的仓库"
          text={['Brain 是一个仓库里大家共用的知识：做需求时定下的原则、决定和踩过的坑。每次运行会加载它，用上了就引用。']}
          punch="先导入一个仓库，这里就能看到它的 Brain。">
          <button type="button" className="br-btn is-primary is-big" onClick={() => props.go({ kind: 'import' })}>
            <RoleIcon role="import" size={17} />导入仓库
          </button>
        </EmptyHero>
      )}
      <LoadState loading={brain.loading} error={brain.error} has={!!data} />
      {data?.error && <div className="br-banner is-error" role="alert">{data.error}</div>}

      {data && empty && (
        <>
          <EmptyHero
            testid="brain-empty"
            title="Brain 还是空的"
            text={[data.reflect.length
              ? '下面「回写」里有做完的需求：把那次运行里 AI 提议的知识（原则、决定、踩过的坑）写进这个仓库的 Brain，写在一个新分支上，开 MR 给大家看过再合并。'
              : '这个仓库还没有能回写的需求。开一个需求做完、合并以后，在这一页「回写」：把那次运行里 AI 提议的知识（原则、决定、踩过的坑）写进 Brain。']}
            punch="写进去的条目，下一次运行会加载；用上了就引用，这里都看得到。"
            flow={FILL_FLOW}
          >
            {data.reflect.length > 0 && (
              <button type="button" className="br-btn is-primary is-big" onClick={() => rootRef.current?.querySelector('[aria-label="回写"]')?.scrollIntoView?.({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })}>
                <RoleIcon role="brain" size={17} />去回写
              </button>
            )}
            <button type="button" className={`br-btn is-big${data.reflect.length ? '' : ' is-primary'}`} onClick={() => props.go({ kind: 'new', repo })}>
              <RoleIcon role="new" size={17} />去开需求
            </button>
          </EmptyHero>
          {lint.length > 0 && <LintCard rows={lint} />}
          {reflect}
        </>
      )}

      {data && !empty && (
        <>
          <BrainKpis data={data} lint={lint} branch={branch} onEntry={pickEntry} />
          <div className="bv-main">
            <div className="bv-col">
              <div className="bv-tabs" role="group" aria-label="Brain 文件">
                {data.files.map((f) => (
                  <button key={f.key} type="button" className={`bv-tab is-${f.key}`} aria-pressed={file?.key === f.key} onClick={() => pickFile(f.key as BrainFile)}
                    title={`brain/${f.key}.md`} aria-label={`${FILE_LABEL[f.key] ?? f.key} ${f.count}`}>
                    <b className="bv-letter" aria-hidden="true">{f.letter}</b>
                    <span className="bv-tab-name">{FILE_LABEL[f.key] ?? f.key}</span>
                    <span className="bv-tab-n">{f.count}</span>
                  </button>
                ))}
              </div>

              {file && (
                <section className={`br-card bv-file is-${file.key}`} aria-label={`${FILE_LABEL[file.key] ?? file.key}知识`}>
                  <header>
                    <h3>{FILE_LABEL[file.key] ?? file.key}知识</h3>
                    <code className="br-dim br-small">brain/{file.key}.md</code>
                    <span className="br-tag">{SIDE_LABEL[file.side] ?? file.side}</span>
                    <span className="br-grow" />
                    <span className="br-dim br-small">显示 {showing}/{total} 条</span>
                  </header>
                  <div className="bv-filter">
                    <label className="bv-search" htmlFor="brain-text">
                      <span className="br-sr">按文字筛</span>
                      <Icon name="Search" size={14} />
                      <input id="brain-text" type="text" placeholder="按 id、文字、来源筛" value={text} onChange={(e) => setText(e.target.value)} />
                    </label>
                    <TypeChips file={file} type={type} onType={setType} />
                  </div>
                  {idMissing && <p className="br-note">Brain 里没有 <span className="br-mono">{id}</span>：可能已经撤回、归档，或者写错了。</p>}
                  {shown.length === 0 && <p className="br-empty">{total ? '没有符合筛选的条目。' : '这个文件还没有条目。'}</p>}
                  {shown.map((s, i) => (
                    <div key={`${s.title}-${i}`} className="bv-sec">
                      {s.title && <h4>{s.title} <span className="br-dim">{s.entries.length}</span></h4>}
                      <div className="bv-entries">
                        {s.entries.map((e) => <EntryCard key={e.id} e={e} hl={e.id === id} />)}
                      </div>
                    </div>
                  ))}
                </section>
              )}
            </div>
            <div className="bv-col">
              <LintCard rows={lint} />
              <UsageCard usage={data.usage} onEntry={pickEntry} />
            </div>
          </div>
          <RunsCard runs={data.usage.runs} unmerged={data.usage.unmerged ?? []} branch={branch} onEntry={pickEntry} onItem={openItem} />
          {reflect}
        </>
      )}
    </main>
  )
}

/** No repo readable because brain-kit cannot be used: that one cause once (the banner above says what to do), the
 * repos with a cause of their own, and the same way on as the banner. */
function NoKit({ status, onSettings }: { status: NonNullable<ViewProps['status']>; onSettings: () => void }) {
  const p = brainkitProblem(status.brainkit.error)
  const waiting = status.repos.filter((r) => !r.pending && /没装载/.test(r.error))
  const own = status.repos.filter((r) => !waiting.includes(r))
  return (
    <EmptyHero testid="repos-unusable" title={`${p.text}：这里还看不了 Brain`}
      text={[
        `${waiting.length === status.repos.length ? '列表里的 ' : ''}${waiting.length} 个仓库的 Brain 都要 brain-kit 才读得出来。`,
        ...own.map((r) => `${r.name}：${r.pending ? r.pending.text : r.error || '读不了'}`),
      ]}
      punch={p.kind === 'missing' ? '写对 brain-kit 的位置以后，这里就能看到它们的 Brain。' : 'brain-kit 修好以后，这里就能看到它们的 Brain。'}>
      <button type="button" className="br-btn is-primary is-big" onClick={onSettings}>
        <RoleIcon role="settings" size={17} />{p.kind === 'missing' ? '去填位置' : '去设置'}
      </button>
    </EmptyHero>
  )
}

// ---------------------------------------------------------------- the counter cards

function BrainKpis({ data, lint, branch, onEntry }: { data: BrainView; lint: CheckRow[]; branch: string; onEntry: (id: string) => void }) {
  const total = data.files.reduce((n, f) => n + entriesOf(f).length, 0)
  const candidates = data.files.flatMap(entriesOf).filter((e) => e.candidate)
  const errors = lint.filter((r) => r.level === 'FAIL').length
  const warns = lint.filter((r) => r.level === 'WARN').length
  const u = data.usage
  return (
    <div className="br-kpis bv-kpis" role="group" aria-label="指标">
      <Kpi label="条目" value={total} of="条" testid="kpi-entries">
        <FileBar files={data.files} total={total} />
      </Kpi>
      <Kpi label="知识有用率" value={fmtRate(u.useful).pct} of={fmtRate(u.useful).frac} note={`现有条目里被引用过的 · 只算合并进 ${branch} 的运行`} testid="usage-useful">
        <RateCells rate={u.useful} hit="pass" label="用上的" />
      </Kpi>
      <Kpi label="重复纠正率" value={fmtRate(u.repeat_rate).pct} of={fmtRate(u.repeat_rate).frac} note="同样的纠正又出现的" testid="usage-repeat">
        <RateCells rate={u.repeat_rate} hit="fail" label="又出现的" />
      </Kpi>
      <Kpi label="撤回候选" value={candidates.length} of="条" testid="kpi-candidates"
        note={candidates.length ? undefined : `没有 · 已归档 ${u.archived} · 已清除 ${u.purged}`}>
        {candidates.length > 0 && (
          <>
            <IdChips ids={candidates.map((e) => e.id)} onEntry={onEntry} tone="warn" />
            <div className="br-kpi-note">加载够多次，从没被引用</div>
            <p className="bv-do"><b>做什么</b>{CANDIDATE_DO}</p>
          </>
        )}
      </Kpi>
      <Kpi label="Brain 检查" value={errors} of="个错" tone={errors ? 'bad' : warns ? undefined : 'ok'} testid="kpi-lint"
        note={errors || warns ? `${warns} 个提醒` : '全过'}>
        {lint.length > 0 && (
          <div className="kt-segs bv-cells" role="img" aria-label={`${errors} 个错，${warns} 个提醒`}>
            {lint.map((r, i) => <i key={i} className={r.level === 'FAIL' ? 'is-fail' : 'is-warn'} title={r.text} />)}
          </div>
        )}
      </Kpi>
    </div>
  )
}

/** The entries per file as one stacked bar, with its legend. */
function FileBar({ files, total }: { files: BrainFileView[]; total: number }) {
  return (
    <>
      <div className="bv-stack" role="img" aria-label={files.map((f) => `${FILE_LABEL[f.key] ?? f.key} ${entriesOf(f).length}`).join('，')}>
        {files.map((f) => {
          const n = entriesOf(f).length
          return n > 0 ? <i key={f.key} className={`is-${f.key}`} style={{ flexGrow: n }} title={`${FILE_LABEL[f.key] ?? f.key} ${n} 条`} /> : null
        })}
        {total === 0 && <i className="is-none" />}
      </div>
      <div className="cto-legend bv-legend">
        {files.map((f) => (
          <span key={f.key}><i className={`cto-sw is-${f.key}`} aria-hidden="true" />{FILE_LABEL[f.key] ?? f.key} <b>{entriesOf(f).length}</b></span>
        ))}
      </div>
    </>
  )
}

/** a/b as cells (up to 40), else as a bar; *hit* says how the a are drawn. */
function RateCells({ rate: [a, b], hit, label }: { rate: [number, number]; hit: 'pass' | 'fail'; label: string }) {
  if (b <= 0) return <div className="kt-kpi-note">还没有数</div>
  if (b <= 40) {
    return <Segs label={`${a}/${b} ${label}`} cells={Array.from({ length: b }, (_, i) => ({ tone: i < a ? hit : 'idle' as const }))} />
  }
  return (
    <div className={`bv-meter is-${hit}`} role="img" aria-label={`${a}/${b} ${label}`}>
      <i style={{ width: `${Math.round((a / b) * 100)}%` }} />
    </div>
  )
}

function IdChips({ ids, onEntry, tone = 'idle' }: { ids: string[]; onEntry: (id: string) => void; tone?: string }) {
  if (!ids.length) return <span className="br-dim">—</span>
  return (
    <span className="bv-ids">
      {ids.map((x) => <button key={x} type="button" className={`br-chip tone-${tone}`} title="在 Brain 里看这一条" onClick={() => onEntry(x)}>{x}</button>)}
    </span>
  )
}

/** what to do about a withdraw candidate (an entry runs keep loading and never cite) */
export const CANDIDATE_DO = '看一眼还有没有用：没用了，就在下一个需求里让 AI 提议撤回它，回写以后它就从 Brain 里拿掉；还有用就不用管。'

// ---------------------------------------------------------------- the entries

function TypeChips({ file, type, onType }: { file: BrainFileView; type: string; onType: (t: string) => void }) {
  const all = entriesOf(file)
  const present = file.types.filter((t) => all.some((e) => e.type === t))
  const extra = Array.from(new Set(all.map((e) => e.type))).filter((t) => !present.includes(t))
  const types = [...present, ...extra]
  if (types.length < 2) return null
  return (
    <div className="bv-types" role="group" aria-label="按类型筛">
      <button type="button" className="bv-type" aria-pressed={type === ''} onClick={() => onType('')}>全部 <b>{all.length}</b></button>
      {types.map((t) => (
        <button key={t} type="button" className="bv-type" aria-pressed={type === t} title={t} onClick={() => onType(type === t ? '' : t)}>
          {TYPE_LABEL[t] ?? t} <b>{all.filter((e) => e.type === t).length}</b>
        </button>
      ))}
    </div>
  )
}

function EntryCard({ e, hl }: { e: BrainEntry; hl: boolean }) {
  const used = e.loaded_by > 0 ? Math.min(1, e.runs / e.loaded_by) : 0
  return (
    <article className={`bv-entry${hl ? ' is-hl' : ''}${e.candidate ? ' is-cand' : ''}`} data-entry-id={e.id} aria-current={hl ? 'true' : undefined} aria-label={e.id}>
      <div className="bv-entry-top">
        <b className="br-key">{e.id}</b>
        <span className="br-chip tone-info" title={e.type}>{TYPE_LABEL[e.type] ?? e.type}</span>
        <span className="br-tag">{SIDE_LABEL[e.side] ?? e.side}</span>
        {e.rel && REL_ON_CARD.has(e.rel.split(' ')[0]) && <span className="br-tag">{relLabel(e.rel)}</span>}
        <span className="br-grow" />
        {e.repeats > 0 && <span className={`br-chip tone-${e.repeats >= 2 ? 'bad' : 'warn'}`}>重复 {e.repeats} 次</span>}
        {e.candidate && <span className="br-chip tone-warn" title={CANDIDATE_DO}>撤回候选</span>}
      </div>
      <p className="bv-text"><InlineCode text={e.text} /></p>
      <div className="bv-entry-foot">
        <span className="bv-use" title={`合并的运行里，${e.loaded_by} 次加载了它，其中 ${e.runs} 次引用了它（共引用 ${e.cites} 处）`}>
          <span className={`bv-meter is-pass${e.candidate ? ' is-cand' : ''}`} aria-hidden="true"><i style={{ width: `${Math.round(used * 100)}%` }} /></span>
          <span>{e.loaded_by ? <>{e.loaded_by} 次加载 · <b>{e.runs}</b> 次用上</> : '合并的运行还没加载过'}{e.cites > e.runs ? `（引用 ${e.cites} 处）` : ''}</span>
        </span>
        {e.src.length > 0 && (
          <span className="bv-src">
            <span className="br-dim">来源</span>{e.src.map((s) => <span key={s} className="br-tag br-mono">{s}</span>)}
          </span>
        )}
      </div>
    </article>
  )
}

// ---------------------------------------------------------------- lint, usage, runs

function LintCard({ rows }: { rows: CheckRow[] }) {
  const errors = rows.filter((r) => r.level === 'FAIL').length
  const warns = rows.filter((r) => r.level === 'WARN').length
  return (
    <section className={`br-card${errors ? ' is-bad' : rows.length ? '' : ' is-ok'}`} aria-label="检查" data-testid="lint">
      <header>
        <RoleIcon role="lint" size={18} />
        <h3>Brain 检查</h3>
        <span className="br-dim br-small">默认分支上的条目写得对不对</span>
        <span className="br-grow" />
        {errors > 0 && <span className="br-chip tone-bad">{errors} 个错</span>}
        {warns > 0 && <span className="br-chip tone-warn">{warns} 个提醒</span>}
      </header>
      <CheckRows rows={rows.length ? rows : [{ level: 'OK', text: '全过：没有问题' }]} />
    </section>
  )
}

function UsageCard({ usage, onEntry }: { usage: BrainView['usage']; onEntry: (id: string) => void }) {
  return (
    <section className="br-card" aria-label="用处">
      <header>
        <RoleIcon role="list" size={18} />
        <h3>用处</h3>
        <span className="br-grow" />
        <span className="br-dim br-small">已归档 {usage.archived} · 已清除 {usage.purged}</span>
      </header>
      <div className="bv-block">
        <b className="bv-block-h">又出现的纠正</b>
        {usage.repeats_any.length === 0 ? <p className="br-empty">没有：同样的纠正没再出现过。</p> : (
          <ul className="bv-repeats" data-testid="usage-repeats">
            {usage.repeats_any.map(([x, n]) => (
              <li key={x}>
                <button type="button" className={`br-chip tone-${n >= 2 ? 'bad' : 'warn'}`} onClick={() => onEntry(x)}>{x}</button>
                <span className="bv-rep-n" aria-hidden="true">{Array.from({ length: Math.min(n, 8) }, (_, i) => <i key={i} />)}</span>
                <span>重复 {n} 次</span>
                {n >= 2 && <span className="br-chip tone-bad kt-pill" title="同样的纠正出现两次以上：写成一个会失败的确定性检查，别再靠 AI 记住">该写成确定性检查了</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="bv-block">
        <b className="bv-block-h">从没被引用</b>
        <IdChips ids={usage.never_cited} onEntry={onEntry} />
      </div>
    </section>
  )
}

function RunsCard({ runs, unmerged, branch, onEntry, onItem }: {
  runs: BrainView['usage']['runs']
  unmerged: NonNullable<BrainView['usage']['unmerged']>
  branch: string
  onEntry: (id: string) => void
  onItem: (key: string) => void
}) {
  return (
    <section className="br-card" aria-label="每次运行的用处">
      <header>
        <RoleIcon role="laptop" size={18} />
        <h3>每次运行</h3>
        <span className="br-dim br-small">加载了几条，用上了哪些 · 上面的数只算合并进 {branch} 的运行</span>
      </header>
      {runs.length === 0 ? <p className="br-empty">合并进 {branch} 的运行还没有记下用了 Brain 的哪些条目。</p> : (
        <div className="br-scroll">
          <table className="cto-table bv-runs" aria-label="每次运行">
            <thead><tr><th>需求</th><th>加载 · 用上</th><th>引用</th><th>过时</th><th>不认识</th></tr></thead>
            <tbody>
              {runs.map((r) => {
                const hit = r.loaded ? Math.min(1, r.cited.length / r.loaded) : 0
                return (
                  <tr key={`${r.key}-${r.intent}`}>
                    <td><button type="button" className="br-link br-key" onClick={() => onItem(r.key)}>{r.key}</button></td>
                    <td>
                      <span className="bv-load">
                        <span className="bv-meter is-pass" aria-hidden="true"><i style={{ width: `${Math.round(hit * 100)}%` }} /></span>
                        <span className="br-mono">{r.loaded ?? '—'} · {r.cited.length}</span>
                      </span>
                    </td>
                    <td><IdChips ids={r.cited} onEntry={onEntry} tone="ok" /></td>
                    <td><IdChips ids={r.stale} onEntry={onEntry} tone="warn" /></td>
                    <td><IdChips ids={r.unknown} onEntry={onEntry} tone="bad" /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {unmerged.length > 0 && (
        <div className="bv-block" data-testid="usage-unmerged">
          <b className="bv-block-h">还没合并的（合并以后才算进上面的数）</b>
          <ul className="bv-unmerged">
            {unmerged.map((r) => (
              <li key={r.key}>
                <button type="button" className="br-link br-key" onClick={() => onItem(r.key)}>{r.key}</button>
                <span>{r.where === 'worktree' ? '还在本机做' : '还在分支上'}：加载 {r.loaded ?? '—'} · 引用 {r.cited.length}</span>
                <IdChips ids={r.cited} onEntry={onEntry} tone="ok" />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- 回写 (brain reflect)

type StepState = 'done' | 'now' | 'bad' | 'off' | undefined

/** What a preview means for the person: there is something to write, there is nothing new, or it cannot be written. */
function previewSays(p: ReflectPreview): { what: 'write' | 'nothing' | 'blocked'; text: string } {
  if (p.error || p.problems.length) return { what: 'blocked', text: '' }
  const gaps = p.gaps.length ? '下面「Brain 里缺的」是这次发现还缺的知识或测试，可以开成新的需求。' : ''
  if (p.ops.length === 0) return { what: 'nothing', text: `这次的提议 Brain 里都有了（或者已经在别的回写分支上）：不用回写。${gaps}` }
  if (!p.substantive) {
    const ids = Array.from(new Set(p.ops.map((o) => o.target).filter((x): x is string => !!x)))
    return { what: 'nothing', text: `这次的提议只是给已有的 ${ids.join('、') || '条目'} 补来源，没有新知识：不开分支，Brain 不变，不用回写。${gaps}` }
  }
  return { what: 'write', text: '' }
}

function ReflectCard({ repo, branch, items, pick, onPick, onItem, onApplied, post }: {
  repo: string
  /** the repo's default branch: where the new branch starts */
  branch: string
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
  const says = p ? previewSays(p) : null
  const written = !!apply.result?.ok
  const blocked = !says || says.what !== 'write' || written
  const doApply = async (push: boolean) => {
    if (!pick) return
    const r = await apply.run({ repo, key: pick, push })
    setConfirm(null)
    if (r) onApplied()
  }
  const steps: [string, StepState][] = [
    ['选一个需求', pick ? 'done' : items.length ? 'now' : undefined],
    ['预览', p ? 'done' : pick ? 'now' : undefined],
    ['确认写入', written ? 'done' : !says ? undefined : says.what === 'nothing' ? 'off' : says.what === 'blocked' ? 'bad' : 'now'],
    ['写在新分支上', written ? 'done' : apply.result ? 'bad' : says?.what === 'nothing' ? 'off' : undefined],
  ]
  const item = items.find((r) => r.key === pick)
  const r = apply.result
  return (
    <section className={`br-card bv-reflect${written ? ' is-ok' : ''}`} aria-label="回写">
      <header>
        <RoleIcon role="brain" size={20} />
        <h3>回写</h3>
        <span className="br-dim br-small">把一次运行里 AI 提议的知识写进 Brain：先预览，再写进新分支（可以开 MR）</span>
      </header>
      <ol className={`bv-steps${items.length ? '' : ' is-idle'}`} aria-label="回写的步骤">
        {steps.map(([label, st], i) => (
          <li key={label} className={st ? `is-${st}` : undefined} data-state={st}>
            <i aria-hidden="true">{st === 'done' ? '✓' : st === 'bad' ? '✕' : st === 'off' ? '–' : i + 1}</i>
            <span>{label}</span>
          </li>
        ))}
      </ol>
      {items.length === 0 ? <p className="br-empty">还没有能回写的需求：一个需求的运行提出了新知识，它就会出现在这里（通常在合并以后回写）。</p> : (
        <div className="bv-pick">
          <label className="br-sr" htmlFor="reflect-key">选一个需求</label>
          <select id="reflect-key" value={pick ?? ''} onChange={(e) => {
            onPick(e.target.value)
            preview.reset()
            apply.reset()
            setConfirm(null)
          }}>
            {items.map((x) => <option key={x.key} value={x.key}>{x.key} · {x.title}（{x.state === 'merged' ? '已合并' : '还没合并'}）</option>)}
          </select>
          {item && <StateChip state={item.state} />}
          <button type="button" className="br-btn is-primary" disabled={!pick || preview.busy} onClick={() => {
            apply.reset()
            setConfirm(null)
            if (pick) void preview.run(pick)
          }}>
            <Icon name="Eye" size={14} />{preview.busy ? '正在预览…' : p ? '再预览一次' : '预览'}
          </button>
          {pick && <button type="button" className="br-link" onClick={() => onItem(pick)}>{ACT.openDetail}</button>}
          {item && item.state !== 'merged' && <span className="br-hint">还没合并：一般合并以后再回写。现在写也行，读的是它还在做的那一份。</span>}
        </div>
      )}
      {preview.error && <p className="br-error" role="alert">{preview.error}</p>}
      {p && says && (
        <div className="bv-preview" data-testid="reflect-preview">
          {p.source && <p className="br-note">读的是 <span className="br-mono">{p.source}</span></p>}
          {p.error && <p className="br-error br-pre" role="alert">{p.error}</p>}
          {p.problems.length > 0 && (
            <div data-testid="reflect-problems"><CheckRows rows={p.problems.map((x) => ({ level: 'FAIL', text: x }))} /></div>
          )}
          {says.what === 'write' && (
            <div className="br-scroll">
              <table className="cto-table bv-ops" aria-label="要写的改动">
                <thead><tr><th>动作</th><th>条目</th><th>写到</th><th>类型</th><th>来源</th><th>文字</th></tr></thead>
                <tbody>
                  {p.ops.map((o, i) => (
                    <tr key={i}>
                      <td><span className={`br-chip tone-${relTone(o.kind)}`}>{relLabel(o.kind)}</span></td>
                      <td className="br-mono">{o.target ?? <span className="br-dim">新条目</span>}</td>
                      <td>
                        {o.file ? <span className={`bv-filetag is-${o.file}`}>{FILE_LABEL[o.file] ?? o.file}</span> : <span className="br-dim">—</span>}
                        {o.section && <span className="br-dim"> · {o.section}</span>}
                      </td>
                      <td>{o.type ? <span className="br-chip tone-info">{TYPE_LABEL[o.type] ?? o.type}</span> : <span className="br-dim">—</span>}</td>
                      <td>{o.src.length ? <span className="bv-src">{o.src.map((x) => <span key={x} className="br-tag br-mono">{x}</span>)}</span> : '—'}</td>
                      <td className="br-pre">{o.text ? <InlineCode text={o.text} /> : <span className="br-dim">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {says.text && <p className="br-banner is-info" role="status" data-testid="reflect-nothing">{says.text}</p>}
          {p.gaps.length > 0 && (
            <div className="bv-block">
              <b className="bv-block-h">Brain 里缺的</b>
              <ul className="bv-gaps">
                {p.gaps.map((g, i) => <li key={i}><b>{g.title}</b><span className="br-tag">{GAP_KIND_NAME[g.kind] ?? '其他'}</span><span>{g.what}</span></li>)}
              </ul>
            </div>
          )}
          {p.warnings.length > 0 && <CheckRows rows={p.warnings.map((x) => ({ level: 'WARN', text: x }))} />}
          {p.notes.length > 0 && <ul className="br-list br-dim br-small">{p.notes.map((x, i) => <li key={i}>{x}</li>)}</ul>}
          {(p.raw?.length ?? 0) > 0 && (
            <details className="br-raw">
              <summary>细节</summary>
              <pre>{p.raw!.join('\n')}</pre>
            </details>
          )}
          {says.what !== 'nothing' && (
            <div className="br-row">
              <button type="button" className="br-btn" disabled={blocked || apply.busy} aria-pressed={confirm === false} onClick={() => setConfirm(false)}>
                <Icon name="GitBranch" size={14} />写入新分支
              </button>
              <button type="button" className="br-btn" disabled={blocked || apply.busy} aria-pressed={confirm === true} onClick={() => setConfirm(true)}>
                <Icon name="GitPullRequest" size={14} />写入并开 MR
              </button>
              {written && <span className="br-hint">已经写好了：要再写一次，先重新预览。</span>}
              {says.what === 'blocked' && <span className="br-hint">上面的问题改好以后，重新预览再写。</span>}
            </div>
          )}
          {confirm !== null && !blocked && (
            <div className="br-confirm" role="group" aria-label="确认写入">
              <p className="br-pre">
                {confirm
                  ? `从 ${branch} 开一个新分支，写入 ${pick} 的 ${p.ops.length} 处改动，推到远端并开 MR。你现在的工作目录不动。`
                  : `从 ${branch} 开一个新分支，写入 ${pick} 的 ${p.ops.length} 处改动，只在本机，不推。你现在的工作目录不动。`}
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
      {r && (
        <div className={`br-banner ${r.ok ? 'is-ok' : 'is-error'} bv-applied`} data-testid="reflect-applied">
          <p className={r.ok ? 'br-strong' : 'br-error'} role="status">
            {r.ok ? `写好了${r.branch ? `：分支 ${r.branch}` : ''}` : '没写成：原因在「细节」里。改好以后重新预览，再写一次。'}
          </p>
          {r.ok && r.mr_url && (
            <p className="br-row">
              <ExtLink href={r.mr_url} className="br-btn is-small is-primary">{ACT.viewMr}</ExtLink>
              <span>MR 合并进 {branch} 以后，这里的条目就更新了。</span>
            </p>
          )}
          {r.ok && !r.mr_url && r.pushed && <p>推上去了，但没开成 MR（这台机器没有 GitLab 的 token）：在 GitLab 上用这个分支开一个 MR，合并以后这里就更新了。</p>}
          {r.ok && !r.pushed && <p>只写在本机，还没推。要给团队看：把这个分支推上去再开 MR（怎么推在「细节」里）；合并进 {branch} 以后这里就更新了。</p>}
          {r.worktree && <p className="br-note" data-testid="reflect-worktree">工作区：<span className="br-mono">{r.worktree}</span></p>}
          {r.output && (
            <details className="br-raw">
              <summary>细节</summary>
              <pre className="br-findings">{r.output}</pre>
            </details>
          )}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- styles

const FILE_COLORS = (p: string, t: string, i: string, j: string) => `--bv-PRODUCT: ${p}; --bv-TECH: ${t}; --bv-IMPROVEMENT: ${i}; --bv-PROJECT: ${j};`

const BV_CSS = `
.bv-root { ${FILE_COLORS('#3987e5', '#9085e9', '#d95926', '#3ea37a')} }
:root[data-mode="light"] .bv-root { ${FILE_COLORS('#2a78d6', '#6250d6', '#eb6834', '#1f8a5c')} }
.bv-top { display: flex; align-items: center; gap: .6em 1em; flex-wrap: wrap; }
.bv-top-icon { color: var(--accent); }
.bv-top .br-view-head p { font-size: .93em; }
.bv-repo { display: inline-flex; align-items: center; gap: .5em; font-size: .93em; }
.bv-repo select { padding: .35em .7em; border-radius: .7em; }
.bv-ref { font-size: .86em; color: var(--muted); padding: .2em .7em; border-radius: 999px; background: var(--kt-glass); border: 1px solid var(--border); }
.bv-ref code { color: var(--text-strong); }
/* five cards: one row; three over two (a grid of six, so each row is full); two by two, the last one as wide as two */
.bv-kpis { grid-template-columns: repeat(5, minmax(0, 1fr)); }
@container kt-root (max-width: 1200px) { .bv-kpis { grid-template-columns: repeat(6, minmax(0, 1fr)); } .bv-kpis > * { grid-column: span 2; } .bv-kpis > :nth-child(n+4) { grid-column: span 3; } }
@container kt-root (max-width: 760px) { .bv-kpis > *, .bv-kpis > :nth-child(n+4) { grid-column: span 3; } .bv-kpis > :last-child:nth-child(odd) { grid-column: span 6; } }
@container kt-root (max-width: 460px) { .bv-kpis > *, .bv-kpis > :nth-child(n+4), .bv-kpis > :last-child:nth-child(odd) { grid-column: span 6; } }
.bv-kpis .br-kpi-big { font-size: 2.6em; }
.bv-stack { display: flex; gap: 2px; height: .8em; margin-top: .2em; border-radius: .3em; overflow: hidden; }
.bv-stack i { flex: 1 1 0; min-width: .4em; background: var(--muted); }
.bv-stack i.is-none { background: color-mix(in srgb, var(--muted) 22%, transparent); }
.bv-stack i:last-child { border-radius: 0 .3em .3em 0; }
.bv-root .is-PRODUCT { --bv-c: var(--bv-PRODUCT); } .bv-root .is-TECH { --bv-c: var(--bv-TECH); }
.bv-root .is-IMPROVEMENT { --bv-c: var(--bv-IMPROVEMENT); } .bv-root .is-PROJECT { --bv-c: var(--bv-PROJECT); }
.bv-stack i[class*="is-"]:not(.is-none), .bv-legend .cto-sw { background: var(--bv-c); }
.bv-legend { margin-top: .3em; gap: .2em .9em; font-size: .86em; }
.bv-legend b { color: var(--text-strong); font-variant-numeric: tabular-nums; }
.bv-cells i.is-warn { background: var(--kt-warn); }
.bv-ids { display: inline-flex; flex-wrap: wrap; gap: .3em; }
.bv-ids .br-chip { font-family: var(--mono, ui-monospace, monospace); font-size: .8em; padding: .1em .6em; }
.bv-meter { display: inline-block; width: 5em; height: .55em; border-radius: .3em; overflow: hidden; vertical-align: middle;
  background: color-mix(in srgb, var(--muted) 22%, transparent); }
.bv-meter > i { display: block; height: 100%; border-radius: .3em; background: var(--kt-ok); }
.bv-meter.is-fail > i { background: var(--kt-bad); }
.br-kpi .bv-meter { width: 100%; height: .6em; margin-top: .2em; }
.bv-meter.is-cand { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--kt-warn) 70%, transparent); }

.bv-main { display: grid; grid-template-columns: minmax(0, 1fr) minmax(22em, 30em); gap: var(--kit-gap-block, 16px); align-items: start; }
@container kt-root (max-width: 1200px) { .bv-main { grid-template-columns: minmax(0, 1fr); } }
.bv-col { display: grid; gap: var(--kit-gap-row, 12px); min-width: 0; align-content: start; }
.bv-tabs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .6em; }
@container kt-root (max-width: 700px) { .bv-tabs { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.bv-tab { appearance: none; font: inherit; display: grid; grid-template-columns: 2.3em minmax(0, 1fr) auto; align-items: center; gap: .7em; padding: .6em .9em;
  border-radius: 12px; border: 1px solid var(--border); background: var(--card); color: var(--text); cursor: pointer; text-align: left; }
.bv-tab:hover { border-color: var(--border-strong); }
.bv-tab[aria-pressed="true"] { border-color: var(--bv-c, var(--accent)); background: color-mix(in srgb, var(--bv-c, var(--accent)) 12%, var(--card));
  box-shadow: 0 0 0 1px var(--bv-c, var(--accent)); }
.bv-letter { display: grid; place-items: center; width: 2.3em; height: 2.3em; border-radius: .6em; font-weight: 850; color: #fff; background: var(--bv-c, var(--muted)); }
.bv-tab-name { font-weight: 750; font-size: 1.05em; color: var(--text-strong); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bv-tab-n { font-size: 1.6em; font-weight: 800; font-variant-numeric: tabular-nums; color: var(--text-strong); }
.bv-file { border-top: 3px solid var(--bv-c, var(--border)); }
.bv-filter { display: flex; align-items: center; gap: .6em 1em; flex-wrap: wrap; }
.bv-search { display: inline-flex; align-items: center; gap: .4em; padding: 0 .4em 0 .7em; border-radius: 10px; border: 1px solid var(--border-strong, var(--border));
  background: var(--bg); color: var(--muted); flex: 0 1 22em; }
.bv-search input { border: 0 !important; background: transparent !important; padding: .45em .2em !important; flex: 1; min-width: 0; outline: none; }
.bv-search:focus-within { outline: 2px solid var(--accent); outline-offset: 1px; }
.bv-types { display: flex; flex-wrap: wrap; gap: .35em; }
.bv-type { appearance: none; font: inherit; font-size: .86em; padding: .2em .8em; border-radius: 999px; border: 1px solid var(--border); background: transparent; color: var(--text); cursor: pointer; }
.bv-type b { color: var(--muted); font-weight: 700; margin-left: .2em; }
.bv-type:hover { border-color: var(--accent); }
.bv-type[aria-pressed="true"] { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--text-strong); }
.bv-type[aria-pressed="true"] b { color: var(--text-strong); }
.bv-sec { display: grid; gap: .5em; }
.bv-sec > h4 { margin: .4em 0 0; font-size: .93em; font-weight: 750; color: var(--text-strong); letter-spacing: .04em; }
.bv-entries { display: grid; grid-template-columns: repeat(auto-fill, minmax(22em, 1fr)); gap: .7em; }
.bv-entry { display: grid; gap: .5em; align-content: start; padding: .8em 1em; border-radius: var(--kit-r-cell, 10px); border: 1px solid var(--border);
  background: var(--bg-elevated, var(--card)); scroll-margin: 6em; border-left: 3px solid var(--bv-c, var(--border)); }
.bv-file .bv-entry { --bv-c: inherit; }
.bv-entry.is-cand { border-color: color-mix(in srgb, var(--kt-warn) 50%, var(--border)); border-left-color: var(--kt-warn); border-style: dashed; border-left-style: solid; }
.bv-entry.is-hl { border-color: var(--accent); border-left-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 30%, transparent); }
.bv-entry-top { display: flex; align-items: center; gap: .4em .5em; flex-wrap: wrap; }
.bv-entry-top .br-chip, .bv-entry-top .br-tag { font-size: .8em; }
.bv-text { margin: 0; white-space: pre-wrap; word-break: break-word; color: var(--text-strong); line-height: 1.55; }
.bv-code { font-family: var(--mono, ui-monospace, monospace); font-size: .88em; padding: .05em .35em; border-radius: 5px;
  background: color-mix(in srgb, var(--muted) 16%, transparent); border: 1px solid color-mix(in srgb, var(--muted) 22%, transparent); }
.bv-do { margin: .2em 0 0; font-size: .84em; line-height: 1.5; color: var(--text); }
.bv-do b { color: var(--muted); font-weight: 650; margin-right: .4em; }
.bv-unmerged { list-style: none; margin: 0; padding: 0; display: grid; gap: .4em; }
.bv-unmerged li { display: flex; align-items: center; gap: .4em .7em; flex-wrap: wrap; padding: .45em .7em; border-radius: var(--kit-r-cell, 10px);
  border: 1px dashed var(--border-strong, var(--border)); }
.bv-entry-foot { display: flex; align-items: center; justify-content: space-between; gap: .4em 1em; flex-wrap: wrap; font-size: .82em; color: var(--muted); }
.bv-use { display: inline-flex; align-items: center; gap: .5em; }
.bv-use b { color: var(--text-strong); }
.bv-src { display: inline-flex; align-items: center; gap: .3em; flex-wrap: wrap; }
.bv-src .br-tag { font-size: .92em; padding: 0 .45em; }

.bv-block { display: grid; gap: .45em; }
.bv-block-h { font-size: .86em; font-weight: 700; color: var(--muted); letter-spacing: .04em; }
.bv-repeats { list-style: none; margin: 0; padding: 0; display: grid; gap: .45em; }
.bv-repeats li { display: flex; align-items: center; gap: .5em; flex-wrap: wrap; }
.bv-repeats .br-chip { font-family: var(--mono, ui-monospace, monospace); font-size: .82em; }
.bv-rep-n { display: inline-flex; gap: 2px; }
.bv-rep-n i { width: .5em; height: .9em; border-radius: 2px; background: var(--kt-bad); }
.bv-runs td { vertical-align: middle; }
.bv-load { display: inline-flex; align-items: center; gap: .5em; white-space: nowrap; }

.bv-steps { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0; counter-reset: s; }
@container kt-root (max-width: 760px) { .bv-steps { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.bv-steps li { position: relative; display: flex; align-items: center; gap: .55em; padding: .5em .6em; font-weight: 650; color: var(--muted); }
.bv-steps li:not(:last-child)::after { content: ''; flex: 1; height: 2px; margin: 0 .2em 0 .4em; border-radius: 1px; background: color-mix(in srgb, var(--muted) 30%, transparent); }
.bv-steps li i { font-style: normal; flex: none; display: grid; place-items: center; width: 1.8em; height: 1.8em; border-radius: 50%; font-size: .86em; font-weight: 850;
  border: 2px dashed color-mix(in srgb, var(--muted) 55%, transparent); color: var(--muted); }
.bv-steps li span { white-space: nowrap; }
.bv-steps li.is-done { color: var(--text); }
.bv-steps li.is-done i { border: 2px solid var(--kt-ok-solid); background: var(--kt-ok-solid); color: #fff; }
.bv-steps li.is-done::after { background: var(--kt-ok); }
.bv-steps li.is-now { color: var(--text-strong); }
.bv-steps li.is-now i { border: 2px solid var(--accent); background: var(--accent); color: var(--accent-fg, #fff); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 22%, transparent); }
.bv-steps li.is-bad { color: var(--kt-bad); }
.bv-steps li.is-bad i { border: 2px solid var(--kt-bad); color: var(--kt-bad); background: color-mix(in srgb, var(--kt-bad) 14%, transparent); }
.bv-steps li.is-off { opacity: .6; }
.bv-steps.is-idle { opacity: .55; }
.bv-pick { display: flex; align-items: center; gap: .6em 1em; flex-wrap: wrap; padding: .7em .9em; border-radius: var(--kit-r-cell, 10px); background: var(--kt-glass); border: 1px solid var(--border); }
.bv-pick select { min-width: 18em; }
.bv-preview { display: grid; gap: .8em; }
.bv-ops td { vertical-align: middle; }
.bv-filetag { display: inline-flex; padding: 0 .5em; border-radius: 6px; font-size: .84em; font-weight: 750; color: #fff; background: var(--bv-c, var(--muted)); }
.bv-gaps { list-style: none; margin: 0; padding: 0; display: grid; gap: .4em; }
.bv-gaps li { display: flex; align-items: baseline; gap: .5em; flex-wrap: wrap; padding: .5em .8em; border-radius: var(--kit-r-cell, 10px);
  border: 1px dashed color-mix(in srgb, var(--kt-warn) 55%, var(--border)); background: color-mix(in srgb, var(--kt-warn) 6%, transparent); }
.bv-gaps b { color: var(--text-strong); }
.bv-applied p { margin: 0; }
.bv-applied a.br-btn { text-decoration: none; }
.bv-applied a.br-btn.is-primary { color: var(--accent-fg, #fff); }
`
