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
.group button, .project {
  font: inherit; color: rgb(255 255 255 / .7); background: transparent; border: 0; border-radius: 999px;
  padding: 4px 12px; cursor: pointer; text-decoration: none; transition: background-color 200ms, color 200ms;
}
.group button:hover:not(:disabled) { background: rgb(255 255 255 / .1); color: #fff; }
.group button[aria-pressed="true"] { background: #fff; color: #1D1D1B; }
.group button:disabled { cursor: not-allowed; opacity: .4; }
.project { color: #fff; background: rgb(255 255 255 / .1); }
.project:hover { background: rgb(255 255 255 / .2); }
.tab:focus-visible, button:focus-visible, .project:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.sep { width: 1px; height: 20px; background: rgb(255 255 255 / .2); }
.warning { color: #FFB4A8; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

@media (max-width: 640px) { .sep { display: none; } }
@media (prefers-reduced-motion: reduce) {
  .bar, .wrap[data-position="right"] .bar { transform: none; transition: opacity 200ms, visibility 200ms; }
  .tab { transition: none; }
}
`;
