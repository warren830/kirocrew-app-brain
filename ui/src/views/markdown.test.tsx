import { render, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { fx } from '../test/data'
import { Inline, Markdown, pathPieces } from './Markdown'

describe('Markdown as text', () => {
  test('a 变更说明: headings, lists and tables as such; no pipes, hashes or backticks left; nothing is HTML', () => {
    const text = fx.detail().mr_desc.text + '\n<img src=x onerror=alert(1)>\n'
    const { container } = render(<Markdown text={text} testid="md" />)
    const md = screen.getByTestId('md')
    expect(within(md).getByRole('heading', { name: 'PAY-3 · 退款单导出 CSV' })).toBeInTheDocument()
    expect(within(md).getByRole('heading', { name: '验收标准和证据' })).toBeInTheDocument()
    const [ac, dec] = within(md).getAllByRole('table')
    expect(within(ac).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['AC', '要求', '测试', '结果'])
    expect(within(ac).getAllByRole('cell').find((c) => c.textContent === 'tests/test_export.py::test_range')?.querySelector('code')).not.toBeNull()
    expect(within(dec).getAllByRole('row')).toHaveLength(2)
    expect(within(md).getByText('先看 AC-1 的测试', { exact: false }).closest('ol')).not.toBeNull()
    expect(md.textContent).not.toMatch(/\||^#|`|\*\*/m)
    expect(within(md).getByText('一句话').tagName).toBe('B')
    expect(container.querySelector('img')).toBeNull()
    expect(md).toHaveTextContent('<img src=x onerror=alert(1)>')
  })

  test('a short line: `code` and **bold**, a link keeps its words only', () => {
    render(<p data-testid="p"><Inline text="给 `calc.py` 加 **乘法**，见 [MR](https://x.test/1)" /></p>)
    const p = screen.getByTestId('p')
    expect(p).toHaveTextContent('给 calc.py 加 乘法，见 MR')
    expect(within(p).getByText('calc.py').tagName).toBe('CODE')
    expect(within(p).getByText('乘法').tagName).toBe('B')
    expect(p.querySelector('a')).toBeNull()
  })

  test('a branch or a path in a line breaks only next to a 「/」: each name between them is one piece (DETAIL-24)', () => {
    render(<p data-testid="p"><Inline text="工作目录 /Users/alice/workplace/brain-app/shop-pay/refund-export，分支 ai/alice/PAY-3-refund-export；见 `construction/build-and-test/review.md`" /></p>)
    const p = screen.getByTestId('p')
    expect(p).toHaveTextContent('工作目录 /Users/alice/workplace/brain-app/shop-pay/refund-export，分支 ai/alice/PAY-3-refund-export；见 construction/build-and-test/review.md')
    const pieces = [...p.querySelectorAll('.br-path')].map((x) => [...x.children].map((c) => c.textContent))
    expect(pieces).toEqual([
      ['/Users', '/alice', '/workplace', '/brain-app', '/shop-pay', '/refund-export'],
      ['ai', '/alice', '/PAY-3-refund-export'],
      ['construction', '/build-and-test', '/review.md'],
    ])
    expect(pathPieces('aidlc-docs/261107-refund-export/')).toEqual(['aidlc-docs', '/261107-refund-export/'])
  })

  test('a 变更说明 says its material ref once, and a cell cut inside its code keeps the code (BOARD-17, DETAIL-22)', () => {
    const text = ['**一句话**：给 `calc.py` 加乘法 `multiply(a, b)`（D01#S002 · 097f2e9e）（规模 small）。', '',
      '- 目标：给 `calc.py` 加乘法（D01#S002 · 097f2e9e）。', '',
      '| AC | 要求 |', '|---|---|', '| AC-2 | `multiply(0, 7)`、`multiply(0, -7)`、`multip… |'].join('\n')
    render(<Markdown text={text} testid="md" foldRefs />)
    const md = screen.getByTestId('md')
    expect(md.textContent?.match(/D01#S002 · 097f2e9e/g)).toHaveLength(1)
    expect(screen.getByTestId('md-refs')).toHaveTextContent(/^引用的材料段落：D01#S002 · 097f2e9e$/)
    expect(md).toHaveTextContent('给 calc.py 加乘法 multiply(a, b)（规模 small）。')
    const cell = within(md).getAllByRole('cell')[1]
    expect(cell).toHaveTextContent(/^multiply\(0, 7\)、multiply\(0, -7\)、multip…$/)
    expect([...cell.querySelectorAll('code')].map((c) => c.textContent)).toEqual(['multiply(0, 7)', 'multiply(0, -7)', 'multip'])
    expect(md.textContent).not.toContain('`')
  })
})
