/**
 * The app shell's stylesheet and the shared pieces of every form view, in the sample team board's visual language
 * (board/styles.ts BOARD_CSS: buttons, pills, banners, the status tones; kit.ts KIT_CSS: how a card is framed). Only
 * the host's theme variables (--bg, --card, --text, --text-strong, --muted, --border, --border-strong, --accent,
 * --mono) plus the tones the board defines, one set per host mode. Class names start with `br-`.
 *
 * A tone is a meaning, not a colour: ok 做完/通过, run 在跑, wait 等人, hand 交接, bad 失败/拦下, warn 注意, info, idle.
 * They are the board's tones under the app's names (wait = the board's approve magenta, hand = its handoff violet), so
 * a `br-chip tone-wait` and a `kt-pill tone-approve` are the same colour. Every coloured thing has a word next to it.
 */

export const TONES = ['ok', 'run', 'wait', 'hand', 'bad', 'warn', 'info', 'idle'] as const
export type Tone = (typeof TONES)[number]

const KT_OF: Record<Tone, string> = { ok: 'ok', run: 'run', wait: 'approve', hand: 'handoff', bad: 'bad', warn: 'warn', info: 'info', idle: 'idle' }
const toneVars = TONES.map((t) => `.br-app .tone-${t} { --br-tone: var(--kt-${KT_OF[t]}); --kt-tone: var(--kt-${KT_OF[t]}); }`).join('\n')

export const APP_CSS = `
.br-app { --br-ok: var(--kt-ok); --br-run: var(--kt-run); --br-wait: var(--kt-approve); --br-hand: var(--kt-handoff); --br-bad: var(--kt-bad);
  --br-warn: var(--kt-warn); --br-info: var(--kt-info); --br-idle: var(--kt-idle); --br-tone: var(--kt-idle);
  --br-cell: color-mix(in srgb, var(--text, #dcdadf) 5%, transparent);
  display: flex; flex-direction: column; min-height: 100%; box-sizing: border-box; color: var(--text);
  font-family: var(--font-body, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif); font-size: 14px; line-height: 1.5; }
.br-app *, .br-app *::before, .br-app *::after { box-sizing: border-box; }
${toneVars}
.br-app :is(button, select, textarea, input, a, summary):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.br-mono, .br-app code { font-family: var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace); font-size: .92em; }
.br-dim { color: var(--muted); }
.br-small { font-size: .86em; }
.br-strong { color: var(--text-strong); font-weight: 650; }
.br-bad-text { color: var(--kt-bad); }
.br-warn-text { color: var(--kt-warn); }
.br-ok-text { color: var(--kt-ok); }
.br-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
.br-pre { margin: 0; white-space: pre-wrap; word-break: break-word; }
.br-grow { flex: 1; }
.br-row { display: flex; align-items: center; gap: 6px 10px; flex-wrap: wrap; }
.br-stack { display: grid; gap: 10px; }
.br-list { margin: 0; padding-left: 1.3em; }
.br-list li { margin: 2px 0; }
.br-plain { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }

/* ---------- the app bar: the sample's (AppBar.tsx APP_CSS) ---------- */
.br-bar { display: flex; align-items: center; gap: 6px 18px; flex-wrap: wrap; padding: 10px 20px 0; border-bottom: 1px solid var(--border); font-size: 14px; }
.br-bar h1 { margin: 0; display: inline-flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 700; color: var(--muted); letter-spacing: .04em; white-space: nowrap; }
.br-bar h1 .kt-role-icon { color: var(--accent); }
.br-tabs { display: flex; gap: 4px; align-self: stretch; flex-wrap: wrap; }
.br-tabs button { appearance: none; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--text); font: inherit; font-weight: 650;
  padding: 8px 12px 9px; margin-bottom: -1px; cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; }
.br-tabs button:hover:not(:disabled) { color: var(--text-strong); }
.br-tabs button:disabled { color: var(--muted); cursor: default; opacity: .7; }
.br-tabs button[aria-selected="true"] { border-bottom-color: var(--accent); color: var(--text-strong); }
.br-count { display: inline-flex; align-items: center; justify-content: center; min-width: 1.6em; padding: 0 6px; border-radius: 999px; font-size: .78em; font-weight: 800;
  background: var(--kt-approve); color: var(--kt-on); }
.br-bar .br-btn { margin: 4px 0 6px; }
.br-bar-key { font-family: var(--mono, ui-monospace, monospace); font-size: .82em; font-weight: 700; color: var(--muted); }

/* ---------- a view: a kt-root (the board's frame, padding and gaps) ---------- */
.br-view h2 { margin: 0; font-size: 1.1em; font-weight: 700; color: var(--text-strong); }
.br-view h3 { margin: 0; font-size: 1em; font-weight: 700; color: var(--text-strong); }
.br-view-head { display: flex; align-items: baseline; gap: 8px 14px; flex-wrap: wrap; }
.br-view-head h2 { font-size: 1.65em; font-weight: 800; letter-spacing: -.01em; }
.br-view-head p { margin: 0; color: var(--muted); }
/* a card: framed by kit.ts (radius 16, 1 px border, padding 16/20) */
.br-card { display: grid; gap: 10px; min-width: 0; align-content: start; }
.br-card > header { display: flex; align-items: center; gap: 6px 12px; flex-wrap: wrap; }
.br-card > header h2, .br-card > header h3 { font-size: 1.1em; font-weight: 700; color: var(--text-strong); }
.br-card.is-wait { border-color: var(--kit-wait); }
.br-card.is-bad { border-color: var(--kit-bad); }
.br-card.is-warn { border-color: color-mix(in srgb, var(--kt-warn) 55%, var(--border)); }
.br-card.is-ok { border-color: var(--kit-ok); }
.br-card.is-run { border-color: var(--kit-run); }
.br-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; align-items: start; }
.br-loading { color: var(--muted); margin: 12px 0; }
.br-empty { color: var(--muted); padding: 6px 0; margin: 0; }

/* ---------- buttons, chips, banners: the board's ---------- */
.br-btn { appearance: none; font: inherit; font-size: .93em; font-weight: 650; padding: 7px 14px; border-radius: 10px; cursor: pointer; white-space: nowrap;
  border: 1px solid var(--border-strong, var(--border)); background: var(--card); color: var(--text); display: inline-flex; align-items: center; gap: 6px;
  transition: border-color .15s, background .15s; }
.br-btn:hover:not(:disabled) { border-color: var(--accent); }
.br-btn:disabled { opacity: .55; cursor: not-allowed; }
.br-btn.is-primary { background: var(--accent); border-color: var(--accent); color: var(--accent-fg, #fff); }
.br-btn.is-primary:hover:not(:disabled) { filter: brightness(1.08); }
.br-btn.is-danger { color: var(--kt-bad); border-color: color-mix(in srgb, var(--kt-bad) 55%, var(--border)); }
.br-btn.is-small { padding: 4px 10px; font-size: .84em; border-radius: 8px; }
.br-btn.is-big { padding: 10px 20px; font-size: 1.02em; border-radius: 12px; }
.br-btn[aria-pressed="true"] { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 18%, var(--card)); color: var(--text-strong); }
.br-link { appearance: none; border: 0; background: transparent; padding: 0; font: inherit; color: var(--accent); cursor: pointer; text-decoration: none; }
.br-link:hover { text-decoration: underline; text-underline-offset: 3px; }
a.br-link { display: inline-flex; align-items: center; gap: 3px; }
.br-chip { display: inline-flex; align-items: center; gap: 5px; padding: 2px 10px; border-radius: 999px; font-size: .86em; font-weight: 750; white-space: nowrap;
  color: var(--br-tone); background: color-mix(in srgb, var(--br-tone) 14%, transparent); border: 1px solid color-mix(in srgb, var(--br-tone) 42%, transparent); }
button.br-chip { cursor: pointer; font-family: inherit; }
button.br-chip:hover { border-color: var(--br-tone); }
.br-tag { display: inline-flex; align-items: center; padding: 1px 8px; border-radius: 7px; font-size: .84em; border: 1px solid var(--border); color: var(--text); white-space: nowrap;
  background: var(--kt-glass); }
button.br-tag { cursor: pointer; font-family: var(--mono, ui-monospace, monospace); }
button.br-tag:hover { border-color: var(--accent); color: var(--text-strong); }
.br-banner { padding: 9px 13px; border-radius: 12px; border: 1px solid color-mix(in srgb, var(--kt-warn) 55%, var(--border));
  background: color-mix(in srgb, var(--kt-warn) 9%, var(--card)); display: grid; gap: 6px; }
.br-banner.is-error { border-color: color-mix(in srgb, var(--kt-bad) 60%, var(--border)); background: color-mix(in srgb, var(--kt-bad) 9%, var(--card)); }
.br-banner.is-ok { border-color: color-mix(in srgb, var(--kt-ok) 55%, var(--border)); background: color-mix(in srgb, var(--kt-ok) 8%, var(--card)); }
.br-banner.is-info { border-color: color-mix(in srgb, var(--kt-info) 50%, var(--border)); background: color-mix(in srgb, var(--kt-info) 8%, var(--card)); }
.br-banners { display: grid; gap: 8px; padding: 12px 20px 0; }
.br-banners:empty { display: none; }
.br-error { margin: 0; color: var(--kt-bad); font-weight: 650; }
.br-note { margin: 0; color: var(--muted); font-size: .9em; }

/* ---------- a line the person types themselves (magenta: it waits for a person) ---------- */
.br-line { display: grid; gap: 6px; padding: 10px 12px; border-radius: 12px; border: 1px dashed color-mix(in srgb, var(--kt-approve) 60%, var(--border));
  background: color-mix(in srgb, var(--kt-approve) 7%, transparent); }
.br-line code { font-size: 1.05em; font-weight: 700; color: var(--text-strong); user-select: all; word-break: break-all; }
.br-line p { margin: 0; color: var(--text); font-size: .88em; }

/* ---------- problems: what is wrong, 做什么, the fix, brain-kit's own words folded ---------- */
.br-probs { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.br-prob { display: grid; grid-template-columns: 26px minmax(0, 1fr); gap: 2px 10px; align-items: start; padding: 9px 12px; border-radius: 12px;
  border: 1px solid var(--border); background: var(--kt-glass); }
.br-prob.is-FAIL { border-color: color-mix(in srgb, var(--kt-bad) 50%, var(--border)); background: color-mix(in srgb, var(--kt-bad) 7%, transparent); }
.br-prob.is-WARN { border-color: color-mix(in srgb, var(--kt-warn) 45%, var(--border)); background: color-mix(in srgb, var(--kt-warn) 6%, transparent); }
.br-prob.is-OK { border-color: transparent; background: transparent; padding-top: 3px; padding-bottom: 3px; }
.br-prob-glyph { grid-row: span 3; width: 24px; height: 24px; display: grid; place-items: center; border-radius: 8px; font-weight: 900; font-size: 13px;
  color: var(--kt-tone); border: 2px solid var(--kt-tone); background: color-mix(in srgb, var(--kt-tone) 14%, transparent); }
.br-prob.is-OK .br-prob-glyph { background: var(--kt-ok-solid); border-color: var(--kt-ok-solid); color: #fff; width: 20px; height: 20px; border-radius: 6px; font-size: 11px; }
.br-prob-text { font-weight: 700; color: var(--text-strong); }
.br-prob-repo { margin-right: 6px; font-weight: 650; vertical-align: 1px; }
.br-prob.is-OK .br-prob-text { font-weight: 550; color: var(--text); }
.br-prob-todo { color: var(--text); font-size: .93em; }
.br-prob-todo b { color: var(--muted); font-weight: 650; margin-right: 4px; }
.br-prob-acts { display: flex; align-items: center; gap: 6px 10px; flex-wrap: wrap; margin-top: 4px; }
.br-raw { font-size: .82em; color: var(--muted); }
.br-raw summary { cursor: pointer; list-style: none; display: inline-flex; align-items: center; gap: 4px; }
.br-raw summary::-webkit-details-marker { display: none; }
.br-raw summary::before { content: '▸'; font-size: .9em; }
.br-raw[open] summary::before { content: '▾'; }
.br-raw pre { margin: 6px 0 0; padding: 8px 10px; border-radius: 8px; background: var(--bg); border: 1px solid var(--border); white-space: pre-wrap; word-break: break-word;
  font-family: var(--mono, ui-monospace, monospace); font-size: 1em; }
.br-fixjob { display: grid; gap: 6px; margin-top: 6px; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--border); background: var(--card); }
/* where an install goes: the options of a kit fix, one line each, the recommended one marked */
.br-modes { display: grid; gap: 6px; justify-items: start; }
.br-me { display: flex; align-items: center; gap: 6px; margin: 0; }
.br-me.is-bad { color: var(--kt-warn); }
.br-me-ask { display: grid; gap: 4px; max-width: 34em; }
.br-me-ask label { font-weight: 650; font-size: .9em; }
.br-me-ask .br-row { flex-wrap: nowrap; }
.br-me-ask input { flex: 1; min-width: 0; }
.br-mode { display: flex; align-items: center; gap: 4px 10px; flex-wrap: wrap; }
.br-mode.is-off .br-hint { color: var(--kt-warn); }

/* ---------- tables: the CTO view's ---------- */
.br-scroll { overflow-x: auto; }
.br-table { width: 100%; border-collapse: collapse; font-size: .96em; }
.br-table th { text-align: left; font-weight: 600; color: var(--text); padding: 8px 10px; border-bottom: 1px solid var(--border); white-space: nowrap; }
.br-table td { padding: 9px 10px; border-bottom: 1px solid var(--border); vertical-align: top; color: var(--text-strong); }
.br-table tr:last-child td { border-bottom: 0; }
.br-table .is-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.br-key { font-weight: 750; font-family: var(--mono, ui-monospace, monospace); white-space: nowrap; }

/* ---------- progress ---------- */
.br-prog { display: inline-flex; gap: 2px; vertical-align: middle; }
.br-prog > i { width: 7px; height: 9px; border-radius: 2px; background: color-mix(in srgb, var(--muted) 28%, transparent); }
.br-prog > i.is-done { background: var(--kt-ok); box-shadow: 0 0 6px color-mix(in srgb, var(--kt-ok) 45%, transparent); }
.br-prog > i.is-started { background: var(--kt-run); box-shadow: 0 0 6px color-mix(in srgb, var(--kt-run) 55%, transparent); }
.br-prog > i.is-skipped { background: color-mix(in srgb, var(--kt-ok) 35%, transparent); }
.br-bars { display: grid; gap: 7px; }
.br-barrow { display: grid; grid-template-columns: minmax(120px, 13em) 1fr 3.5em; gap: 10px; align-items: center; }
.br-bartrack { height: 12px; border-radius: 6px; background: color-mix(in srgb, var(--muted) 16%, transparent); overflow: hidden; }
.br-bartrack > i { display: block; height: 100%; background: var(--accent); border-radius: 6px; }

/* ---------- forms: the board's start form ---------- */
.br-form { display: grid; gap: 14px; }
.br-field { display: grid; gap: 5px; }
.br-field > label, .br-field > .br-label, .br-fieldset legend { font-weight: 750; color: var(--text-strong); }
.br-fieldset { border: 1px solid var(--border); border-radius: 12px; padding: 10px 14px 12px; margin: 0; display: grid; gap: 7px; background: var(--kt-glass); min-width: 0; }
.br-fieldset legend { padding: 0 6px; }
.br-app :is(input[type="text"], input:not([type]), input[type="number"], textarea, select) { font: inherit; padding: 8px 10px; border-radius: 10px;
  border: 1px solid var(--border-strong, var(--border)); background: var(--bg); color: var(--text); max-width: 100%; }
.br-app :is(input, textarea)::placeholder { color: var(--muted); }
.br-app textarea { resize: vertical; min-height: 64px; font-family: var(--mono, ui-monospace, monospace); font-size: .92em; }
.br-field textarea { width: 100%; box-sizing: border-box; }
.br-app input[aria-invalid="true"] { border-color: var(--kt-bad); }
.br-check { display: inline-flex; align-items: flex-start; gap: 7px; cursor: pointer; }
.br-check input { margin-top: 4px; accent-color: var(--accent); }
.br-hint { margin: 0; font-size: .86em; color: var(--muted); }
.br-findings { margin: 0; padding: 10px 12px; border-radius: 10px; background: var(--bg-elevated, var(--card)); border: 1px solid var(--border); display: grid; gap: 2px;
  font-family: var(--mono, ui-monospace, monospace); font-size: .86em; white-space: pre-wrap; word-break: break-word; max-height: 360px; overflow: auto; }
.br-findings .is-blocking { color: var(--kt-bad); font-weight: 650; }
.br-confirm { display: grid; gap: 8px; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--card)); }
.br-confirm.is-danger { border-color: var(--kt-bad); background: color-mix(in srgb, var(--kt-bad) 8%, var(--card)); }

/* ---------- crumbs, facts, stages, timeline, brain ---------- */
.br-crumb { display: flex; align-items: center; gap: 6px 8px; flex-wrap: wrap; font-size: .93em; color: var(--muted); }
.br-crumb b { color: var(--text-strong); font-weight: 650; }
.br-head { display: grid; gap: 8px; }
.br-head .br-title { font-size: 1.5em; font-weight: 800; color: var(--text-strong); letter-spacing: -.01em; }
.br-facts { display: grid; grid-template-columns: max-content 1fr; gap: 4px 14px; margin: 0; }
.br-facts dt { color: var(--muted); font-size: .93em; }
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
.br-q { display: grid; gap: 7px; padding: 11px 13px; border-radius: 12px; border: 1px solid var(--border); background: var(--kt-glass); }
.br-q.is-open { border-color: color-mix(in srgb, var(--kt-approve) 55%, var(--border)); background: color-mix(in srgb, var(--kt-approve) 6%, var(--card)); }
.br-q > *, .br-q .br-stack > * { min-width: 0; overflow-wrap: anywhere; }
.br-q .br-tag { display: inline-block; white-space: normal; overflow-wrap: anywhere; max-width: 100%; }
.br-q .br-row { min-width: 0; flex-wrap: wrap; }
.br-opts { margin: 0; padding-left: .2em; list-style: none; display: grid; gap: 3px; }
.br-files { display: flex; gap: 6px; flex-wrap: wrap; }
.br-entry { display: grid; gap: 6px; padding: 11px 13px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg-elevated, var(--card)); scroll-margin: 80px; }
.br-entry.is-hl { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 30%, transparent); }
.br-entry .br-text { margin: 0; white-space: pre-wrap; word-break: break-word; color: var(--text-strong); }
.br-section { display: grid; gap: 8px; }
.br-section > h3 { margin-top: 6px; }
.br-group { display: grid; gap: 8px; }
.br-item { display: grid; gap: 7px; padding: 11px 13px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg-elevated, var(--card)); }

/* ---------- 导入仓库: the call to action, the checks, the steps ---------- */
.br-cta { justify-items: start; padding: 26px 28px; gap: 12px; }
.br-cta p { margin: 0; max-width: 46em; color: var(--text); }
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

/* ---------- an empty state that says what to do: the board's (kt-empty), as a component (EmptyHero) ---------- */
.br-hero { display: grid; gap: 18px; padding: 26px 28px; border-radius: 22px; border: 1px solid var(--border);
  background: radial-gradient(90% 90% at 0% 0%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 60%), var(--card); }
.br-hero h2 { margin: 0 0 6px; font-size: 2em; font-weight: 850; color: var(--text-strong); letter-spacing: -.01em; }
.br-hero p { margin: 0; max-width: 62em; color: var(--text); font-size: 1.03em; line-height: 1.65; }
.br-hero .br-punch { margin-top: 4px; font-size: 1.08em; font-weight: 850; color: var(--text-strong); }
.br-hero-acts { display: flex; align-items: center; gap: 10px 14px; flex-wrap: wrap; }
/* the steps of a flow, left to right (the board's kt-team-intro) */
.br-flow { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(var(--n, 4), minmax(0, 1fr)); gap: 22px; align-items: stretch; }
@media (max-width: 1000px) { .br-flow { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.br-flow > li { position: relative; display: grid; grid-template-columns: 36px minmax(0, 1fr); grid-template-rows: auto auto; column-gap: 9px; row-gap: 2px; padding: 10px 12px;
  border-radius: 14px; border: 1px solid var(--border); background: var(--bg-elevated, var(--card)); align-content: start; }
.br-flow > li:not(:last-child)::after { content: '→'; position: absolute; right: -17px; top: 50%; transform: translateY(-50%); color: var(--kt-handoff); font-weight: 900; font-size: 1.2em; }
.br-flow > li > .kt-role-icon { grid-row: span 2; align-self: center; color: var(--text-strong); opacity: .9; }
.br-flow b { color: var(--text-strong); }
.br-flow small { color: var(--muted); font-size: .84em; }
.br-flow > li.is-done { border-color: var(--kit-ok); }
.br-flow > li.is-done > .kt-role-icon { color: var(--kt-ok); }
.br-flow > li.is-now { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 28%, transparent); }
.br-flow > li.is-bad { border-color: var(--kit-bad); }
.br-flow > li.is-wait { border-color: var(--kit-wait); }
.br-flow > li.is-off { opacity: .55; border-style: dashed; }
.br-flow-n { display: inline-grid; place-items: center; width: 18px; height: 18px; margin-right: 6px; border-radius: 50%; font-size: .74em; font-weight: 800;
  background: color-mix(in srgb, var(--muted) 24%, transparent); color: var(--text-strong); vertical-align: 1px; }
.br-flow > li.is-done .br-flow-n { background: var(--kt-ok-solid); color: #fff; }
.br-flow > li.is-now .br-flow-n { background: var(--accent); color: var(--accent-fg, #fff); }

/* ---------- a counter card (the board's 指标卡, framed by kit.ts) ---------- */
.br-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }
.br-kpi { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.br-kpi-label { font-size: .93em; font-weight: 650; color: var(--muted); letter-spacing: .04em; }
.br-kpi-big { font-size: 2.6em; font-weight: 800; letter-spacing: -.03em; line-height: 1.1; font-variant-numeric: tabular-nums; color: var(--text-strong); }
.br-kpi-of { font-size: 1.4em; font-weight: 700; color: var(--muted); margin-left: 4px; }
.br-kpi-note { font-size: .84em; color: var(--muted); }
.br-kpi.is-ok .br-kpi-big { color: var(--kt-ok); }
.br-kpi.is-bad .br-kpi-big { color: var(--kt-bad); }
.br-kpi.is-wait .br-kpi-big { color: var(--kt-approve); }
.br-kpi.is-ok { border-color: var(--kit-ok); }
.br-kpi.is-bad { border-color: var(--kit-bad); }
.br-kpi.is-wait { border-color: var(--kit-wait); }
/* ---------- a background job's steps (clone, install, the kit fix) ---------- */
.br-jobsteps { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 5px; }
.br-jobsteps li { display: inline-flex; align-items: center; gap: 6px; padding: 3px 11px 3px 5px; border-radius: 999px; font-size: .86em; font-weight: 650;
  border: 1px solid color-mix(in srgb, var(--kt-tone) 45%, var(--border)); background: color-mix(in srgb, var(--kt-tone) 9%, var(--card)); color: var(--text); }
.br-jobsteps li i { font-style: normal; display: inline-grid; place-items: center; width: 19px; height: 19px; border-radius: 50%; font-size: .78em; font-weight: 900;
  background: color-mix(in srgb, var(--kt-tone) 30%, transparent); color: var(--text-strong); }
.br-jobsteps li.is-running { border-color: var(--kt-run); box-shadow: 0 0 0 2px color-mix(in srgb, var(--kt-run) 20%, transparent); color: var(--text-strong); }
.br-jobsteps li.is-running i { animation: kt-blink 1.4s ease-in-out infinite; }
.br-jobsteps li.is-ok i { background: var(--kt-ok-solid); color: #fff; }
.br-jobsteps li.is-fail { border-color: var(--kt-bad); }
.br-jobsteps li.is-fail i { background: var(--kt-bad-solid); color: #fff; }
.br-jobsteps li.is-todo { opacity: .6; border-style: dashed; }
.br-segs i.is-run { background: var(--kt-run); box-shadow: 0 0 8px color-mix(in srgb, var(--kt-run) 55%, transparent); }
.br-switch { display: inline-flex; align-items: center; gap: 8px; color: var(--muted); font-size: 13px; font-weight: 600; white-space: nowrap; }
.br-switch .kt-select { max-width: 340px; color: var(--text-strong); }
/* ---------- Markdown shown as text (views/Markdown.tsx: a 变更说明's 看全文) ---------- */
.br-md { display: grid; gap: 8px; margin-top: 8px; font-size: 14px; color: var(--text); line-height: 1.6; }
.br-md > * { margin: 0; min-width: 0; }
.br-md :is(h4, h5) { margin: 6px 0 0; color: var(--text-strong); font-weight: 700; }
.br-md h4 { font-size: 1.08em; }
.br-md h5 { font-size: 1em; }
.br-md :is(ul, ol) { padding-left: 1.4em; display: grid; gap: 2px; }
.br-md hr { border: 0; border-top: 1px solid var(--border); }
.br-md pre { padding: 8px 10px; border-radius: 8px; background: var(--bg); border: 1px solid var(--border); white-space: pre-wrap; word-break: break-word; }
.br-md .cto-table { font-size: 13px; }
.br-md .cto-table td { color: var(--text); }
.br-md .cto-table td:first-child { white-space: nowrap; }
.br-md code, .br-inline code { padding: 0 4px; border-radius: 5px; background: color-mix(in srgb, var(--text) 8%, transparent); overflow-wrap: anywhere; }
.br-mdfold > summary { font-size: 13px; }
`

