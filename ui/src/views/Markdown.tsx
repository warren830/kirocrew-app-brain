/**
 * The Markdown brain-kit writes (a 变更说明, Lean's notes, a decision) shown as formatted text: headings, paragraphs,
 * lists, tables, code. Built as React elements from the text, never as HTML, so nothing in it can act on the page; a
 * link stays its words.
 */
import type { ReactNode } from 'react'

const INLINE = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\([^)\s]*\)/g
/** a path or a branch (ai/alice/PAY-3-refund-export, /Users/alice/…, aidlc-docs/…/): names joined by 「/」 */
const PATH = /\/?[\w.~@+-]+(?:\/[\w.~@+-]*)+/g

/** A path's pieces as it may break: only next to a 「/」 (a folder's trailing 「/」 stays with its name). */
export function pathPieces(path: string): string[] {
  const parts = path.split('/').map((p, i) => (i ? `/${p}` : p)).filter((p, i) => p || i)
  if (parts.length > 1 && parts[parts.length - 1] === '/') parts.splice(-2, 2, `${parts[parts.length - 2]}/`)
  return parts
}

/** A path drawn so that it breaks only at a 「/」, never at a 「-」 inside a name (.br-path > span is nowrap). */
export function PathPieces({ path }: { path: string }) {
  return <span className="br-path">{pathPieces(path).map((p, i) => <span key={i}><span>{p}</span><wbr /></span>)}</span>
}

/** Plain text with its paths and branches drawn by PathPieces. */
export function Paths({ text }: { text: string | null | undefined }) {
  if (!text) return null
  const out: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(PATH)) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(<PathPieces key={m.index} path={m[0]} />)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return <>{out}</>
}

/** A text cut short (「…」) inside its `code` keeps the code: its open backtick is closed before the 「…」, so no lone
 * backtick shows (brain-kit cuts long table cells at a length, wherever that falls). */
const closeCut = (text: string) => ((text.match(/`/g)?.length ?? 0) % 2 && /…$/.test(text) ? text.replace(/…$/, '`…') : text)

/** One line's `code`, **bold** and [links](…) (their words only); a path in it breaks only at a 「/」. */
export function Inline({ text: raw }: { text: string | null | undefined }) {
  if (!raw) return null
  const text = closeCut(raw)
  const out: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push(<Paths key={`t${m.index}`} text={text.slice(last, m.index)} />)
    out.push(m[1] !== undefined ? <code key={m.index}><Paths text={m[1]} /></code> : m[2] !== undefined ? <b key={m.index}><Paths text={m[2]} /></b> : m[3])
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(<Paths key="end" text={text.slice(last)} />)
  return <>{out}</>
}

const REF = /\s*（(D\d{2}#S\d{3}[^）]*)）/g

/** A line's material refs (「（D01#S002 · 097f2e9e）」: a document's section and its hash) taken out: the line for a
 * person, and the refs for 细节. */
export function takeRefs(text: string): { text: string; refs: string[] } {
  return { text: text.replace(REF, ''), refs: [...text.matchAll(REF)].map((m) => m[1]) }
}

type Block =
  | { kind: 'h'; level: number; text: string }
  | { kind: 'p'; lines: string[] }
  | { kind: 'ul' | 'ol'; items: string[] }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'code'; text: string }
  | { kind: 'hr' }

const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'))
const isRow = (l: string) => /^\s*\|.*\|\s*$/.test(l)
const isRule = (l: string) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(l)
const UL = /^\s*[-*+]\s+(.*)$/
const OL = /^\s*\d+[.)]\s+(.*)$/
const H = /^(#{1,6})\s+(.*)$/

export function blocks(text: string): Block[] {
  const ls = text.replace(/\r\n?/g, '\n').split('\n')
  const out: Block[] = []
  let i = 0
  while (i < ls.length) {
    const l = ls[i]
    if (!l.trim()) { i++; continue }
    if (/^\s*```/.test(l)) {
      const body: string[] = []
      i++
      while (i < ls.length && !/^\s*```/.test(ls[i])) body.push(ls[i++])
      i++
      out.push({ kind: 'code', text: body.join('\n') })
      continue
    }
    const h = H.exec(l)
    if (h) { out.push({ kind: 'h', level: h[1].length, text: h[2] }); i++; continue }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { out.push({ kind: 'hr' }); i++; continue }
    if (isRow(l) && i + 1 < ls.length && isRule(ls[i + 1])) {
      const head = cells(l)
      const rows: string[][] = []
      i += 2
      while (i < ls.length && isRow(ls[i])) rows.push(cells(ls[i++]))
      out.push({ kind: 'table', head, rows })
      continue
    }
    for (const [re, kind] of [[UL, 'ul'], [OL, 'ol']] as const) {
      if (!re.test(l)) continue
      const items: string[] = []
      while (i < ls.length && re.test(ls[i])) items.push((re.exec(ls[i++]) as RegExpExecArray)[1])
      out.push({ kind, items })
      break
    }
    if (UL.test(l) || OL.test(l)) continue
    const lines: string[] = []
    while (i < ls.length && ls[i].trim() && !H.test(ls[i]) && !UL.test(ls[i]) && !OL.test(ls[i]) && !/^\s*```/.test(ls[i]) && !(isRow(ls[i]) && isRule(ls[i + 1] ?? ''))) lines.push(ls[i++])
    out.push({ kind: 'p', lines })
  }
  return out
}

/** A whole Markdown text as formatted text (the 变更说明's 看全文). *foldRefs*: the material refs (「（D01#S002 · 097f2e9e）」)
 * are taken out of the lines and said once, at the end (BOARD-17). */
export function Markdown({ text: raw, testid, foldRefs = false }: { text: string; testid?: string; foldRefs?: boolean }) {
  const refs: string[] = []
  const text = foldRefs ? raw.split('\n').map((l) => { const t = takeRefs(l); refs.push(...t.refs); return t.text }).join('\n') : raw
  const once = [...new Set(refs)]
  return (
    <div className="br-md" data-testid={testid}>
      {blocks(text).map((b, i) => {
        switch (b.kind) {
          case 'h': return b.level <= 2 ? <h4 key={i}><Inline text={b.text} /></h4> : <h5 key={i}><Inline text={b.text} /></h5>
          case 'hr': return <hr key={i} />
          case 'code': return <pre key={i}><code>{b.text}</code></pre>
          case 'ul': return <ul key={i}>{b.items.map((t, j) => <li key={j}><Inline text={t} /></li>)}</ul>
          case 'ol': return <ol key={i}>{b.items.map((t, j) => <li key={j}><Inline text={t} /></li>)}</ol>
          case 'table':
            return (
              <div key={i} className="br-scroll">
                <table className="cto-table">
                  <thead><tr>{b.head.map((c, j) => <th key={j}><Inline text={c} /></th>)}</tr></thead>
                  <tbody>{b.rows.map((r, j) => <tr key={j}>{b.head.map((_, k) => <td key={k}><Inline text={r[k] ?? ''} /></td>)}</tr>)}</tbody>
                </table>
              </div>
            )
          default: return <p key={i}>{b.lines.map((t, j) => <span key={j}>{j > 0 && <br />}<Inline text={t} /></span>)}</p>
        }
      })}
      {once.length > 0 && <p className="br-hint" data-testid="md-refs">引用的材料段落：{once.join('、')}</p>}
    </div>
  )
}
