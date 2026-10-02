const BASE_EDITING_URL = process.env.DATOCMS_BASE_EDITING_URL || "https://example.admin.datocms.com";
const ENVIRONMENT = process.env.DATOCMS_ENVIRONMENT || "";

const PAGES = { "/": "Home", "/other": "Another page", "/double": "Two bars", "/no-reload": "No reload" };

const RECORDS = [
  { published: "Welcome to the playground", draft: "Welcome to the playground (edited, not yet published)" },
  { published: "This paragraph is published.", draft: "This paragraph has changes that only drafts show." },
];

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Returns the page HTML, or null for an unknown path. */
export async function renderPage(pathname, preview) {
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
  <h2>Change events</h2>
  <pre id="events"></pre>
  ${await realData(preview)}
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
