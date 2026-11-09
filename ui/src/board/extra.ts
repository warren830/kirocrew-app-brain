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

/* the counters */
.br-board .br-kpis { grid-template-columns: minmax(190px, 1fr) minmax(260px, 1.45fr) minmax(190px, 1fr) minmax(220px, 1.1fr) minmax(130px, .7fr); }
@media (max-width: 1240px) { .br-board .br-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
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

/* the introduction: five phases */
.br-way.kt-team-intro.is-phased { grid-template-columns: .7fr 1.25fr 1.7fr 1.1fr .8fr; }
@media (max-width: 1100px) { .br-way.kt-team-intro.is-phased { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.br-btn-big { padding: 10px 20px; font-size: 1.02em; border-radius: 12px; }
`
