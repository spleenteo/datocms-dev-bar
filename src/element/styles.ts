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

.badge {
  margin-left: 8px; padding: 2px 8px; border-radius: 999px; font-size: 11px; text-transform: uppercase; letter-spacing: .04em;
  color: #1D1D1B; background: #7AFFDF;
}
.badge[data-primary="false"] { background: var(--accent); color: #fff; }

.group { display: inline-flex; gap: 2px; padding: 2px; border-radius: 999px; background: rgb(255 255 255 / .1); }
.group button, .advanced {
  font: inherit; color: rgb(255 255 255 / .7); background: transparent; border: 0; border-radius: 999px;
  padding: 4px 12px; cursor: pointer; text-decoration: none; transition: background-color 200ms, color 200ms;
}
.group button:hover:not(:disabled) { background: rgb(255 255 255 / .1); color: #fff; }
.group button[aria-pressed="true"] { background: #fff; color: #1D1D1B; }
.group button:disabled { cursor: not-allowed; opacity: .4; }
.links { display: flex; flex-wrap: wrap; gap: 4px 16px; }
.project, .docs, .readme { color: #fff; text-decoration: underline; text-underline-offset: 3px; }
.project:hover, .docs:hover, .readme:hover { text-decoration-color: var(--accent); }
.advanced { color: #fff; background: rgb(255 255 255 / .1); }
.advanced:hover { background: rgb(255 255 255 / .2); }
.advanced[aria-expanded="true"] { background: #fff; color: #1D1D1B; }
.tab:focus-visible, button:focus-visible, .project:focus-visible, .docs:focus-visible, .readme:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.panel {
  pointer-events: auto; position: absolute; left: 12px; bottom: calc(100% + 8px); box-sizing: border-box;
  width: min(400px, calc(100vw - 24px)); padding: 12px 16px; border-radius: 16px; background: #1D1D1B;
  box-shadow: 0 8px 24px rgb(0 0 0 / .3); visibility: hidden; opacity: 0;
  transition: opacity 200ms var(--ease), visibility 200ms;
}
.wrap[data-position="right"] .panel { left: auto; right: 12px; }
.wrap[data-open][data-advanced] .panel { visibility: visible; opacity: 1; }
.tabs { display: flex; gap: 2px; margin: 10px 0 0; padding: 2px; border-radius: 999px; background: rgb(255 255 255 / .08); }
.tab-button {
  flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 5px 8px; border: 0; border-radius: 999px;
  font: inherit; font-size: 12px; color: rgb(255 255 255 / .7); background: transparent; cursor: pointer; transition: background-color 200ms, color 200ms;
}
.tab-button:hover { color: #fff; background: rgb(255 255 255 / .08); }
.tab-button[aria-selected="true"] { color: #1D1D1B; background: #fff; }
.tab-count { min-width: 16px; padding: 0 5px; border-radius: 999px; font-size: 10px; line-height: 16px; background: rgb(255 255 255 / .15); }
.tab-button[aria-selected="true"] .tab-count { background: rgb(29 29 27 / .12); }
.pane > .records-block { margin-top: 0; padding-top: 0; border-top: 0; }
.pane > .rows > .row:first-child { border-top: 0; }
.help { font-size: 12px; font-weight: 500; color: rgb(255 255 255 / .8); }
.help h3 { margin: 4px 0 6px; font: inherit; font-size: 13px; font-weight: 700; color: #fff; }
.help h3 + * { margin-top: 0; }
.keys { margin: 0; }
.keys > div { display: grid; grid-template-columns: 132px 1fr; gap: 12px; align-items: center; padding: 3px 0; }
.keys dd { margin: 0; }
kbd { display: inline-block; min-width: 14px; margin-right: 3px; padding: 1px 5px; border-radius: 4px; text-align: center; font: 600 11px/1.4 ui-monospace, Menlo, monospace; color: #fff; background: rgb(255 255 255 / .12); box-shadow: inset 0 -1px 0 rgb(255 255 255 / .15); }
.help-note { margin: 6px 0 10px; color: rgb(255 255 255 / .6); }
.help-list { margin: 0 0 6px; padding-left: 16px; }
.help-list li { margin: 0 0 6px; }
.help code { font: 11px ui-monospace, Menlo, monospace; color: #fff; }
.empty { margin: 8px 0 0; color: rgb(255 255 255 / .7); font-weight: 500; }
.rows { margin: 0; }
.row { display: grid; grid-template-columns: 132px 1fr; gap: 12px; padding: 6px 0; border-top: 1px solid rgb(255 255 255 / .1); }
.row dt { color: rgb(255 255 255 / .7); font-weight: 500; }
.row dd { margin: 0; overflow-wrap: anywhere; }
.queries { margin: 0; padding: 0; list-style: none; font-size: 12px; }
.q-line { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; padding: 4px 0; }
.queries summary { cursor: pointer; list-style: none; }
.queries summary::-webkit-details-marker { display: none; }
.queries summary::before { content: "▸"; width: 10px; color: rgb(255 255 255 / .5); transition: transform 150ms; }
.queries details[open] > summary::before { transform: rotate(90deg); }
.queries summary:hover .q-name { text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--accent); }
.query-lines { margin: 0; padding: 4px 0; list-style: none; border-top: 1px solid rgb(255 255 255 / .1); font-size: 12px; }
.q-jump { cursor: pointer; border-radius: 6px; }
.q-jump:hover .q-name { text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--accent); }
.q-jump:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.links-rows { border-top: 1px solid rgb(255 255 255 / .1); }
.pane[data-pane="queries"] { max-height: min(60vh, 520px); overflow: auto; }
.pane[data-pane="queries"] .tip { top: calc(100% + 8px); bottom: auto; }
.queries > li + li { border-top: 1px solid rgb(255 255 255 / .08); }
.queries details[open] { padding-bottom: 6px; }
.q-name { font-weight: 700; }
.queries .info { margin-left: 0; }
.q-weight { margin-left: auto; color: rgb(255 255 255 / .6); font-weight: 500; }
.flag { padding: 1px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; color: #fff; background: var(--accent); cursor: help; }
.q-body { padding: 2px 0 4px; color: rgb(255 255 255 / .75); font-weight: 500; }
.q-why { margin: 0 0 6px; }
.code { margin-top: 6px; border-radius: 8px; background: rgb(255 255 255 / .06); }
.code-head { display: flex; justify-content: space-between; align-items: center; padding: 4px 4px 0 10px; color: rgb(255 255 255 / .6); }
.code-head button { font: inherit; font-size: 11px; color: #fff; background: rgb(255 255 255 / .12); border: 0; border-radius: 999px; padding: 2px 10px; cursor: pointer; }
.code-head button:hover { background: rgb(255 255 255 / .22); }
.code pre { margin: 0; padding: 6px 10px 10px; max-height: 220px; overflow: auto; font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; color: #E8EEF4; white-space: pre; }

.records-block { margin-top: 8px; padding-top: 8px; border-top: 1px solid rgb(255 255 255 / .1); font-size: 12px; }
.records-block h3 { margin: 0 0 4px; font: inherit; font-size: 13px; font-weight: 700; }
.records-note { margin: 0 0 4px; color: rgb(255 255 255 / .7); font-weight: 500; }
.records { margin: 0; padding: 0; list-style: none; max-height: min(45vh, 360px); overflow: auto; }
.r-group { padding: 2px 0; }
.r-group summary { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; padding: 2px 0; cursor: pointer; list-style-position: inside; }
.r-rec { display: grid; grid-template-columns: 8px minmax(0, 1fr) 22px; column-gap: 8px; align-items: start; padding: 3px 0; }
.r-rec .r-dot { margin-top: 5px; }
.r-main { min-width: 0; border-radius: 6px; }
.r-findable { cursor: pointer; }
.r-findable:hover .r-model, .r-findable:hover .r-title { color: #fff; text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--accent); }
.r-findable:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.r-head { display: flex; align-items: center; gap: 6px; min-width: 0; }
.r-head .r-when { margin-left: auto; padding-left: 8px; }
.r-main > .r-title { display: block; margin-top: 1px; }
.r-head .r-title { flex: 1 1 auto; }
.r-items { margin: 0; padding: 0 0 4px 22px; list-style: none; }
.r-count { color: rgb(255 255 255 / .6); font-weight: 600; }
.block-counts { margin: 0 0 6px; }
.block-counts summary { display: flex; align-items: center; gap: 6px; cursor: pointer; color: rgb(255 255 255 / .85); font-weight: 600; }
.block-list { margin: 4px 0 0; padding: 0 0 0 16px; list-style: none; columns: 2; column-gap: 16px; }
.block-list li { display: flex; gap: 6px; padding: 1px 0; break-inside: avoid; }
.records-filter {
  box-sizing: border-box; width: 100%; margin: 2px 0 6px; padding: 6px 10px; border: 1px solid rgb(255 255 255 / .2);
  border-radius: 8px; background: rgb(255 255 255 / .06); color: #fff; font: inherit; font-weight: 500;
}
.records-filter::placeholder { color: rgb(255 255 255 / .5); }
.records-filter:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
.r-model { font-weight: 700; }
.r-block { padding: 1px 6px; border-radius: 4px; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; border: 1px solid rgb(255 255 255 / .3); color: rgb(255 255 255 / .7); }
.r-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: #7AFFDF; cursor: help; }
.r-dot[data-status="updated"] { background: #FFD27A; }
.r-dot[data-status="draft"], .r-dot[data-status="unknown"] { background: transparent; box-shadow: inset 0 0 0 1.5px rgb(255 255 255 / .6); }
.r-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: rgb(255 255 255 / .85); font-weight: 500; }
.r-when { flex: none; white-space: nowrap; color: rgb(255 255 255 / .5); font-weight: 500; font-size: 11px; }
.r-edit {
  margin-top: -3px; display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: 6px; color: rgb(255 255 255 / .7); transition: background-color 200ms, color 200ms;
}
.r-edit:hover { color: #fff; background: rgb(255 255 255 / .12); }
.r-edit:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.info { position: relative; display: inline-flex; margin-left: 6px; vertical-align: middle; }
.i {
  width: 16px; height: 16px; padding: 0; border-radius: 50%; border: 1px solid rgb(255 255 255 / .5);
  background: transparent; color: rgb(255 255 255 / .7); font: italic 700 10px/1 Georgia, serif; cursor: help;
}
.i:hover { color: #fff; border-color: #fff; }
.tip-line { display: block; }
.tip-line + .tip-line { margin-top: 4px; }
.tip {
  position: absolute; left: -8px; bottom: calc(100% + 8px); z-index: 2; box-sizing: border-box; width: 260px; padding: 8px 10px;
  border-radius: 8px; background: #fff; color: #1D1D1B; font-size: 12px; font-weight: 500; line-height: 1.4;
  box-shadow: 0 4px 16px rgb(0 0 0 / .3); visibility: hidden; opacity: 0; pointer-events: none;
}
.info:hover .tip, .info:focus-within .tip { visibility: visible; opacity: 1; }
.tip-end { left: auto; right: -8px; }

.outlines { display: inline-flex; align-items: center; gap: 6px; font-weight: 500; color: rgb(255 255 255 / .75); }
.outlines-dot { width: 8px; height: 8px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px rgb(255 255 255 / .6); }
.outlines[data-state="on"] .outlines-dot { background: var(--accent); box-shadow: none; }
.outlines .info { margin-left: 0; }
.sep { width: 1px; height: 20px; background: rgb(255 255 255 / .2); }
.warning { color: #FFB4A8; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

@media (max-width: 640px) { .sep { display: none; } }
@media (prefers-reduced-motion: reduce) {
  .bar, .wrap[data-position="right"] .bar { transform: none; transition: opacity 200ms, visibility 200ms; }
  .tab { transition: none; }
}
`;
