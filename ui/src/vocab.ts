/**
 * The app's one word list (UI问题清单 #10, #14): every view says a stage, a state, who waits, an action, a source with
 * these words and no other. A code name (stage id, field, enum) is never shown to a person: look it up here; one that
 * is missing gets added here, not spelled out in a view.
 */
import type { LeanSummary, WaitDo, WaitWho } from './types'

/** Lean's stage ids → the stage's Chinese name (backend/core/lean_view.py STAGES) */
export const STAGE_NAME: Record<string, string> = {
  'reverse-engineering': '逆向工程',
  requirements: '需求分析',
  'user-stories': '用户故事',
  'application-design': '应用设计',
  units: '拆分单元',
  'functional-design': '功能设计',
  'nfr-design': '非功能设计',
  'infrastructure-design': '基础设施设计',
  'code-generation': '代码生成',
  'build-and-test': '构建测试',
  release: '发布',
}
export const stageName = (id: string | null | undefined): string => (id ? STAGE_NAME[id] ?? id : '')

/** Lean's approval kinds → what is approved */
export const APPROVAL_NAME: Record<string, string> = {
  REQUIREMENTS: '需求审批', DESIGN: '设计审批', INCEPTION: '需求和设计审批', PLAN: '代码生成计划审批', RELEASE: '发布审批',
}
export const approvalName = (kind: string | null | undefined): string => (kind ? APPROVAL_NAME[kind] ?? kind : '')

/** who a requirement waits on (Waits.who) → one word. 「等你」 is for `you` only; anyone else is 「等<them>」. */
export const WHO_NAME: Record<WaitWho, string> = {
  you: '你', agent: 'AI', runner: '运行机', bridge: '桥', product: '产品', builder: '开发的人', people: '别人', nobody: '没人',
}
export const waitsOn = (who: WaitWho): string => (who === 'nobody' ? '' : `等${WHO_NAME[who]}`)

/** the step a person takes (Waits.do) → the button / the verb, the same everywhere */
export const DO_NAME: Record<WaitDo, string> = {
  approve: '去批准', reply: '去回话', tool: '去批准工具调用', start: '去开工', answer: '去回答', accept: '去验收',
  redo_handoff: '改好后重新交接', label_handoff: '补上交接标签', write_back: '回写 Brain', watch: '观察中', none: '',
}

/** the actions' names (buttons and the text that points at them use exactly these) */
export const ACT = {
  openSession: '打开会话',
  copyLine: '复制那一行',
  start: '开工',
  answerOnMr: '去 MR 上回答',
  openBoard: '需求看板',
  openDetail: '需求详情',
  me: '你是谁',
  review: '开审查会话',
  writeBack: '回写 Brain',
  onBoard: '在看板上看 ↗',
  acceptOnMr: '去 MR 上验收',
  viewMr: '看 MR',
} as const

/** where a requirement came from (Requirement.source, brainkit.intents) */
export const SOURCE_NAME: Record<string, string> = {
  product: '产品需求', debt: '技术债', alert: '告警', schedule: '定期任务', 'eval-gap': 'Eval 发现的缺口', gap: '缺口', local: '本机',
}
export const sourceName = (s: string | null | undefined): string => (s ? SOURCE_NAME[s] ?? s : '')

/** how a document is classified (gate 2) */
export const CLASS_NAME: Record<string, string> = {
  public: '公开', internal: '内部', confidential: '机密', restricted: '严格受限', unsure: '不确定', secret: '绝密',
}

/** 4 done · 6 skipped · next: 发布 — the one way the whole app says Lean's progress (#8) */
export function leanProgress(lean: Pick<LeanSummary, 'done_n' | 'skipped_n' | 'next'>): string {
  if (!lean.next) return lean.skipped_n ? `全部做完（跳过 ${lean.skipped_n}）` : '全部做完'
  const parts = [`做完 ${lean.done_n}`]
  if (lean.skipped_n) parts.push(`跳过 ${lean.skipped_n}`)
  parts.push(`下一步：${lean.next.label}`)
  return parts.join(' · ')
}

/** the step (Waits.do) as what the requirement is waiting for: the counters of 交付总览 (「轮到你 5：等回话 2 · 等开工 3」) */
export const WAIT_NAME: Record<WaitDo, string> = {
  approve: '等批准', reply: '等回话', tool: '等批准工具调用', start: '等开工', answer: '等回答', accept: '等验收',
  redo_handoff: '要重做交接', label_handoff: '要补交接标签', write_back: '要回写 Brain', watch: '观察中', none: '',
}

/** where a requirement's facts were read (Requirement.where) → where it is, in words (需求详情's head) */
export const WHERE_NAME: Record<string, string> = {
  worktree: '在这台机器上做', branch: '在运行分支上（这台机器没检出）', main: '已合并到默认分支', runner: '在运行机上', claim: '只有认领',
}

/** who settled a decision (Decision.by, decisions.md's Who) → one word; a person's pseudonym and the Brain entries are
 * added by the view */
export const DECIDED_BY: Record<string, string> = {
  agent: 'AI 自己定的', person: '人', check: '检查定的', brain: '照 Brain', bridge: '桥记下的', unclassified: '没归类',
}

/** what a check of the wall is about (CheckCell.group) */
export const CHECK_GROUP_NAME: Record<string, string> = {
  gate: 'Lean 审批', verify: '自动检查', handover: '交接', brain: 'Brain', after: '合并后观察',
}

/** a source brain-kit's trace could not read (its English words, ReqBoard.missing) → what it is */
const MISSING_SOURCE: [RegExp, string][] = [
  [/^bridge ledger/i, '桥的账本'], [/^vouchers/i, '回答凭证'], [/^pushes/i, '推送记录'], [/^CI pipelines/i, 'GitLab 上的 CI'], [/^runnerd/i, '运行机的记录'],
]
export const missingSourceName = (raw: string): string => MISSING_SOURCE.find(([re]) => re.test(raw))?.[1] ?? '别的记录'

/** brain-kit's optional modules (Status.brainkit.modules) → what they do for a person */
export const MODULE_NAME: Record<string, string> = {
  trace: '需求时间线', evaluate: '交付评估', golden: '标准考题', intents: '需求来源', mrdesc: '变更说明',
}

/** kit.json tracker → one word (设置, 导入仓库) */
export const TRACKER_NAME: Record<string, string> = { none: '不用 Jira', jira: '用 Jira' }

/** what kind of gap a run found missing (brain-gap blocks, brainkit.intents GAP_KINDS) */
export const GAP_KIND_NAME: Record<string, string> = { knowledge: '缺知识', test: '缺测试', other: '其他' }
