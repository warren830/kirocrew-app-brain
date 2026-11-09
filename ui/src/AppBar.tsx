/**
 * The bar every view shares (the sample's app bar): the app's name, the views as tabs — 交付总览 (every requirement),
 * 需求详情 and 需求看板 (the requirement in hand: the last one opened), 开需求, Brain, 待办 (with its count), 运行机 (team
 * mode only) — and at the right 导入仓库 (how a repo gets into the app) and 设置. It stays where it is when the view
 * changes. Without a requirement in hand, 需求详情 and 需求看板 are off.
 */
import type { ViewKind } from './nav'
import { Icon } from './ui'
import { RoleIcon } from './board/RoleIcon'

type Tab = Exclude<ViewKind, 'settings' | 'import'>
const TABS: [Tab, string, string][] = [
  ['overview', '交付总览', '全部需求：结果、需求流动、交付清单'],
  ['item', '需求详情', '一个需求：周期、时间花在哪、成本、检查、决定和问题'],
  ['board', '需求看板', '一个需求怎么走：你、本机会话、Lean 的审批、交接、运行机、检查、验收'],
  ['new', '开需求', '认领一个需求，文档过五关，开工'],
  ['brain', 'Brain', '仓库里的共享知识：条目、检查、用处、回写'],
  ['todo', '待办', '等你做的事'],
  ['team', '运行机', '团队运行机：交接、运行、签名'],
]

export function AppBar({ view, onView, item, todo, team }: {
  view: ViewKind
  onView: (v: ViewKind) => void
  /** the requirement in hand (KEY), what 需求详情 and 需求看板 open */
  item?: string
  /** status.counts.todo */
  todo: number
  /** team mode: the 运行机 tab */
  team: boolean
}) {
  return (
    <header className="br-bar" data-testid="br-appbar">
      <h1><RoleIcon role="brain" size={16} />Brain 交付</h1>
      <div className="br-tabs" role="tablist" aria-label="视图">
        {TABS.filter(([k]) => k !== 'team' || team).map(([k, name, hint]) => {
          const held = k === 'item' || k === 'board'
          return (
            <button type="button" role="tab" key={k} aria-selected={view === k} disabled={held && !item && view !== k}
              title={held ? (item ? `${hint}（${item}）` : '先在交付总览里点一个需求') : hint}
              aria-label={k === 'todo' && todo > 0 ? `待办 ${todo}` : undefined}
              onClick={() => view !== k && onView(k)}>
              {name}
              {held && item && view === k && <span className="br-bar-key">{item}</span>}
              {k === 'todo' && todo > 0 && <span className="br-count" aria-hidden="true">{todo}</span>}
            </button>
          )
        })}
      </div>
      <span className="br-grow" />
      <button type="button" className="br-btn" aria-pressed={view === 'import'} onClick={() => view !== 'import' && onView('import')} title="本机目录或克隆：检查它，没装 brain-kit 就装到新分支上">
        <Icon name="FolderPlus" size={14} />导入仓库
      </button>
      <button type="button" className="br-btn" aria-pressed={view === 'settings'} onClick={() => view !== 'settings' && onView('settings')} title="brain-kit、仓库、团队模式">
        <Icon name="Settings" size={14} />设置
      </button>
    </header>
  )
}
