/**
 * 切换需求: the select on 需求详情 and 需求看板 (the sample board's 选择运行) that opens another requirement in the same
 * view, so neither view is stuck on the one first opened. It lists what 交付总览 lists (GET /overview?repo=all, read
 * again every 30 s): grouped by repo when there is more than one, the newest activity first, and 「等你」 on the ones
 * that wait on the person. Nothing to switch to (one requirement, or the list did not come): it is not shown.
 */
import { paths, usePoll } from '../api'
import type { Overview, Requirement, Status } from '../types'

export const SWITCH_POLL_MS = 30_000

const SEP = '\u0001'
const idOf = (repo: string, key: string) => `${repo}${SEP}${key}`

export function optionText(r: Requirement): string {
  return `${r.key} ${r.title}${r.state_label ? ` · ${r.state_label}` : ''}${r.waits.who === 'you' ? ' · 等你' : ''}`
}

/** The one shown that its repo does not have (closed, or a key from elsewhere): 「PAY-1（shop-pay 里没有）」. */
export function missingText(key: string, repoName: string): string {
  return `${key}（${repoName}${/[\x21-\x7e]$/.test(repoName) ? ' ' : ''}里没有）`
}

export function ReqSwitch({ repo, reqKey, status, onPick, pollMs }: {
  repo: string
  reqKey: string
  status: Status | null
  onPick: (repo: string, key: string) => void
  pollMs?: number
}) {
  const o = usePoll<Overview>(paths.overview('all'), Math.max(pollMs ?? 0, SWITCH_POLL_MS))
  const rows = o.data?.rows ?? []
  const here = rows.some((r) => r.repo === repo && r.key === reqKey)
  if (!rows.length || (rows.length === 1 && here)) return null
  const t = (r: Requirement) => r.updated_at ?? 0
  const order = (status?.repos ?? []).map((x) => x.id)
  const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : id === 'runner' ? order.length : order.length + 1)
  const groups = new Map<string, Requirement[]>()
  for (const r of [...rows].sort((a, b) => rank(a.repo) - rank(b.repo) || t(b) - t(a))) {
    groups.set(r.repo, [...(groups.get(r.repo) ?? []), r])
  }
  const nameOf = (id: string) => (id === 'runner' ? '运行机' : status?.repos.find((x) => x.id === id)?.name ?? id)
  const options = (list: Requirement[]) => list.map((r) => <option key={idOf(r.repo, r.key)} value={idOf(r.repo, r.key)}>{optionText(r)}</option>)
  return (
    <label className="br-switch" title="换一个需求看：在这个视图里打开它">
      <span>切换需求</span>
      <select className="kt-select" aria-label="切换需求" data-testid="br-switch" value={idOf(repo, reqKey)}
        onChange={(e) => {
          const [r, k] = e.target.value.split(SEP)
          if (r && k && (r !== repo || k !== reqKey)) onPick(r, k)
        }}>
        {!here && <option value={idOf(repo, reqKey)}>{missingText(reqKey, nameOf(repo))}</option>}
        {groups.size > 1
          ? [...groups].map(([id, list]) => <optgroup key={id} label={nameOf(id)}>{options(list)}</optgroup>)
          : options([...groups.values()][0])}
      </select>
    </label>
  )
}

/** A requirement its repo does not have (需求详情, 需求看板): which repo, what may have happened, and what to do. */
export function NotFound({ repoName, reqKey, onOverview, testId }: { repoName: string | null; reqKey: string; onOverview: () => void; testId: string }) {
  return (
    <section className="cto-card br-notfound" aria-label="没有这个需求" data-testid={testId}>
      <h3>{repoName ? `${repoName} 仓库里没有 ${reqKey}` : `没有找到 ${reqKey}`}</h3>
      <p className="cto-desc">它可能已经关闭，或者在别的仓库里。</p>
      <p className="br-hint">做什么：在上面「切换需求」里换一个，或者回交付总览找。</p>
      <div className="br-row" style={{ marginTop: 10 }}>
        <button type="button" className="kt-btn is-primary" onClick={onOverview}>回交付总览</button>
      </div>
    </section>
  )
}
