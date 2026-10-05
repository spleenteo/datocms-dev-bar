// What each row of the Advanced panel means, shown behind its "i" icon.
const ROWS = [
  {
    key: "environment",
    label: "Environment",
    tip: "The DatoCMS environment that answered (x-environment header). A site that names none reads the primary environment.",
  },
  {
    key: "time",
    label: "Response time",
    tip: "Time DatoCMS spent on the query (x-timings-total). It leaves out the network trip and your server. On a cache hit it repeats the time of the original run.",
  },
  {
    key: "size",
    label: "Response size",
    tip: "Size of the JSON DatoCMS sent back, uncompressed: the network moves less thanks to compression. In drafts with Visual editing on, Content Link adds hidden characters to every text, so responses are bigger than on published content.",
  },
  {
    key: "complexity",
    label: "Complexity",
    tip: "How costly the query is, against the maximum DatoCMS accepts (x-complexity and x-max-complexity). Deep nesting and long lists raise it.",
  },
  {
    key: "queryLength",
    label: "Query length",
    tip: "Size of the query text against the limit for being cached on the CDN (x-cacheable-on-cdn-query-length-limit). Above the limit the query is not cacheable there.",
  },
  {
    key: "cache",
    label: "From cache",
    tip: "Whether the DatoCMS CDN answered from its cache (cf-cache-status). HIT: served from cache. MISS: computed now and stored for next time. BYPASS: caching skipped, as with drafts.",
  },
  {
    key: "cacheTags",
    label: "Cache tags",
    tip: "Tags that let your site clear cached pages when content changes (x-cache-tags). Active: DatoCMS returned them. Not requested: the query did not ask, and drafts never do. Missing: asked for, none came back. The bar cannot see whether your invalidation webhook is set up.",
  },
];

const row = ({ key, label, tip }: (typeof ROWS)[number]) => `
      <div class="row"${key === "environment" ? "" : " data-queries"}>
        <dt>${label}<span class="info"><button type="button" class="i" aria-label="About ${label}" aria-describedby="tip-${key}">i</button><span class="tip" role="tooltip" id="tip-${key}">${tip}</span></span></dt>
        <dd><span data-row="${key}"></span>${key === "environment" ? '<span class="badge" data-primary="true"></span>' : ""}</dd>
      </div>`;

const TABS = [
  { key: "general", label: "General" },
  { key: "records", label: "Records" },
  { key: "queries", label: "Queries" },
  { key: "help", label: "Help" },
];

// The bar holds what you click; the Advanced panel above it holds what you read.
export const TEMPLATE = `
<div class="wrap" data-position="left" data-mode="draft">
  <button type="button" class="tab" aria-label="DatoCMS dev bar" aria-expanded="false" aria-controls="bar">
    <span class="dot"></span>
  </button>
  <div class="bar" id="bar">
    <span class="label"><span class="status" aria-hidden="true"></span>Viewing</span>
    <span class="group" role="group" aria-label="Content version">
      <button type="button" data-mode="draft">draft</button>
      <button type="button" data-mode="published">published</button>
    </span>
    <span class="sep" aria-hidden="true"></span>
    <span class="label">Visual editing</span>
    <span class="group" role="group" aria-label="Visual editing">
      <button type="button" data-visual="on">on</button>
      <button type="button" data-visual="off">off</button>
    </span>
    <span class="sep" aria-hidden="true"></span>
    <button type="button" class="advanced" aria-expanded="false" aria-controls="advanced">Advanced</button>
    <span class="warning" role="status" hidden>cookies blocked</span>
  </div>
  <section class="panel" id="advanced" aria-label="Advanced">
    <div class="pane" role="tabpanel" id="pane-general" data-pane="general" aria-labelledby="tab-general">
    <dl class="rows">${ROWS.map(row).join("")}
    </dl>
    <p class="empty" hidden>No queries reported on this page. The site has to hand them to the bar: see the README.</p>
    <ul class="query-lines"></ul>
    <dl class="rows links-rows">
      <div class="row">
        <dt>Links</dt>
        <dd class="links">
          <a class="project" target="_blank" rel="noopener">Project <span aria-hidden="true">↗</span><span class="sr-only">(opens in a new window)</span></a>
          <a class="docs" href="https://www.datocms.com/docs" target="_blank" rel="noopener">Documentation <span aria-hidden="true">↗</span><span class="sr-only">(opens in a new window)</span></a>
        </dd>
      </div>
    </dl>
    </div>
    <div class="pane" role="tabpanel" id="pane-records" data-pane="records" aria-labelledby="tab-records" hidden>
    <div class="records-block">
      <h3>Records on this page<span class="info"><button type="button" class="i" aria-label="About records" aria-describedby="tip-records">i</button><span class="tip" role="tooltip" id="tip-records">Records whose content the page shows, read from the Content Management API with a read-only token on the server. Dot: green published, yellow unpublished changes, hollow draft. With Visual editing on, click a record to scroll to it on the page.</span></span></h3>
      <p class="records-note"></p>
      <details class="block-counts" hidden>
        <summary><span class="block-total"></span><span class="info"><button type="button" class="i" aria-label="About block counts" aria-describedby="tip-blocks">i</button><span class="tip" role="tooltip" id="tip-blocks">Every block inside the records of this page, nested ones and all locales included, counted by model. Read from the records in full, so it also counts blocks the page does not show.</span></span></summary>
        <ul class="block-list"></ul>
      </details>
      <input class="records-filter" type="search" placeholder="Filter models and blocks" aria-label="Filter models and blocks" hidden>
      <ul class="records"></ul>
    </div>
    </div>
    <div class="pane" role="tabpanel" id="pane-queries" data-pane="queries" aria-labelledby="tab-queries" hidden>
    <p class="empty" hidden>No queries reported on this page. The site has to hand them to the bar: see the README.</p>
    <ul class="queries"></ul>
    </div>
    <div class="pane help" role="tabpanel" id="pane-help" data-pane="help" aria-labelledby="tab-help" hidden>
      <h3>Keyboard shortcuts</h3>
      <dl class="keys">
        <div><dt><kbd>Alt</kbd><kbd>Shift</kbd><kbd>D</kbd></dt><dd>Switch between draft and published</dd></div>
        <div><dt><kbd>Alt</kbd><kbd>Shift</kbd><kbd>V</kbd></dt><dd>Turn visual editing on and off (drafts only)</dd></div>
        <div><dt><kbd>Alt</kbd><kbd>Shift</kbd><kbd>B</kbd></dt><dd>Open and close the bar</dd></div>
      </dl>
      <p class="help-note">Shortcuts are ignored while you type in a field.</p>
      <h3>How it works</h3>
      <ul class="help-list">
        <li>The bar writes two cookies and reloads the page; the server reads them to query DatoCMS. <code>?datocms=published</code> or <code>?datocms-visual=off</code> do the same for one page.</li>
        <li><b>General</b>: the environment the page read, how its queries performed, and links to the project and the docs. Click a query to read it.</li>
        <li><b>Records</b>: what the page shows, by model. Green dot published, yellow unpublished changes, hollow draft. Needs a read-only CMA token on the server. With visual editing on, click a record to scroll to it.</li>
        <li><b>Queries</b>: each query with its text and variables, ready to copy. Orange flags mark slow, heavy or long queries.</li>
      </ul>
      <p class="help-note"><a class="readme" href="https://github.com/spleenteo/datocms-dev-bar#readme" target="_blank" rel="noopener">Full guide in the README <span aria-hidden="true">↗</span><span class="sr-only">(opens in a new window)</span></a></p>
    </div>
    <!-- Tabs at the bottom: the panel grows upwards, so they stay under the pointer when switching. -->
    <div class="tabs" role="tablist" aria-label="Advanced">
      ${TABS.map(({ key, label }) => `<button type="button" role="tab" class="tab-button" id="tab-${key}" data-tab="${key}" aria-controls="pane-${key}" aria-selected="false" tabindex="-1">${label}<span class="tab-count" data-count="${key}"></span></button>`).join("")}
    </div>
  </section>
</div>
`;
