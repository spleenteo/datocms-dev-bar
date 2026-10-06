export const STYLES = `
:host { all: initial; }
[hidden] { display: none !important; }

.wrap {
  --accent: var(--dev-bar-accent, #FF593D);
  --ease: cubic-bezier(.55, 0, .1, 1);
  position: fixed; bottom: var(--dev-bar-bottom, 12px); left: 0; z-index: 2147483000;
  display: flex; align-items: center; pointer-events: none;
  font: 600 13px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif; color: #fff;
}
.wrap[data-position="right"] { left: auto; right: 0; flex-direction: row-reverse; }

.tab {
  pointer-events: auto; position: absolute; left: 0; top: 50%; z-index: 1;
  width: 24px; height: 48px; padding: 0; border: 0; border-radius: 0 999px 999px 0;
  background: var(--accent); box-shadow: 0 4px 16px rgb(0 0 0 / .25);
  cursor: pointer; overflow: hidden; transform: translateY(-50%);
  transition: width 300ms var(--ease);
}
.tab:hover { width: 28px; }
.wrap[data-position="right"] .tab { left: auto; right: 0; border-radius: 999px 0 0 999px; }

.dot {
  position: absolute; left: 0; top: 50%; width: 16px; height: 16px; box-sizing: border-box;
  border-radius: 50%; background: #fff; transform: translate(-50%, -50%);
}
.wrap[data-position="right"] .dot { left: auto; right: 0; transform: translate(50%, -50%); }
.wrap[data-mode="published"] .dot { background: transparent; border: 3px solid #fff; }

.bar {
  pointer-events: auto; position: relative; margin: 0 12px; box-sizing: border-box;
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; max-width: calc(100vw - 24px);
  padding: 8px 8px 8px 24px; border-radius: 24px; background: #1D1D1B; box-shadow: 0 8px 24px rgb(0 0 0 / .3);
  visibility: hidden; opacity: 0; transform: translateX(calc(-100% - 12px));
  transition: transform 300ms var(--ease), opacity 300ms var(--ease), visibility 300ms;
}
.wrap[data-position="right"] .bar { padding: 8px 24px 8px 8px; transform: translateX(calc(100% + 12px)); }
.wrap[data-open] .bar { visibility: visible; opacity: 1; transform: none; }

.label { display: inline-flex; align-items: center; gap: 8px; }
.status { width: 8px; height: 8px; border-radius: 50%; background: #7AFFDF; }
.wrap[data-mode="published"] .status { background: #8FA1B3; }
.group { display: inline-flex; gap: 2px; padding: 2px; border-radius: 999px; background: rgb(255 255 255 / .1); }
.group button, .advanced {
  font: inherit; color: rgb(255 255 255 / .7); background: transparent; border: 0; border-radius: 999px;
  padding: 4px 12px; cursor: pointer; text-decoration: none; transition: background-color 200ms, color 200ms;
}
.group button:hover:not(:disabled) { background: rgb(255 255 255 / .1); color: #fff; }
.group button[aria-pressed="true"] { background: #fff; color: #1D1D1B; }
.group button:disabled { cursor: not-allowed; opacity: .4; }
.advanced { color: #fff; background: rgb(255 255 255 / .1); }
.advanced:hover { background: rgb(255 255 255 / .2); }
.advanced[aria-expanded="true"] { background: #fff; color: #1D1D1B; }
.tab:focus-visible, button:focus-visible, a:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.outlines { display: inline-flex; align-items: center; gap: 6px; font-weight: 500; color: rgb(255 255 255 / .75); }
.outlines-dot { width: 8px; height: 8px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px rgb(255 255 255 / .6); }
.outlines[data-state="on"] .outlines-dot { background: var(--accent); box-shadow: none; }
.outlines .info { margin-left: 0; }
.sep { width: 1px; height: 20px; background: rgb(255 255 255 / .2); }
.warning { color: #FFB4A8; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* The X-Ray panel: light, in the style of the DatoCMS interface. */
.panel {
  --purple: #6E3FF3; --purple-soft: #EDE8FF; --surface: #F3F3F5; --border: #E6E6EA; --ink: #1D1D1B; --grey: #6F6F75; --green: #51C21A; --amber: #F5A623;
  pointer-events: auto; position: absolute; left: 33px; bottom: calc(100% + 8px); box-sizing: border-box;
  width: min(400px, calc(100vw - 45px)); border-radius: 8px; background: #fff; color: var(--ink); border: 1px solid var(--border);
  box-shadow: 0 8px 24px rgb(0 0 0 / .15); visibility: hidden; opacity: 0; overflow: hidden;
  font-size: 13px; font-weight: 500; line-height: 1.3;
  transition: opacity 200ms var(--ease), visibility 200ms;
}
.wrap[data-position="right"] .panel { left: auto; right: 33px; }
.wrap[data-open][data-advanced] .panel { visibility: visible; opacity: 1; }
.pane { max-height: min(70vh, 640px); overflow: auto; }
.panel b, .panel strong { font-weight: 700; }
.panel code { font: 11px ui-monospace, Menlo, monospace; }

.sec { border-top: 1px solid var(--border); }
.sec:first-child { border-top: 0; }
.sec > summary {
  display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 16px; cursor: pointer; list-style: none;
  font-weight: 700; background: var(--surface);
}
.sec > summary::-webkit-details-marker { display: none; }
.sec > summary::after { content: ""; width: 7px; height: 7px; border: solid var(--ink); border-width: 0 1.5px 1.5px 0; transform: rotate(45deg); margin: 0 3px 3px 0; transition: transform 150ms; }
.sec[open] > summary::after { transform: rotate(225deg); margin: 3px 3px 0 0; }
.sec-body { padding: 4px 16px 12px; }

.rows, .keys { margin: 0; }
.row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--border); }
.rows > .row:last-child, .keys > .row:last-child { border-bottom: 0; }
.row dt { color: var(--grey); flex: none; }
.row dd { margin: 0; text-align: right; overflow-wrap: anywhere; display: flex; align-items: center; justify-content: flex-end; gap: 6px; flex-wrap: wrap; }
.row dt[title] { cursor: help; }
.badge { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; color: #2E7D0D; background: #E3F7D6; }
.badge::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--green); }
.badge[data-primary="false"] { color: #8A4B00; background: #FFF0D6; }
.badge[data-primary="false"]::before { background: var(--amber); }
.cache-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); }
.cache-dot[data-cache="some"] { background: var(--amber); }
.cache-dot[data-cache="none"] { background: transparent; box-shadow: inset 0 0 0 1.5px #9A9AA0; }
.links { gap: 4px 16px; justify-content: flex-start; }
.links a { color: var(--purple); font-weight: 600; text-decoration: underline; text-underline-offset: 3px; display: inline-flex; align-items: center; gap: 3px; }
.ext { font-size: 11px; }
.flagged { display: flex; align-items: center; gap: 6px; margin: 4px 0 0; color: var(--grey); }
.flag { padding: 1px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; color: #fff; background: var(--accent); cursor: help; }
.empty, .project-note { margin: 6px 0 0; color: var(--grey); }
.go {
  display: flex; align-items: center; justify-content: center; gap: 8px; box-sizing: border-box; width: 100%; margin: 12px 0 0; padding: 10px 16px;
  border: 0; border-radius: 4px; background: var(--purple-soft); color: var(--purple); font: inherit; font-weight: 700; cursor: pointer; text-decoration: none;
  transition: background-color 200ms;
}
.go:hover { background: #E2DAFF; }

/* Note and filter stay put while the models and records scroll under them. */
.records-top { position: sticky; top: 0; z-index: 1; padding: 12px 16px 8px; background: #fff; border-bottom: 1px solid var(--border); }
.records-note { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin: 0; }
.records-filter-wrap { position: relative; display: block; margin-top: 8px; }
.search { position: absolute; left: 10px; top: 50%; width: 12px; height: 12px; margin-top: -7px; border: 1.5px solid var(--grey); border-radius: 50%; box-sizing: border-box; }
.search::after { content: ""; position: absolute; right: -5px; bottom: -4px; width: 5px; height: 1.5px; background: var(--grey); transform: rotate(45deg); }
.records-filter {
  box-sizing: border-box; width: 100%; padding: 8px 10px 8px 30px; border: 1px solid var(--border); border-radius: 4px; background: #fff; color: var(--ink); font: inherit;
}
.records-filter::placeholder { color: #9A9AA0; }
.records-filter:focus { outline: 2px solid var(--purple); outline-offset: 1px; }
.r-head { display: inline-flex; align-items: center; gap: 6px; }
.r-group > summary .r-dot { margin-left: 2px; }
.r-rec { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border); }
.r-items > .r-rec:last-child { border-bottom: 0; }
.r-items { margin: 0; padding: 0; list-style: none; }
.r-main { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; border-radius: 4px; }
.r-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.r-findable { cursor: pointer; }
.r-findable:hover .r-title { color: var(--purple); text-decoration: underline; text-underline-offset: 3px; }
.r-when { flex: none; white-space: nowrap; color: var(--grey); font-size: 12px; }
.r-blocks { flex: none; padding: 1px 6px; border-radius: 999px; font-size: 11px; font-weight: 600; color: var(--grey); background: var(--surface); }
.r-block { font-weight: 500; color: var(--grey); }
.r-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--green); cursor: help; }
.r-dot[data-status="updated"] { background: var(--amber); }
.r-dot[data-status="draft"], .r-dot[data-status="unknown"] { background: transparent; box-shadow: inset 0 0 0 1.5px #9A9AA0; }
.r-edit { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 4px; color: var(--purple); transition: background-color 200ms; }
.r-edit:hover { background: var(--purple-soft); }
.block-list { margin: 0; padding: 0; list-style: none; columns: 2; column-gap: 16px; }
.block-list li { display: flex; justify-content: space-between; gap: 6px; padding: 4px 0; break-inside: avoid; color: var(--grey); }
.block-list .r-count { color: var(--ink); font-weight: 600; }

.q-head { display: flex; align-items: center; gap: 6px; }
.q-count { font-weight: 600; color: var(--grey); }
.q-weight { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 6px 0; font-size: 12px; color: var(--grey); }
.q-why { margin: 0 0 6px; font-size: 12px; color: var(--grey); line-height: 1.4; }
.code { margin: 6px 0 0; border: 1px solid var(--border); border-radius: 4px; background: #F8F8FA; overflow: hidden; }
.code-head { display: flex; justify-content: space-between; align-items: center; padding: 6px 6px 6px 10px; background: var(--surface); color: var(--grey); font-size: 12px; font-weight: 600; }
.code-head button { font: inherit; font-size: 11px; font-weight: 600; color: var(--ink); background: #fff; border: 1px solid var(--border); border-radius: 4px; padding: 3px 10px; cursor: pointer; }
.code-head button:hover { background: var(--surface); }
.code pre { margin: 0; padding: 8px 10px 10px; max-height: 220px; overflow: auto; font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--ink); white-space: pre; }

.keys .row { align-items: center; }
.keys dt { display: flex; gap: 3px; width: 120px; }
.keys dd { flex: 1; justify-content: flex-start; text-align: left; color: var(--grey); font-size: 12px; }
kbd { display: inline-block; min-width: 14px; padding: 1px 6px; border: 1px solid var(--border); border-radius: 4px; text-align: center; font: 600 11px/1.4 ui-monospace, Menlo, monospace; color: var(--ink); background: #fff; }
.help-note { margin: 8px 0 0; color: #9A9AA0; font-size: 12px; }
.how { margin: 8px 0 0; font-size: 12px; color: var(--grey); line-height: 1.4; }
.how b { display: block; font-size: 13px; color: var(--ink); margin-bottom: 2px; }
.readme { margin-top: 12px; }

.info { position: relative; display: inline-flex; margin-left: 6px; vertical-align: middle; }
.i {
  width: 16px; height: 16px; padding: 0; border-radius: 50%; border: 1px solid rgb(255 255 255 / .5);
  background: transparent; color: rgb(255 255 255 / .7); font: italic 700 10px/1 Georgia, serif; cursor: help;
}
.i:hover { color: #fff; border-color: #fff; }
.panel .i { border-color: #9A9AA0; color: var(--grey); }
.panel .i:hover { color: var(--ink); border-color: var(--ink); }
.tip-line { display: block; }
.tip-line + .tip-line { margin-top: 4px; }
/* Tooltips are placed by the bar in viewport coordinates, so the panel's scrolling and clipping never cut them. */
.tip {
  position: fixed; left: 0; top: 0; z-index: 2147483001; box-sizing: border-box; width: min(260px, 100vw - 16px); padding: 8px 10px;
  border-radius: 8px; background: #fff; color: #1D1D1B; font-size: 12px; font-weight: 500; line-height: 1.4; text-align: left;
  box-shadow: 0 4px 16px rgb(0 0 0 / .3); visibility: hidden; opacity: 0; pointer-events: none;
}
.panel .tip { background: var(--ink); color: #fff; }
.info:hover .tip, .info:focus-within .tip { visibility: visible; opacity: 1; }

.tabs { display: flex; gap: 24px; padding: 0 16px 10px; border-top: 1px solid var(--border); background: var(--surface); }
.tab-button {
  display: inline-flex; align-items: center; gap: 5px; padding: 12px 0 4px; border: 0; border-bottom: 3px solid transparent;
  font: inherit; font-size: 14px; font-weight: 700; color: var(--grey); background: transparent; cursor: pointer; transition: color 200ms, border-color 200ms;
}
.tab-button:hover { color: var(--ink); }
.tab-button[aria-selected="true"] { color: var(--ink); border-bottom-color: var(--purple); }
.tab-count { font-weight: 600; color: var(--grey); }

@media (max-width: 640px) { .sep { display: none; } .panel { left: 12px; width: calc(100vw - 24px); } .wrap[data-position="right"] .panel { right: 12px; } }
@media (prefers-reduced-motion: reduce) {
  .bar, .wrap[data-position="right"] .bar { transform: none; transition: opacity 200ms, visibility 200ms; }
  .tab { transition: none; }
}
`;
