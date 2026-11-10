/**
 * 交付总览: the sample's CTO 视图 for brain-kit — one sentence and three numbers (how many requirements handed to the
 * runner ran unattended end to end, how many times a person stepped in at the judgment points and outside them,
 * credits per requirement) and who settled the decisions, each with its small SVG chart (cto/charts.tsx); 轮到你 (what
 * waits on the person, with its one step); the weekly merges; 需求流动 (cto/Flow.tsx: the kanban of what is in
 * progress); the 交付清单 (every requirement, a big requirement's small ones folded under it); brain-kit's eval batch
 * (its big requirements split into small ones among its rows). Every card and row opens the requirement's board
 * (需求看板). Polls GET /overview (Overview.cto has the numbers, from brainkit.evaluate). The repo pills and the
 * ledger's state filter are in the URL; a big number, a legend entry, a week, a column, a lane or 「+N 个」 filters the
 * ledger once more (a LedgerPick, with its ✕) and scrolls to it.
 *
 * Whose turn it is and the step are the backend's (waits.who / do / since), read here as they are. A repo that cannot
 * hand over (no remote, or no GitLab) is done only on this machine: the backend's sentence says so, the top has the
 * 只在本机 tag, and the runner's parts fold to 「这次不需要」.
 *
 * Without any repo it is one big way in: 导入仓库. A repo without requirements shows only its way in: 开需求.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useAppApi, useNavigate } from '@kirocrew/app-sdk'
import { POLL_MS, paths, useAction, usePoll } from '../api'
import { RoleIcon } from '../board/RoleIcon'
import { HOW, HOW_LABEL, HOW_VAR, MiniCredits, MiniPeople, MiniUnattended, MiniWho, WHO_VAR, WeeklyChart, fmt, slash } from '../cto/charts'
import { COL_NAME, Flow, LANE_NAME, StepButton, blockText, blockersOf, colOf, familyProgress, laneOf, stepOf, waitedText, type Col, type Lane } from '../cto/Flow'
import { ago, fmtCredits } from '../format'
import type { OverviewEntry, View } from '../nav'
import type { CtoNumbers, CtoRun, EvalFamily, EvalMetric, EvalView, Funnel, Overview, RefreshResult, ReqFamily, ReqState, RepoInfo, Requirement } from '../types'
import { STATE_LABEL } from '../types'
import { ACT, DECIDED_BY, leanProgress, waitName } from '../vocab'
import { EmptyHero, Icon, ImportCta, LeanCell, LoadState, MrLink, PendingRepo, STATE_TONE, StateChip } from '../ui'
import type { ViewProps } from './props'

const STATES = Object.keys(STATE_LABEL) as ReqState[]
/** what decisions.md's 「谁定的」 (its Who column) may say, by who decided: brain-kit's words, typed as they are */
const WHO_SYNTAX: [who: string, typed: string[], note: string][] = [
  [DECIDED_BY.person, ['<化名> <凭证号>', 'owner'], '（桥送来的回答写化名和凭证号；本机做时负责人自己定的写 owner）'],
  [DECIDED_BY.check, ['check'], ''], [DECIDED_BY.brain, ['brain <条目号>'], ''], [DECIDED_BY.agent, ['agent'], ''],
]

function WhoSyntax() {
  return (
    <span data-testid="who-syntax">
      决定表（decisions.md）里「谁定的」那一格（<code>Who</code> 列）这样写：
      {WHO_SYNTAX.map(([who, typed, note], i) => (
        <span key={who}>{i > 0 && '；'}「{who}」写 {typed.map((t, j) => <span key={t}>{j > 0 && ' 或 '}<code>{t}</code></span>)}{note}</span>
      ))}
    </span>
  )
}

export const OV_CSS = `
.br-ov { container: brov / inline-size; --ov-person: #008300; --ov-ink: color-mix(in srgb, var(--text) 62%, var(--card)); --ov-ink-2: color-mix(in srgb, var(--text) 46%, var(--card));
  --ov-ink-3: color-mix(in srgb, var(--text) 32%, var(--card)); --ov-ink-4: color-mix(in srgb, var(--text) 18%, var(--card)); --ov-warn: color-mix(in srgb, var(--kt-warn) 55%, var(--border)); }
.br-ov .cto-hero h2 { font-size: 30px; }
.br-ov .cto-hero p b { color: var(--text-strong); }
.br-ov .cto-hero p .br-link { margin-left: 6px; }
.br-ov .cto-cards { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.br-ov .cto-value .cto-of { font-size: .5em; margin-left: 6px; }
.br-ov .cto-value.is-word { font-size: 1.9em; color: var(--muted); }
.br-ov .cto-link-value { font-size: 2.85em; font-weight: 800; letter-spacing: -.03em; line-height: 1.1; margin: 6px 0 2px; }
.br-ov .cto-foot .br-link { font-size: 13px; }
.br-ov .cto-card.is-warn { border-color: var(--ov-warn); }
.br-ov .cto-lines button span.is-you { color: var(--kt-approve); font-weight: 650; }
.br-ov .br-refresh { display: inline-flex; align-items: center; gap: 6px 10px; flex-wrap: wrap; justify-content: flex-end; }

.br-ov .br-yours { display: grid; gap: 8px; }
.br-ov .br-yours ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.br-ov .br-yours li { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; padding: 7px 10px; border-radius: 10px; background: color-mix(in srgb, var(--kt-approve) 6%, var(--cto-cell)); }
.br-ov .br-yours .br-yt-title { color: var(--text-strong); font-weight: 600; }
.br-ov .br-waited { color: var(--kt-approve); font-size: 12.5px; font-weight: 650; white-space: nowrap; }
.br-ov .br-linecopy { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.br-ov .br-linecopy code { white-space: nowrap; }
.br-ov .br-linecopy code { padding: 1px 8px; border-radius: 6px; border: 1px dashed color-mix(in srgb, var(--kt-approve) 60%, var(--border)); color: var(--text-strong); font-weight: 700; user-select: all; }

.br-ov .cto-lane { justify-content: flex-start; padding: 8px 10px; }
.br-ov .cto-lane .br-lane-name { white-space: nowrap; font-weight: 650; }
.br-ov .cto-lane.is-you { background: color-mix(in srgb, var(--kt-approve) 28%, var(--cto-cell)); }
.br-ov .cto-lane:not(.is-wait) .kt-role-icon { color: var(--kt-run); }
.br-ov .br-kwait { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 12px; }
.br-ov .cto-kcard.is-live.is-wait .br-kwait { color: var(--kt-approve); font-weight: 650; }
.br-ov .cto-kcard .cto-gate { display: inline-flex; align-items: center; gap: 4px; }
.br-ov .cto-kcard .br-step { justify-self: start; margin-top: 4px; max-width: 100%; white-space: normal; text-align: left; }
.br-ov .br-review { display: inline-grid; gap: 4px; justify-items: start; }
.br-ov .br-review .kt-btn { padding: 3px 10px; font-size: 13px; border-radius: 8px; display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.br-ov .br-review .br-note, .br-ov .br-review .br-error { margin: 0; font-size: 12px; }
.br-ov .cto-kcard .cto-ktop { flex-wrap: wrap; }
.br-ov .cto-kmore.cto-link { text-align: left; padding: 0 4px; font-size: 12px; color: var(--accent); }
.br-ov .cto-stats small { font-size: 14px; font-weight: 500; color: var(--text); margin-left: 4px; }
.br-ov .cto-stats b { font-weight: inherit; white-space: nowrap; }
.br-ov .cto-kb-h.is-off .cto-st { color: var(--muted); }
.br-ov .br-kcell-off { display: grid; place-items: center; writing-mode: vertical-rl; letter-spacing: .2em; color: var(--muted); font-size: 12px; background: transparent; border: 1px dashed var(--border); }
.br-ov .br-kband { grid-column: 1 / -1; display: flex; align-items: center; gap: 6px 14px; flex-wrap: wrap; padding: 6px 10px; border-radius: 10px; border: 1px dashed var(--border); color: var(--muted); font-size: 13px; }
.br-ov .br-kband .br-lane-name { display: inline-flex; align-items: center; gap: 6px; font-weight: 650; color: var(--text); }

.br-ov .br-ledger td .br-hint { margin-top: 2px; }
.br-ov .br-ledger .br-col-req { min-width: 190px; }
.br-ov .br-ledger .br-col-wait { min-width: 180px; }
.br-ov .br-ledger .br-col-wait .br-step { margin-top: 4px; }
.br-ov .br-ledger .br-col-nowrap { white-space: nowrap; }
.br-ov .br-ledger .br-linecopy { margin-top: 4px; }
.br-ov .br-lean { display: grid; gap: 3px; min-width: 116px; font-size: 12.5px; color: var(--text); }
.br-ov .br-nw { white-space: nowrap; }
.br-ov .br-prog > i.is-next { background: transparent; outline: 1.5px solid var(--kt-run); outline-offset: -1.5px; }
.br-ov .br-sum code { font-size: .95em; padding: 0 4px; border-radius: 4px; background: var(--kt-glass); }
.br-ov .br-empty-row td { color: var(--muted); padding: 18px 10px; }
.br-ov .br-how { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; font-size: 13px; }
.br-ov .br-how i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
.br-ov .br-acts { display: flex; gap: 6px; align-items: center; white-space: nowrap; }
.br-ov .br-overlap { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
.br-ov .br-funnel-rows { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 8px; font-size: 13px; }
.br-ov .br-funnel-rows span { display: inline-flex; align-items: center; gap: 6px; }
.br-ov .br-funnel-rows b { color: var(--text-strong); font-variant-numeric: tabular-nums; }
.br-ov .br-funnel-vs { margin-top: 8px; font-size: 12.5px; line-height: 1.5; }
.br-ov .cto-notes li { line-height: 1.6; }
.br-ov .cto-notes code { font-size: .92em; padding: 0 4px; border-radius: 4px; background: var(--kt-glass); }
.br-ov .cto-table tr.cto-row-pick.is-merged td { color: var(--text); }

.br-ov .br-metrics { display: grid; grid-template-columns: repeat(auto-fill, minmax(176px, 1fr)); gap: 8px; margin-top: 10px; }
.br-ov .br-metric { padding: 8px 12px; border-radius: 10px; background: var(--cto-cell); display: grid; gap: 2px; align-content: start; }
.br-ov .br-metric > span { color: var(--text); font-size: 13px; }
.br-ov .br-metric b { font-size: 18px; color: var(--text-strong); font-variant-numeric: tabular-nums; }
.br-ov .br-metric b.is-none { font-size: 14px; color: var(--muted); font-weight: 600; }
.br-ov .br-metric small { color: var(--muted); font-size: 12px; line-height: 1.4; }
.br-ov .br-eval-list { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 6px; }
.br-ov .br-eval-list li { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; }

/* 大需求 and 小需求: nobody's yet is dashed (as the board's idle chips); its big one, dependencies and what blocks it */
.br-ov .cto-kcard.br-kfree { border-style: dashed; border-color: var(--border-strong); }
.br-ov .cto-lane.br-lane-free .kt-role-icon { color: var(--muted); }
.br-ov .br-kfam { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.br-ov .br-kdeps { display: flex; flex-wrap: wrap; gap: 0 6px; font-size: 12px; color: var(--muted); }
.br-ov .br-kdeps span { font-family: var(--mono, ui-monospace, monospace); color: var(--text); }
.br-ov .br-kdeps span.is-merged { color: var(--kt-ok); }
.br-ov .br-kblock { font-size: 12px; line-height: 1.4; color: var(--kt-warn); font-weight: 650; }
.br-ov .br-fam { display: grid; gap: 4px; margin: 3px 0 1px; }
.br-ov .br-fam-bar { display: flex; align-items: center; gap: 8px; }
.br-ov .br-fam-bar .kt-segs { flex: 1; margin: 0; }
.br-ov .br-fam-bar .kt-segs i { height: 7px; }
.br-ov .br-fam-bar b { font-size: 12px; color: var(--text-strong); font-variant-numeric: tabular-nums; }
.br-ov .br-segs i.is-claimed { background: color-mix(in srgb, var(--kt-info) 45%, transparent); }
.br-ov .br-fkids { display: flex; flex-wrap: wrap; gap: 1px 9px; font-size: 12px; color: var(--text); }
.br-ov .br-fkid { display: inline-flex; align-items: baseline; gap: 3px; white-space: nowrap; }
.br-ov .br-fkid i { font-style: normal; font-size: 11px; color: var(--br-tone); }
.br-ov .br-fkid-unit { color: var(--muted); }
.br-ov .br-ledger tr.br-kid td { background: color-mix(in srgb, var(--text) 2.5%, transparent); }
.br-ov .br-ledger tr.br-kid.cto-row-pick:hover td { background: var(--cto-glass); }
.br-ov .br-ledger tr.br-kid td:first-child { padding-left: 14px; }
.br-ov .br-tree { color: var(--muted); font-family: var(--mono, ui-monospace, monospace); width: 1.1em; flex: none; }
.br-ov .br-fam-toggle { font-variant-numeric: tabular-nums; cursor: pointer; }
.br-ov .br-fam-toggle[aria-expanded="false"] { border-style: dashed; }
.br-ov .br-how-cell { display: grid; gap: 1px; justify-items: start; }
.br-ov .br-how .br-chip { padding: 0 7px; font-size: 11.5px; }
.br-ov .br-eval-list .br-tag b { margin-left: 4px; color: var(--text-strong); font-variant-numeric: tabular-nums; }

@container brov (max-width: 1180px) {
  .br-ov .cto-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .br-ov .br-ledger { font-size: 13px; }
  .br-ov .br-ledger th, .br-ov .br-ledger td { padding: 8px 6px; }
}
@container brov (max-width: 900px) {
  .br-ov .br-kanban { grid-template-columns: minmax(0, 1fr) !important; }
  .br-ov .br-merged-cell, .br-ov .br-kcell-off { grid-row: auto !important; }
  .br-ov .br-kcell-off { writing-mode: horizontal-tb; padding: 6px; }
}
@container brov (max-width: 640px) { .br-ov .cto-cards { grid-template-columns: minmax(0, 1fr); } }
`

/** One more filter on the ledger, besides its state: a week, a way of delivery, a column or lane of 需求流动 … */
type LedgerPick = { id: string; label: string; keep: (r: Requirement, run: CtoRun | undefined) => boolean }
type RepoCount = { open: number; you: number }

const isOpen = (r: Requirement) => r.state !== 'merged' && r.state !== 'merged_into_parent' && r.state !== 'closed'
const idOf = (r: { repo: string; key: string }) => `${r.repo}/${r.key}`
type Group = { r: Requirement; kids: Requirement[] }
type Tree = 'mid' | 'last'

/** A repo pill's counts: its requirements in progress, and those that wait on you (a merge to write back into the
 * Brain too, as 轮到你 lists them); 'all' among *ids*: every row. */
function repoCounts(rows: Requirement[], ids: string[]): Record<string, RepoCount> {
  const counts: Record<string, RepoCount> = Object.fromEntries(ids.map((id) => [id, { open: 0, you: 0 }]))
  for (const r of rows) {
    for (const id of ids.includes('all') ? [r.repo, 'all'] : [r.repo]) {
      const c = (counts[id] ??= { open: 0, you: 0 })
      if (isOpen(r)) c.open += 1
      if (r.waits.who === 'you' && r.state !== 'closed') c.you += 1
    }
  }
  return counts
}

export function OverviewView({ entry, status, go, replace, reloadStatus, pollMs }: { entry: OverviewEntry } & ViewProps) {
  const [repo, setRepo] = useState(entry.repo ?? 'all')
  const [state, setState] = useState<ReqState | undefined>(entry.state)
  const [pick, setPick] = useState<LedgerPick | null>(null)
  const [limit, setLimit] = useState(14)
  const [pillCounts, setPillCounts] = useState<Record<string, RepoCount>>({})
  const ledgerRef = useRef<HTMLElement>(null)
  const repos = status?.repos ?? []
  const noRepos = !!status && repos.length === 0
  // without brain-kit no repo can be read: the app's banner says why and where to fix it, once
  const noKit = status?.brainkit.ok === false
  const ov = usePoll<Overview>(noRepos ? null : paths.overview(repo), pollMs ?? POLL_MS)
  const data = ov.data
  const runsBy = useMemo(() => new Map((data?.cto.runs ?? []).map((r) => [idOf(r), r])), [data])
  const rows = useMemo(
    () => (data ? sortRows(data.rows.filter((r) => (!state || r.state === state) && (!pick || pick.keep(r, runsBy.get(idOf(r)))))) : []),
    [data, state, pick, runsBy],
  )
  // a big requirement's small ones in the list come right under it, folded with its 小需求 n/m
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set())
  const groups = useMemo(() => ledgerGroups(rows), [rows])
  const fold = (id: string) => setFolded((s) => {
    const next = new Set(s)
    if (!next.delete(id)) next.add(id)
    return next
  })
  const size = (g: Group) => 1 + (folded.has(idOf(g.r)) ? 0 : g.kids.length)
  const listed = groups.reduce((a, g) => a + size(g), 0)
  const shown: Group[] = []
  for (let n = 0, i = 0; i < groups.length && n < limit; i++) {
    shown.push(groups[i])
    n += size(groups[i])
  }
  const shownN = shown.reduce((a, g) => a + size(g), 0)
  useEffect(() => {
    if (!data) return
    const counts = repoCounts(data.rows, repo === 'all' ? ['all', ...repos.filter((x) => x.ok).map((x) => x.id)] : [repo])
    setPillCounts((m) => (repo === 'all' ? counts : { ...m, ...counts }))
  }, [data, repo]) // eslint-disable-line react-hooks/exhaustive-deps
  // opened at one repo (a link, a reload): the other pills' counts come from 全部, read once
  const api = useAppApi()
  const pillsRead = useRef(entry.repo === undefined || entry.repo === 'all')
  const manyPills = repos.length > 1
  useEffect(() => {
    if (pillsRead.current || !manyPills) return
    pillsRead.current = true
    void api.get<Overview>(paths.overview('all')).then(
      (o) => setPillCounts((m) => ({ ...repoCounts(o.rows, ['all', ...repos.filter((x) => x.ok).map((x) => x.id)]), ...m })),
      () => { /* the pills keep their names; the repo shown has its counts from its own poll */ })
  }, [manyPills]) // eslint-disable-line react-hooks/exhaustive-deps

  const pickRepo = (r: string) => {
    setRepo(r)
    setPick(null)
    setLimit(14)
    replace({ kind: 'overview', ...(r !== 'all' ? { repo: r } : {}), ...(state ? { state } : {}) })
  }
  const pickState = (s: ReqState | undefined) => {
    setState(s)
    setLimit(14)
    replace({ kind: 'overview', ...(repo !== 'all' ? { repo } : {}), ...(s ? { state: s } : {}) })
  }
  const toLedger = () => setTimeout(() => ledgerRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 30)
  const filterTo = (p: LedgerPick) => {
    setPick((was) => (was?.id === p.id ? null : p))
    setLimit(14)
    toLedger()
  }
  const toBoard = (r: { repo: string; key: string }, replay = false) => go({ kind: 'board', repo: r.repo, key: r.key, ...(replay ? { replay: true } : {}), from: 'overview' })
  const toItem = (r: { repo: string; key: string }) => go({ kind: 'item', repo: r.repo, key: r.key, from: 'overview' })
  const repoOfKey = (key: string) => data?.rows.find((r) => r.key === key)?.repo ?? (repo !== 'all' ? repo : repos.find((x) => x.ok)?.id)
  const openKey = (key: string, item = false) => {
    const r = repoOfKey(key)
    if (r) (item ? toItem : toBoard)({ repo: r, key })
  }
  const openDecision = (key: string, id: string) => {
    const r = repoOfKey(key)
    if (r) go({ kind: 'item', repo: r, key, from: 'overview', decision: id })
  }
  const repoName = (id: string) => repos.find((x) => x.id === id)?.name
  const scope = repo === 'all' ? repos.filter((r) => r.ok) : repos.filter((r) => r.id === repo)
  // nothing here can be handed over: no origin to push to, or no GitLab for the bridge (the backend's local_only rule)
  const localOnly = scope.length > 0 && scope.every((r) => r.remote === false || !(r.kit?.gitlab_base && r.kit?.gitlab_project))
  const manyRepos = repo === 'all' && repos.length > 1
  const team = !!status && (status.app.team || status.team.enabled)
  const newReq = () => go({ kind: 'new', ...(repo !== 'all' ? { repo } : {}) })

  if (noRepos) {
    return (
      <main className="kt-root br-view cto-root br-ov" data-testid="overview">
        <ImportCta onImport={() => go({ kind: 'import' })} />
      </main>
    )
  }
  const c = data?.cto
  const computing = !!data && !data.cto.available && !!data.eval.computing
  const empty = !!data && data.rows.length === 0
  const credits = (data?.rows ?? []).filter((r) => r.credits !== null && r.credits > 0).map((r) => ({ key: r.key, credits: r.credits as number }))
  const yours = (data?.rows ?? []).filter((r) => r.waits.who === 'you' && r.state !== 'closed')
    .sort((a, b) => (a.waits.since ?? Infinity) - (b.waits.since ?? Infinity) || (b.updated_at ?? 0) - (a.updated_at ?? 0))
  const where = scope.length > 1 ? '这些仓库' : '这个仓库'
  return (
    <main className="kt-root br-view cto-root br-ov" data-testid="overview">
      <style>{OV_CSS}</style>
      <header className="cto-top">
        {localOnly && <span className="cto-tag" data-testid="ov-local-tag" title="没有远端：需求只在这台机器上做，不交给运行机">只在本机</span>}
        {team && <span className="cto-tag is-real" title="交给运行机的需求由团队的运行机接手">团队模式</span>}
        <span className="cto-org">{noKit ? `${repos.length} 个仓库 · 现在一个都读不了`
          : [status ? `${scope.length} 个仓库` : '', data ? `${data.rows.length} 个需求` : '…'].filter(Boolean).join(' · ')}</span>
        <span className="cto-grow" />
        <RefreshButton repos={scope.filter((r) => r.remote !== false)} onDone={ov.reload} />
      </header>
      {repos.filter((r) => r.pending && (repo === 'all' || r.id === repo)).map((r) => (
        <PendingRepo key={r.id} repo={r} banner onOpen={() => go({ kind: 'import', path: r.path })} onDone={reloadStatus} />
      ))}
      <LoadState loading={ov.loading} error={ov.error} has={!!data} />
      {!noKit && data?.errors.map((e) => {
        const r = repos.find((x) => x.id === e.repo)
        // the backend's words when it said them; an error it passed on as it came (a scan that threw) is folded
        const plain = /[\u3400-\u9fff]/.test(e.error)
        return (
          <div key={e.repo} className="br-banner" role="status" data-testid="repo-error">
            <div className="br-row">
              <span><b className="br-strong">{r?.name ?? e.repo}：</b>{plain ? e.error : '这次没读出来'}</span>
              {!plain && <span className="br-dim">做什么：看看这个仓库的目录还在不在、能不能读，再去导入仓库检查它</span>}
              {r && <button type="button" className="br-btn is-small" onClick={() => go({ kind: 'import', path: r.path })}>去导入仓库</button>}
              {(plain ? e.raw : e.error) && <details className="br-raw"><summary>细节</summary><pre>{plain ? e.raw : e.error}</pre></details>}
            </div>
          </div>
        )
      })}

      {data && c && !empty && (
        <section className="cto-hero" data-testid="ov-hero">
          <h2>{c.sentence}</h2>
          <p>
            {c.available
              ? `数字来自 brain-kit 的评估（读的是${c.ref || '默认分支'}）和这个 app 开的会话`
              : computing ? 'brain-kit 正在算评估的数字，算好就出来：下面先看 credits 和合并' : 'brain-kit 的评估还没给出数字：下面先看 credits 和合并'}
            {' · '}口径见末尾
            {!c.available && status?.brainkit.modules.evaluate === false && (
              <>。做什么：换一个带评估模块的 brain-kit<button type="button" className="br-link" onClick={() => go({ kind: 'settings' })}>去设置 ↗</button></>
            )}
          </p>
        </section>
      )}

      {data && repos.length > 1 && (
        <nav className="cto-lines" aria-label="仓库">
          {[{ id: 'all', name: '全部' } as Pick<RepoInfo, 'id' | 'name'> & Partial<RepoInfo>, ...repos].map((r) => {
            const off = r.ok === false
            const n = pillCounts[r.id]
            return (
              <button type="button" key={r.id} aria-pressed={repo === r.id} disabled={off} onClick={() => pickRepo(r.id)}>
                <b>{r.name}</b>
                {off ? <span>{r.pending ? r.pending.word || '在分支上' : r.error?.startsWith('还没装') ? '还没装' : '读不到'}</span>
                  : n ? <span>进行中 {n.open}{n.you > 0 && <span className="is-you"> · 轮到你 {n.you}</span>}</span> : null}
              </button>
            )
          })}
        </nav>
      )}

      {empty && noKit && (
        <section className="cto-card" data-testid="ov-nokit"><p className="cto-was">brain-kit 读不到，这里的需求和数字要等它能读了才有：照最上面那条提示修。</p></section>
      )}
      {empty && !noKit && (
        <EmptyHero title="还没有需求" text={[`${where}还没有需求。认领一个需求，交它的文档过五关，开工：它会在这里一路走到合并——在哪一步、等谁、花了多少。`]}
          punch="人只在判断点上出手：批准、回答、验收。"
          flow={localOnly
            ? [{ icon: 'new', title: '开需求', text: '认领，文档过五关' }, { icon: 'laptop', title: '本机开发', text: 'brain-dev 带着 Lean' },
              { icon: 'release', title: '发布', text: '你批准发布，合并' }, { icon: 'brain', title: '回写 Brain', text: '学到的留下来' }]
            : [{ icon: 'new', title: '开需求', text: '认领，文档过五关' }, { icon: 'laptop', title: '本机开发', text: 'brain-dev 带着 Lean' },
              { icon: 'handover', title: '交给运行机', text: '无人值守地做' }, { icon: 'release', title: '验收', text: '产品在 MR 上验收' }, { icon: 'brain', title: '回写 Brain', text: '学到的留下来' }]}>
          <button type="button" className="br-btn is-primary is-big" onClick={newReq}><RoleIcon role="new" size={17} />开需求</button>
        </EmptyHero>
      )}

      {data && c && !empty && (
        <>
          {yours.length > 0 && <YourTurn rows={yours} at={data.at} repoName={manyRepos ? repoName : () => undefined} onGo={go} onOpen={(r) => toBoard(r)}
            onAll={() => filterTo(cellPick(undefined, 'you'))} />}

          <section className="cto-cards" data-testid="ov-cards">
            <UnattendedCard c={c} localOnly={localOnly} computing={computing} pick={pick} onPick={filterTo} onKey={(r) => (r.repo ? toBoard(r) : openKey(r.key))} />
            <PeopleCard c={c} computing={computing} onPick={filterTo} />
            <article className="cto-card" aria-label="每个需求的 credits" data-anchor="credits">
              <div className="cto-eyebrow">每个需求的 credits</div>
              {c.credits.per_req !== null ? (
                <>
                  <button type="button" className="cto-value cto-link-value" data-testid="ov-credits" title="在交付清单里看有 credits 的需求"
                    onClick={() => filterTo({ id: 'credits', label: '有 credits 的需求', keep: (r) => (r.credits ?? 0) > 0 })}>{fmtCredits(c.credits.per_req)}</button>
                  <div className="cto-desc">有 credits 的 {c.credits.reqs} 个需求，合计 {fmtCredits(c.credits.total)}</div>
                  {credits.length > 0 && <MiniCredits rows={credits} avg={c.credits.per_req} onKey={(k) => openKey(k)} />}
                </>
              ) : (
                <>
                  <div className="cto-value is-word" data-testid="ov-credits">还没有</div>
                  <div className="cto-desc">这个 app 开的会话报了 credits 以后才有</div>
                </>
              )}
            </article>
            <FunnelCard f={data.funnel} team={team} steppedIn={c.stepped_in ? c.stepped_in.at_points + c.stepped_in.outside : null} onDecision={openDecision}
              computing={!!data.eval.computing && data.funnel.source !== 'evaluate'} />
          </section>

          <WeeklyChart weeks={c.weekly} onWeek={(w) => filterTo({ id: `week:${w}`, label: `${slash(w)} 起的一周合并的`, keep: (r, run) => weekOf(r, run) === w })} />

          {data.overlaps.length > 0 && <Overlaps data={data} onKey={(k) => openKey(k)} />}

          <Flow rows={data.rows} at={data.at} hl={null} localOnly={localOnly} repos={scope.length} onOpen={(r) => toBoard(r)} onGo={go} onNew={newReq} repoName={repoName}
            onCell={(col, lane) => filterTo(cellPick(col, lane))} />

          <section className="cto-card" aria-label="交付清单" data-anchor="ledger" data-testid="ledger" ref={ledgerRef}>
            <div className="cto-ledger-head">
              <h3>交付清单</h3>
              <StateFilter counts={data.counts} total={data.rows.length} value={state} onPick={pickState} />
              {pick && <span className="cto-filter" data-testid="ledger-pick">{pick.label}<button type="button" aria-label={`不按「${pick.label}」筛选`} onClick={() => setPick(null)}>✕</button></span>}
              <span className="cto-dim" data-testid="ledger-count">共 {rows.length} 个 · 点一行打开它的需求看板</span>
            </div>
            <div className="br-scroll">
              <table className="cto-table br-ledger" data-testid="req-table">
                <thead>
                  <tr><th>需求</th><th>状态</th><th>Lean</th><th>在等</th><th>交付方式</th><th className="is-num">credits</th><th>MR</th><th /></tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr className="br-empty-row"><td colSpan={8}>
                      这个筛选下没有需求。{' '}
                      <button type="button" className="br-link" onClick={() => { setPick(null); pickState(undefined) }}>看全部</button>
                    </td></tr>
                  )}
                  {shown.map((g) => {
                    const id = idOf(g.r)
                    const open = !folded.has(id)
                    const row = (r: Requirement, tree?: Tree) => (
                      <Row key={idOf(r)} r={r} at={data.at} run={runsBy.get(idOf(r))} ev={data.eval} repoName={manyRepos && !tree ? repoName(r.repo) : undefined} tree={tree}
                        fold={r === g.r && g.kids.length ? { open, onFold: () => fold(id) } : undefined}
                        onOpen={() => toBoard(r)} onItem={() => toItem(r)} onReplay={() => toBoard(r, true)} onGo={go} />
                    )
                    return (
                      <Fragment key={id}>
                        {row(g.r)}
                        {open && g.kids.map((k, i) => row(k, i === g.kids.length - 1 ? 'last' : 'mid'))}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {listed > shownN && <button type="button" className="kt-btn is-small" style={{ marginTop: 10 }} onClick={() => setLimit((n) => n + 30)}>显示更多（还有 {listed - shownN} 个）</button>}
          </section>

          <EvalCard ev={data.eval} noModule={status?.brainkit.modules.evaluate === false} onBoard={(k) => openKey(k)} onItem={(k) => openKey(k, true)} onSettings={() => go({ kind: 'settings' })}
            onFamily={(f) => (f.repo ? toBoard(f) : openKey(f.key))} />
        </>
      )}

      {data && !empty && (
        <details className="cto-notes">
          <summary>口径</summary>
          <ul>
            <li>无人值守：brain-kit 评估里的「自主度」。交给运行机以后，除了必经的审批（需求、设计、计划、发布、验收），没有人做过任何事，而且交付正确（一次通过验收，合并后 14 天没有回滚、热修或缺陷）；14 天没满的、还没合并的算「还没评」，不算进分母。只在本机做的需求不交给运行机，也不算进分母。</li>
            <li>人介入：人在判断点上的动作是 Lean 的审批（批准、退回，打了批准那一行却没被接受的也算）和等人回答的问题；交接后又推了代码、允许改验收测试、平台上的手动操作，都算判断点之外。本机做的和交给运行机的需求都算。</li>
            <li>每个需求的 credits：这个 app 给需求开的 Kiro Crew 会话报的 credits 合计 ÷ 有 credits 的需求数。KiroCrew 只报 credits，没有别的用量数。</li>
            <li>决定 · 谁定的：<WhoSyntax />。每个决定只算一次，写了别的就算「没归类」，列出在哪一行，不猜是谁。还在分支上、没合并的需求也算；评估里的「知识有用率」只看默认分支上的引用，所以两个数的范围不一样。</li>
            <li>每周合并：合并进默认分支的那一周（周一起）；交付方式同上，没评估过的合并算「还没评」。</li>
            <li>轮到你、等别人：按每个需求此刻等谁；「已等」从它开始这样等的那一刻算起。</li>
            <li>没交付就结束：交给运行机以后，运行机没能开始，或 MR 关了没合并。它不算无人值守，也不算进分母。</li>
            <li>大需求：拆成小需求的需求。已合并 = 合进大需求分支的小需求；评估里大需求那一行的介入、问题和 credits 是大需求和它的小需求加起来的。待认领：拆出来、还没人认领的小需求。</li>
          </ul>
        </details>
      )}
    </main>
  )
}

/** A column and/or lane of 需求流动 as a ledger filter (its 「+N 个」, its heading). */
function cellPick(col?: Col, lane?: Lane): LedgerPick {
  const label = [col ? `「${COL_NAME[col]}」这一列` : '', lane ? `「${LANE_NAME[lane]}」` : ''].filter(Boolean).join('里')
  return {
    id: `cell:${col ?? ''}:${lane ?? ''}`,
    label: `需求流动 · ${label}`,
    keep: (r) => (!col || colOf(r) === col) && (!lane || (laneOf(r) === lane && isOpen(r))),
  }
}

/** The week a requirement was merged in, as the backend buckets 每周合并 (deliveries.cto_numbers / _week): its run's
 * merge, else a merged row's last activity; the Monday of that week (UTC), YYYY-MM-DD. */
function weekOf(r: Requirement, run: CtoRun | undefined): string | null {
  const t = run?.merged_at ?? (r.state === 'merged' ? r.updated_at : null)
  if (t === null || t === undefined) return null
  const wd = (new Date(t * 1000).getUTCDay() + 6) % 7
  const m = new Date((t - wd * 86400) * 1000)
  return `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, '0')}-${String(m.getUTCDate()).padStart(2, '0')}`
}

/** Open requirements first (the newest activity first), then the merged ones (into main, or a small one into its big
 * one's branch), then the closed. */
function sortRows(rows: Requirement[]): Requirement[] {
  const rank = (r: Requirement) => (r.state === 'merged' || r.state === 'merged_into_parent' ? 1 : r.state === 'closed' ? 2 : 0)
  return rows.slice().sort((a, b) => rank(a) - rank(b) || (b.updated_at ?? 0) - (a.updated_at ?? 0))
}

/** The ledger's rows as groups: a big requirement split into small ones, with those of them in the list right after it
 * (in its filing order); a small one whose big one is not in the list stands alone, where its own order puts it. */
function ledgerGroups(rows: Requirement[]): Group[] {
  const parents = new Set(rows.filter((r) => r.family?.role === 'parent').map(idOf))
  const parentOf = (r: Requirement) => {
    const f = r.family
    return f?.role === 'child' && f.parent !== r.key && parents.has(idOf({ repo: r.repo, key: f.parent })) ? idOf({ repo: r.repo, key: f.parent }) : null
  }
  const kids = new Map<string, Requirement[]>()
  for (const r of rows) {
    const p = parentOf(r)
    if (p) kids.set(p, [...(kids.get(p) ?? []), r])
  }
  return rows.filter((r) => !parentOf(r)).map((r) => {
    const order = (r.family?.children ?? []).map((c) => c.key)
    const at = (k: string) => (order.includes(k) ? order.indexOf(k) : order.length)
    return { r, kids: (kids.get(idOf(r)) ?? []).sort((a, b) => at(a.key) - at(b.key)) }
  })
}

/** 轮到你: every requirement that waits on the person, the longest wait first, each with its one step. */
function YourTurn({ rows, at, repoName, onGo, onOpen, onAll }: {
  rows: Requirement[]; at: number; repoName: (id: string) => string | undefined; onGo: (v: View) => void; onOpen: (r: Requirement) => void; onAll: () => void
}) {
  const SHOWN = 5
  const by = Object.entries(rows.reduce<Record<string, number>>((m, r) => {
    const w = waitName(r.waits)
    return w ? { ...m, [w]: (m[w] ?? 0) + 1 } : m
  }, {}))
  return (
    <section className="cto-card is-wait br-yours" aria-label="轮到你" data-testid="your-turn">
      <div className="cto-chart-head">
        <h3>轮到你</h3>
        <span className="cto-dim">{rows.length} 个需求{by.length > 0 ? ` · ${by.map(([w, n]) => `${w} ${n}`).join(' · ')}` : ''}</span>
      </div>
      <ul>
        {rows.slice(0, SHOWN).map((r) => {
          const step = stepOf(r)
          const waited = waitedText(r, at)
          const name = repoName(r.repo)
          return (
            <li key={idOf(r)} data-key={r.key}>
              {step && <StepButton step={step} onGo={onGo} />}
              <button type="button" className="br-link br-key" onClick={() => onOpen(r)} title="打开它的需求看板">{r.key}</button>
              <span className="br-yt-title">{r.title}</span>
              {name && <span className="cto-was">{name}</span>}
              <span>{r.waits.text}</span>
              {waited && <span className="br-waited">{waited}</span>}
              {r.waits.line && <LineCopy line={r.waits.line} sessionUrl={r.session_url} />}
            </li>
          )
        })}
      </ul>
      {rows.length > SHOWN && <button type="button" className="br-link" style={{ justifySelf: 'start' }} onClick={onAll}>还有 {rows.length - SHOWN} 件：在交付清单里看全部</button>}
    </section>
  )
}

/** The exact line the person types themselves in the session, with 复制那一行 and 打开会话 (it is never sent anywhere). */
function LineCopy({ line, sessionUrl }: { line: string; sessionUrl?: string | null }) {
  const navigate = useNavigate()
  const [copied, setCopied] = useState<'' | 'ok' | 'fail'>('')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(line)
      setCopied('ok')
    } catch {
      setCopied('fail')
    }
  }
  return (
    <span className="br-linecopy" data-testid="line-copy" onClick={(e) => e.stopPropagation()} title="在会话里自己打这一行：app 不会替你发">
      <code className="br-mono">{line}</code>
      <button type="button" className="br-btn is-small" onClick={() => void copy()}><Icon name="Copy" size={13} />{ACT.copyLine}</button>
      {sessionUrl && <button type="button" className="br-btn is-small" onClick={() => navigate(sessionUrl)}><Icon name="MessageSquare" size={13} />{ACT.openSession}</button>}
      {copied === 'ok' && <span className="br-small br-ok-text" role="status">已复制，去会话里自己打</span>}
      {copied === 'fail' && <span className="br-small br-bad-text" role="status">没复制成：请手动选中这一行</span>}
    </span>
  )
}

/** A big number that is not there yet: 「还没有」, and when it will be; 「正在算」 while brain-kit works it out. */
function NotYet({ testid, why, computing = false }: { testid: string; why: string; computing?: boolean }) {
  return (
    <>
      <div className="cto-value is-word" data-testid={testid}>{computing ? '正在算' : '还没有'}</div>
      <div className="cto-desc">{computing ? 'brain-kit 正在算评估，算好就出来' : why}</div>
    </>
  )
}

function UnattendedCard({ c, localOnly, computing, pick, onPick, onKey }: {
  c: CtoNumbers; localOnly: boolean; computing: boolean; pick: LedgerPick | null; onPick: (p: LedgerPick) => void; onKey: (r: CtoRun) => void
}) {
  const u = c.unattended
  const count = (h: CtoRun['how']) => c.runs.filter((r) => r.how === h).length
  const ended = c.runs.filter((r) => r.how === 'ended')
  const howPick = (hs: CtoRun['how'][], label: string): LedgerPick => ({ id: `how:${hs.join(',')}`, label, keep: (_r, run) => !!run && hs.includes(run.how) })
  const judged = !!u && u[1] > 0 && !localOnly
  return (
    <article className={`cto-card${judged && u && u[0] === u[1] ? ' is-ok' : ''}`} aria-label="无人值守" data-anchor="unattended">
      <div className="cto-eyebrow">无人值守</div>
      {localOnly ? (
        <>
          <div className="cto-value is-word" data-testid="ov-unattended">这次不需要</div>
          <div className="cto-desc">只在本机做的仓库不交给运行机；交给运行机、合并满 14 天的需求才算无人值守</div>
        </>
      ) : !u ? (
        <NotYet testid="ov-unattended" computing={computing} why={c.available ? '交给运行机的需求合并满 14 天以后才评' : 'brain-kit 的评估给出数字以后才有'} />
      ) : u[1] === 0 ? (
        <NotYet testid="ov-unattended" why="还没有评完的交接：交给运行机、合并满 14 天的需求才评" />
      ) : (
        <>
          <button type="button" className="cto-value cto-link-value" data-testid="ov-unattended" title="在交付清单里看评估过的交接"
            onClick={() => onPick(howPick(['unattended', 'people'], '交付方式：评估过的交接'))}>{u[0]}<span className="cto-of">/{u[1]}</span></button>
          <div className="cto-desc">交给运行机的需求里，交接以后没人插手就做完的</div>
          <MiniUnattended c={c} />
        </>
      )}
      {c.runs.length > 0 && !localOnly && (
        <div className="cto-legend">
          {([...HOW, 'ended'] as CtoRun['how'][]).filter((h) => count(h) > 0).map((h) => (
            <button type="button" key={h} data-how={h} aria-pressed={pick?.id === `how:${h}`} title={h === 'ended' ? HOW_ENDED : `在交付清单里看「${HOW_LABEL[h]}」的需求`}
              onClick={() => onPick(howPick([h], `交付方式：${HOW_LABEL[h]}`))}>
              <i className="cto-sw" style={{ background: HOW_VAR[h] }} />{HOW_LABEL[h]}<b>{count(h)}</b>
            </button>
          ))}
        </div>
      )}
      {ended.length > 0 && !localOnly && (
        <div className="cto-foot" data-testid="ov-ended">
          <span>没交付就结束：{ended.slice(0, 3).map((r, i) => (
            <span key={idOf(r)}>{i > 0 && '、'}<button type="button" className="br-link" onClick={() => onKey(r)}>{r.key}</button>{endedWhy(r) && `（${endedWhy(r)}）`}</span>
          ))}{ended.length > 3 && ` 等 ${ended.length} 个`}</span>
        </div>
      )}
    </article>
  )
}

function PeopleCard({ c, computing, onPick }: { c: CtoNumbers; computing: boolean; onPick: (p: LedgerPick) => void }) {
  const s = c.stepped_in
  const n = s ? s.at_points + s.outside : 0
  return (
    <article className={`cto-card${s && s.outside ? ' is-warn' : ''}`} aria-label="人介入" data-anchor="people">
      <div className="cto-eyebrow">人介入</div>
      {!s ? (
        <NotYet testid="ov-people" computing={computing} why="brain-kit 的评估给出数字以后才有" />
      ) : n === 0 ? (
        <NotYet testid="ov-people" why="人在判断点上批准、退回、回答以后才有" />
      ) : (
        <>
          <button type="button" className="cto-value cto-link-value" data-testid="ov-people" title="在交付清单里看人介入过的需求"
            onClick={() => onPick({ id: 'people', label: '人介入过的需求', keep: (_r, run) => !!run && run.at_points + run.outside > 0 })}>{n}<span className="cto-of">次</span></button>
          <div className="cto-desc">{s.at_points} 次落在判断点上（批准、退回、回答），{s.outside} 次在判断点之外 · 本机做的也算</div>
          <MiniPeople c={c} />
          {s.outside > 0 && (
            <div className="cto-foot"><span className="br-warn-text">判断点之外：{s.kinds.filter((k) => !k.point).map((k) => `${k.label} ${k.n}`).join('、')}</span></div>
          )}
        </>
      )}
    </article>
  )
}

/** *steppedIn*: 人介入's count, beside which 人定了 N 个 counts something else (said when the two differ). *computing*: the
 * app's own count stands in while brain-kit evaluates, and brain-kit's comes out different: 正在算, not a number that jumps. */
function FunnelCard({ f, team, steppedIn, onDecision, computing }: { f: Funnel; team: boolean; steppedIn: number | null; onDecision: (key: string, id: string) => void; computing: boolean }) {
  const people = f.rows.find((r) => r.id === 'person')?.count ?? 0
  // the app's words for who decided (需求详情's decisions say the same), not brain-kit's labels with agent / Who in them
  const rows = f.rows.map((r) => ({ ...r, label: DECIDED_BY[r.id] ?? r.label }))
  return (
    <article className={`cto-card${f.unclassified.length ? ' is-warn' : ''}`} aria-label="决定 · 谁定的" data-testid="funnel-card">
      <div className="cto-eyebrow">决定 · 谁定的</div>
      {computing || f.total === 0 ? (
        <NotYet testid="funnel-total" computing={computing} why="需求的决定表里有了决定以后才有" />
      ) : (
        <>
          <div className="cto-value" data-testid="funnel-total">{f.total}<span className="cto-of">个决定</span></div>
          <div className="cto-desc">人定了 {people} 个 · {f.source === 'evaluate' ? '数字来自 brain-kit 的评估' : 'app 自己数的'} · 没合并的需求也算</div>
          <MiniWho rows={rows} />
          <div className="br-funnel-rows">
            {rows.filter((r) => r.count > 0).map((r) => <span key={r.id} data-row={r.id}><i className="cto-sw" style={{ background: WHO_VAR[r.id] ?? 'var(--ov-ink-3)' }} />{r.label}<b>{r.count}</b></span>)}
          </div>
          {steppedIn !== null && steppedIn > 0 && steppedIn !== people && (
            <div className="cto-was br-funnel-vs" data-testid="funnel-vs-people">人定的 {people} 个是决定表里的条数；「人介入 {steppedIn} 次」数的是人做的动作（批准、退回、回答），所以两个数不一样</div>
          )}
        </>
      )}
      {f.unclassified.length > 0 && (
        <div className="cto-foot" data-testid="funnel-unclassified">
          <span className="br-warn-text">没归类 {f.unclassified.length} 个，去改「谁定的」那一格：</span>
          {f.unclassified.slice(0, 3).map((u) => (
            <button key={`${u.key}-${u.id}`} type="button" className="br-link" title={u.src ? `在 ${u.src}` : undefined} onClick={() => onDecision(u.key, u.id)}>{u.key} {u.id} ↗</button>
          ))}
          {f.unclassified.length > 3 && <span className="cto-was">还有 {f.unclassified.length - 3} 个</span>}
          <span className="cto-was">写法见口径</span>
        </div>
      )}
      {team && <div className="cto-foot" data-testid="funnel-questions"><span>问人 {fmt(f.questions.asked)} 次 · 答了 {fmt(f.questions.answered)} · 送回运行机 {fmt(f.questions.delivered)}</span></div>}
    </article>
  )
}

function Overlaps({ data, onKey }: { data: Overview; onKey: (key: string) => void }) {
  const owner = (k: string) => data.rows.find((r) => r.key === k)?.owner ?? null
  return (
    <section className="cto-card is-warn br-overlaps" aria-label="改同一处的需求" data-testid="overlaps">
      <div className="cto-chart-head"><h3>这些需求要改同一处</h3></div>
      {data.overlaps.map((o, i) => {
        const owners = o.keys.map(owner)
        const same = owners.every((x) => x && x === owners[0])
        return (
          <div key={i} className="br-overlap">
            {o.keys.map((k, j) => (
              <span key={k} className="br-row" style={{ gap: 4 }}>
                {j > 0 && <span className="br-dim">和</span>}
                <button type="button" className="br-link br-key" onClick={() => onKey(k)}>{k}</button>
                {!same && <span className="cto-was">{owners[j] ?? '没写负责人'}</span>}
              </span>
            ))}
            <span className="br-dim">都要改</span>
            {o.paths.map((p) => <code key={p} className="br-tag">{p}</code>)}
            <span className="cto-dim">{same ? `都是 ${owners[0]} 的：先合一个，再做另一个，免得冲突` : '先商量好谁先合，免得冲突'}</span>
          </div>
        )
      })}
    </section>
  )
}

/** backend/core/mrdesc_view.py SIZE_WORD: 「（规模 small）」 reads 「（规模小）」 as the backend writes it */
const SIZE_NAME: Record<string, string> = { small: '小', s: '小', xs: '很小', medium: '中', m: '中', large: '大', l: '大', xl: '很大' }

/** The first line of a 变更说明 for the ledger: `code` as code, internal ids (D01#S002 · 097f2e9e) only on hover, 规模
 * in Chinese, and without its 「现在：…」 tail (the row's state and Lean columns say that). The backend sends a person's
 * rows already plain (mrdesc_view.plain_line); this is a no-op on those and makes the runner's rows read the same. */
export function plainSummary(s: string): { parts: { code: boolean; text: string }[]; ids: string } {
  const ids: string[] = []
  const t = s.split('现在：')[0]
    .replace(/（([^（）]*#[^（）]*)）/g, (_m, id: string) => (ids.push(id), ''))
    .replace(/（规模\s*([A-Za-z]+)）/g, (m, z: string) => (SIZE_NAME[z.toLowerCase()] ? `（规模${SIZE_NAME[z.toLowerCase()]}）` : m))
    .trim()
  return { parts: t.split('`').map((text, i) => ({ code: i % 2 === 1, text })).filter((p) => p.text), ids: ids.join('；') }
}

function Summary({ text }: { text: string }) {
  const s = plainSummary(text)
  return (
    <div className="br-hint br-sum" data-testid="row-summary" title={s.ids ? `变更说明的第一行 · ${s.ids}` : '变更说明的第一行'}>
      {s.parts.map((p, i) => (p.code ? <code key={i}>{p.text}</code> : <span key={i}>{p.text}</span>))}
    </div>
  )
}

/** Lean's progress the one way the app says it: 做完 4 · 跳过 6 · 下一步：发布, the next stage's cell outlined. */
function LeanProgress({ r }: { r: Requirement }) {
  const l = r.lean
  if (l.done_n === undefined) return <LeanCell lean={l} compact />
  if (r.state === 'claimed' || (l.stage_n === null && !l.done_n && !l.skipped_n)) return <span className="cto-was" data-testid="lean-cell">还没开工</span>
  const next = l.next && l.next.label ? l.next : null
  const text = leanProgress({ done_n: l.done_n, skipped_n: l.skipped_n ?? 0, next })
  const skipped = l.skipped_n ?? 0
  return (
    <span className="br-lean" data-testid="lean-cell">
      <span className="br-prog" role="img" aria-label={text}>
        {Array.from({ length: l.total }, (_, i) => (
          <i key={i} className={i < l.done_n! ? 'is-done' : i < l.done_n! + skipped ? 'is-skipped' : next && i === l.done_n! + skipped ? 'is-next' : ''} />
        ))}
      </span>
      <span>{text.split(' · ').map((part, i) => <span key={i}>{i > 0 && ' · '}<span className="br-nw">{part}</span></span>)}</span>
    </span>
  )
}

/** The tone of how far a family is: its family_state, or brain-kit's eval state of the big requirement. */
const FAMILY_TONE: Record<string, string> = { in_progress: 'info', ready_to_release: 'wait', done: 'ok', merged: 'ok', closed: 'idle', failed: 'bad', unknown: 'warn', merged_not_here: 'warn' }

/** A row's family, in its 需求 cell: a big one's 小需求 n/m (the toggle of its small ones' rows when they are in the
 * list); a small one's unit, its big one (when it is not right above), what blocks it (unless 在等 says it already). */
function FamilyBits({ r, f, nested, fold }: { r: Requirement; f: ReqFamily; nested: boolean; fold?: { open: boolean; onFold: () => void } }) {
  if (f.role === 'big') return <span className="br-chip tone-info" title={f.family_label || undefined}>大需求</span>
  if (f.role === 'parent') {
    const { merged, total } = familyProgress(f)
    const tone = FAMILY_TONE[f.family_state ?? ''] ?? 'info'
    const title = f.family_label || undefined
    if (!fold) return <span className={`br-chip tone-${tone}`} title={title}>小需求 {merged}/{total}</span>
    return (
      <button type="button" className={`br-chip tone-${tone} br-fam-toggle`} aria-expanded={fold.open} title={`${fold.open ? '收起' : '展开'}它的小需求${title ? `（${title}）` : ''}`}
        onClick={(e) => { e.stopPropagation(); fold.onFold() }}>小需求 {merged}/{total} {fold.open ? '▾' : '▸'}</button>
    )
  }
  const blocks = blockersOf(f).filter((d) => !r.waits.text.includes(d.key))
  return (
    <>
      {f.unit && <span className="br-tag" title="单元（unit-of-work.md）">{f.unit}</span>}
      {!nested && <span className="cto-was">{f.parent} 的小需求</span>}
      {blocks.length > 0 && <span className="br-chip tone-warn" title={blocks.map(blockText).join('；')}>等 {blocks.map((d) => d.key).join('、')} 合进大需求</span>}
    </>
  )
}

/** The eval states the how already says (a merge, still open): their words add nothing beside it. */
const HOW_SAYS = new Set(['merged', 'open'])
const HOW_ENDED = '没交付就结束：运行机没能开始，或 MR 关了没合并'
/** Why a run ended without a delivery: brain-kit's words for it (its beyond), else its state's. */
const endedWhy = (r: CtoRun) => r.beyond.join('、') || r.state_label

/** 交付方式: how it was delivered and a person's acts; for one that ended without a delivery, why; the run's state when
 * it says more than the how (有了回答、运行机没接着做, 已合进大需求 …); 停住了 when nothing new came for a long time; its
 * delivery in the title. One done only here and not merged yet is 只在本机（还没合并）. */
function HowCell({ r, run }: { r: Requirement; run?: CtoRun }) {
  if (!run) return <span className="cto-was">—</span>
  const ended = run.how === 'ended'
  const why = ended ? endedWhy(run) : ''
  const said = !!run.state_label && !HOW_SAYS.has(run.state ?? '') && run.state_label !== why && !(ended && run.beyond.length)
  const title = [ended ? HOW_ENDED : '', run.delivery_label ? `交付：${run.delivery_label}` : '', !ended && run.beyond.length ? `判断点之外：${run.beyond.join('、')}` : '']
    .filter(Boolean).join(' · ')
  return (
    <span className="br-how-cell" data-how={run.how} title={title || undefined}>
      {run.how === 'pending' && r.local_only ? (
        <span className="br-how" title="只在这台机器上做，不交给运行机：合并以后算「只在本机」"><i style={{ background: HOW_VAR.local }} />{HOW_LABEL.local}（还没合并）</span>
      ) : (
        <span className="br-how">
          <i style={{ background: HOW_VAR[run.how] }} />{HOW_LABEL[run.how]}
          {run.stuck && <span className="br-chip tone-warn" title="好久没有新动静了（brain-kit 的 stuck_hours）">停住了</span>}
        </span>
      )}
      {(run.at_points || run.outside) ? (
        <span className="cto-was"><span className="br-nw">人介入 {run.at_points + run.outside} 次</span>{run.outside ? <span className="br-nw">（判断点外 {run.outside}）</span> : null}</span>
      ) : null}
      {why && <span className="cto-was" data-testid="how-why">{why}</span>}
      {said && <span className="cto-was" data-testid="how-state">{run.state_label}</span>}
    </span>
  )
}

function Row({ r, at, run, ev, repoName, tree, fold, onOpen, onItem, onReplay, onGo }: {
  r: Requirement; at: number; run?: CtoRun; ev: EvalView; repoName?: string; tree?: Tree; fold?: { open: boolean; onFold: () => void }
  onOpen: () => void; onItem: () => void; onReplay: () => void; onGo: (v: View) => void
}) {
  const f = r.family
  const done = r.state === 'merged' || r.state === 'merged_into_parent'
  const step = stepOf(r)
  const waited = r.waits.who === 'you' || (r.waits.who !== 'nobody' && isOpen(r)) ? waitedText(r, at) : ''
  const review = ev.queue.find((q) => q.key === r.key)
  const skipped = ev.skipped.find((x) => x.key === r.key)
  return (
    <tr data-key={r.key} data-role={f?.role ?? undefined} className={`cto-row-pick${done ? ' is-merged' : ''}${tree ? ' br-kid' : ''}`} onClick={onOpen} title={`打开它的${ACT.openBoard}`} tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget && (e.preventDefault(), onOpen())}>
      <td className="br-col-req">
        <div className="br-row" style={{ gap: 6 }}>
          {tree && <span className="br-tree" aria-hidden="true">{tree === 'last' ? '└' : '├'}</span>}
          <b className="br-key">{r.key}</b>
          <span>{r.title}</span>
          {f && <FamilyBits r={r} f={f} nested={!!tree} fold={fold} />}
          {repoName && <span className="cto-was">{repoName}</span>}
          {r.open_questions.map((q) => <span key={q} className="br-chip tone-wait" title="还没回答的问题">{q} 待答</span>)}
          {r.overlap.length > 0 && <span className="br-chip tone-warn" title="和这些需求要改同一处">和 {r.overlap.join('、')} 重叠</span>}
          {review && <span className="br-chip tone-warn" title={review.reasons.join('；')}>要复看</span>}
          {skipped && <span className="br-chip tone-idle" title={skipped.why}>评估跳过了它</span>}
        </div>
        {r.summary && <Summary text={r.summary} />}
      </td>
      <td className="br-col-nowrap">
        <StateChip state={r.state} label={r.state_label} who={r.waits.who} />
        {r.updated_at !== null && <div className="cto-was">{ago(r.updated_at, at)}更新</div>}
      </td>
      <td><LeanProgress r={r} /></td>
      <td className="br-col-wait">
        <div className={r.waits.who === 'you' ? 'br-strong' : undefined}>{r.waits.text}</div>
        {waited && <div className={r.waits.who === 'you' ? 'br-waited' : 'cto-was'}>{waited}</div>}
        {r.waits.line && <LineCopy line={r.waits.line} sessionUrl={r.session_url} />}
        {step && <StepButton step={step} onGo={onGo} primary={false} />}
      </td>
      <td><HowCell r={r} run={run} /></td>
      <td className="is-num">{fmtCredits(r.credits)}</td>
      <td className="br-col-nowrap" onClick={(e) => e.stopPropagation()}><MrLink mr={r.mr} /></td>
      <td onClick={(e) => e.stopPropagation()}>
        <span className="br-acts">
          <button type="button" className="kt-btn is-small" onClick={onItem}>{ACT.openDetail}</button>
          {r.state === 'merged' && <button type="button" className="kt-btn is-small" onClick={onReplay} title="在需求看板上从头回放">▶ 回放</button>}
        </span>
      </td>
    </tr>
  )
}

/** What each eval number means, in one short line under it (brain-kit's full rule is on hover). */
const METRIC_SHORT: Record<string, string> = {
  autonomy: '交接以后没人插手、交付也正确的',
  delivery: '一次过验收、合并后 14 天没出问题的',
  judgment: '人做的事里，落在批准、退回、回答上的',
  repeat_rate: '同一个纠正又出现的（越低越好）',
  useful: 'Brain 条目里被引用过的（只看默认分支）',
  staleness: '过时的引用、同名术语、覆盖或撤回的',
  credits_per_success: '每交付对一个需求花的 credits',
}

/** Each eval number's whole rule, in the app's words (brain-kit's own has Lean's approval kinds and its field names). */
const METRIC_RULE: Record<string, string> = {
  autonomy: '交接以后，除了必经的审批（需求、设计、计划、发布审批和验收），没有人做过任何事，而且交付正确',
  delivery: '一次通过验收，合并后 14 天内没有回滚、修复提交，也没有新认领的缺陷',
  judgment: '判断点是 Lean 的审批（批准、退回）和等人回答的问题（本机会话里的、MR 上的）',
  repeat_rate: '同一条纠正又被提出的次数 ÷ 全部纠正（越低越好）',
  useful: '被引用过的 Brain 条目 ÷ 现有的条目',
  staleness: '过时的引用 + 同名的术语 + 这一期被覆盖或撤回的条目',
  credits_per_success: '做完的运行花的 credits 合计 ÷ 交付正确的需求数；只用来看钱花在哪，不设上限',
}

function metricValue(v: EvalMetric['value']): string | null {
  if (v === null) return null
  if (Array.isArray(v)) return v[1] > 0 ? `${v[0]}/${v[1]}` : null
  return String(v)
}

/** brain-kit's eval batch: its numbers with what each means, the runs to look at again, the runs it skipped and its
 * notes. The batch is what the default branch has records of: it does not follow the ledger's filters. Without a batch:
 * why in words (a missing module: what to do and 去设置), brain-kit's own words folded under 细节. */
function EvalCard({ ev, noModule, onBoard, onItem, onSettings, onFamily }: {
  ev: EvalView; noModule: boolean; onBoard: (k: string) => void; onItem: (k: string) => void; onSettings: () => void; onFamily: (f: EvalFamily) => void
}) {
  const families = ev.families ?? []
  const computing = !ev.available && !!ev.computing
  const missing = !computing && (noModule || !ev.error)
  const notes = ev.note_rows
  // brain-kit's own words; a backend older than EvalView.raw put them in the error of a missing module
  const folded = ev.raw ?? (missing ? ev.error : '')
  return (
    <section className="cto-card br-eval" aria-label="brain-kit 的评估" data-testid="eval-batch">
      <div className="cto-chart-head">
        <h3>brain-kit 的评估</h3>
        <span className="cto-dim">{ev.available ? `这一批：${ev.ref || '默认分支'}上已经有记录的需求 · 不跟着交付清单的筛选变` : ''}</span>
      </div>
      {!ev.available ? (
        <div className="br-note" style={{ marginTop: 6 }}>
          {computing ? <span data-testid="eval-computing">正在算：brain-kit 在后台评估默认分支上的记录，算好这里和上面的数字就出来，不用刷新。</span> : missing ? (
            <>
              brain-kit 还没有评估模块。做什么：换一个新一点的 brain-kit，评估的数字就会出来。
              <button type="button" className="br-link" style={{ marginLeft: 6 }} onClick={onSettings}>去设置 ↗</button>
            </>
          ) : ev.error}
          {folded && <details className="br-raw"><summary>细节</summary><pre>{folded}</pre></details>}
        </div>
      ) : (
        <>
          <div className="br-metrics">
            {ev.metrics.map((m) => {
              const v = metricValue(m.value)
              return (
                <div key={m.id} className="br-metric" data-metric={m.id} title={METRIC_RULE[m.id] ?? m.rule}>
                  <span>{m.label}</span>
                  <b className={v === null ? 'is-none' : undefined}>{v ?? '还没有'}</b>
                  <small>{METRIC_SHORT[m.id] ?? m.rule}</small>
                </div>
              )
            })}
          </div>
          {(families.length > 0 || ev.queue.length > 0 || ev.skipped.length > 0 || ev.notes.length > 0) && (
            <ul className="br-eval-list">
              {families.map((f) => (
                <li key={`f-${f.repo}/${f.key}`} data-testid="eval-family" data-family={f.key}>
                  <span className="kt-pill tone-info">大需求</span>
                  <button type="button" className="br-link br-key" onClick={() => onFamily(f)} title="打开它的需求看板">{f.key} ↗</button>
                  <span className={`br-chip tone-${FAMILY_TONE[f.state] ?? 'idle'}`}>{f.state_label || f.state}</span>
                  <span className="br-tag" data-n="merged" title={f.children.length ? `小需求：${f.children.join('、')}` : undefined}>已合并<b>{f.merged}/{f.total}</b></span>
                  {(f.not_started?.length ?? 0) > 0 && <span className="br-tag" data-n="not_started" title={f.not_started!.join('、')}>没开工<b>{f.not_started!.length}</b></span>}
                  {(f.closed?.length ?? 0) > 0 && <span className="br-tag" data-n="closed" title={`关了，不算在内：${f.closed!.join('、')}`}>关了<b>{f.closed!.length}</b></span>}
                  <span className="cto-was" title="大需求和它的小需求加起来">
                    <span data-n="at_points">判断点上 {f.at_points}</span> · <span data-n="outside">判断点外 {f.outside}</span> · <span data-n="questions">问题 {f.questions}</span>
                    {' · '}<span data-n="credits">{fmtCredits(f.credits)} credits</span>
                  </span>
                </li>
              ))}
              {ev.queue.map((q) => (
                <li key={`q-${q.key}`} data-testid="eval-queue">
                  <span className="kt-pill tone-warn">要复看</span>
                  <button type="button" className="br-link br-key" onClick={() => onBoard(q.key)}>{q.key} ↗</button>
                  <span>{q.reasons.join('；')}</span>
                </li>
              ))}
              {ev.skipped.map((x) => (
                <li key={`s-${x.key}`} data-testid="eval-skipped">
                  <span className="kt-pill tone-idle">跳过</span>
                  <button type="button" className="br-link br-key" onClick={() => onItem(x.key)}>{x.key} ↗</button>
                  <span><span className="br-warn-text">读不了，不算进数字：</span>{x.why}</span>
                  <span className="cto-was">做什么：在它的分支上把这个文件改对，下一次评估就会算进来</span>
                  {x.raw && x.raw !== x.why && <details className="br-raw"><summary>细节</summary><pre>{x.raw}</pre></details>}
                </li>
              ))}
              {notes ? notes.map((n, i) => (
                <li key={`n-${i}`} className="cto-was" data-testid="eval-notes">
                  <span>brain-kit 说：{n.text}</span>
                  {n.todo && <span>做什么：{n.todo}</span>}
                  {n.raw && n.raw !== n.text && <details className="br-raw"><summary>细节</summary><pre>{n.raw}</pre></details>}
                </li>
              )) : ev.notes.length > 0 && <li className="cto-was" data-testid="eval-notes">brain-kit 说：{ev.notes.join('；')}</li>}
            </ul>
          )}
        </>
      )}
    </section>
  )
}

function StateFilter({ counts, total, value, onPick }: { counts: Overview['counts']; total: number; value?: ReqState; onPick: (s: ReqState | undefined) => void }) {
  const shown = STATES.filter((s) => (counts[s] ?? 0) > 0 || s === value)
  return (
    <div className="cto-seg" role="group" aria-label="按状态看" data-testid="state-filter">
      <button type="button" aria-pressed={!value} onClick={() => onPick(undefined)}>全部 {total}</button>
      {shown.map((s) => (
        <button key={s} type="button" className={`tone-${STATE_TONE[s]}`} aria-pressed={value === s} onClick={() => onPick(value === s ? undefined : s)}>
          {STATE_LABEL[s]} {counts[s] ?? 0}
        </button>
      ))}
    </div>
  )
}

/** 从远端取最新 (git fetch) for every repo here that has a remote; none: no button (a repo done only here has nothing
 * to fetch). What happened is said per repo (by its name when there are several); git's own words are under 细节. */
function RefreshButton({ repos, onDone }: { repos: RepoInfo[]; onDone: () => void }) {
  const api = useAppApi()
  const act = useAction(async () => {
    const out: (RefreshResult & { name: string })[] = []
    for (const r of repos) out.push({ ...(await api.post<RefreshResult>(paths.refresh(), { repo: r.id })), name: r.name })
    return out
  })
  if (repos.length === 0) return null
  const run = async () => {
    const r = await act.run()
    if (r) onDone()
  }
  const named = repos.length > 1
  return (
    <span className="br-refresh">
      {act.result?.map((x) => (
        <span key={x.name} className={`br-small ${x.ok ? 'br-dim' : 'br-bad-text'}`} role="status" data-testid="refresh-result">
          {named && `${x.name}：`}{x.text}
          {x.raw && <details className="br-raw"><summary>细节</summary><pre>{x.raw}</pre></details>}
        </span>
      ))}
      {act.error && (
        <span className="br-small br-bad-text" role="alert">没取成：{act.error}。做什么：看看网络、远端地址和你的权限，再点一次</span>
      )}
      <button type="button" className="br-btn is-small" disabled={act.busy} onClick={() => void run()} title={`从远端读最新的分支和默认分支（${repos.map((r) => r.name).join('、')}），这里的数字跟着更新`}>
        <Icon name="RefreshCw" size={13} />{act.busy ? '正在取…' : '从远端取最新'}
      </button>
    </span>
  )
}

