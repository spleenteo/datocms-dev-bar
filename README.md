# @spleenteo/datocms-dev-bar

A dev bar for DatoCMS sites, for local development only. One click (or `Alt+Shift+D`) switches the page between draft and published content; another (`Alt+Shift+V`) turns visual editing on and off. Works with any framework, has no dependencies, and does nothing outside localhost.

## How it works

The bar never talks to DatoCMS. It writes two cookies and reloads the page. Your server reads them when it queries the Content Delivery API:

| Cookie | Values | Default | Query effect |
|---|---|---|---|
| `datocms-mode` | `draft` \| `published` | `draft` | `draft` → `X-Include-Drafts: true` |
| `datocms-visual` | `on` \| `off` | `on` | `on` in draft → `X-Visual-Editing: v1` + `X-Base-Editing-Url` |

URL parameters do the same for one page and win over cookies: `?datocms=published`, `?datocms-visual=off`. Handy when an AI agent drives your browser: it can open `http://localhost:4321/about?datocms=published` and see the published page right away.

Visual editing only applies to drafts. Turning it off removes the Content Link metadata from the response, so the overlays disappear without client code.

**If your site does not read the cookies, the switches change nothing.** Wire the server side first.

## Install

```bash
npm install @spleenteo/datocms-dev-bar
```

## 1. Server side

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

## 2. The bar

Load it in development only:

```html
<datocms-dev-bar project-url="https://your-project.admin.datocms.com"></datocms-dev-bar>
<script type="module">
  if (location.hostname === "localhost") import("https://cdn.jsdelivr.net/npm/@spleenteo/datocms-dev-bar");
</script>
```

| Attribute | Default | Meaning |
|---|---|---|
| `project-url` | none | DatoCMS admin URL; without it the project link is hidden |
| `environment` | none | links to `<project-url>/environments/<environment>` |
| `position` | `bottom-left` | or `bottom-right` |
| `reload` | `true` | `false`: write the cookies, emit the event, do not reload |
| `allow-hosts` | none | extra development hosts, space separated |
| `shortcuts` | `on` | `off` disables `Alt+Shift+D` / `V` / `B` |

CSS: `datocms-dev-bar { --dev-bar-accent: #FF593D; --dev-bar-bottom: 12px; }`

The bar shows only on `localhost`, `127.0.0.1`, `[::1]` and hosts ending in `.local`, `.localhost` or `.test`.

Event: `datocms-dev-bar:change`, cancelable, `detail: { mode, visualEditing }`. Cancel it to refresh your own way (for example `router.refresh()` in Next.js).

## Recipes

### Astro

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

### Next.js (App Router)

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

### Nuxt

```ts
const preview = readDevPreview(toWebRequest(event), { isDev: import.meta.dev });
```

### SvelteKit

```ts
import { dev } from "$app/environment";
const preview = readDevPreview(event.request, { isDev: dev });
```

### By hand

Read `datocms` / `datocms-visual` from the query string first, then the `datocms-mode` / `datocms-visual` cookies, then the defaults (`draft`, `on`). Send `X-Include-Drafts: true` in draft, and `X-Visual-Editing: v1` plus `X-Base-Editing-Url` when visual editing is on in draft. Only in development.

## Develop

```bash
npm install
npm run dev        # playground on http://localhost:5173
npm test           # unit tests
npm run test:e2e   # browser tests
```

Copy `.env.example` to `.env` and add a CDA token to see real data in the playground.

## Licence

MIT
