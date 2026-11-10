/**
 * What the 需求看板 adds to the sample team board's stylesheet (styles.ts BOARD_CSS stays the sample's): the owner in
 * the orchestrator's slot, a refused node's ✕, the hand-over and merge dots on the rail, the check cells that wait for a
 * person, the spans and marks of a requirement's lanes, the conveyor's hand-over / runner / merge chips, the counters'
 * extras, 验收's step, the introduction's five phases. Only the board's tones and the host's variables.
 */
export const BOARD_EXTRA_CSS = `
.br-board .kt-orch.br-person .kt-orch-title { font-size: 17px; }
.br-board .kt-orch.br-person.is-awaiting_approval .kt-orch-body { fill: color-mix(in srgb, var(--kt-approve) 13%, var(--card)); stroke: var(--kt-approve); stroke-width: 3; }
.br-board .kt-orch.br-person.is-awaiting_approval .kt-node-halo { stroke: var(--kt-approve); animation: kt-beacon 1.1s ease-in-out infinite; }
.br-board .kt-orch.br-person.is-merged .kt-orch-body { fill: color-mix(in srgb, var(--kt-ok) 10%, var(--card)); stroke: var(--kt-ok); }
.br-board .kt-orch.br-person.is-waiting .kt-orch-body { stroke: color-mix(in srgb, var(--muted) 55%, transparent); }
.br-board .kt-orch-sub.is-wait { fill: var(--kt-approve); font-weight: 800; }
.br-board .kt-node-x circle { fill: #fff; }
.br-board .kt-node-x path { fill: none; stroke: var(--kt-bad-solid); stroke-width: 2.4; stroke-linecap: round; }
.br-board .kt-node.is-done .kt-node-sub { fill: var(--kt-ok); }
.br-board .kt-node.is-awaiting_approval .kt-node-task, .br-board .kt-node.is-failed .kt-node-task { fill: var(--text); }
.br-board .kt-node.is-failed .kt-node-task { fill: #fff; fill-opacity: .85; }
.br-board .kt-node.is-merged .kt-node-task { fill: #fff; fill-opacity: .8; }
.br-board .kt-rail-dot.is-handover circle { fill: var(--kt-handoff); }
.br-board .kt-rail-dot.is-merge circle { fill: var(--kt-ok-solid); stroke: var(--kt-ok); stroke-width: 2.5; }
.br-board .kt-rail-dot .kt-role-icon { color: #fff; }
.br-board .kt-rail-n { fill: var(--muted); font-size: 11px; font-weight: 800; }
.br-board .kt-station.is-part .kt-station-bg { stroke: color-mix(in srgb, var(--kt-approve) 60%, transparent); }
.br-board .kt-gate-chip text { fill: #fff; }

/* the check wall: a cell that waits for a person is magenta, like everything that waits for one */
.br-board .kt-cell.is-wait { --kt-c: var(--kt-approve); }
.br-board .kt-cell.is-wait .kt-cell-face { border-style: solid; animation: kt-blink 2.4s ease-in-out infinite; }
.br-board .kt-wall-inspect.is-wait { background: color-mix(in srgb, var(--kt-approve) 9%, transparent); }
.br-board .br-wall-group .kt-ac-cells { flex-wrap: wrap; }
.br-board .kt-cell-ac { overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.kt-segs i.is-wait { background: var(--kt-approve); box-shadow: 0 0 8px color-mix(in srgb, var(--kt-approve) 50%, transparent); }
.kt-segs i.is-run { background: var(--kt-run); box-shadow: 0 0 8px color-mix(in srgb, var(--kt-run) 55%, transparent); }

/* the lanes: work, waits for a person, work done again */
.br-board .kt-track-span.is-wait { background: color-mix(in srgb, var(--kt-approve) 60%, transparent); }
.br-board .kt-track-span.is-wait.is-live { background: var(--kt-approve); box-shadow: 0 0 10px color-mix(in srgb, var(--kt-approve) 70%, transparent); }
.br-board .kt-track-span.is-fix { background: color-mix(in srgb, var(--kt-fix) 70%, transparent); }
.br-board .kt-track-mark:is(.is-approved, .is-answer, .is-accepted, .is-verify-ok, .is-reflect) { background: var(--kt-ok); }
.br-board .kt-track-mark:is(.is-rejected, .is-refused, .is-verify-fail) { background: var(--kt-bad); }
.br-board .kt-track-mark:is(.is-request, .is-question) { background: var(--kt-approve); }
.br-board .kt-track-mark:is(.is-handover, .is-signed) { background: var(--kt-handoff); }
.br-board .kt-track-mark.is-blocked { background: var(--kt-warn); }
.br-board .kt-track-mark.is-commit { top: 4px; width: 6px; height: 6px; margin-left: -3px; border-radius: 50%; background: var(--text-strong); box-shadow: 0 0 0 2px var(--card); }
.br-board .kt-track-mark.is-session { background: var(--kt-run); }
.br-board .br-fact { color: var(--text); }
.br-board .br-facts-chips li { max-width: none; }
.br-board .br-mark { padding: 0 6px; border-radius: 6px; font-family: var(--font-body, sans-serif); font-weight: 750; font-size: .95em;
  background: color-mix(in srgb, var(--muted) 16%, transparent); color: var(--text-strong) !important; }
.br-board .br-mark:is(.is-approved, .is-answer, .is-accepted, .is-verify-ok, .is-reflect) { background: color-mix(in srgb, var(--kt-ok) 18%, transparent); }
.br-board .br-mark:is(.is-rejected, .is-refused, .is-verify-fail) { background: color-mix(in srgb, var(--kt-bad) 18%, transparent); }
.br-board .br-mark:is(.is-request, .is-question) { background: color-mix(in srgb, var(--kt-approve) 18%, transparent); }
.br-board .br-mark:is(.is-handover, .is-signed) { background: color-mix(in srgb, var(--kt-handoff) 20%, transparent); }
.br-board .kt-lane .br-line { margin-top: 2px; }

/* the conveyor */
.br-board .kt-belt-chip.is-handover { border: 1px solid color-mix(in srgb, var(--kt-handoff) 60%, var(--border)); background: color-mix(in srgb, var(--kt-handoff) 12%, var(--card)); }
.br-board .kt-belt-chip.is-bot { border-color: color-mix(in srgb, var(--kt-run) 50%, var(--border)); background: color-mix(in srgb, var(--kt-run) 9%, var(--card)); }
.br-board .kt-belt-chip.is-merge { background: var(--kt-ok-solid); border-color: var(--kt-ok-solid); }
.br-board .kt-belt-chip.is-merge :is(.kt-belt-role, .kt-belt-meta, .kt-belt-meta code) { color: #fff; }
.br-board .kt-belt-text { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .8em; color: var(--text); }
.br-board .kt-belt-end.is-head.is-merged { background: var(--kt-ok-solid); color: #fff; border-color: var(--kt-ok-solid); }
.br-board .kt-belt-end.is-head.is-merged code { color: #fff; }

/* the counters: one row as long as the app is wide enough (its own width, not the window's: the KiroCrew sidebar) */
.br-board .br-kpis { grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr) minmax(0, 1.1fr) minmax(0, 1.05fr) minmax(0, .7fr); }
.br-board .br-kpis > * { grid-column: auto; order: 0; }
@container kt-root (max-width: 860px) { .br-board .br-kpis { grid-template-columns: repeat(6, minmax(0, 1fr)); } .br-board .br-kpis > * { grid-column: span 2; } .br-board .br-kpis > :nth-child(n+4) { grid-column: span 3; } }
@container kt-root (max-width: 560px) { .br-board .br-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } .br-board .br-kpis > *, .br-board .br-kpis > :nth-child(n+4) { grid-column: auto; } }
.br-board .kt-kpi-note { white-space: normal; overflow: visible; word-break: keep-all; overflow-wrap: break-word; }
.br-board .br-lean-next b { color: var(--kt-approve); }
.kt-segs i.is-skip { background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--muted) 38%, transparent) 0 3px, transparent 3px 6px); }
.kt-segs i.is-next { background: color-mix(in srgb, var(--kt-approve) 30%, transparent); box-shadow: inset 0 0 0 2px var(--kt-approve); }
.kt-segs i.is-watch { background: color-mix(in srgb, var(--kt-info) 60%, transparent); }
.br-board .kt-kpi.is-warn { border-color: var(--kit-wait); }
.br-dots { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; min-height: 12px; }
.br-dots i { width: 12px; height: 12px; border-radius: 4px; }
.br-dots i.is-point { background: var(--kt-ok); box-shadow: 0 0 6px color-mix(in srgb, var(--kt-ok) 55%, transparent); }
.br-dots i.is-out { background: var(--kt-warn); }
.br-board .kt-gates-rows { margin-top: 4px; }

/* the event feed's places (你, 运行分支, 检查) */
.br-board .kt-ev-place { padding: 0 5px; border-radius: 7px; border: 1px dashed var(--border-strong, var(--border)); font-size: 12px; color: var(--muted); }

/* 验收 */
.br-board .kt-sign.is-idle { border-color: var(--border); }
.br-board .kt-sign-head .kt-pill { align-self: center; }
.br-board .kt-sign-grid dd { color: var(--text-strong); }
.br-board .br-accept-desc dt { display: flex; align-items: center; gap: 8px; }
.br-board .br-accept-desc dd > span { font-weight: 650; }
.br-step { display: grid; gap: 8px; margin-top: 10px; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--kit-wait);
  background: color-mix(in srgb, var(--kt-approve) 8%, var(--card)); }
.br-step p { margin: 0; }
.br-step-who { display: inline-flex; align-items: center; gap: 6px; font-weight: 800; color: var(--kt-approve); font-size: .9em; }
.br-extbtn { text-decoration: none; }
.br-board .br-board-qs { display: grid; gap: 10px; }
.br-board .kt-sign-blocked { font-size: .95em; }

/* the introduction: five phases (four for a repo done only here) in a row while they fit, the next row when they do
   not; a card never gets narrower than its words, which break only after a 、 (never inside a word) */
.br-way.kt-team-intro.is-phased { display: flex; flex-wrap: wrap; }
.br-way .kt-intro-phase { flex: 1 1 auto; }
.br-way .kt-intro-phase-body > .kt-intro-stage { flex: 1 0 auto; min-width: auto; }
.br-way .kt-intro-role { grid-template-columns: 36px minmax(min-content, 1fr); }
.br-board .kt-intro-name b { white-space: nowrap; }
.br-board .kt-intro-does { overflow-wrap: normal; }
.br-board .kt-intro-does .br-phrase { display: inline-block; white-space: nowrap; }
/* a requirement the repo does not have: the same card as 需求详情's */
.br-board .br-notfound { padding: 16px 20px; border: 1px solid var(--border); border-radius: 16px; background: var(--card); max-width: 720px; }
.br-board .br-notfound h3 { margin: 0 0 6px; }
/* a step said on two lines (what happened, then what to do) keeps its lines */
.br-next .br-pre-line { white-space: pre-line; }
.br-btn-big { padding: 10px 20px; font-size: 1.02em; border-radius: 12px; }

/* whom it waits for: magenta is the person looking only; anyone else is a calm blue, no blinking */
.br-board .kt-orch.br-person.is-other .kt-orch-body { fill: color-mix(in srgb, var(--kt-info) 9%, var(--card)); stroke: var(--kt-info); stroke-width: 2.5; }
.br-board .kt-orch-sub.is-other { fill: var(--kt-info); font-weight: 750; }
.br-board .kt-orch.br-person { cursor: default; }
.br-board .kt-node.is-awaiting_approval.is-other .kt-node-body { stroke: var(--kt-info); stroke-width: 2.5; fill: color-mix(in srgb, var(--kt-info) 9%, var(--card)); }
.br-board .kt-node.is-awaiting_approval.is-other .kt-node-sub { fill: var(--kt-info); }
.kt-node-badge.is-other { --kt-badge: var(--kt-info); }
.kt-legend-item.is-other i { border-color: var(--kt-info); background: color-mix(in srgb, var(--kt-info) 16%, transparent); }
.br-board .kt-track-span.is-wait.is-other { background: color-mix(in srgb, var(--kt-info) 55%, transparent); }
.br-board .kt-track-span.is-wait.is-other.is-live { background: var(--kt-info); box-shadow: none; }
.br-board .kt-track-span.is-wait.is-other.is-live::after { display: none; }

/* the graph keeps its text readable: an app too narrow for it scrolls the graph sideways (layout.ts graphWidth); the
   hidden part's edge fades and says so */
.br-graph-view { position: relative; }
/* its smallest words are 12 px too, so at that scale nothing on the graph is under 10 px (BOARD-31) */
.br-board .kt-graph-svg :is(.kt-orch-sub, .kt-rail-n, .kt-phase-stages, .kt-roster-title, .kt-roster-item text) { font-size: 12px; }
.br-graph-scroll { overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; }
.br-graph-view::before, .br-graph-view::after { content: ''; position: absolute; top: 0; bottom: 0; width: 56px; pointer-events: none; opacity: 0; transition: opacity .2s; z-index: 2; }
.br-graph-view::before { left: 0; background: linear-gradient(90deg, var(--card), transparent); }
.br-graph-view::after { right: 0; background: linear-gradient(270deg, var(--card), transparent); }
.br-graph-view.has-left::before, .br-graph-view.has-right::after { opacity: 1; }
.br-graph-more { position: absolute; top: 50%; transform: translateY(-50%); z-index: 3; padding: 5px 11px; border-radius: 999px; font: inherit; font-size: 12.5px; font-weight: 750; cursor: pointer;
  color: var(--text-strong); background: var(--card); border: 1px solid var(--border-strong, var(--border)); box-shadow: 0 2px 10px rgba(0, 0, 0, .25); }
.br-graph-more:hover { border-color: var(--accent); }
.br-graph-more.is-right { right: 10px; }
.br-graph-more.is-left { left: 10px; }

/* a phase not on the way, folded to a narrow band */
.br-board .kt-phase.is-folded .kt-phase-title { font-size: 14px; }
.br-board .kt-phase.is-folded .kt-phase-band { fill: color-mix(in srgb, var(--muted) 5%, transparent); }

/* the check wall: watching (the 14 days, nobody's turn) and not needed this time */
.br-board .kt-cell.is-watch { --kt-c: var(--kt-info); }
.br-board .kt-cell.is-watch .kt-cell-face { color: var(--kt-info); }
.br-board .kt-wall-inspect.is-watch { background: color-mix(in srgb, var(--kt-info) 9%, transparent); }
.br-board .kt-cell.is-not_needed { --kt-c: var(--muted); opacity: .6; }
.br-board .kt-cell.is-not_needed .kt-cell-face { border-style: dotted; background: none; color: var(--muted); }
.br-wall-fix { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin: 8px 0 0; font-size: .86em; color: var(--muted); }
.br-wall-fix .br-link { font-weight: 750; }
.br-spark-one { margin: -2px 0 8px; }

/* the lanes: the quiet tail drawn short, the change block */
.br-board .kt-axis .kt-axis-tick { transform: translateX(-50%); white-space: nowrap; }
.br-board .kt-axis .kt-axis-tick.is-first { transform: none; }
.br-board .kt-axis .kt-axis-tick.is-last { transform: translateX(-100%); }
.kt-axis-tail { position: absolute; top: 0; padding-left: 6px; border-left: 2px dotted color-mix(in srgb, var(--muted) 55%, transparent); font-size: .76em; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kt-track-tail { position: absolute; top: 0; height: 14px; border-left: 2px dotted color-mix(in srgb, var(--muted) 55%, transparent);
  background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--muted) 12%, transparent) 0 4px, transparent 4px 8px); }
.br-changes { display: grid; gap: 4px; min-width: 0; }
.br-commit-rows li { align-items: center; }
.br-commit-rows li .br-commit-subj { flex: 1 1 auto; }
.br-commit-rows li.is-records .br-commit-subj { color: var(--muted); }
.br-commit-rows .br-commit-files { flex: none; display: inline-flex; align-items: center; gap: 6px; color: var(--muted); }
.br-commit-rows .br-commit-files .kt-file-bar { width: 56px; }
.br-board .kt-owned { margin-top: 2px; }

/* 你要做的一步: the strip above the graph */
.br-next { display: grid; gap: 8px; padding: 10px 14px; border-radius: 14px; border: 1px solid var(--kit-wait, var(--kt-approve));
  background: color-mix(in srgb, var(--kt-approve) 7%, var(--card)); }
.br-next-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.br-next-who { display: inline-flex; align-items: center; gap: 6px; font-weight: 800; color: var(--kt-approve); white-space: nowrap; }
.br-next-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.br-next-item + .br-next-item { border-top: 1px dashed color-mix(in srgb, var(--kt-approve) 30%, var(--border)); padding-top: 8px; }
.br-next-row { display: flex; align-items: center; gap: 8px 14px; flex-wrap: wrap; }
.br-next-text { flex: 1 1 340px; min-width: 0; display: grid; gap: 4px; }
.br-next-text p { margin: 0; }
.br-next-text .br-line { margin-top: 2px; }
.br-next-acts { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.br-next-k { display: inline-block; min-width: 5.2em; margin-right: 8px; color: var(--muted); font-size: .88em; }
.br-next-hint { color: var(--text); }
.br-next-cmd { display: flex; align-items: center; gap: 6px 8px; flex-wrap: wrap; }
.br-next-cmd code { padding: 2px 8px; border-radius: 6px; border: 1px solid var(--border); background: var(--kt-glass); }
.br-next-cwd { font-size: .8em; overflow-wrap: anywhere; }
.br-next .br-q { margin: 0; }
.br-next.is-other { display: flex; align-items: baseline; gap: 6px 10px; flex-wrap: wrap; margin: 0; padding: 8px 14px; border-color: var(--border); background: var(--card); }
.br-next.is-other .br-next-who { color: var(--muted); font-weight: 700; }

/* 验收's small parts; the board's problem said with what to do */
.br-board .br-copy { display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; }
.br-board .br-desc-ref { cursor: help; }
.br-board .br-problem { display: grid; gap: 4px; }
`
