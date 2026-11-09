/**
 * Line icons, from the sample team board: single-colour drawings (stroke only, currentColor) on a 24×24 grid, 1.6
 * stroke, round caps — they take the text colour, so both themes work. Inside the board's SVG they render as a nested
 * <svg> positioned by x/y/size. The sample's role and moment drawings are kept; BRAIN_ICONS adds the actors of a
 * requirement's way (你, 本机会话, Lean 的审批, 交接, 桥, 签名, 运行机, CI, 发布验收, 合并, 回写 Brain) and the app's views.
 */
import type { ReactNode } from 'react'

const PATHS: Record<string, ReactNode> = {
  // 意图：靶心
  intent: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 12h.01" />
    </>
  ),
  // 约束：天平
  feasibility: (
    <>
      <path d="M12 4v15.5M8 19.5h8M5 7.5h14" />
      <path d="M5 7.5l-2.5 6a2.8 2.8 0 0 0 5 0L5 7.5zM19 7.5l-2.5 6a2.8 2.8 0 0 0 5 0L19 7.5z" />
    </>
  ),
  // 范围：打了勾的清单
  scope: (
    <>
      <path d="M10 6.5h10M10 12h10M10 17.5h10" />
      <path d="M3.8 6.5l1.4 1.4L8 5M3.8 12l1.4 1.4L8 10.5M3.8 17.5l1.4 1.4L8 16" />
    </>
  ),
  // 产品经理：一张验收清单
  pm: (
    <>
      <rect x="5.5" y="4.5" width="13" height="16" rx="2" />
      <path d="M9.5 4.5V3.5h5v1" />
      <path d="M9 12.5l2 2 4-4" />
    </>
  ),
  // 商品列表：九宫格
  catalog: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.2" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2" />
    </>
  ),
  // 商品详情：一张带图的卡片
  detail: (
    <>
      <rect x="4" y="3.5" width="16" height="17" rx="2" />
      <rect x="7" y="6.5" width="10" height="6" rx="1" />
      <path d="M7 15.5h10M7 18h6" />
    </>
  ),
  // 购物车与结算：购物车
  cart: (
    <>
      <path d="M3 4.5h2.5l2.2 10.5h10.6l2-7.5H6.6" />
      <circle cx="9.5" cy="19" r="1.4" />
      <circle cx="17" cy="19" r="1.4" />
    </>
  ),
  // 安全审查：盾牌
  security: (
    <>
      <path d="M12 3.5l7.5 3v5.5c0 4.5-3.2 7.7-7.5 9-4.3-1.3-7.5-4.5-7.5-9V6.5l7.5-3z" />
      <path d="M9 12l2.2 2.2L15.5 10" />
    </>
  ),
  // 架构师：分层
  architect: (
    <>
      <path d="M12 3.5l8.5 4.5-8.5 4.5L3.5 8 12 3.5z" />
      <path d="M3.5 12.5l8.5 4.5 8.5-4.5" />
      <path d="M3.5 16.5l8.5 4 8.5-4" />
    </>
  ),
  // UI 设计：铅笔
  designer: (
    <>
      <path d="M4.5 19.5l1-4L15.5 5.5l3 3-10 10-4 1z" />
      <path d="M13.5 7.5l3 3" />
    </>
  ),
  // 测试：烧瓶
  tester: (
    <>
      <path d="M9 3.5h6" />
      <path d="M10 3.5v6l-5 8.5a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3L14 9.5v-6" />
      <path d="M7.5 15.5h9" />
    </>
  ),
  // 后端：服务器
  backend: (
    <>
      <rect x="3.5" y="4.5" width="17" height="6.5" rx="1.5" />
      <rect x="3.5" y="13" width="17" height="6.5" rx="1.5" />
      <path d="M7 7.75h.01M7 16.25h.01" />
    </>
  ),
  // 网页前端：显示器
  frontend: (
    <>
      <rect x="3.5" y="4.5" width="17" height="11.5" rx="1.5" />
      <path d="M9 20h6M12 16v4" />
    </>
  ),
  // 安卓：手机
  mobile: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M11 18h2" />
    </>
  ),
  // 运维：容器
  ops: (
    <>
      <path d="M12 3.5l8 4.5v8L12 20.5 4 16V8l8-4.5z" />
      <path d="M4 8l8 4.5L20 8" />
      <path d="M12 12.5v8" />
    </>
  ),
  // 部署：火箭
  deploy: (
    <>
      <path d="M12 3c3 2.2 4.5 5.5 4.5 9.5l-2 3h-5l-2-3C7.5 8.5 9 5.2 12 3z" />
      <circle cx="12" cy="9.5" r="1.6" />
      <path d="M9.5 15.5l-2 3.5M14.5 15.5l2 3.5M12 16v4.5" />
    </>
  ),
  // 动效：一道带星光的弧线
  motion: (
    <>
      <path d="M3.5 18.5c4-1 7-4 8.5-9" />
      <path d="M17 3.5l1.1 2.4 2.4 1.1-2.4 1.1L17 10.5l-1.1-2.4-2.4-1.1 2.4-1.1z" />
      <path d="M6.5 6.5l.6 1.3 1.3.6-1.3.6-.6 1.3-.6-1.3-1.3-.6 1.3-.6z" />
    </>
  ),
  // 合规与安全：盾牌
  compliance: (
    <>
      <path d="M12 3.5l7 3v5.5c0 4.2-2.9 7.2-7 8.5-4.1-1.3-7-4.3-7-8.5V6.5l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  // 评审：放大镜
  reviewer: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5" />
    </>
  ),
  // 整个产品：版面
  product: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
      <path d="M3.5 9h17M9 9v11.5" />
    </>
  ),
}

/** The moments of a run, drawn the same way (CTO 视图 and 交付详情 use them beside the role icons). */
export const ACTION_ICONS = {
  // 等人批准：一个人
  wait: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
    </>
  ),
  // 批准：打勾的圆
  approved: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12.2l2.4 2.4 4.6-4.8" />
    </>
  ),
  // 退回：折回的箭头
  bounce: (
    <>
      <path d="M9 14L4 9l5-5" />
      <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
    </>
  ),
  // 签字：一支笔
  sign: (
    <>
      <path d="M12 20h8" />
      <path d="M16.5 3.6a2.1 2.1 0 0 1 3 3L7 19.1l-4 .9.9-4L16.5 3.6z" />
    </>
  ),
  // 合入 main：分支并回主干
  merge: (
    <>
      <circle cx="18" cy="18" r="2.5" />
      <circle cx="6" cy="6" r="2.5" />
      <path d="M6 21V8.5" />
      <path d="M6 8.5c0 5 4 9.5 9.5 9.5" />
    </>
  ),
  // 知识库：一本打开的书
  book: (
    <>
      <path d="M12 6.5c-2-1.6-4.6-2-8-2v13c3.4 0 6 .4 8 2 2-1.6 4.6-2 8-2v-13c-3.4 0-6 .4-8 2z" />
      <path d="M12 6.5v13" />
    </>
  ),
  // Issue：带圆点的圆
  issue: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="1.6" />
    </>
  ),
  // PR：分支指向主干
  pr: (
    <>
      <circle cx="18" cy="18" r="2.5" />
      <circle cx="6" cy="6" r="2.5" />
      <path d="M6 8.5V21" />
      <path d="M12.5 6H16a2 2 0 0 1 2 2v7.5" />
      <path d="M14.5 3.5L12 6l2.5 2.5" />
    </>
  ),
} satisfies Record<string, ReactNode>
export type ActionIcon = keyof typeof ACTION_ICONS

/** A requirement's actors and the app's own things, drawn the same way. */
export const BRAIN_ICONS = {
  // 你：一个人
  person: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.8 20c.4-3.8 3.4-6.2 7.2-6.2s6.8 2.4 7.2 6.2" />
    </>
  ),
  // 本机会话：笔记本电脑和提示符
  laptop: (
    <>
      <rect x="4.5" y="5" width="15" height="10.5" rx="1.6" />
      <path d="M2.5 19h19" />
      <path d="M8 9l2 1.6L8 12.2M11.5 12.4h3.5" />
    </>
  ),
  // 需求审批：带勾的清单
  req: (
    <>
      <rect x="5.5" y="4.5" width="13" height="16" rx="2" />
      <path d="M9.5 4.5V3.5h5v1" />
      <path d="M8.8 10.5h6.4M8.8 14h3.6" />
      <path d="M13.6 16.6l1.4 1.4 2.6-2.8" />
    </>
  ),
  // 设计审批：分层的方案
  design: (
    <>
      <path d="M12 3.5l8.5 4.5-8.5 4.5L3.5 8 12 3.5z" />
      <path d="M3.5 12.5l8.5 4.5 8.5-4.5" />
      <path d="M3.5 16.5l8.5 4 8.5-4" />
    </>
  ),
  // 交接：纸飞机
  handover: (
    <>
      <path d="M20.5 3.5L10 14" />
      <path d="M20.5 3.5l-6.5 17-4-6.5-6.5-4 17-6.5z" />
    </>
  ),
  // 桥：一座拱桥
  bridge: (
    <>
      <path d="M2.5 9.5h19" />
      <path d="M3.5 18.5v-9M20.5 18.5v-9" />
      <path d="M3.5 17c2.2-4.4 5-6.5 8.5-6.5s6.3 2.1 8.5 6.5" />
      <path d="M8 12.6v5.9M12 10.5v8M16 12.6v5.9" />
    </>
  ),
  // 签名：一把钥匙
  signer: (
    <>
      <circle cx="8" cy="12" r="3.8" />
      <path d="M11.8 12h9M17.5 12v3M20.5 12v2.2" />
    </>
  ),
  // 运行机：机柜和一个三角
  runner: (
    <>
      <rect x="3.5" y="4" width="17" height="6.5" rx="1.5" />
      <rect x="3.5" y="13.5" width="17" height="6.5" rx="1.5" />
      <path d="M7 7.25h.01M7 16.75h.01" />
      <path d="M13.5 5.8l3 1.45-3 1.45z" />
    </>
  ),
  // CI 检查：仪表上的勾
  ci: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.4 12.3l2.4 2.4 4.8-5" />
    </>
  ),
  // 发布验收：一面旗
  release: (
    <>
      <path d="M5.5 21V4" />
      <path d="M5.5 4.5h11l-2.2 3.8 2.2 3.8h-11" />
    </>
  ),
  // 回写 Brain：书上加一笔
  brain: (
    <>
      <path d="M12 6.5c-2-1.6-4.6-2-8-2v13c3.4 0 6 .4 8 2 2-1.6 4.6-2 8-2v-13c-3.4 0-6 .4-8 2z" />
      <path d="M12 6.5v13" />
      <path d="M15 9.5h2.5M15 12.5h2.5" />
    </>
  ),
  // 提交：线上的一个点
  commit: (
    <>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M2.5 12h6M15.5 12h6" />
    </>
  ),
  // 问题：带问号的气泡
  question: (
    <>
      <path d="M4.5 5.5h15v10h-8l-4.5 4v-4h-2.5z" />
      <path d="M10.2 8.9a1.9 1.9 0 1 1 2.6 1.8c-.6.3-.8.7-.8 1.3" />
      <path d="M12 13.6h.01" />
    </>
  ),
  // 拦下：带斜杠的圆
  blocked: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M6 6l12 12" />
    </>
  ),
  // 导入仓库：带加号的文件夹
  import: (
    <>
      <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
      <path d="M12 11v5M9.5 13.5h5" />
    </>
  ),
  // 设置：齿轮
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4L18 18M6 18l1.6-1.6M16.4 7.6L18 6" />
    </>
  ),
  // 待办：收件箱
  todo: (
    <>
      <path d="M3.5 13.5l2.5-8h12l2.5 8v5a1.5 1.5 0 0 1-1.5 1.5h-14a1.5 1.5 0 0 1-1.5-1.5z" />
      <path d="M3.5 13.5h5l1.5 2.5h4l1.5-2.5h5" />
    </>
  ),
  // 开需求：带加号的文档
  new: (
    <>
      <path d="M13.5 3.5h-7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-9z" />
      <path d="M13.5 3.5v6h6" />
      <path d="M12 12.5v5M9.5 15h5" />
    </>
  ),
  // 检查：lint 的放大镜和一条线
  lint: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5" />
      <path d="M8 10.5h5" />
    </>
  ),
  // 一个文件
  file: (
    <>
      <path d="M13.5 3.5h-7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-9z" />
      <path d="M13.5 3.5v6h6" />
    </>
  ),
  // 下载：克隆
  clone: (
    <>
      <path d="M12 4v11" />
      <path d="M7.5 10.5L12 15l4.5-4.5" />
      <path d="M4.5 19.5h15" />
    </>
  ),
  // 列表：加入列表
  list: (
    <>
      <path d="M9 6.5h11M9 12h11M9 17.5h7" />
      <path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />
    </>
  ),
} satisfies Record<string, ReactNode>
export type BrainIcon = keyof typeof BRAIN_ICONS

const FALLBACK = <circle cx="12" cy="12" r="7.5" />

/** A role's drawing by its key; numbered team members (frontend2, backend1) share their kind's drawing. */
export function rolePaths(role: string | null | undefined): ReactNode {
  return (role && (PATHS[role] || PATHS[role.replace(/\d+$/, '')] || (ACTION_ICONS as Record<string, ReactNode>)[role] ||
    (BRAIN_ICONS as Record<string, ReactNode>)[role])) || FALLBACK
}

export function RoleIcon({ role, size = 18, className = '' }: { role: string | null | undefined; size?: number; className?: string }) {
  return (
    <svg
      className={`kt-role-icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {rolePaths(role)}
    </svg>
  )
}

/** The same drawing inside another SVG (the team graph), centred on (cx, cy). */
export function RoleGlyph({ role, cx, cy, size = 22, className = '' }: { role: string | null | undefined; cx: number; cy: number; size?: number; className?: string }) {
  return (
    <svg
      className={`kt-role-icon ${className}`.trim()}
      x={cx - size / 2}
      y={cy - size / 2}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {rolePaths(role)}
    </svg>
  )
}
