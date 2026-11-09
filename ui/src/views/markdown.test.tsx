import { render, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { fx } from '../test/data'
import { Inline, Markdown } from './Markdown'

describe('Markdown as text', () => {
  test('a 变更说明: headings, lists and tables as such; no pipes, hashes or backticks left; nothing is HTML', () => {
    const text = fx.detail().mr_desc.text + '\n<img src=x onerror=alert(1)>\n'
    const { container } = render(<Markdown text={text} testid="md" />)
    const md = screen.getByTestId('md')
    expect(within(md).getByRole('heading', { name: 'PAY-3 · 退款单导出 CSV' })).toBeInTheDocument()
    expect(within(md).getByRole('heading', { name: '验收标准和证据' })).toBeInTheDocument()
    const [ac, dec] = within(md).getAllByRole('table')
    expect(within(ac).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['AC', '要求', '测试', '结果'])
    expect(within(ac).getByRole('cell', { name: 'tests/test_export.py::test_range' }).querySelector('code')).not.toBeNull()
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
})
