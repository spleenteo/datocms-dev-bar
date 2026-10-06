# @spleenteo/datocms-dev-bar

A dev bar for DatoCMS sites, for local development only. One click (or `Alt+Shift+D`) switches the page between draft and published content; another (`Alt+Shift+V`) turns visual editing on and off. An **X-Ray** panel shows what DatoCMS said about the page: the environment, how the queries performed, their text, and the records and blocks the page shows.

It loads into your development server and needs no change to your code: it watches the queries your server sends to DatoCMS, applies the switches to them, and adds the bar to every page. Any framework that runs its dev server on Node. No dependencies. Nothing of it reaches your build.

## What you get

**The bar** holds what you click:

| Control | What it does |
|---|---|
| Viewing: draft / published | which version of the content the page reads |
| Visual editing: on / off | Content Link overlays (drafts only) |
| Outlines | not a control: says whether the Content Link outlines are on, once the bar has seen them change (hold `Alt` to show or hide them) |
| X-Ray | opens the panel |

**The X-Ray panel** holds what you read, in four tabs at its bottom edge:

| Tab | What it shows | Needs |
|---|---|---|
| General | environment (primary or not), response time, response size, complexity, query length, CDN cache, cache tags, one line per query, links to the project and the docs | nothing |
| Records | the records and blocks the page shows, grouped by model, with status, title and last change; a filter; a click scrolls to the content | a read-only CMA token |
| Queries | each query with its text and variables, ready to copy; flags on slow, heavy, long or large ones | nothing |
| Help | keyboard shortcuts and a short guide | nothing |

Every figure has an "i" icon that explains it.

## Install

```bash
npm install -D @spleenteo/datocms-dev-bar
```

Load it into the development server with Node's `--import`, in the `dev` script:

```json
"dev": "NODE_OPTIONS=--import=@spleenteo/datocms-dev-bar/register next dev"
```

The same line works with `astro dev`, `nuxt dev`, `vite dev` or any other dev server that runs on Node (on Windows, set the variable with `cross-env` or in the shell). Tested on Next.js 16 with the App Router.

Then the environment, in your local env file and never in production:

| Variable | What for |
|---|---|
| `DATOCMS_DEV_BAR_CDA_TOKEN` | a Content Delivery API token that can read drafts. It replaces the one your site sends, so the draft switch works whatever token the site uses. Without it the site's token is kept, and drafts show only if it can read them |
| `DATOCMS_BASE_EDITING_URL` | your DatoCMS admin URL, `https://your-project.admin.datocms.com`: for Content Link and for the links in the panel |
| `DATOCMS_DEVTOOLS_TOKEN` | optional: a read-only Content Management API token, for the Records tab. See [Records](#records-needs-a-read-only-cma-token) |

Start the server, open the site: the bar sits bottom left, 200 px up from the edge so the framework's own dev indicator keeps its corner. `DATOCMS_DEV_BAR_POSITION=bottom-right` moves it, `DATOCMS_DEV_BAR_BOTTOM=12px` (any CSS length) lowers or raises it.

## How it works

The bar never talks to DatoCMS. It writes two cookies and reloads the page. The preload reads them on each request your server serves, and applies them to the calls your server makes to the Content Delivery API:

| Cookie | Values | Default | Effect on the calls |
|---|---|---|---|
| `datocms-mode` | `draft` \| `published` | `draft` | `draft` → `X-Include-Drafts: true`, `published` → the header is removed |
| `datocms-visual` | `on` \| `off` | `on` | `on` in draft → `X-Visual-Editing: v1` + `X-Base-Editing-Url` |

URL parameters do the same for one page and win over cookies: `?datocms=published`, `?datocms-visual=off`. Handy when an AI agent drives your browser: it can open `http://localhost:3000/about?datocms=published` and see the published page right away.

Visual editing only applies to drafts. Turning it off removes the Content Link metadata from the response, so the overlays disappear.

What the preload does, in order:

1. It sits on the server's `fetch` and watches the calls to `graphql.datocms.com`. On each one it applies the cookies, swaps the token when `DATOCMS_DEV_BAR_CDA_TOKEN` is set, and keeps a report: the query, its variables, the response headers and the result. Each call is tied to the HTTP request being served.
2. It appends the bar to every HTML page the server sends, and serves the bar's script and data from `/__datocms-dev-bar/`.
3. After a navigation that does not reload the page, the bar asks for the data of the new page.

Every call to the Content Delivery API goes out with `cache: "no-store"` while the preload is loaded: the switches must show at once, and a cached answer would hide them. So in development the panel counts the queries your code really makes, and your framework's data cache does not apply to them.

The bar shows only on `localhost`, `127.0.0.1`, `[::1]` and hosts ending in `.local`, `.localhost` or `.test`. The preload loads only where you put it, the `dev` script: nothing of the package is imported by your code, so nothing of it is in your build.

### Limits

- Node only. A dev server that runs your code elsewhere (an edge sandbox, a worker, a Cloudflare `workerd`) is not seen: use the [manual integration](#manual-integration).
- Your site's own draft logic is untouched. The bar decides what DatoCMS answers, not what your code renders around it: a `<ContentLink>` controller that your site mounts only in its own draft mode stays unmounted, and with it the outlines and the "scroll to the content" of the Records tab.
- The bar is appended after `</html>`; browsers move it into the body. Compression is turned off for the pages that get it.

## The X-Ray panel

### Queries

What the panel reads from the headers of each response:

| Row | Header | Notes |
|---|---|---|
| Environment | `x-environment` | the environment that answered |
| Response time | `x-timings-total` | time at DatoCMS, without the network; on a cache hit it repeats the original run |
| Response size | none: measured on the result | the JSON, uncompressed |
| Complexity | `x-complexity`, `x-max-complexity` | cost of the query against the maximum |
| Query length | `x-cacheable-on-cdn-query-length-limit` | above the limit the query is not cacheable on the CDN |
| From cache | `cf-cache-status` | hit, miss (computed now, stored), bypass |
| Cache tags | `x-cache-tags` | active, not requested (drafts never ask), or missing |

The weight flags are rules of thumb, not DatoCMS limits: **slow** from 500 ms, **heavy** from 5% of the maximum complexity, **length** from 75% of the CDN limit, **large** from 200 KB of JSON.

### Records (needs a read-only CMA token)

The Records tab reads the project from the Content Management API, on your machine, with a token you create for it. The token never reaches the browser: the page only gets names, statuses, titles and links.

**Create the token** in DatoCMS:

1. Settings → Roles → new role, for example "Dev Tools". Add one rule on content: action **read**, all models, all environments. Leave everything else off: no create, update, publish, schema, environments, users, webhooks or audit log.
2. Settings → API tokens → new token with that role and access to the Content Management API.
3. Put it in your local env file as `DATOCMS_DEVTOOLS_TOKEN`. Never in the production environment.

A rule limited to one environment hides the records of the others: the panel then shows blocks only, and says the role cannot read the models.

The records come from the query results: every `id` in them, plus the records behind the Content Link metadata when visual editing is on (the preload uses `@datocms/content-link` for that when your site has it). At most 100 IDs are looked up per page; IDs of uploads simply come back empty. Environments and models are kept for a minute, title fields for ten; records are read on every load.

What the tab shows, per model: records and blocks, a dot for the status (green published, yellow unpublished changes, hollow draft), the title (the model's title field, or a field named `title`, `name`, `label`, `heading`, `question` or `internal_name`), the last change, and a pencil that opens the record in DatoCMS. Blocks have no pencil: they live inside a record. The filter searches model names, API keys, titles and statuses (`unpublished` finds the records with changes to publish).

With the token, the Environment badge also becomes a fact: DatoCMS says whether the environment is the primary one.

### Scroll to the content

With visual editing on, Content Link marks the elements each record fills. A click on a record in the Records tab scrolls the page to it and outlines it for a moment; repeated clicks walk through every place it appears. Blocks are found through the record that holds them. With visual editing off, on published content, or when the site does not mount its Content Link controller, the marks are not there and records are not clickable.

## Keyboard shortcuts

| Keys | Action |
|---|---|
| `Alt+Shift+D` | switch between draft and published |
| `Alt+Shift+V` | turn visual editing on and off (drafts only) |
| `Alt+Shift+B` | open and close the bar |
| `Alt` (hold) | show the Content Link outlines, or hide them if the site keeps them on. This one belongs to `@datocms/content-link`; the bar only shows the state |

The bar's shortcuts are ignored while you type in a field.

## Manual integration

Without the preload, your code does its work: it reads the cookies, passes the switches to its queries, puts the bar in the page and hands it what it knows. For runtimes that are not Node, or when you would rather wire it yourself. Nothing here is needed with the preload.

### 1. Server side

```ts
import { readDevPreview } from "@spleenteo/datocms-dev-bar/server";

const preview = readDevPreview(request, { isDev: process.env.NODE_ENV === "development" });
// preview.mode: "draft" | "published"; preview.visualEditing: boolean

// With @datocms/cda-client:
const result = await executeQuery(query, {
  token: process.env.DATOCMS_CDA_TOKEN,
  ...preview.cdaOptions({ baseEditingUrl: "https://your-project.admin.datocms.com" }),
});

// With fetch:
await fetch("https://graphql.datocms.com/", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, ...preview.headers({ baseEditingUrl: "https://your-project.admin.datocms.com" }) },
  body: JSON.stringify({ query }),
});
```

`readDevPreview` takes a `Request`, or `{ cookie, url, searchParams }`. Without `isDev: true` it always answers published, so a hand-written cookie cannot open drafts in production. Use one CDA token with access to drafts. Do not cache draft responses.

### 2. The bar

Load it in development only:

```html
<datocms-dev-bar project-url="https://your-project.admin.datocms.com"></datocms-dev-bar>
<script type="module">
  if (location.hostname === "localhost") import("https://cdn.jsdelivr.net/npm/@spleenteo/datocms-dev-bar@0.1.0");
</script>
```

From a CDN, name the version: the script runs on your machine, and an unpinned address runs whatever is published next. With a bundler, `import("@spleenteo/datocms-dev-bar")` (see the recipes). For a classic `<script src>` the package also ships `dist/datocms-dev-bar.iife.js`.

| Attribute | Default | Meaning |
|---|---|---|
| `project-url` | none | DatoCMS admin URL; without it the Project link in the panel is hidden |
| `environment` | none | the environment the site reads; the Project link points to `<project-url>/environments/<environment>`. The panel prefers the name DatoCMS sends back (`x-environment`); left out and with no queries reported, it shows the primary environment |
| `environment-primary` | none | add it when the named `environment` is the primary one; otherwise the panel flags it "not primary". With a CMA token the panel asks DatoCMS instead |
| `position` | `bottom-left` | or `bottom-right` |
| `reload` | `true` | `false`: write the cookies, emit the event, do not reload |
| `allow-hosts` | none | extra development hosts, space separated |
| `shortcuts` | `on` | `off` disables `Alt+Shift+D` / `V` / `B` |
| `data-url` | none | where the bar fetches the data of the X-Ray panel, instead of reading it from the page: see [Loading the data after the page](#loading-the-data-after-the-page) |

CSS: `datocms-dev-bar { --dev-bar-accent: #FF593D; --dev-bar-bottom: 12px; }`

Event: `datocms-dev-bar:change`, cancelable, `detail: { mode, visualEditing }`. Cancel it to refresh your own way (for example `router.refresh()` in Next.js).

### 3. The X-Ray panel

The bar runs in the browser and the queries run on your server, so the server hands over what it knows. Write it into the page once, in development only:

```html
<script type="application/json" data-datocms-dev-bar>{ "queries": [...], "project": {...} }</script>
```

Build that JSON with `serializeDevBarData({ queries, project })`: it escapes `<`, so the data cannot close the tag. `project` is `null` without a CMA token.

The bar reads the script once, when it loads, so the script must already be in the page: after the queries have run, and before a navigation that does not reload the page.

#### Loading the data after the page

Some frameworks send the page while its queries still run (Next.js App Router), or change page without reloading it. There is nothing to write into the page yet, or nobody reads it again. Give the bar an address instead:

```html
<datocms-dev-bar data-url="/api/dev-bar?id=..."></datocms-dev-bar>
```

The bar fetches it when it loads and again every time the attribute changes (same origin, never from cache), and expects the same JSON, built with `serializeDevBarData`. The endpoint is yours: keep the reports of each request on the server under an ID, put the ID in the address, and answer 404 outside development.

#### Query reports

After each Content Delivery API call, read the response headers:

```ts
import { readQueryReport } from "@spleenteo/datocms-dev-bar/server";

reports.push(
  readQueryReport(response.headers, {
    cacheTagsRequested: true, // whether you sent X-Cache-Tags: true
    operation: "HomeQuery", // optional: the name shown in the panel
    query: queryText, // optional: shown and copyable in the Queries tab
    variables, // optional: anything JSON can hold
    result, // optional: the data that came back, to measure the response size
  }),
);
```

With `@datocms/cda-client`, `rawExecuteQuery` returns the `Response` as its second value. To get the text of a `gql.tada` or `graphql` document, use `print` from `@0no-co/graphql.web` or `graphql`. Without `result` the Response size row says n/a: `Content-Length` counts the compressed bytes.

#### Project data

**Collect the record IDs** from each query result, then **fetch the project data** once per page:

```ts
import { decodeStega } from "@datocms/content-link";
import { collectRecordIds, fetchProjectInfo } from "@spleenteo/datocms-dev-bar/server";

// after each query: every `id` in the result, plus the records behind Content Link metadata
for (const id of collectRecordIds(result, decodeStega)) recordIds.add(id);

// once per page, in development only, when the token is set
const project = await fetchProjectInfo({
  token: process.env.DATOCMS_DEVTOOLS_TOKEN,
  environment: reports.find((r) => r.environment)?.environment, // the one that answered
  recordIds: [...recordIds],
  projectUrl: "https://your-project.admin.datocms.com", // for the edit links
});
```

`collectRecordIds` works without the decoder too, but then it only finds the records whose `id` your queries select. With visual editing on, the decoder finds the records behind every text.

`fetchProjectInfo` never throws: a failure comes back in `project.error` and shows in the panel. It takes `maxRecords` (default 100). Call it in development only, like everything in this section: it reads the latest version of each record, so what it returns includes the titles of drafts and links to the DatoCMS admin, and none of it belongs in a production page.

#### Without a token, or without reports

| Missing | The panel |
|---|---|
| the token | Records tab says how to add one; the Environment badge is a guess from the attributes |
| the query reports | General and Queries say no queries were reported |
| both | the bar still switches draft, published and visual editing |

### Recipes

#### Astro

The minimal setup:

```astro
---
import { readDevPreview } from "@spleenteo/datocms-dev-bar/server";
const preview = readDevPreview(Astro.request, { isDev: import.meta.env.DEV });
---
{import.meta.env.DEV && <datocms-dev-bar project-url="https://your-project.admin.datocms.com" />}
<script>
  if (import.meta.env.DEV) import("@spleenteo/datocms-dev-bar");
</script>
```

Pages that read cookies must be rendered on demand (`output: "server"` or `export const prerender = false`).

With the X-Ray panel, collect per request in the function that runs your queries, and hand over in the component that renders the bar (it must render after the page's queries, for example at the end of the layout):

```ts
// src/lib/devBar.ts
import { decodeStega } from "@datocms/content-link";
import { collectRecordIds, readQueryReport, type QueryReport } from "@spleenteo/datocms-dev-bar/server";

const byRequest = new WeakMap<Request, { reports: QueryReport[]; ids: Set<string> }>();

export function recordQuery(request: Request, response: Response, result: unknown, options: Parameters<typeof readQueryReport>[1]) {
  if (!import.meta.env.DEV) return;
  const data = byRequest.get(request) ?? { reports: [], ids: new Set<string>() };
  data.reports.push(readQueryReport(response.headers, { ...options, result }));
  for (const id of collectRecordIds(result, decodeStega)) data.ids.add(id);
  byRequest.set(request, data);
}

export const pageData = (request: Request) => byRequest.get(request) ?? { reports: [], ids: new Set<string>() };
```

```astro
---
// in the component that renders the bar
import { fetchProjectInfo, serializeDevBarData } from "@spleenteo/datocms-dev-bar/server";
import { pageData } from "~/lib/devBar";

const isDev = import.meta.env.DEV;
const { reports, ids } = pageData(Astro.request);
const token = import.meta.env.DATOCMS_DEVTOOLS_TOKEN;
const project =
  isDev && token
    ? await fetchProjectInfo({
        token,
        environment: reports.find((r) => r.environment)?.environment,
        recordIds: [...ids],
        projectUrl: "https://your-project.admin.datocms.com",
      })
    : null;
---
{isDev && (
  <>
    <script is:inline type="application/json" data-datocms-dev-bar set:html={serializeDevBarData({ queries: reports, project })} />
    <datocms-dev-bar project-url="https://your-project.admin.datocms.com" />
  </>
)}
```

#### Next.js (App Router)

```tsx
// app/page.tsx
import { cookies } from "next/headers";
import { readDevPreview } from "@spleenteo/datocms-dev-bar/server";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const preview = readDevPreview(
    { cookie: (await cookies()).toString(), searchParams: await searchParams },
    { isDev: process.env.NODE_ENV === "development" },
  );
  // ...
}
```

```tsx
// app/dev-bar.tsx
"use client";
import { useEffect } from "react";

export function DevBar() {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") import("@spleenteo/datocms-dev-bar");
  }, []);
  return process.env.NODE_ENV === "development" ? <datocms-dev-bar project-url="https://your-project.admin.datocms.com" /> : null;
}
```

Layouts do not receive `searchParams`: there only the cookie counts.

The App Router sends the page while its queries still run, so for the X-Ray panel use `data-url`: see [Loading the data after the page](#loading-the-data-after-the-page).

TypeScript does not know the custom tag in JSX. Declare it once, for example in `app/dev-bar.d.ts`:

```ts
import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "datocms-dev-bar": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        "project-url"?: string;
        environment?: string;
        "environment-primary"?: string;
        position?: "bottom-left" | "bottom-right";
        reload?: "true" | "false";
        "allow-hosts"?: string;
        shortcuts?: "on" | "off";
        "data-url"?: string;
      };
    }
  }
}
```

#### Nuxt

```ts
const preview = readDevPreview(toWebRequest(event), { isDev: import.meta.dev });
```

#### SvelteKit

```ts
import { dev } from "$app/environment";
const preview = readDevPreview(event.request, { isDev: dev });
```

#### By hand

Read `datocms` / `datocms-visual` from the query string first, then the `datocms-mode` / `datocms-visual` cookies, then the defaults (`draft`, `on`). Send `X-Include-Drafts: true` in draft, and `X-Visual-Editing: v1` plus `X-Base-Editing-Url` when visual editing is on in draft. Only in development.

## Develop

```bash
npm install
npm run dev        # playground on http://localhost:5173
npm test           # unit tests, the preload included
npm run test:e2e   # browser tests
```

Copy `.env.example` to `.env` and add a CDA token to see real data in the playground. The playground also carries sample query reports and project data, so every tab of the X-Ray panel has something to show. To try the preload on a real site, point `NODE_OPTIONS` at `dist/register.js` of a checkout (`npm run build` first), or `npm link` the package.

## Licence

MIT
