const BASE_EDITING_URL = process.env.DATOCMS_BASE_EDITING_URL || "https://example.admin.datocms.com";
const ENVIRONMENT = process.env.DATOCMS_ENVIRONMENT || "";

const PAGES = { "/": "Home", "/other": "Another page", "/double": "Two bars", "/no-reload": "No reload", "/remote": "Data from a URL" };

/** What /dev-bar-data answers: the same data the inline script carries. `serialize` is the helper's `serializeDevBarData`. */
export const remoteData = (serialize) => serialize({ queries: SAMPLE_REPORTS.slice(0, 1), project: SAMPLE_PROJECT });

// Stand-ins for what a site would hand to the X-Ray panel (the real thing is built from CDA response headers).
const SAMPLE_REPORTS = [
  { operation: "HomeQuery", environment: "main", timingsTotalMs: 35, complexity: 102, maxComplexity: 21294900, queryLength: 192, queryLengthLimit: 12000, cache: "hit", cacheTags: "active", responseBytes: 3200, query: "query HomeQuery {\n  homePage {\n    title\n  }\n}", variables: null },
  { operation: "MenuQuery", environment: "main", timingsTotalMs: 612, complexity: 1500000, maxComplexity: 21294900, queryLength: 80, queryLengthLimit: 12000, cache: "miss", cacheTags: "active", responseBytes: 260000, query: "query MenuQuery($locale: SiteLocale) {\n  allMenuItems(locale: $locale) {\n    label\n  }\n}", variables: '{\n  "locale": "it"\n}' },
];

// Stand-in for what a site reads from the Content Management API with a read-only token.
const SAMPLE_PROJECT = {
  environments: [{ name: "main", primary: true }],
  records: [
    { id: "1", model: "Home page", modelApiKey: "home_page", title: null, block: false, status: "published", updatedAt: "2026-10-01T10:00:00Z", editUrl: "https://example.admin.datocms.com/editor/item_types/1/items/1/edit", blockCount: 5 },
    { id: "2", model: "Menu item", modelApiKey: "menu_item", title: "Pricing", block: false, status: "updated", updatedAt: "2026-10-04T10:00:00Z", editUrl: "https://example.admin.datocms.com/editor/item_types/2/items/2/edit", anchor: { recordId: "2", fieldPath: "" }, blockCount: 1 },
    { id: "4", model: "Menu item", modelApiKey: "menu_item", title: "Blog", block: false, status: "published", updatedAt: "2026-09-20T10:00:00Z", editUrl: "https://example.admin.datocms.com/editor/item_types/2/items/4/edit", blockCount: 1 },
    { id: "3", model: "Button", modelApiKey: "button", title: "Start free trial", block: true, status: "published", updatedAt: null, editUrl: null, blockCount: null },
  ],
  moreRecords: 0,
  blocks: 1,
  blockCounts: [{ model: "Button", modelApiKey: "button", count: 5 }, { model: "Hero", modelApiKey: "hero", count: 2 }],
  error: null,
};

const RECORDS = [
  { published: "Welcome to the playground", draft: "Welcome to the playground (edited, not yet published)" },
  { published: "This paragraph is published.", draft: "This paragraph has changes that only drafts show." },
];

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Returns the page HTML, or null for an unknown path. `serialize` is the helper's `serializeDevBarData`. */
export async function renderPage(pathname, preview, serialize) {
  const title = PAGES[pathname];
  if (!title) return null;
  const visual = preview.visualEditing;
  const text = (record) => escapeHtml(preview.mode === "draft" ? record.draft : record.published);
  // Simulated Content Link: with visual editing on, editable texts get an outline, like DatoCMS overlays.
  const editable = (record) => (visual ? `<span class="cl" title="Edit in DatoCMS">${text(record)}</span>` : text(record));
  const attrs = [
    `project-url="${escapeHtml(BASE_EDITING_URL)}"`,
    ENVIRONMENT ? `environment="${escapeHtml(ENVIRONMENT)}"` : "",
    pathname === "/no-reload" ? 'reload="false"' : "",
    pathname === "/remote" ? 'data-url="/dev-bar-data"' : "",
  ].join(" ");
  const bars = pathname === "/double" ? 2 : 1;
  const headers = preview.headers({ baseEditingUrl: BASE_EDITING_URL });

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · datocms-dev-bar playground</title>
  <style>
    body { font: 16px/1.5 system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px 120px; color: #1D1D1B; background: #fff; }
    nav a { margin-right: 12px; }
    .cl { outline: 2px solid #FF593D; outline-offset: 2px; border-radius: 2px; }
    pre { background: #F5F8FB; padding: 12px; border-radius: 8px; overflow-x: auto; font-size: 13px; }
    input { font: inherit; padding: 6px 10px; width: 100%; box-sizing: border-box; }
  </style>
</head>
<body>
  <nav>${Object.entries(PAGES).map(([href, label]) => `<a href="${href}">${label}</a>`).join("")}</nav>
  <h1>${editable(RECORDS[0])}</h1>
  <p>${editable(RECORDS[1])}</p>
  <p id="server-state">server: ${preview.mode}, visual editing ${visual ? "on" : "off"}</p>
  <h2>CDA headers the helper would send</h2>
  <pre id="headers">${escapeHtml(JSON.stringify(headers, null, 2))}</pre>
  <p><input id="search" placeholder="Type here: shortcuts are ignored in fields"></p>
  <p id="linked" data-datocms-content-link-url="https://example.admin.datocms.com/editor/item_types/2/items/2/edit">Menu item content (linked to record 2)</p>
  <h2>Change events</h2>
  <pre id="events"></pre>
  ${await realData(preview)}
  ${pathname === "/remote" ? "" : `<script type="application/json" data-datocms-dev-bar>${serialize({ queries: SAMPLE_REPORTS, project: SAMPLE_PROJECT })}</script>`}
  ${`<datocms-dev-bar ${attrs}></datocms-dev-bar>`.repeat(bars)}
  <script>
    document.addEventListener("datocms-dev-bar:change", (event) => {
      document.getElementById("events").textContent += JSON.stringify(event.detail) + "\\n";
    });
  </script>
  <script type="module" src="/dist/index.js"></script>
</body>
</html>`;
}

/** With DATOCMS_CDA_TOKEN set, queries a real project with the helper's headers. */
async function realData(preview) {
  const token = process.env.DATOCMS_CDA_TOKEN;
  if (!token) return "";
  const query = process.env.PLAYGROUND_QUERY || "{ _site { globalSeo { siteName } } }";
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...preview.headers({ baseEditingUrl: BASE_EDITING_URL }),
  };
  if (ENVIRONMENT) headers["X-Environment"] = ENVIRONMENT;
  let body;
  try {
    const response = await fetch("https://graphql.datocms.com/", { method: "POST", headers, body: JSON.stringify({ query }) });
    body = JSON.stringify(await response.json(), null, 2);
  } catch (error) {
    body = String(error);
  }
  return `<h2>Real data</h2><pre id="real-data">${escapeHtml(body)}</pre>`;
}
