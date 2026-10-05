# datocms-dev-bar: design

Date: 2026-10-02
Status: approved on 2026-10-02.
Package: `@spleenteo/datocms-dev-bar`.

> **Later changes.** The X-ray direction in section 7 shipped as the **Advanced panel** (tabs General, Records, Queries, Help), with an optional read-only Content Management API token on the server. The size target moved from 6 KB to 16 KB to make room for it. The README describes the current behaviour; this document records the original design.

## Goal

A tool for people who build DatoCMS sites locally, often with Claude running and a browser on localhost. It does two things:

1. switch between draft and published content in one click, because they change what the page shows and both are needed;
2. turn visual editing (Content Link) on and off, because the orange outlines help while editing content and get in the way while developing.

Plus a link to the DatoCMS project, which opens in a new window.

It succeeds if adding it to a new project takes a few minutes and a handful of lines, in any framework.

### Constraints

- Local development only. In production it does nothing, even if it ends up in the bundle.
- Framework independent: Astro, Next.js, Nuxt, SvelteKit, plain HTML.
- No dependencies: no Tailwind, no UI libraries, no external runtimes.
- Born from the draft bar of gestart-astro (`src/components/DraftModeBanner`), from which it inherits shape and behaviour.

### Out of this version

- Production and editors: signed cookies, Web Previews tokens, DatoCMS sessions.
- X-ray (see section 7).
- Browser extension (see section 7).
- Switching DatoCMS environment: it stays project configuration.

## Architecture in short

Three pieces, each usable on its own:

| Piece | Where it runs | What it does |
|---|---|---|
| Contract | documentation | names and values of cookies and URL parameters |
| `<datocms-dev-bar>` | browser | the interface: writes the cookies and reloads |
| `@spleenteo/datocms-dev-bar/server` | the site's server | reads cookies and parameters, returns the options for the CDA |

The widget calls no endpoint and knows no token. The site does not know the widget: it only reads two cookies. Whoever does not want our helper implements the contract by hand.

## 1. The contract (approved)

### Cookies

Written by the widget with `path=/`, `SameSite=Lax`, no expiry (session cookies).

| Cookie | Values | Default when missing or invalid | Effect on the query |
|---|---|---|---|
| `datocms-mode` | `draft` \| `published` | `draft` | `draft` → `includeDrafts: true` |
| `datocms-visual` | `on` \| `off` | `on` | `on` and mode `draft` → `contentLink: "v1"` and `baseEditingUrl` |

- Visual editing only applies to drafts. On published content the switch is disabled.
- Turning visual editing off needs nothing on the client: without metadata in the response, the overlay script has nothing to highlight.

### URL parameters

`?datocms=draft|published` and `?datocms-visual=on|off`.

- The server reads them first, before the cookies, so the first response is already the right one. This is part of the contract: whoever implements it by hand reads the parameters too.
- On load, the widget copies them into the cookies and removes them from the URL with `history.replaceState`, without reloading. The following pages read the cookie.
- The widget cannot know what the server showed, so it does not try to correct it. A site that ignores the parameters shows the wrong version only on that first page.

Typical use with Claude: open `http://localhost:4321/about?datocms=published` to see the published page.

### Mapping to the CDA

| State | `@datocms/cda-client` | raw HTTP headers |
|---|---|---|
| draft | `includeDrafts: true` | `X-Include-Drafts: true` |
| draft + visual on | `contentLink: "v1"`, `baseEditingUrl` | `X-Visual-Editing: v1`, `X-Base-Editing-Url: <url>` |
| published | no option | no header |

With `X-Include-Drafts` one token is enough, as long as it can read drafts.

### Security

- The helper always returns "published, without Content Link" unless it receives `isDev: true`. A hand-written cookie on a production site does not open drafts.
- The widget does not show if `location.hostname` is not `localhost`, `127.0.0.1`, `[::1]` or a host ending in `.local`, `.localhost` or `.test`, except hosts added with the `allow-hosts` attribute.

## 2. The `<datocms-dev-bar>` web component

### Use

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@spleenteo/datocms-dev-bar"></script>
<datocms-dev-bar project-url="https://my-project.admin.datocms.com"></datocms-dev-bar>
```

Or from npm: `import "@spleenteo/datocms-dev-bar"` registers the element.

### Attributes

| Attribute | Default | Meaning |
|---|---|---|
| `project-url` | none | DatoCMS admin URL. Without it the project link does not show |
| `environment` | none | when present, the link points to `<project-url>/environments/<environment>` |
| `position` | `bottom-left` | `bottom-left` \| `bottom-right`: the side the tab sits on |
| `reload` | `true` | `false` for sites that handle the change themselves (see Events) |
| `allow-hosts` | none | extra hosts, space separated, where the widget shows |
| `shortcuts` | `on` | `off` turns the keyboard shortcuts off |

Colour and vertical position are set with CSS properties on the element: `--dev-bar-accent` (default `#FF593D`), `--dev-bar-bottom` (default `12px`).

### Shape

Inherited from gestart-astro:

- **Tab**: a 24×48 px half-moon attached to the screen edge, in the accent colour, with a 16 px white dot cut in half by the edge: the D of DatoCMS. It stays above the bar (higher z-index) even when open.
- **State readable with the bar closed**: in draft the dot is full, in published it becomes a ring. You can tell what you are looking at without opening anything.
- **Bar**: black, rounded, slides out from the edge when the tab is clicked and back in on the second click. It contains, in order:
  1. `Viewing` with the `draft` | `published` switch;
  2. `Visual editing` with the `on` | `off` switch, disabled in published;
  3. `DatoCMS ↗`, when `project-url` is set.
- **Opening**: on click only, with the state in `sessionStorage` (key `datocms-dev-bar:open`), so it stays open after the reload a switch causes.
- On narrow screens the bar wraps, as it does today.
- With `prefers-reduced-motion`, no sliding animation, only a fade.

### Keyboard shortcuts

- `Alt+Shift+D`: switch between draft and published.
- `Alt+Shift+V`: switch visual editing on and off.
- `Alt+Shift+B`: open and close the bar.

Ignored while focus is in a text field.

### Isolation

Shadow DOM with its own `<style>`. The site's CSS does not get in, the widget's does not get out. No external font: `system-ui`.

### Events

Before reloading, the element emits `datocms-dev-bar:change` with `detail: { mode, visualEditing }`. The event is cancelable: with `preventDefault()`, or with `reload="false"`, the widget writes the cookies but does not reload. It serves apps that prefer a soft refresh, for example `router.refresh()` in Next.js.

### Accessibility

- Tab: a `<button>` with `aria-expanded` and `aria-controls`, labelled "DatoCMS dev bar".
- Switches: button groups with `aria-pressed`.
- Project link: `target="_blank" rel="noopener"` and hidden text "(opens in a new window)".

### Size

Target: under 6 KB gzipped.

## 3. The server helper `@spleenteo/datocms-dev-bar/server`

Pure functions, with no dependencies, that work in Node, Workers, Deno and Bun.

```ts
import { readDevPreview } from "@spleenteo/datocms-dev-bar/server";

const preview = readDevPreview(request, { isDev: import.meta.env.DEV });
// { mode: "draft" | "published", visualEditing: boolean }

const options = preview.cdaOptions({ baseEditingUrl: "https://my-project.admin.datocms.com" });
// for @datocms/cda-client: { includeDrafts, contentLink?, baseEditingUrl? }

const headers = preview.headers({ baseEditingUrl: "https://my-project.admin.datocms.com" });
// for raw fetch: { "X-Include-Drafts": "true", "X-Visual-Editing": "v1", ... }
```

- **Input**: a `Request`, or an object `{ cookie?: string | null; url?: string | URL; searchParams?: URLSearchParams | Record<string, string | string[] | undefined> }` for frameworks that give cookies and URL separately (Next.js App Router).
- **Reading order**: URL parameter, then cookie, then default.
- **Outside development** (`isDev` missing or `false`): `{ mode: "published", visualEditing: false }`, always.
- **Never throws**: unknown values become defaults.

### Recipes in the documentation

One page per framework, with the minimal snippet:

- **Astro**: `readDevPreview(Astro.request, { isDev: import.meta.env.DEV })` where the query runs; widget in the layout inside `{import.meta.env.DEV && ...}`.
- **Next.js App Router**: `readDevPreview({ cookie: (await headers()).get("cookie"), searchParams: await searchParams }, { isDev: process.env.NODE_ENV === "development" })` in the page, which receives `searchParams` as a prop. Layouts do not receive them: there only the cookie counts. Widget in a Client Component loaded in development only.
- **Nuxt**: `readDevPreview(toWebRequest(event), { isDev: import.meta.dev })`.
- **SvelteKit**: `readDevPreview(event.request, { isDev: dev })`.
- **Contract by hand**: table of cookies and headers, for any other stack.

Common note: draft responses must not be cached. The documentation says so; the helper does not touch the framework's cache.

## 4. Distribution

- One npm package, `@spleenteo/datocms-dev-bar`, with two entry points:
  - `@spleenteo/datocms-dev-bar` registers the element (side effect, `customElements.define` guarded against double registration);
  - `@spleenteo/datocms-dev-bar/server` exports the helper.
- An IIFE file for the CDN (jsDelivr, unpkg), for use with a `<script>` in plain HTML.
- TypeScript sources, built with esbuild, `.d.ts` types included. No runtime dependencies.
- The recipes recommend loading the widget in development only (conditional or dynamic import), so it does not end up in the production bundle. The host check stays as a second belt.
- MIT licence, public repository.

### First project using it

gestart-astro: in development, the bar in `src/components/DraftModeBanner` gives way to the package. In production the current bar stays, with the signed cookie, which is out of scope.

## 5. Edge cases and errors

| Case | Behaviour |
|---|---|
| Host not allowed | the element draws nothing; a single `console.info` explains why |
| Cookies blocked | the bar shows "cookies blocked": the switches would not work |
| Two elements on the page | the second one does not draw |
| Unknown cookie value | treated as the default |
| `sessionStorage` unavailable | the bar starts closed on every page, the rest works |
| Site that ignores the contract | the switches change the cookies but the page stays the same. The documentation explains this at the top |

## 6. Verification

### Where you see the bar while developing it

Three levels, from quickest to most realistic:

1. **Playground in the repo**: `npm run dev` starts a small Node server on `http://localhost:5173` that rebuilds the widget on every save (esbuild in watch mode) and serves a test page. The page is rendered on the server with the real helper, and states plainly what it decided: "server: draft, visual editing on". The content is fake, with texts carrying simulated Content Link metadata, so the overlays can be seen turning on and off. No DatoCMS project needed.
2. **Playground with real data**: with a CDA token in `.env`, the same page queries a real DatoCMS project instead of the fake data.
3. **In a real site**: the package is linked to gestart-astro with a local dependency (`"@spleenteo/datocms-dev-bar": "file:../datocms-dev-bar"`) and shows on `localhost:4321`, in place of the current bar.

### Tests

- **Helper**: unit tests with Vitest. They are pure functions, so tests are cheap: reading order, defaults, `isDev` false, unknown values, the three input formats.
- **Web component**: Playwright tests on a static HTML page served locally: opening and closing, cookie writing, URL parameters removed from the URL, shortcuts, host check.
- **Examples**: an `examples/` folder with plain HTML and Astro, also used as a manual check before every release. The playground in point 1 is the HTML example.

## 7. Future directions (not in v1)

v1 must not close these roads.

- **X-ray**: with visual editing on, every text carries a hidden link to the DatoCMS editor (model ID, record ID, field path). A panel of the widget can read it and highlight records and blocks. Showing the *names* of models and blocks needs a token with schema access, or `_modelApiKey` in the queries. The v1 bar leaves room for a third group, without being rewritten.
- **Browser extension**: the same web component injected on any localhost, for people who have the helper in the project and do not want to add the script. For X-ray the extension has an advantage: it reads the metadata without going through the server.
- **Production for editors**: signed cookie and Web Previews token, as in gestart-astro. It needs server code for each framework and has to be designed separately.

## Decisions

- Tab colour: `#FF593D`.
- npm package with a personal scope: `@spleenteo/datocms-dev-bar`.
- `Alt+Shift+D/V/B` shortcuts on by default, can be turned off with `shortcuts="off"`.
