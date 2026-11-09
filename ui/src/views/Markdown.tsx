/**
 * The Markdown brain-kit writes (a 变更说明, Lean's notes, a decision) shown as formatted text: headings, paragraphs,
 * lists, tables, code. Built as React elements from the text, never as HTML, so nothing in it can act on the page; a
 * link stays its words.
 */
import type { ReactNode } from 'react'

const INLINE = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\([^)\s]*\)/g

/** One line's `code`, **bold** and [links](…) (their words only). */
export function Inline({ text }: { text: string | null | undefined }) {
  if (!text) return null
  const out: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(m[1] !== undefined ? <code key={m.index}>{m[1]}</code> : m[2] !== undefined ? <b key={m.index}>{m[2]}</b> : m[3])
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
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

/** A whole Markdown text as formatted text (the 变更说明's 看全文). */
export function Markdown({ text, testid }: { text: string; testid?: string }) {
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
    </div>
  )
}
