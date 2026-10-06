// What each row of the General tab means: on the label, as a tooltip.
const ROWS = {
  environment: ["Environment", "The DatoCMS environment that answered (x-environment header). A site that names none reads the primary environment."],
  calls: ["Calls", "How many times the page asked the Content Delivery API, and how many different queries it sent."],
  time: ["Response time", "Time DatoCMS spent on the queries (x-timings-total), summed. It leaves out the network trip and your server. On a cache hit it repeats the time of the original run."],
  size: ["Response size", "Size of the JSON DatoCMS sent back, uncompressed: the network moves less thanks to compression. In drafts with Visual editing on, Content Link adds hidden characters to every text, so responses are bigger than on published content."],
  complexity: ["Complexity", "How costly the heaviest query is, against the maximum DatoCMS accepts (x-complexity and x-max-complexity). Deep nesting and long lists raise it."],
  queryLength: ["Query length", "Size of the longest query text against the limit for being cached on the CDN (x-cacheable-on-cdn-query-length-limit). Above the limit the query is not cacheable there."],
  cache: ["From cache", "Whether the DatoCMS CDN answered from its cache (cf-cache-status). HIT: served from cache. MISS: computed now and stored for next time. BYPASS: caching skipped, as with drafts."],
  cacheTags: ["Cache tags", "Tags that let your site clear cached pages when content changes (x-cache-tags). Active: DatoCMS returned them. Not requested: the query did not ask, and drafts never do. Missing: asked for, none came back. The bar cannot see whether your invalidation webhook is set up."],
  records: ["Records", "Records whose content the page shows, read from the Content Management API with the read-only token on the server."],
  blocks: ["Blocks in use", "Blocks inside the records of this page, nested ones and all locales included."],
  heaviest: ["Heaviest record", "The record with the most blocks. DatoCMS caps the blocks a single record can hold (500 by default; the cap depends on the plan), so this is the one to watch."],
} as const;

const row = (key: keyof typeof ROWS, value = `<span data-row="${key}"></span>`) =>
  `<div class="row"><dt title="${ROWS[key][1]}">${ROWS[key][0]}</dt><dd>${value}</dd></div>`;

const section = (title: string, body: string) => `
      <details class="sec" open><summary>${title}</summary><div class="sec-body">${body}</div></details>`;

export const TABS = [
  { key: "general", label: "General" },
  { key: "records", label: "Records" },
  { key: "queries", label: "Queries" },
  { key: "help", label: "Help" },
];

const info = (name: string, tip: string) =>
  `<span class="info"><button type="button" class="i" aria-label="About ${name}" aria-describedby="tip-${name}">i</button><span class="tip" role="tooltip" id="tip-${name}">${tip}</span></span>`;

const KEYS = [
  [["Alt", "Shift", "D"], "Switch between draft and published"],
  [["Alt", "Shift", "V"], "Turn visual editing on and off (drafts only)"],
  [["Alt", "Shift", "B"], "Open and close the bar"],
  [["Alt"], "Hold: show the edit outlines, or hide them if the site keeps them on (Content Link, drafts with visual editing on)"],
] as const;

const HOW = [
  ["The bar", "writes two cookies and reloads the page; the server reads them to query DatoCMS. <code>?datocms=published</code> or <code>?datocms-visual=off</code> do the same for one page."],
  ["General", "the environment the page read, how its queries performed, and the records and blocks it holds, with links to the project and the docs."],
  ["Records", "what the page shows, by model. Green dot published, yellow unpublished changes, hollow draft. Needs a read-only CMA token on the server. With visual editing on, click a record to scroll to it."],
  ["Queries", "each query with its text and variables, ready to copy. Orange flags mark slow, heavy, long or large queries."],
];

// The bar holds what you click; the X-Ray panel above it holds what you read.
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
    <span class="outlines" hidden>
      <span class="outlines-dot" aria-hidden="true"></span><span class="outlines-label"></span>
      ${info("outlines", "Outlines mark what you can edit in DatoCMS. Hold Alt (Option on a Mac) to show them, or to hide them if your site keeps them on: the bar shows their state once it changes. Turning Visual editing off also removes the invisible stega characters Content Link adds to texts, which can get in the way while you work on the design (text width, line breaks, copy and paste).")}
    </span>
    <span class="sep" aria-hidden="true"></span>
    <button type="button" class="advanced" aria-expanded="false" aria-controls="advanced">X-Ray</button>
    <span class="warning" role="status" hidden>cookies blocked</span>
  </div>
  <section class="panel" id="advanced" aria-label="X-Ray">
    <div class="pane" role="tabpanel" id="pane-general" data-pane="general" aria-labelledby="tab-general">
      ${section(
        "Environment",
        `<dl class="rows">${row("environment", '<span data-row="environment"></span><span class="badge" data-primary="true"></span>')}
        <div class="row"><dt>Links</dt><dd class="links">
          <a class="project" target="_blank" rel="noopener">Project<span class="ext" aria-hidden="true">↗</span><span class="sr-only">(opens in a new window)</span></a>
          <a class="docs" href="https://www.datocms.com/docs" target="_blank" rel="noopener">Documentation<span class="ext" aria-hidden="true">↗</span><span class="sr-only">(opens in a new window)</span></a>
        </dd></div></dl>`,
      )}
      ${section(
        "Queries on this page",
        `<dl class="rows" data-queries>${row("calls")}${row("time")}${row("size")}${row("complexity")}${row("queryLength")}${row("cache", '<span class="cache-dot" aria-hidden="true"></span><span data-row="cache"></span>')}${row("cacheTags")}</dl>
        <p class="flagged" data-queries hidden><span class="flag"></span><span>slow, heavy, long or large: worth a look</span></p>
        <p class="empty">No queries reported on this page. The site has to hand them to the bar: see the README.</p>
        <button type="button" class="go" data-go="queries" data-queries>Show the queries<span class="go-arrow" aria-hidden="true">→</span></button>`,
      )}
      ${section(
        "Records on this page",
        `<dl class="rows" data-project>${row("records")}${row("blocks")}${row("heaviest")}</dl>
        <p class="project-note" hidden></p>
        <button type="button" class="go" data-go="records" data-project>Show the records<span class="go-arrow" aria-hidden="true">→</span></button>`,
      )}
    </div>
    <div class="pane" role="tabpanel" id="pane-records" data-pane="records" aria-labelledby="tab-records" hidden>
      <div class="records-top">
        <p class="records-note"><span class="records-note-text"></span>${info("records", "Records whose content the page shows, read from the Content Management API with a read-only token on the server. Dot: green published, yellow unpublished changes, hollow draft. The blocks are counted inside the records, nested ones and all locales included. With Visual editing on, click a record to scroll to it on the page.")}</p>
        <label class="records-filter-wrap" hidden><span class="search" aria-hidden="true"></span><input class="records-filter" type="search" placeholder="Filter models and blocks" aria-label="Filter models and blocks"></label>
      </div>
      <div class="records"></div>
      <details class="sec block-counts" hidden><summary><span class="block-total"></span></summary><div class="sec-body"><ul class="block-list"></ul></div></details>
    </div>
    <div class="pane" role="tabpanel" id="pane-queries" data-pane="queries" aria-labelledby="tab-queries" hidden>
      <p class="empty">No queries reported on this page. The site has to hand them to the bar: see the README.</p>
      <div class="queries"></div>
    </div>
    <div class="pane help" role="tabpanel" id="pane-help" data-pane="help" aria-labelledby="tab-help" hidden>
      ${section(
        "Keyboard shortcuts",
        `<dl class="keys">${KEYS.map(([combo, what]) => `<div class="row"><dt>${combo.map((key) => `<kbd>${key}</kbd>`).join("")}</dt><dd>${what}</dd></div>`).join("")}</dl>
        <p class="help-note">Shortcuts are ignored while you type in a field.</p>`,
      )}
      ${section(
        "How it works",
        `${HOW.map(([title, text]) => `<p class="how"><b>${title}</b>${text}</p>`).join("")}
        <a class="go readme" href="https://github.com/spleenteo/datocms-dev-bar#readme" target="_blank" rel="noopener">Full guide in the README<span class="go-arrow" aria-hidden="true">↗</span><span class="sr-only">(opens in a new window)</span></a>`,
      )}
    </div>
    <!-- Tabs at the bottom: the panel grows upwards, so they stay under the pointer when switching. -->
    <div class="tabs" role="tablist" aria-label="X-Ray">
      ${TABS.map(({ key, label }) => `<button type="button" role="tab" class="tab-button" id="tab-${key}" data-tab="${key}" aria-controls="pane-${key}" aria-selected="false" tabindex="-1">${label}<span class="tab-count" data-count="${key}"></span></button>`).join("")}
    </div>
  </section>
</div>
`;
