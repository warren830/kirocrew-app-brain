/**
 * The app's one stylesheet (a <style> tag; no CSS files). Only the host's theme variables (--bg, --card, --text,
 * --text-strong, --muted, --border, --border-strong, --accent, --mono) plus the status tones defined here, one set per
 * host mode (kiro-dark / kiro-light; the board's palette of the sample, picked for 4.5:1 as text on the card).
 *
 * A tone is a meaning, not a colour: ok 做完/通过, run 在跑, wait 等人, hand 交接, bad 失败/拦下, warn 注意, info, idle.
 * Every coloured thing has a word next to it. Class names start with `br-`.
 */

export const TONES = ['ok', 'run', 'wait', 'hand', 'bad', 'warn', 'info', 'idle'] as const
export type Tone = (typeof TONES)[number]

const toneVars = TONES.map((t) => `.br-app .tone-${t} { --br-tone: var(--br-${t}); }`).join('\n')

export const APP_CSS = `
.br-app { --br-ok: #3ee08f; --br-run: #3cc4ff; --br-wait: #ff6ec7; --br-hand: #b48cff; --br-bad: #ff5d6c; --br-warn: #ffc53d;
  --br-info: #8fb8ff; --br-idle: var(--muted, #938f9b); --br-tone: var(--br-idle);
  --br-r: 14px; --br-cell: color-mix(in srgb, var(--text, #dcdadf) 5%, transparent);
  display: flex; flex-direction: column; min-height: 100%; box-sizing: border-box; color: var(--text);
  font-family: var(--font-body, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif); font-size: 14px; line-height: 1.5; }
:root[data-mode="light"] .br-app { --br-ok: #0a7d45; --br-run: #0a6db5; --br-wait: #b8237a; --br-hand: #7b3fe4; --br-bad: #c8243b;
  --br-warn: #946200; --br-info: #285092; }
.br-app *, .br-app *::before, .br-app *::after { box-sizing: border-box; }
${toneVars}
.br-app :is(button, select, textarea, input, a):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.br-mono, .br-app code { font-family: var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace); font-size: .92em; }
.br-dim { color: var(--muted); }
.br-small { font-size: .86em; }
.br-strong { color: var(--text-strong); font-weight: 650; }
.br-bad-text { color: var(--br-bad); }
.br-warn-text { color: var(--br-warn); }
.br-ok-text { color: var(--br-ok); }
.br-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
.br-pre { margin: 0; white-space: pre-wrap; word-break: break-word; }
.br-grow { flex: 1; }
.br-row { display: flex; align-items: center; gap: 6px 10px; flex-wrap: wrap; }
.br-stack { display: grid; gap: 10px; }
.br-list { margin: 0; padding-left: 1.3em; }
.br-list li { margin: 2px 0; }
.br-plain { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }

/* ---------- the bar ---------- */
.br-bar { display: flex; align-items: center; gap: 6px 18px; flex-wrap: wrap; padding: 10px 20px 0; border-bottom: 1px solid var(--border); }
.br-bar h1 { margin: 0; font-size: 14px; font-weight: 700; color: var(--muted); letter-spacing: .04em; white-space: nowrap; }
.br-tabs { display: flex; gap: 2px; align-self: stretch; flex-wrap: wrap; }
.br-tabs button { appearance: none; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--text); font: inherit; font-weight: 650;
  padding: 8px 12px 9px; margin-bottom: -1px; cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; }
.br-tabs button:hover:not(:disabled) { color: var(--text-strong); }
.br-tabs button:disabled { color: var(--muted); cursor: default; }
.br-tabs button[aria-selected="true"] { border-bottom-color: var(--accent); color: var(--text-strong); }
.br-count { display: inline-flex; align-items: center; justify-content: center; min-width: 1.6em; padding: 0 6px; border-radius: 999px; font-size: .78em; font-weight: 800;
  background: var(--br-wait); color: #16121b; }
:root[data-mode="light"] .br-count { color: #fff; }
.br-bar .br-btn { margin: 4px 0 6px; }

/* ---------- a view ---------- */
.br-view { display: flex; flex-direction: column; gap: 16px; padding: 16px 20px 28px; }
.br-view h2 { margin: 0; font-size: 1.15em; font-weight: 700; color: var(--text-strong); }
.br-view h3 { margin: 0; font-size: 1em; font-weight: 700; color: var(--text-strong); }
.br-card { border: 1px solid var(--border); border-radius: var(--br-r); background: var(--card); padding: 14px 18px; display: grid; gap: 10px; min-width: 0; }
.br-card > header { display: flex; align-items: baseline; gap: 6px 12px; flex-wrap: wrap; }
.br-card.is-wait { border-color: color-mix(in srgb, var(--br-wait) 55%, var(--border)); }
.br-card.is-bad { border-color: color-mix(in srgb, var(--br-bad) 55%, var(--border)); }
.br-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; align-items: start; }
.br-loading { color: var(--muted); margin: 12px 0; }
.br-empty { color: var(--muted); padding: 10px 0; }

/* ---------- buttons, chips, banners ---------- */
.br-btn { appearance: none; font: inherit; font-size: .93em; font-weight: 650; padding: 6px 13px; border-radius: 10px; cursor: pointer; white-space: nowrap;
  border: 1px solid var(--border-strong, var(--border)); background: var(--card); color: var(--text); display: inline-flex; align-items: center; gap: 6px; }
.br-btn:hover:not(:disabled) { border-color: var(--accent); }
.br-btn:disabled { opacity: .55; cursor: not-allowed; }
.br-btn.is-primary { background: var(--accent); border-color: var(--accent); color: var(--accent-fg, #fff); }
.br-btn.is-danger { color: var(--br-bad); border-color: color-mix(in srgb, var(--br-bad) 55%, var(--border)); }
.br-btn.is-small { padding: 3px 9px; font-size: .84em; border-radius: 8px; }
.br-btn[aria-pressed="true"] { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 18%, var(--card)); color: var(--text-strong); }
.br-link { appearance: none; border: 0; background: transparent; padding: 0; font: inherit; color: var(--accent); cursor: pointer; text-decoration: none; }
.br-link:hover { text-decoration: underline; text-underline-offset: 3px; }
a.br-link { display: inline-flex; align-items: center; gap: 3px; }
.br-chip { display: inline-flex; align-items: center; gap: 4px; padding: 1px 9px; border-radius: 999px; font-size: .84em; font-weight: 700; white-space: nowrap;
  color: var(--br-tone); background: color-mix(in srgb, var(--br-tone) 13%, transparent); border: 1px solid color-mix(in srgb, var(--br-tone) 40%, transparent); }
button.br-chip { cursor: pointer; font-family: inherit; }
button.br-chip:hover { border-color: var(--br-tone); }
.br-tag { display: inline-flex; align-items: center; padding: 0 7px; border-radius: 6px; font-size: .84em; border: 1px solid var(--border); color: var(--text); white-space: nowrap; }
button.br-tag { cursor: pointer; background: transparent; font-family: var(--mono, ui-monospace, monospace); }
button.br-tag:hover { border-color: var(--accent); color: var(--text-strong); }
.br-banner { padding: 8px 12px; border-radius: 10px; border: 1px solid color-mix(in srgb, var(--br-warn) 55%, var(--border));
  background: color-mix(in srgb, var(--br-warn) 9%, var(--card)); display: grid; gap: 6px; }
.br-banner.is-error { border-color: color-mix(in srgb, var(--br-bad) 60%, var(--border)); background: color-mix(in srgb, var(--br-bad) 9%, var(--card)); }
.br-banner.is-ok { border-color: color-mix(in srgb, var(--br-ok) 55%, var(--border)); background: color-mix(in srgb, var(--br-ok) 8%, var(--card)); }
.br-banners { display: grid; gap: 8px; padding: 12px 20px 0; }
.br-banners:empty { display: none; }
.br-error { margin: 0; color: var(--br-bad); font-weight: 650; }
.br-note { margin: 0; color: var(--muted); font-size: .9em; }

/* ---------- a line the person types themselves ---------- */
.br-line { display: grid; gap: 6px; padding: 10px 12px; border-radius: 10px; border: 1px dashed color-mix(in srgb, var(--br-wait) 60%, var(--border));
  background: color-mix(in srgb, var(--br-wait) 6%, transparent); }
.br-line code { font-size: 1em; color: var(--text-strong); user-select: all; word-break: break-all; }
.br-line p { margin: 0; color: var(--text); font-size: .9em; }

/* ---------- tables ---------- */
.br-scroll { overflow-x: auto; }
.br-table { width: 100%; border-collapse: collapse; font-size: .93em; }
.br-table th { text-align: left; font-weight: 650; color: var(--muted); padding: 6px 8px; border-bottom: 1px solid var(--border); white-space: nowrap; }
.br-table td { padding: 7px 8px; border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent); vertical-align: top; }
.br-table tr:last-child td { border-bottom: 0; }
.br-table .is-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.br-key { font-weight: 750; font-family: var(--mono, ui-monospace, monospace); white-space: nowrap; }

/* ---------- progress, bars ---------- */
.br-prog { display: inline-block; width: 72px; height: 6px; border-radius: 999px; background: var(--br-cell); overflow: hidden; vertical-align: middle; }
.br-prog > i { display: block; height: 100%; background: var(--br-run); border-radius: inherit; }
.br-bars { display: grid; gap: 6px; }
.br-barrow { display: grid; grid-template-columns: minmax(120px, 13em) 1fr 3.5em; gap: 10px; align-items: center; }
.br-bartrack { height: 12px; border-radius: 4px; background: var(--br-cell); overflow: hidden; }
.br-bartrack > i { display: block; height: 100%; background: var(--accent); border-radius: 4px; }

/* ---------- forms ---------- */
.br-form { display: grid; gap: 14px; }
.br-field { display: grid; gap: 4px; }
.br-field > label, .br-field > .br-label, .br-fieldset legend { font-weight: 650; color: var(--text-strong); }
.br-fieldset { border: 1px solid var(--border); border-radius: 12px; padding: 10px 14px 12px; margin: 0; display: grid; gap: 6px; }
.br-fieldset legend { padding: 0 6px; }
.br-app :is(input[type="text"], input:not([type]), textarea, select) { font: inherit; padding: 6px 10px; border-radius: 9px; border: 1px solid var(--border-strong, var(--border));
  background: var(--bg); color: var(--text); max-width: 100%; }
.br-app textarea { resize: vertical; min-height: 64px; font-family: var(--mono, ui-monospace, monospace); font-size: .92em; }
.br-app input[aria-invalid="true"] { border-color: var(--br-bad); }
.br-check { display: inline-flex; align-items: flex-start; gap: 7px; cursor: pointer; }
.br-check input { margin-top: 4px; }
.br-hint { margin: 0; font-size: .86em; color: var(--muted); }
.br-findings { margin: 0; padding: 10px 12px; border-radius: 10px; background: var(--br-cell); display: grid; gap: 2px;
  font-family: var(--mono, ui-monospace, monospace); font-size: .88em; white-space: pre-wrap; word-break: break-word; }
.br-findings .is-blocking { color: var(--br-bad); font-weight: 650; }
.br-confirm { display: grid; gap: 8px; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--card)); }

/* ---------- crumbs, stages, timeline, brain ---------- */
.br-crumb { display: flex; align-items: center; gap: 6px 8px; flex-wrap: wrap; font-size: .93em; color: var(--muted); }
.br-crumb b { color: var(--text-strong); font-weight: 650; }
.br-head { display: grid; gap: 8px; }
.br-head .br-title { font-size: 1.5em; font-weight: 800; color: var(--text-strong); letter-spacing: -.01em; }
.br-facts { display: grid; grid-template-columns: max-content 1fr; gap: 3px 14px; margin: 0; }
.br-facts dt { color: var(--muted); }
.br-facts dd { margin: 0; min-width: 0; word-break: break-word; }
.br-stages { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.br-stages li { display: grid; grid-template-columns: 2em 1.4em 1fr; gap: 6px; align-items: baseline; }
.br-stages .is-done, .br-stages .is-skipped { color: var(--muted); }
.br-stages .is-started { color: var(--text-strong); font-weight: 650; }
.br-glyph { text-align: center; color: var(--br-tone); font-weight: 800; }
.br-units { display: inline-flex; gap: 4px; flex-wrap: wrap; margin-left: 6px; }
.br-day { margin: 8px 0 2px; font-size: .86em; font-weight: 700; color: var(--muted); }
.br-tl { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.br-tl li { display: grid; grid-template-columns: 3.4em 18px 1fr; gap: 8px; align-items: start; }
.br-tl time { color: var(--muted); font-variant-numeric: tabular-nums; font-size: .88em; padding-top: 1px; }
.br-q { display: grid; gap: 6px; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border); }
.br-q.is-open { border-color: color-mix(in srgb, var(--br-wait) 55%, var(--border)); }
.br-opts { margin: 0; padding-left: .2em; list-style: none; display: grid; gap: 2px; }
.br-files { display: flex; gap: 6px; flex-wrap: wrap; }
.br-entry { display: grid; gap: 6px; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border); background: var(--card); scroll-margin: 80px; }
.br-entry.is-hl { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 30%, transparent); }
.br-entry .br-text { margin: 0; white-space: pre-wrap; word-break: break-word; color: var(--text-strong); }
.br-section { display: grid; gap: 8px; }
.br-section > h3 { margin-top: 6px; }
.br-group { display: grid; gap: 8px; }
.br-item { display: grid; gap: 6px; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border); background: var(--card); }

/* ---------- 导入仓库: the call to action, the checks, the steps ---------- */
.br-cta { justify-items: start; padding: 26px 28px; gap: 12px; border-style: dashed; border-color: var(--border-strong, var(--border)); }
.br-cta p { margin: 0; max-width: 46em; color: var(--text); }
.br-btn.is-big { padding: 9px 18px; font-size: 1em; border-radius: 12px; }
.br-checks { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.br-checks li { display: grid; grid-template-columns: 1.4em minmax(6em, max-content) 1fr; gap: 2px 10px; align-items: baseline; }
.br-checks .br-todo { grid-column: 3; font-size: .88em; color: var(--muted); }
.br-steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.br-steps li { display: grid; grid-template-columns: 1.4em 1fr; gap: 2px 10px; align-items: baseline; }
.br-steps li.is-todo { color: var(--muted); }
.br-steps li.is-running { color: var(--text-strong); font-weight: 650; }
.br-steps .br-hint { grid-column: 2; font-weight: 400; }
.br-choice { display: flex; gap: 6px 18px; flex-wrap: wrap; }
.br-changes { max-height: 16em; overflow: auto; }
`
