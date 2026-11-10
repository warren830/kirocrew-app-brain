/**
 * The bar every view shares (the sample's app bar): the app's name, the views as tabs — 交付总览 (every requirement),
 * 需求详情 and 需求看板 (the requirement in hand: the last one opened), 开需求, Brain, 待办 (with its count), 运行机 (team
 * mode only) — and at the right 导入仓库 (how a repo gets into the app) and 设置. It stays where it is when the view
 * changes. Without a requirement in hand, 需求详情 and 需求看板 open the one that waits on you (else the newest one); with one
 * in hand both tabs carry its key, so a person sees which one they open; one its repo does not have (*gone*) opens in
 * neither, and the other tab says so instead of opening it. 运行机 opened on a machine that is not a team
 * runner is still a tab there (selected, greyed): the page says why it is empty.
 */
import { VIEW_NAME, type ViewKind } from './nav'
import { Icon } from './ui'
import { RoleIcon } from './board/RoleIcon'

type Tab = Exclude<ViewKind, 'settings' | 'import'>
const TABS: [Tab, string, string][] = ([
  ['overview', '全部需求：结果、需求流动、交付清单'],
  ['item', '一个需求：周期、时间花在哪、成本、检查、决定和问题'],
  ['board', '一个需求怎么走：你、本机会话、Lean 的审批、交接、运行机、检查、验收'],
  ['new', '认领一个需求，文档过五关，开工'],
  ['brain', '仓库里的共享知识：条目、检查、用处、回写'],
  ['todo', '等你做的事'],
  ['team', '团队运行机：交接、运行、签名'],
] as [Tab, string][]).map(([k, hint]) => [k, VIEW_NAME[k], hint])

export function AppBar({ view, onView, item, gone = false, picking, todo, team }: {
  view: ViewKind
  onView: (v: ViewKind) => void
  /** the requirement in hand (KEY), what 需求详情 and 需求看板 open */
  item?: string
  /** its repo does not have it (the view in hand got 404) */
  gone?: boolean
  /** 需求详情 / 需求看板 clicked with nothing in hand: the app is picking one */
  picking?: boolean
  /** status.counts.todo */
  todo: number
  /** team mode: the 运行机 tab */
  team: boolean
}) {
  return (
    <header className="br-bar" data-testid="br-appbar">
      <h1><RoleIcon role="brain" size={16} />Brain 交付</h1>
      <div className="br-tabs" role="tablist" aria-label="视图">
        {TABS.filter(([k]) => k !== 'team' || team || view === 'team').map(([k, name, hint]) => {
          const held = k === 'item' || k === 'board'
          const off = k === 'team' && !team
          const none = held && !!item && gone && view !== k
          return (
            <button type="button" role="tab" key={k} aria-selected={view === k} disabled={held && !item && !!picking}
              aria-disabled={none || undefined} className={off || none ? 'is-off' : undefined}
              title={off ? '这台机器不是团队运行机' : none ? `没有 ${item} 这个需求：${name}打不开` : held ? (item ? `${hint}（${item}）` : `${hint}（打开等你的那个需求，没有就打开最近的）`) : hint}
              aria-label={k === 'todo' && todo > 0 ? `待办 ${todo}` : held && item ? `${name} ${item}` : undefined}
              onClick={() => view !== k && !none && onView(k)}>
              {name}
              {held && item && <span className="br-bar-key">{item}</span>}
              {k === 'todo' && todo > 0 && <span className="br-count" aria-hidden="true">{todo}</span>}
            </button>
          )
        })}
      </div>
      <span className="br-grow" />
      <button type="button" className="br-btn" aria-pressed={view === 'import'} onClick={() => view !== 'import' && onView('import')} title="本机目录或克隆：先检查它，没装 brain-kit 的直接装上">
        <Icon name="FolderPlus" size={14} />{VIEW_NAME.import}
      </button>
      <button type="button" className="br-btn" aria-pressed={view === 'settings'} onClick={() => view !== 'settings' && onView('settings')} title="brain-kit、仓库、团队模式">
        <Icon name="Settings" size={14} />{VIEW_NAME.settings}
      </button>
    </header>
  )
}
