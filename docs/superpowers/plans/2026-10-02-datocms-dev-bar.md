# datocms-dev-bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and ship `@spleenteo/datocms-dev-bar`: a dependency-free web component plus a server helper that let developers switch a local DatoCMS site between draft and published content and turn visual editing on and off, then adopt it in gestart-astro.

**Architecture:** A shared contract module defines cookie and URL parameter names and how to resolve them. The browser entry registers `<datocms-dev-bar>` (Shadow DOM, own CSS) which writes the cookies and reloads. The server entry reads the same cookies and parameters and returns options for `@datocms/cda-client` or raw CDA headers. A Node playground on `localhost:5173` renders a page with the real helper so the bar can be seen and tested end to end.

**Tech Stack:** TypeScript, esbuild (bundling), tsc (declarations), Vitest (unit), Playwright (end to end), Node ≥ 20 built-ins for the playground.

**Spec:** `docs/superpowers/specs/2026-10-02-datocms-dev-bar-design.md`

## Global Constraints

- Package name `@spleenteo/datocms-dev-bar`, licence MIT, `publishConfig.access` `public`.
- Zero runtime dependencies: `package.json` has no `dependencies` field.
- Two entry points: `@spleenteo/datocms-dev-bar` (registers the element) and `@spleenteo/datocms-dev-bar/server` (helper). Plus `dist/datocms-dev-bar.iife.js` for `<script>` use.
- Cookies: `datocms-mode` = `draft` | `published` (default `draft`), `datocms-visual` = `on` | `off` (default `on`). Written with `path=/; SameSite=Lax`, no expiry.
- URL parameters: `datocms` = `draft` | `published`, `datocms-visual` = `on` | `off`. Server reads parameters before cookies.
- Visual editing only applies in draft. In published the effective value is always off.
- CDA mapping: draft → `includeDrafts: true` / `X-Include-Drafts: true`; draft + visual → `contentLink: "v1"`, `baseEditingUrl` / `X-Visual-Editing: v1`, `X-Base-Editing-Url`.
- Helper returns `{ mode: "published", visualEditing: false }` unless `isDev === true`.
- Element renders only on `localhost`, `127.0.0.1`, `[::1]`, hosts ending in `.local`, `.localhost`, `.test`, or hosts listed in `allow-hosts`.
- Tag `datocms-dev-bar`; event `datocms-dev-bar:change` (cancelable, `detail: { mode, visualEditing }` with the effective visual value); sessionStorage key `datocms-dev-bar:open`.
- Attributes: `project-url`, `environment`, `position` (`bottom-left` default | `bottom-right`), `reload` (`false` disables reload), `allow-hosts`, `shortcuts` (`off` disables).
- CSS custom properties: `--dev-bar-accent` default `#FF593D`, `--dev-bar-bottom` default `12px`.
- Shortcuts on by default: `Alt+Shift+D` mode, `Alt+Shift+V` visual, `Alt+Shift+B` open/close; ignored in editable fields.
- `dist/index.js` gzipped under 6 KB (6144 bytes).
- Code comments and README in English (public package).

## Review Focus

1. A `Cookie` header with duplicate names, extra whitespace or percent-encoded values: the first occurrence wins and nothing throws. Pinned in Task 2.
2. Repeated query parameters (`?datocms=published&datocms=draft`) and array values from Next.js `searchParams`: the first value wins. Pinned in Task 2.
3. A relative URL string passed in the object input (`/page?datocms=published`): it is parsed against a dummy base instead of being dropped. Pinned in Task 2.
4. Importing the browser entry during server rendering, where `HTMLElement` and `customElements` do not exist: the import does not throw and defines nothing. Pinned in Task 4.
5. A `project-url` with a trailing slash, or an environment name with spaces: the link has no double slash and the name is encoded. Pinned in Task 3.

---

## File Structure

```
package.json, tsconfig.json, tsconfig.build.json, vitest.config.ts, playwright.config.ts
build.mjs                     esbuild configs; builds when run, exports configs for the playground
LICENSE, README.md, .gitignore, .env.example
src/contract.ts               names, types, parse/resolve, parseCookies (shared by both sides)
src/server.ts                 readDevPreview + cdaOptions/headers
src/index.ts                  browser entry: defines <datocms-dev-bar>, re-exports contract
src/element/DevBar.ts         the custom element class
src/element/styles.ts         CSS string for the shadow root
src/element/template.ts       HTML string for the shadow root
src/element/hosts.ts          isAllowedHost
src/element/links.ts          projectHref
src/element/params.ts         takeUrlParams
src/element/shortcuts.ts      shortcutFor, isEditableTarget
src/element/cookies.ts        writeCookie, cookiesWork
test/*.test.ts                Vitest unit tests; test/fakeJar.ts helper
test/e2e/devbar.spec.ts       Playwright tests against the playground
playground/server.mjs         dev server on :5173 with esbuild watch
playground/page.mjs           page renderer (fake content, optional real CDA data)
scripts/size.mjs              gzip size budget
examples/astro/               minimal Astro project using the package
```

---

### Task 1: Project setup and contract module

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts`, `.gitignore`, `LICENSE`
- Create: `src/contract.ts`
- Test: `test/contract.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (from `src/contract.ts`):
  - `MODE_COOKIE = "datocms-mode"`, `VISUAL_COOKIE = "datocms-visual"`, `MODE_PARAM = "datocms"`, `VISUAL_PARAM = "datocms-visual"`
  - `type Mode = "draft" | "published"`
  - `type DevPreviewState = { mode: Mode; visualEditing: boolean }`
  - `DEFAULT_STATE: DevPreviewState` = `{ mode: "draft", visualEditing: true }`
  - `parseMode(value: string | null | undefined): Mode | undefined`
  - `parseVisual(value: string | null | undefined): boolean | undefined`
  - `serializeVisual(on: boolean): "on" | "off"`
  - `type RawSource = { mode?: string | null; visual?: string | null }`
  - `resolveState(sources: RawSource[]): DevPreviewState`
  - `parseCookies(header: string | null | undefined): Map<string, string>`

- [ ] **Step 1: Create the project files**

`package.json`:

```json
{
  "name": "@spleenteo/datocms-dev-bar",
  "version": "0.1.0",
  "description": "A local-only dev bar for DatoCMS sites: switch draft/published content and visual editing in one click, in any framework.",
  "type": "module",
  "license": "MIT",
  "author": "Matteo Papadopoulos",
  "keywords": ["datocms", "draft-mode", "preview", "visual-editing", "web-component"],
  "files": ["dist"],
  "exports": {
    ".": { "types": "./dist/types/index.d.ts", "default": "./dist/index.js" },
    "./server": { "types": "./dist/types/server.d.ts", "default": "./dist/server.js" }
  },
  "jsdelivr": "dist/index.js",
  "unpkg": "dist/index.js",
  "sideEffects": ["./dist/index.js", "./dist/datocms-dev-bar.iife.js"],
  "engines": { "node": ">=20" },
  "publishConfig": { "access": "public" },
  "scripts": {
    "build": "node build.mjs && tsc -p tsconfig.build.json",
    "dev": "node playground/server.mjs",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "typecheck": "tsc --noEmit",
    "size": "node scripts/size.mjs"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "types": ["node"]
  },
  "include": ["src", "test", "playwright.config.ts", "vitest.config.ts"]
}
```

`tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "declaration": true,
    "emitDeclarationOnly": true,
    "outDir": "dist/types",
    "rootDir": "src",
    "types": []
  },
  "include": ["src"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
```

`.gitignore`:

```
node_modules
dist
.env
test-results
playwright-report
```

`LICENSE`: the standard MIT licence text with `Copyright (c) 2026 Matteo Papadopoulos`.

- [ ] **Step 2: Install dev dependencies**

Run: `npm install -D typescript esbuild vitest @types/node`
Expected: `package.json` gains a `devDependencies` block, no `dependencies` block.

- [ ] **Step 3: Write the failing test**

`test/contract.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_STATE, parseCookies, parseMode, parseVisual, resolveState, serializeVisual } from "../src/contract";

describe("parseMode", () => {
  it("accepts draft and published", () => {
    expect(parseMode("draft")).toBe("draft");
    expect(parseMode("published")).toBe("published");
  });
  it("rejects anything else", () => {
    expect(parseMode("Draft")).toBeUndefined();
    expect(parseMode("")).toBeUndefined();
    expect(parseMode(null)).toBeUndefined();
    expect(parseMode(undefined)).toBeUndefined();
  });
});

describe("parseVisual / serializeVisual", () => {
  it("maps on/off to booleans and back", () => {
    expect(parseVisual("on")).toBe(true);
    expect(parseVisual("off")).toBe(false);
    expect(parseVisual("yes")).toBeUndefined();
    expect(serializeVisual(true)).toBe("on");
    expect(serializeVisual(false)).toBe("off");
  });
});

describe("resolveState", () => {
  it("returns the defaults with no sources", () => {
    expect(resolveState([])).toEqual(DEFAULT_STATE);
    expect(DEFAULT_STATE).toEqual({ mode: "draft", visualEditing: true });
  });
  it("lets the first valid source win, field by field", () => {
    expect(resolveState([{ mode: "published" }, { mode: "draft", visual: "off" }])).toEqual({
      mode: "published",
      visualEditing: false,
    });
  });
  it("skips invalid values", () => {
    expect(resolveState([{ mode: "nope", visual: "maybe" }, { mode: "published" }])).toEqual({
      mode: "published",
      visualEditing: true,
    });
  });
});

describe("parseCookies", () => {
  it("reads names and decoded values", () => {
    const cookies = parseCookies("a=1; datocms-mode=published; b=hello%20world");
    expect(cookies.get("datocms-mode")).toBe("published");
    expect(cookies.get("b")).toBe("hello world");
  });
  it("keeps the first occurrence of a duplicate name and tolerates whitespace", () => {
    const cookies = parseCookies("  datocms-mode = published ;datocms-mode=draft");
    expect(cookies.get("datocms-mode")).toBe("published");
  });
  it("never throws on garbage", () => {
    expect(parseCookies("=;;;bad%E0%A4%A=1").get("bad%E0%A4%A")).toBe("1");
    expect(parseCookies(null).size).toBe(0);
    expect(parseCookies("x=%E0%A4%A").get("x")).toBe("%E0%A4%A");
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run test/contract.test.ts`
Expected: FAIL, cannot resolve `../src/contract`.

- [ ] **Step 5: Write the implementation**

`src/contract.ts`:

```ts
/**
 * The contract between the bar and the site: cookie and URL parameter names,
 * their values, and how to resolve them. Sites that do not use the server
 * helper can implement this by hand.
 */
export const MODE_COOKIE = "datocms-mode";
export const VISUAL_COOKIE = "datocms-visual";
export const MODE_PARAM = "datocms";
export const VISUAL_PARAM = "datocms-visual";

export type Mode = "draft" | "published";

/** `visualEditing` is the preference; in published mode Content Link stays off regardless. */
export type DevPreviewState = { mode: Mode; visualEditing: boolean };

export const DEFAULT_STATE: DevPreviewState = { mode: "draft", visualEditing: true };

export function parseMode(value: string | null | undefined): Mode | undefined {
  return value === "draft" || value === "published" ? value : undefined;
}

export function parseVisual(value: string | null | undefined): boolean | undefined {
  if (value === "on") return true;
  if (value === "off") return false;
  return undefined;
}

export function serializeVisual(on: boolean): "on" | "off" {
  return on ? "on" : "off";
}

export type RawSource = { mode?: string | null; visual?: string | null };

/** For each field the first source with a valid value wins; otherwise the default. */
export function resolveState(sources: RawSource[]): DevPreviewState {
  let mode: Mode | undefined;
  let visual: boolean | undefined;
  for (const source of sources) {
    mode ??= parseMode(source.mode);
    visual ??= parseVisual(source.visual);
  }
  return { mode: mode ?? DEFAULT_STATE.mode, visualEditing: visual ?? DEFAULT_STATE.visualEditing };
}

/** Parses a Cookie header. The first occurrence of a name wins; malformed encodings are kept raw. */
export function parseCookies(header: string | null | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of (header ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const name = part.slice(0, separator).trim();
    if (!name || cookies.has(name)) continue;
    cookies.set(name, safeDecode(part.slice(separator + 1).trim()));
  }
  return cookies;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `npx vitest run test/contract.test.ts && npx tsc --noEmit`
Expected: all tests PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.build.json vitest.config.ts .gitignore LICENSE src/contract.ts test/contract.test.ts
git commit -m "feat: project setup and the cookie/parameter contract"
```

---

### Task 2: Server helper

**Files:**
- Create: `src/server.ts`
- Test: `test/server.test.ts`

**Interfaces:**
- Consumes: `MODE_COOKIE`, `VISUAL_COOKIE`, `MODE_PARAM`, `VISUAL_PARAM`, `DEFAULT_STATE`, `resolveState`, `parseCookies`, `DevPreviewState` from `src/contract.ts`.
- Produces (from `src/server.ts`):
  - `type SearchParamsLike = URLSearchParams | Record<string, string | string[] | undefined>`
  - `type DevPreviewInput = Request | { cookie?: string | null; url?: string | URL; searchParams?: SearchParamsLike }`
  - `type DevPreviewOptions = { isDev?: boolean }`
  - `type EditingOptions = { baseEditingUrl: string }`
  - `type CdaOptions = { includeDrafts: boolean; contentLink?: "v1"; baseEditingUrl?: string }`
  - `type DevPreview = DevPreviewState & { cdaOptions(o: EditingOptions): CdaOptions; headers(o: EditingOptions): Record<string, string> }`
  - `readDevPreview(input: DevPreviewInput, options?: DevPreviewOptions): DevPreview` — `visualEditing` is the effective value (false in published).
  - Re-exports the contract types and constants.

- [ ] **Step 1: Write the failing test**

`test/server.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readDevPreview } from "../src/server";

const BASE = "https://demo.admin.datocms.com";
const req = (url: string, cookie?: string) =>
  new Request(`http://localhost:4321${url}`, { headers: cookie ? { cookie } : {} });
const state = (p: { mode: string; visualEditing: boolean }) => ({ mode: p.mode, visualEditing: p.visualEditing });

describe("readDevPreview outside development", () => {
  it("is always published without Content Link", () => {
    expect(state(readDevPreview(req("/?datocms=draft", "datocms-mode=draft")))).toEqual({ mode: "published", visualEditing: false });
    expect(state(readDevPreview(req("/", "datocms-mode=draft"), { isDev: false }))).toEqual({ mode: "published", visualEditing: false });
  });
});

describe("readDevPreview in development", () => {
  const dev = { isDev: true };

  it("defaults to draft with visual editing on", () => {
    expect(state(readDevPreview(req("/"), dev))).toEqual({ mode: "draft", visualEditing: true });
  });

  it("reads the cookies", () => {
    expect(state(readDevPreview(req("/", "datocms-mode=published"), dev))).toEqual({ mode: "published", visualEditing: false });
    expect(state(readDevPreview(req("/", "datocms-mode=draft; datocms-visual=off"), dev))).toEqual({ mode: "draft", visualEditing: false });
  });

  it("reports visual editing off in published even if the cookie says on", () => {
    expect(state(readDevPreview(req("/", "datocms-mode=published; datocms-visual=on"), dev)).visualEditing).toBe(false);
  });

  it("lets URL parameters win over cookies", () => {
    const p = readDevPreview(req("/page?datocms=published", "datocms-mode=draft"), dev);
    expect(p.mode).toBe("published");
    const v = readDevPreview(req("/page?datocms-visual=off", "datocms-visual=on"), dev);
    expect(v.visualEditing).toBe(false);
  });

  it("uses the first value of a repeated parameter", () => {
    expect(readDevPreview(req("/?datocms=published&datocms=draft"), dev).mode).toBe("published");
  });

  it("accepts the object form with a relative URL", () => {
    expect(readDevPreview({ cookie: "datocms-mode=draft", url: "/page?datocms=published" }, dev).mode).toBe("published");
  });

  it("accepts Next.js-style searchParams, first array value wins, and they beat url", () => {
    expect(readDevPreview({ searchParams: { datocms: ["published", "draft"] } }, dev).mode).toBe("published");
    expect(readDevPreview({ searchParams: new URLSearchParams("datocms=published") }, dev).mode).toBe("published");
    expect(readDevPreview({ url: "/?datocms=draft", searchParams: { datocms: "published" } }, dev).mode).toBe("published");
  });

  it("ignores a malformed URL and falls back to the cookie", () => {
    expect(readDevPreview({ url: "http://[bad", cookie: "datocms-mode=published" }, dev).mode).toBe("published");
  });

  it("keeps the first duplicate cookie and tolerates whitespace", () => {
    expect(readDevPreview({ cookie: "a=1;  datocms-mode=published ; datocms-mode=draft" }, dev).mode).toBe("published");
  });

  it("treats unknown values and garbage as defaults", () => {
    expect(state(readDevPreview({ cookie: "datocms-mode=DRAFT; datocms-visual=1" }, dev))).toEqual({ mode: "draft", visualEditing: true });
    expect(state(readDevPreview({ cookie: "=;;;" }, dev))).toEqual({ mode: "draft", visualEditing: true });
    expect(state(readDevPreview({}, dev))).toEqual({ mode: "draft", visualEditing: true });
  });
});

describe("cdaOptions and headers", () => {
  const dev = { isDev: true };

  it("draft with visual editing", () => {
    const p = readDevPreview(req("/"), dev);
    expect(p.cdaOptions({ baseEditingUrl: BASE })).toEqual({ includeDrafts: true, contentLink: "v1", baseEditingUrl: BASE });
    expect(p.headers({ baseEditingUrl: BASE })).toEqual({
      "X-Include-Drafts": "true",
      "X-Visual-Editing": "v1",
      "X-Base-Editing-Url": BASE,
    });
  });

  it("draft without visual editing", () => {
    const p = readDevPreview(req("/", "datocms-visual=off"), dev);
    expect(p.cdaOptions({ baseEditingUrl: BASE })).toEqual({ includeDrafts: true });
    expect(p.headers({ baseEditingUrl: BASE })).toEqual({ "X-Include-Drafts": "true" });
  });

  it("published", () => {
    const p = readDevPreview(req("/", "datocms-mode=published"), dev);
    expect(p.cdaOptions({ baseEditingUrl: BASE })).toEqual({ includeDrafts: false });
    expect(p.headers({ baseEditingUrl: BASE })).toEqual({});
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/server.test.ts`
Expected: FAIL, cannot resolve `../src/server`.

- [ ] **Step 3: Write the implementation**

`src/server.ts`:

```ts
import {
  DEFAULT_STATE,
  MODE_COOKIE,
  MODE_PARAM,
  VISUAL_COOKIE,
  VISUAL_PARAM,
  parseCookies,
  resolveState,
  type DevPreviewState,
} from "./contract";

export * from "./contract";

export type SearchParamsLike = URLSearchParams | Record<string, string | string[] | undefined>;
export type DevPreviewInput = Request | { cookie?: string | null; url?: string | URL; searchParams?: SearchParamsLike };
export type DevPreviewOptions = { isDev?: boolean };
export type EditingOptions = { baseEditingUrl: string };
export type CdaOptions = { includeDrafts: boolean; contentLink?: "v1"; baseEditingUrl?: string };
export type DevPreview = DevPreviewState & {
  /** Options for `@datocms/cda-client` (`executeQuery`, `rawExecuteQuery`). */
  cdaOptions(options: EditingOptions): CdaOptions;
  /** Headers for a raw `fetch` to the Content Delivery API. */
  headers(options: EditingOptions): Record<string, string>;
};

type Lookup = (name: string) => string | undefined;

const PUBLISHED: DevPreviewState = { mode: "published", visualEditing: false };
const none: Lookup = () => undefined;

/**
 * Reads the dev bar state for one request. Outside development (`isDev` not true)
 * it always answers "published, no Content Link", whatever the cookies say.
 * URL parameters win over cookies. Never throws.
 */
export function readDevPreview(input: DevPreviewInput, options: DevPreviewOptions = {}): DevPreview {
  return withHelpers(options.isDev === true ? resolveSafely(input) : PUBLISHED);
}

function resolveSafely(input: DevPreviewInput): DevPreviewState {
  try {
    const { cookies, param } = normalize(input);
    const state = resolveState([
      { mode: param(MODE_PARAM), visual: param(VISUAL_PARAM) },
      { mode: cookies.get(MODE_COOKIE), visual: cookies.get(VISUAL_COOKIE) },
    ]);
    return { mode: state.mode, visualEditing: state.mode === "draft" && state.visualEditing };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function isRequest(input: DevPreviewInput): input is Request {
  return typeof (input as Request).headers?.get === "function" && typeof (input as Request).url === "string";
}

function normalize(input: DevPreviewInput): { cookies: Map<string, string>; param: Lookup } {
  if (isRequest(input)) {
    return { cookies: parseCookies(input.headers.get("cookie")), param: fromUrl(input.url) };
  }
  const fromSearch = input.searchParams !== undefined ? fromSearchParams(input.searchParams) : none;
  const fromUrlParam = input.url !== undefined ? fromUrl(input.url) : none;
  return { cookies: parseCookies(input.cookie), param: (name) => fromSearch(name) ?? fromUrlParam(name) };
}

function fromUrl(url: string | URL): Lookup {
  let parsed: URL;
  try {
    parsed = new URL(url, "http://localhost");
  } catch {
    return none;
  }
  return (name) => parsed.searchParams.get(name) ?? undefined;
}

function fromSearchParams(search: SearchParamsLike): Lookup {
  if (search instanceof URLSearchParams) return (name) => search.get(name) ?? undefined;
  return (name) => {
    const value = search[name];
    return Array.isArray(value) ? value[0] : value;
  };
}

function withHelpers(state: DevPreviewState): DevPreview {
  return {
    ...state,
    cdaOptions({ baseEditingUrl }) {
      if (state.mode === "published") return { includeDrafts: false };
      return state.visualEditing ? { includeDrafts: true, contentLink: "v1", baseEditingUrl } : { includeDrafts: true };
    },
    headers({ baseEditingUrl }) {
      if (state.mode === "published") return {};
      const headers: Record<string, string> = { "X-Include-Drafts": "true" };
      if (state.visualEditing) {
        headers["X-Visual-Editing"] = "v1";
        headers["X-Base-Editing-Url"] = baseEditingUrl;
      }
      return headers;
    },
  };
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/server.ts test/server.test.ts
git commit -m "feat: server helper that reads the dev bar state for a request"
```

---

### Task 3: Browser utilities (hosts, links, URL parameters, shortcuts, cookies)

**Files:**
- Create: `src/element/hosts.ts`, `src/element/links.ts`, `src/element/params.ts`, `src/element/shortcuts.ts`, `src/element/cookies.ts`
- Test: `test/fakeJar.ts`, `test/hosts.test.ts`, `test/links.test.ts`, `test/params.test.ts`, `test/shortcuts.test.ts`, `test/cookies.test.ts`

**Interfaces:**
- Consumes: `MODE_PARAM`, `VISUAL_PARAM`, `parseMode`, `parseVisual`, `parseCookies`, `Mode` from `src/contract.ts`.
- Produces:
  - `isAllowedHost(hostname: string, extraHosts?: string[]): boolean` (`hosts.ts`)
  - `projectHref(projectUrl: string | null, environment: string | null): string | null` (`links.ts`)
  - `type UrlOverrides = { mode?: Mode; visualEditing?: boolean }`; `takeUrlParams(href: string): { overrides: UrlOverrides; cleanedHref: string | null }` (`params.ts`) — `cleanedHref` is `null` when neither parameter is present, otherwise path + remaining query + hash.
  - `type ShortcutAction = "toggle-mode" | "toggle-visual" | "toggle-bar"`; `shortcutFor(event: KeyLike, editableTarget: boolean): ShortcutAction | null`; `isEditableTarget(target: EventTarget | null): boolean` (`shortcuts.ts`)
  - `type CookieJar = { cookie: string }`; `writeCookie(jar: CookieJar, name: string, value: string): void`; `cookiesWork(jar: CookieJar): boolean` (`cookies.ts`)

- [ ] **Step 1: Write the failing tests**

`test/fakeJar.ts`:

```ts
/** Minimal stand-in for document.cookie: a setter that stores one cookie, max-age=0 deletes. */
export class FakeJar {
  private store = new Map<string, string>();
  constructor(private readonly writable = true) {}
  get cookie(): string {
    return [...this.store].map(([name, value]) => `${name}=${value}`).join("; ");
  }
  set cookie(value: string) {
    if (!this.writable) return;
    const [pair, ...attributes] = value.split(";");
    const separator = pair.indexOf("=");
    const name = pair.slice(0, separator).trim();
    if (attributes.some((a) => a.trim().toLowerCase() === "max-age=0")) this.store.delete(name);
    else this.store.set(name, pair.slice(separator + 1).trim());
  }
}
```

`test/hosts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isAllowedHost } from "../src/element/hosts";

describe("isAllowedHost", () => {
  it.each(["localhost", "LOCALHOST", "127.0.0.1", "[::1]", "::1", "mysite.local", "app.localhost", "gestart.test"])(
    "allows %s",
    (host) => expect(isAllowedHost(host)).toBe(true),
  );
  it.each(["example.com", "localhost.example.com", "test.com", "mytest", "www.gestart.it"])("refuses %s", (host) =>
    expect(isAllowedHost(host)).toBe(false),
  );
  it("allows extra hosts, ignoring blanks and case", () => {
    expect(isAllowedHost("devbox", ["", " DevBox "])).toBe(true);
    expect(isAllowedHost("other", ["", "devbox"])).toBe(false);
  });
});
```

`test/links.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { projectHref } from "../src/element/links";

describe("projectHref", () => {
  it("returns null without a project url", () => {
    expect(projectHref(null, null)).toBeNull();
    expect(projectHref("   ", "main")).toBeNull();
  });
  it("strips trailing slashes", () => {
    expect(projectHref("https://demo.admin.datocms.com//", null)).toBe("https://demo.admin.datocms.com");
  });
  it("appends an encoded environment", () => {
    expect(projectHref("https://demo.admin.datocms.com/", "my env")).toBe(
      "https://demo.admin.datocms.com/environments/my%20env",
    );
  });
  it("ignores an empty environment", () => {
    expect(projectHref("https://demo.admin.datocms.com", "  ")).toBe("https://demo.admin.datocms.com");
  });
});
```

`test/params.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { takeUrlParams } from "../src/element/params";

describe("takeUrlParams", () => {
  it("returns nothing to do when no parameter is present", () => {
    expect(takeUrlParams("http://localhost:5173/a?x=1")).toEqual({ overrides: {}, cleanedHref: null });
  });
  it("reads both parameters and removes them, keeping the rest", () => {
    expect(takeUrlParams("http://localhost:5173/a?datocms=published&x=1&datocms-visual=off#h")).toEqual({
      overrides: { mode: "published", visualEditing: false },
      cleanedHref: "/a?x=1#h",
    });
  });
  it("removes an invalid parameter without overriding anything", () => {
    expect(takeUrlParams("http://localhost:5173/?datocms=nope")).toEqual({ overrides: {}, cleanedHref: "/" });
  });
});
```

`test/shortcuts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isEditableTarget, shortcutFor } from "../src/element/shortcuts";

const key = (code: string, mods: Partial<{ altKey: boolean; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }> = {}) => ({
  code,
  altKey: true,
  shiftKey: true,
  ctrlKey: false,
  metaKey: false,
  ...mods,
});

describe("shortcutFor", () => {
  it("maps Alt+Shift+D/V/B", () => {
    expect(shortcutFor(key("KeyD"), false)).toBe("toggle-mode");
    expect(shortcutFor(key("KeyV"), false)).toBe("toggle-visual");
    expect(shortcutFor(key("KeyB"), false)).toBe("toggle-bar");
  });
  it("needs exactly Alt+Shift", () => {
    expect(shortcutFor(key("KeyD", { shiftKey: false }), false)).toBeNull();
    expect(shortcutFor(key("KeyD", { altKey: false }), false)).toBeNull();
    expect(shortcutFor(key("KeyD", { ctrlKey: true }), false)).toBeNull();
    expect(shortcutFor(key("KeyD", { metaKey: true }), false)).toBeNull();
  });
  it("ignores other keys and editable targets", () => {
    expect(shortcutFor(key("KeyX"), false)).toBeNull();
    expect(shortcutFor(key("KeyD"), true)).toBeNull();
  });
});

describe("isEditableTarget", () => {
  it("is false for null and for targets without closest()", () => {
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget({} as EventTarget)).toBe(false);
  });
  it("follows closest()", () => {
    expect(isEditableTarget({ closest: () => null } as unknown as EventTarget)).toBe(false);
    expect(isEditableTarget({ closest: () => ({}) } as unknown as EventTarget)).toBe(true);
  });
});
```

`test/cookies.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseCookies } from "../src/contract";
import { cookiesWork, writeCookie } from "../src/element/cookies";
import { FakeJar } from "./fakeJar";

describe("writeCookie", () => {
  it("writes a readable, encoded value", () => {
    const jar = new FakeJar();
    writeCookie(jar, "datocms-mode", "published");
    writeCookie(jar, "x", "a b");
    expect(parseCookies(jar.cookie).get("datocms-mode")).toBe("published");
    expect(parseCookies(jar.cookie).get("x")).toBe("a b");
  });
});

describe("cookiesWork", () => {
  it("is true when cookies stick, and cleans up its probe", () => {
    const jar = new FakeJar();
    expect(cookiesWork(jar)).toBe(true);
    expect(jar.cookie).toBe("");
  });
  it("is false when writes are ignored", () => {
    expect(cookiesWork(new FakeJar(false))).toBe(false);
  });
  it("is false when the setter throws", () => {
    const jar = {
      get cookie() {
        return "";
      },
      set cookie(_value: string) {
        throw new Error("blocked");
      },
    };
    expect(cookiesWork(jar)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/hosts.test.ts test/links.test.ts test/params.test.ts test/shortcuts.test.ts test/cookies.test.ts`
Expected: FAIL, cannot resolve the `src/element/*` modules.

- [ ] **Step 3: Write the implementations**

`src/element/hosts.ts`:

```ts
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const LOCAL_SUFFIXES = [".local", ".localhost", ".test"];

/** The bar only shows on development hosts, so it does nothing if it ever reaches production. */
export function isAllowedHost(hostname: string, extraHosts: string[] = []): boolean {
  const host = hostname.toLowerCase();
  if (LOCAL_HOSTS.has(host) || LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  return extraHosts.map((extra) => extra.trim().toLowerCase()).filter(Boolean).includes(host);
}
```

`src/element/links.ts`:

```ts
/** Link to the DatoCMS project, or to one of its environments. */
export function projectHref(projectUrl: string | null, environment: string | null): string | null {
  const base = projectUrl?.trim().replace(/\/+$/, "");
  if (!base) return null;
  const env = environment?.trim();
  return env ? `${base}/environments/${encodeURIComponent(env)}` : base;
}
```

`src/element/params.ts`:

```ts
import { MODE_PARAM, VISUAL_PARAM, parseMode, parseVisual, type Mode } from "../contract";

export type UrlOverrides = { mode?: Mode; visualEditing?: boolean };

/**
 * Reads ?datocms= and ?datocms-visual= from a URL. When either is present it also
 * returns the URL without them (path + query + hash) for history.replaceState.
 */
export function takeUrlParams(href: string): { overrides: UrlOverrides; cleanedHref: string | null } {
  const url = new URL(href);
  if (!url.searchParams.has(MODE_PARAM) && !url.searchParams.has(VISUAL_PARAM)) {
    return { overrides: {}, cleanedHref: null };
  }
  const overrides: UrlOverrides = {};
  const mode = parseMode(url.searchParams.get(MODE_PARAM));
  if (mode) overrides.mode = mode;
  const visual = parseVisual(url.searchParams.get(VISUAL_PARAM));
  if (visual !== undefined) overrides.visualEditing = visual;
  url.searchParams.delete(MODE_PARAM);
  url.searchParams.delete(VISUAL_PARAM);
  return { overrides, cleanedHref: url.pathname + url.search + url.hash };
}
```

`src/element/shortcuts.ts`:

```ts
export type ShortcutAction = "toggle-mode" | "toggle-visual" | "toggle-bar";

type KeyLike = { altKey: boolean; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; code: string };

// `code` and not `key`: on macOS Alt changes the character (Alt+Shift+D gives "Î").
const ACTIONS: Record<string, ShortcutAction> = { KeyD: "toggle-mode", KeyV: "toggle-visual", KeyB: "toggle-bar" };

export function shortcutFor(event: KeyLike, editableTarget: boolean): ShortcutAction | null {
  if (editableTarget || !event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return null;
  return ACTIONS[event.code] ?? null;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as Element | null;
  if (!element || typeof element.closest !== "function") return false;
  return element.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])") !== null;
}
```

`src/element/cookies.ts`:

```ts
import { parseCookies } from "../contract";

export type CookieJar = { cookie: string };

export function writeCookie(jar: CookieJar, name: string, value: string): void {
  jar.cookie = `${name}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
}

const PROBE = "datocms-dev-bar-probe";

/** Writes and reads back a probe cookie: false when the browser blocks cookies. */
export function cookiesWork(jar: CookieJar): boolean {
  try {
    writeCookie(jar, PROBE, "1");
    const works = parseCookies(jar.cookie).get(PROBE) === "1";
    jar.cookie = `${PROBE}=; path=/; max-age=0`;
    return works;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run all tests and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/element test/fakeJar.ts test/hosts.test.ts test/links.test.ts test/params.test.ts test/shortcuts.test.ts test/cookies.test.ts
git commit -m "feat: browser utilities for hosts, links, URL parameters, shortcuts and cookies"
```

---

### Task 4: The `<datocms-dev-bar>` element and the build

**Files:**
- Create: `src/element/styles.ts`, `src/element/template.ts`, `src/element/DevBar.ts`, `src/index.ts`, `build.mjs`
- Test: `test/ssr-import.test.ts`

**Interfaces:**
- Consumes: everything produced by Tasks 1 and 3.
- Produces:
  - `class DevBar` (custom element), `CHANGE_EVENT = "datocms-dev-bar:change"`, `type ChangeDetail = { mode: Mode; visualEditing: boolean }` (`src/element/DevBar.ts`)
  - `TAG_NAME = "datocms-dev-bar"` and the re-exports above plus the contract (`src/index.ts`)
  - `build.mjs` exports `configs` (esbuild options array) and builds `dist/index.js`, `dist/datocms-dev-bar.iife.js`, `dist/server.js` when run directly; `--watch` keeps rebuilding.

- [ ] **Step 1: Write the failing test**

`test/ssr-import.test.ts`:

```ts
import { expect, it } from "vitest";

it("can be imported where there is no DOM (server rendering)", async () => {
  expect(typeof (globalThis as { HTMLElement?: unknown }).HTMLElement).toBe("undefined");
  const mod = await import("../src/index");
  expect(mod.TAG_NAME).toBe("datocms-dev-bar");
  expect(mod.CHANGE_EVENT).toBe("datocms-dev-bar:change");
  expect(typeof (globalThis as { customElements?: unknown }).customElements).toBe("undefined");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/ssr-import.test.ts`
Expected: FAIL, cannot resolve `../src/index`.

- [ ] **Step 3: Write the styles**

`src/element/styles.ts`:

```ts
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
```

- [ ] **Step 4: Write the template**

`src/element/template.ts`:

```ts
// The bar is a row of groups; future panels (X-ray) add a group here.
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
    <span class="sep project-sep" aria-hidden="true"></span>
    <a class="project" target="_blank" rel="noopener">DatoCMS <span aria-hidden="true">↗</span><span class="sr-only">(opens in a new window)</span></a>
    <span class="warning" role="status" hidden>cookies blocked</span>
  </div>
</div>
`;
```

- [ ] **Step 5: Write the element**

`src/element/DevBar.ts`:

```ts
import {
  DEFAULT_STATE,
  MODE_COOKIE,
  VISUAL_COOKIE,
  parseCookies,
  resolveState,
  serializeVisual,
  type DevPreviewState,
  type Mode,
} from "../contract";
import { cookiesWork, writeCookie } from "./cookies";
import { isAllowedHost } from "./hosts";
import { projectHref } from "./links";
import { takeUrlParams } from "./params";
import { isEditableTarget, shortcutFor } from "./shortcuts";
import { STYLES } from "./styles";
import { TEMPLATE } from "./template";

export const CHANGE_EVENT = "datocms-dev-bar:change";
/** `visualEditing` is the effective value: false in published mode. */
export type ChangeDetail = { mode: Mode; visualEditing: boolean };

const OPEN_KEY = "datocms-dev-bar:open";

// On the server there is no HTMLElement: importing this module must still work.
const Base = (typeof HTMLElement === "undefined" ? class {} : HTMLElement) as unknown as typeof HTMLElement;

let activeInstance: DevBar | null = null;
let refusalLogged = false;

export class DevBar extends Base {
  static observedAttributes = ["project-url", "environment", "position"];

  private state: DevPreviewState = { ...DEFAULT_STATE };
  private open = false;
  private cookiesOk = true;
  private root: ShadowRoot | null = null;
  private readonly onKeydown = (event: KeyboardEvent) => this.handleKeydown(event);

  connectedCallback() {
    // One bar per page: a second element stays empty.
    if (activeInstance && activeInstance !== this) return;
    const extraHosts = (this.getAttribute("allow-hosts") ?? "").split(/\s+/);
    if (!isAllowedHost(location.hostname, extraHosts)) {
      if (!refusalLogged) {
        console.info(
          `[datocms-dev-bar] hidden: "${location.hostname}" is not a local host. Add it with allow-hosts if this is a development machine.`,
        );
        refusalLogged = true;
      }
      return;
    }
    activeInstance = this;
    this.cookiesOk = cookiesWork(document);
    if (this.cookiesOk) this.applyUrlParams();
    this.state = this.readState();
    this.open = readOpen();
    this.render();
    if (this.getAttribute("shortcuts") !== "off") window.addEventListener("keydown", this.onKeydown);
  }

  disconnectedCallback() {
    window.removeEventListener("keydown", this.onKeydown);
    if (activeInstance === this) activeInstance = null;
  }

  attributeChangedCallback() {
    if (this.root) this.update();
  }

  /** ?datocms= and ?datocms-visual= become cookies and leave the address bar. The server already used them. */
  private applyUrlParams() {
    const { overrides, cleanedHref } = takeUrlParams(location.href);
    if (cleanedHref === null) return;
    if (overrides.mode) writeCookie(document, MODE_COOKIE, overrides.mode);
    if (overrides.visualEditing !== undefined) writeCookie(document, VISUAL_COOKIE, serializeVisual(overrides.visualEditing));
    history.replaceState(history.state, "", cleanedHref);
  }

  private readState(): DevPreviewState {
    const cookies = parseCookies(document.cookie);
    return resolveState([{ mode: cookies.get(MODE_COOKIE), visual: cookies.get(VISUAL_COOKIE) }]);
  }

  private render() {
    this.root ??= this.attachShadow({ mode: "open" });
    this.root.innerHTML = `<style>${STYLES}</style>${TEMPLATE}`;
    this.root.querySelector(".tab")!.addEventListener("click", () => this.setOpen(!this.open));
    this.root.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) =>
      button.addEventListener("click", () => this.commit({ ...this.state, mode: button.dataset.mode as Mode })),
    );
    this.root.querySelectorAll<HTMLButtonElement>("[data-visual]").forEach((button) =>
      button.addEventListener("click", () => this.commit({ ...this.state, visualEditing: button.dataset.visual === "on" })),
    );
    this.update();
  }

  private update() {
    const root = this.root!;
    const wrap = root.querySelector<HTMLElement>(".wrap")!;
    wrap.dataset.position = this.getAttribute("position") === "bottom-right" ? "right" : "left";
    wrap.dataset.mode = this.state.mode;
    wrap.toggleAttribute("data-open", this.open);
    root.querySelector(".tab")!.setAttribute("aria-expanded", String(this.open));

    const published = this.state.mode === "published";
    root.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.mode === this.state.mode));
      button.disabled = !this.cookiesOk;
    });
    root.querySelectorAll<HTMLButtonElement>("[data-visual]").forEach((button) => {
      button.setAttribute("aria-pressed", String((button.dataset.visual === "on") === this.state.visualEditing));
      button.disabled = !this.cookiesOk || published;
    });

    const href = projectHref(this.getAttribute("project-url"), this.getAttribute("environment"));
    const link = root.querySelector<HTMLAnchorElement>(".project")!;
    link.hidden = href === null;
    if (href !== null) link.href = href;
    root.querySelector<HTMLElement>(".project-sep")!.hidden = href === null;
    root.querySelector<HTMLElement>(".warning")!.hidden = this.cookiesOk;
  }

  private setOpen(open: boolean) {
    this.open = open;
    writeOpen(open);
    this.update();
  }

  private commit(next: DevPreviewState) {
    if (!this.cookiesOk) return;
    if (next.mode === this.state.mode && next.visualEditing === this.state.visualEditing) return;
    writeCookie(document, MODE_COOKIE, next.mode);
    writeCookie(document, VISUAL_COOKIE, serializeVisual(next.visualEditing));
    this.state = next;
    this.update();
    const detail: ChangeDetail = { mode: next.mode, visualEditing: next.mode === "draft" && next.visualEditing };
    const proceed = this.dispatchEvent(
      new CustomEvent<ChangeDetail>(CHANGE_EVENT, { detail, bubbles: true, composed: true, cancelable: true }),
    );
    if (proceed && this.getAttribute("reload") !== "false") location.reload();
  }

  private handleKeydown(event: KeyboardEvent) {
    const action = shortcutFor(event, isEditableTarget(event.composedPath()[0] ?? event.target));
    if (!action) return;
    event.preventDefault();
    if (action === "toggle-bar") this.setOpen(!this.open);
    else if (action === "toggle-mode") this.commit({ ...this.state, mode: this.state.mode === "draft" ? "published" : "draft" });
    else if (this.state.mode === "draft") this.commit({ ...this.state, visualEditing: !this.state.visualEditing });
  }
}

function readOpen(): boolean {
  try {
    return sessionStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeOpen(open: boolean) {
  try {
    sessionStorage.setItem(OPEN_KEY, open ? "1" : "0");
  } catch {
    // Without sessionStorage the bar starts closed on every page; everything else works.
  }
}
```

- [ ] **Step 6: Write the browser entry**

`src/index.ts`:

```ts
import { DevBar } from "./element/DevBar";

export { CHANGE_EVENT, DevBar, type ChangeDetail } from "./element/DevBar";
export * from "./contract";

export const TAG_NAME = "datocms-dev-bar";

declare global {
  interface HTMLElementTagNameMap {
    "datocms-dev-bar": DevBar;
  }
}

if (typeof customElements !== "undefined" && !customElements.get(TAG_NAME)) {
  customElements.define(TAG_NAME, DevBar);
}
```

- [ ] **Step 7: Run the SSR test and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests PASS (including `ssr-import`), no type errors.

- [ ] **Step 8: Write the build script**

`build.mjs`:

```js
import { build, context } from "esbuild";
import { pathToFileURL } from "node:url";

const shared = { bundle: true, minify: true, sourcemap: true, target: "es2020", logLevel: "info" };

export const configs = [
  { ...shared, entryPoints: ["src/index.ts"], outfile: "dist/index.js", format: "esm", platform: "browser" },
  { ...shared, entryPoints: ["src/index.ts"], outfile: "dist/datocms-dev-bar.iife.js", format: "iife", platform: "browser" },
  { ...shared, entryPoints: ["src/server.ts"], outfile: "dist/server.js", format: "esm", platform: "neutral" },
];

// Builds only when run directly (`node build.mjs`), not when the playground imports `configs`.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("--watch")) {
    for (const config of configs) await (await context(config)).watch();
  } else {
    await Promise.all(configs.map((config) => build(config)));
  }
}
```

- [ ] **Step 9: Build and check the output**

Run: `npm run build && ls dist dist/types`
Expected: `dist/index.js`, `dist/datocms-dev-bar.iife.js`, `dist/server.js` (with `.map` files); `dist/types/index.d.ts`, `dist/types/server.d.ts`.

- [ ] **Step 10: Commit**

```bash
git add src/element/styles.ts src/element/template.ts src/element/DevBar.ts src/index.ts build.mjs test/ssr-import.test.ts
git commit -m "feat: the datocms-dev-bar custom element and the build"
```

---

### Task 5: Playground and end-to-end tests

**Files:**
- Create: `playground/server.mjs`, `playground/page.mjs`, `.env.example`, `playwright.config.ts`
- Test: `test/e2e/devbar.spec.ts`

**Interfaces:**
- Consumes: `configs` from `build.mjs`; `readDevPreview` from `dist/server.js` (built by the playground's watcher); the element from `dist/index.js`.
- Produces: `npm run dev` serving `http://localhost:5173` with pages `/`, `/other`, `/double` (two bars), `/no-reload` (`reload="false"`). Every page shows `#server-state` with the text `server: <mode>, visual editing <on|off>`, fake content spans `.cl` only when visual editing is effective, an `<input id="search">`, and `#events` listing change events.

- [ ] **Step 1: Write the playground page renderer**

`playground/page.mjs`:

```js
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
  const bars = (pathname === "/double" ? 2 : 1);
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
```

- [ ] **Step 2: Write the playground server**

`playground/server.mjs`:

```js
import { context } from "esbuild";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { configs } from "../build.mjs";
import { renderPage } from "./page.mjs";

try {
  process.loadEnvFile();
} catch {
  // No .env: the playground runs on fake content.
}

const PORT = Number(process.env.PORT || 5173);
const TYPES = { ".js": "text/javascript; charset=utf-8", ".map": "application/json; charset=utf-8" };

// Build once before serving, then rebuild on every save.
for (const config of configs) {
  const ctx = await context({ ...config, minify: false });
  await ctx.rebuild();
  await ctx.watch();
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname.startsWith("/dist/")) {
      const body = await readFile(new URL(`..${url.pathname}`, import.meta.url));
      const type = TYPES[url.pathname.slice(url.pathname.lastIndexOf("."))] ?? "application/octet-stream";
      res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
      return res.end(body);
    }
    // Fresh import on every request, so helper changes show up without restarting.
    const { readDevPreview } = await import(new URL(`../dist/server.js?v=${Date.now()}`, import.meta.url).href);
    const preview = readDevPreview({ cookie: req.headers.cookie, url: req.url }, { isDev: true });
    const html = await renderPage(url.pathname, preview);
    if (html === null) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(html);
  } catch (error) {
    console.error(error);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end(String(error));
  }
}).listen(PORT, () => console.log(`playground: http://localhost:${PORT}`));
```

`.env.example`:

```
# Optional: with a token the playground also queries a real DatoCMS project
DATOCMS_CDA_TOKEN=
DATOCMS_BASE_EDITING_URL=https://your-project.admin.datocms.com
DATOCMS_ENVIRONMENT=
PLAYGROUND_QUERY={ _site { globalSeo { siteName } } }
```

- [ ] **Step 3: Check the playground by hand**

Run: `npm run dev` and open `http://localhost:5173`.
Expected: orange D tab on the left edge with a half white dot; `server: draft, visual editing on`; outlined texts. Click the tab: the bar slides out. Click `published`: the page reloads, texts change, outlines disappear, the dot becomes a ring, the bar stays open. Stop the server with Ctrl+C.

- [ ] **Step 4: Install Playwright and write its config**

Run: `npm install -D @playwright/test && npx playwright install chromium`

`playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "test/e2e",
  use: { baseURL: "http://localhost:5173" },
  webServer: { command: "npm run dev", url: "http://localhost:5173", reuseExistingServer: !process.env.CI, timeout: 30_000 },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // devbar.example resolves to the playground: a non-local host for the host guard test.
        launchOptions: { args: ["--host-resolver-rules=MAP devbar.example 127.0.0.1"] },
      },
    },
  ],
});
```

- [ ] **Step 5: Write the end-to-end tests**

`test/e2e/devbar.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";

const tab = (page: Page) => page.locator("datocms-dev-bar").first().locator(".tab");
const bar = (page: Page) => page.locator("datocms-dev-bar").first().locator(".bar");
const control = (page: Page, selector: string) => page.locator("datocms-dev-bar").first().locator(selector);
const serverState = (page: Page) => page.locator("#server-state");
const cookie = async (page: Page, name: string) => (await page.context().cookies()).find((c) => c.name === name)?.value;

test("starts closed in draft and opens and closes on click", async ({ page }) => {
  await page.goto("/");
  await expect(serverState(page)).toHaveText("server: draft, visual editing on");
  await expect(bar(page)).toBeHidden();
  await tab(page).click();
  await expect(bar(page)).toBeVisible();
  await expect(tab(page)).toHaveAttribute("aria-expanded", "true");
  await tab(page).click();
  await expect(bar(page)).toBeHidden();
});

test("switching to published reloads, keeps the bar open and disables visual editing", async ({ page }) => {
  await page.goto("/");
  await tab(page).click();
  await control(page, "[data-mode=published]").click();
  await expect(serverState(page)).toHaveText("server: published, visual editing off");
  await expect(bar(page)).toBeVisible();
  await expect(control(page, "[data-mode=published]")).toHaveAttribute("aria-pressed", "true");
  await expect(control(page, "[data-visual=on]")).toBeDisabled();
  expect(await cookie(page, "datocms-mode")).toBe("published");
});

test("turning visual editing off removes the outlines", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".cl")).toHaveCount(2);
  await tab(page).click();
  await control(page, "[data-visual=off]").click();
  await expect(serverState(page)).toHaveText("server: draft, visual editing off");
  await expect(page.locator(".cl")).toHaveCount(0);
});

test("a URL parameter wins on the first load, then lives on as a cookie", async ({ page }) => {
  await page.goto("/other?datocms=published&keep=1");
  await expect(serverState(page)).toHaveText("server: published, visual editing off");
  await expect(page).toHaveURL(/\/other\?keep=1$/);
  await page.goto("/");
  await expect(serverState(page)).toHaveText("server: published, visual editing off");
});

test("keyboard shortcuts, ignored in text fields", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Alt+Shift+KeyB");
  await expect(bar(page)).toBeVisible();
  await page.keyboard.press("Alt+Shift+KeyD");
  await expect(serverState(page)).toHaveText("server: published, visual editing off");
  await expect(bar(page)).toBeVisible();
  await page.keyboard.press("Alt+Shift+KeyD");
  await expect(serverState(page)).toHaveText("server: draft, visual editing on");
  await page.keyboard.press("Alt+Shift+KeyV");
  await expect(serverState(page)).toHaveText("server: draft, visual editing off");
  await page.locator("#search").focus();
  await page.keyboard.press("Alt+Shift+KeyB");
  await expect(bar(page)).toBeVisible();
});

test("reload=false emits the event and does not reload", async ({ page }) => {
  await page.goto("/no-reload");
  await tab(page).click();
  await control(page, "[data-mode=published]").click();
  await expect(page.locator("#events")).toContainText('{"mode":"published","visualEditing":false}');
  await expect(serverState(page)).toHaveText("server: draft, visual editing on");
  await page.reload();
  await expect(serverState(page)).toHaveText("server: published, visual editing off");
});

test("only the first bar on a page renders", async ({ page }) => {
  await page.goto("/double");
  await expect(page.locator("datocms-dev-bar").nth(0).locator(".tab")).toHaveCount(1);
  await expect(page.locator("datocms-dev-bar").nth(1).locator(".tab")).toHaveCount(0);
});

test("the project link opens DatoCMS in a new window", async ({ page }) => {
  await page.goto("/");
  await tab(page).click();
  const link = control(page, "a.project");
  await expect(link).toHaveAttribute("href", /admin\.datocms\.com/);
  await expect(link).toHaveAttribute("target", "_blank");
});

test("stays hidden on a non-local host", async ({ page }) => {
  await page.goto("http://devbar.example:5173/");
  await expect(serverState(page)).toBeVisible();
  await expect(page.locator("datocms-dev-bar .tab")).toHaveCount(0);
});
```

- [ ] **Step 6: Run the end-to-end tests**

Run: `npm run test:e2e`
Expected: 9 tests PASS. If the shortcut test fails on the first `Alt+Shift+KeyB`, click the page body first (`await page.locator("body").click()`) so the page has keyboard focus, and note it in the commit message.

- [ ] **Step 7: Commit**

```bash
git add playground .env.example playwright.config.ts test/e2e package.json package-lock.json
git commit -m "feat: playground on localhost:5173 and end-to-end tests"
```

---

### Task 6: README, Astro example and size budget

**Files:**
- Create: `README.md`, `scripts/size.mjs`, `examples/astro/package.json`, `examples/astro/astro.config.mjs`, `examples/astro/src/pages/index.astro`

**Interfaces:**
- Consumes: the built package (`dist/`), the public API from Tasks 2 and 4.
- Produces: documentation of the contract and recipes; `npm run size` failing above 6144 bytes gzipped.

- [ ] **Step 1: Write the size check**

`scripts/size.mjs`:

```js
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const LIMIT = 6 * 1024;
const size = gzipSync(readFileSync("dist/index.js")).length;
console.log(`dist/index.js: ${size} bytes gzipped (budget ${LIMIT})`);
if (size > LIMIT) {
  console.error("Over the size budget.");
  process.exit(1);
}
```

- [ ] **Step 2: Run it**

Run: `npm run build && npm run size`
Expected: prints a size under 6144 and exits 0. If it is over, shorten `STYLES` (drop comments, merge rules) before going on.

- [ ] **Step 3: Write the README**

`README.md`:

````markdown
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
````

- [ ] **Step 4: Write the Astro example**

`examples/astro/package.json`:

```json
{
  "name": "datocms-dev-bar-astro-example",
  "private": true,
  "type": "module",
  "scripts": { "dev": "astro dev" },
  "dependencies": {
    "@spleenteo/datocms-dev-bar": "file:../.."
  }
}
```

Then run: `cd examples/astro && npm install astro@latest @astrojs/node@latest`
Expected: `astro` and `@astrojs/node` added to `dependencies`.

`examples/astro/astro.config.mjs`:

```js
import node from "@astrojs/node";
import { defineConfig } from "astro/config";

export default defineConfig({ output: "server", adapter: node({ mode: "standalone" }) });
```

`examples/astro/src/pages/index.astro`:

```astro
---
import { readDevPreview } from "@spleenteo/datocms-dev-bar/server";

const BASE_EDITING_URL = "https://example.admin.datocms.com";
const preview = readDevPreview(Astro.request, { isDev: import.meta.env.DEV });
---

<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>datocms-dev-bar + Astro</title>
  </head>
  <body>
    <h1>datocms-dev-bar + Astro</h1>
    <p>Server sees: {preview.mode}, visual editing {preview.visualEditing ? "on" : "off"}</p>
    <pre>{JSON.stringify(preview.cdaOptions({ baseEditingUrl: BASE_EDITING_URL }), null, 2)}</pre>
    {import.meta.env.DEV && <datocms-dev-bar project-url={BASE_EDITING_URL} />}
    <script>
      if (import.meta.env.DEV) import("@spleenteo/datocms-dev-bar");
    </script>
  </body>
</html>
```

Add `examples/astro/node_modules` and `examples/astro/.astro` to the root `.gitignore`.

- [ ] **Step 5: Check the Astro example by hand**

Run: `npm run build` (root), then `cd examples/astro && npx astro dev`; open the printed URL.
Expected: the tab is visible; switching to published reloads and the text says `Server sees: published, visual editing off`; `includeDrafts` becomes `false` in the printed options. Stop the server.

- [ ] **Step 6: Run the whole suite**

Run: `npm test && npx tsc --noEmit && npm run build && npm run size && npm run test:e2e`
Expected: everything passes.

- [ ] **Step 7: Commit**

```bash
git add README.md scripts/size.mjs examples/astro/package.json examples/astro/package-lock.json examples/astro/astro.config.mjs examples/astro/src .gitignore
git commit -m "docs: README with the contract and recipes, Astro example, size budget"
```

---

### Task 7: Adopt the bar in gestart-astro (branch only)

**Repository:** `~/Sites/gestart/gestart-astro`, on a new branch `feat/datocms-dev-bar` in a worktree. **Do not merge**: the `file:` dependency points at a local folder and the Cloudflare build cannot see it. Merging waits for Task 8.

**Files (gestart-astro):**
- Modify: `package.json` (new dependency)
- Modify: `src/lib/draftMode.ts` (development branches of `isDraftModeEnabled` and `isVisualEditingEnabled`; remove `DEV_PUBLISHED_COOKIE_NAME`)
- Delete: `src/pages/api/draft-mode/dev/index.ts`
- Modify: `src/components/DraftModeBanner/Component.astro` (development uses the package; production bar unchanged apart from the accent colour)

**Interfaces:**
- Consumes: `readDevPreview` from `@spleenteo/datocms-dev-bar/server`; the element from `@spleenteo/datocms-dev-bar`.
- Produces: in `astro dev`, the same draft/published and visual editing behaviour driven by the package cookies; production unchanged.

- [ ] **Step 1: Create the branch and add the dependency**

Run (from the gestart-astro worktree root): `npm run build --prefix ~/Sites/datocms-dev-bar && npm install ~/Sites/datocms-dev-bar`
Expected: `package.json` gains `"@spleenteo/datocms-dev-bar": "file:<relative path>"` under `dependencies`.

- [ ] **Step 2: Route development through the package in `src/lib/draftMode.ts`**

Add the import at the top:

```ts
import { readDevPreview } from "@spleenteo/datocms-dev-bar/server";
```

Replace this block:

```ts
// Solo in `astro dev`: con questo cookie il sito locale legge il pubblicato, come online (interruttore del banner)
export const DEV_PUBLISHED_COOKIE_NAME = "dev-published";

// In `astro dev` il sito è in draft mode, salvo che dall'interruttore del banner si sia scelto il pubblicato
// La richiesta di Astro (`Astro` in una pagina o un componente, il context in un endpoint o nel middleware)
type RequestContext = { cookies: AstroCookies; request: Request };
```

with:

```ts
// La richiesta di Astro (`Astro` in una pagina o un componente, il context in un endpoint o nel middleware)
type RequestContext = { cookies: AstroCookies; request: Request };

// In `astro dev` bozze/pubblicato e Content Link li decide la barra di @spleenteo/datocms-dev-bar (cookie e ?datocms=)
const devPreview = (request: Request) => readDevPreview(request, { isDev: true });
```

Replace:

```ts
  if (import.meta.env.DEV) return cookies.get(DEV_PUBLISHED_COOKIE_NAME)?.value !== "1";
```

with:

```ts
  if (import.meta.env.DEV) return devPreview(request).mode === "draft";
```

Replace:

```ts
export function isVisualEditingEnabled(context: RequestContext) {
  return isDraftModeEnabled(context) && context.cookies.get(VISUAL_EDITING_OFF_COOKIE_NAME)?.value !== "1";
}
```

with:

```ts
export function isVisualEditingEnabled(context: RequestContext) {
  if (import.meta.env.DEV) return devPreview(context.request).visualEditing;
  return isDraftModeEnabled(context) && context.cookies.get(VISUAL_EDITING_OFF_COOKIE_NAME)?.value !== "1";
}
```

`isDraftModeEnabled` no longer uses `cookies`: change its signature to `export function isDraftModeEnabled({ request }: RequestContext)`.

- [ ] **Step 3: Delete the development endpoint**

Run: `git rm src/pages/api/draft-mode/dev/index.ts`
Then: `grep -rn "DEV_PUBLISHED_COOKIE_NAME\|draft-mode/dev" src`
Expected: no matches.

- [ ] **Step 4: Rewrite `src/components/DraftModeBanner/Component.astro`**

Replace the whole file with:

```astro
---
import { DATOCMS_BASE_EDITING_URL, DATOCMS_ENVIRONMENT } from "astro:env/server";
import { isDraftModeEnabled, isVisualEditingEnabled } from "~/lib/draftMode";

/*
 * In `astro dev`: la barra di @spleenteo/datocms-dev-bar (bozze/pubblicato, Visual editing, link al progetto).
 * Online: avviso visibile solo in draft mode, con l'uscita verso la versione pubblicata della stessa pagina,
 * l'interruttore "Visual editing" e il link al progetto DatoCMS. A riposo si vede solo una linguetta a
 * mezzaluna sul bordo sinistro: un clic fa scorrere fuori la barra, un altro la richiude.
 */
const isDev = import.meta.env.DEV;
const draftModeEnabled = !isDev && isDraftModeEnabled(Astro);
const visualEditing = isVisualEditingEnabled(Astro);
const here = encodeURIComponent(Astro.url.pathname + Astro.url.search);
const exitHref = `/api/draft-mode/disable?redirect=${here}`;
const visualHref = (mode: "on" | "off") => `/api/visual-editing?mode=${mode}&redirect=${here}`;
const datoHref = DATOCMS_ENVIRONMENT
  ? `${DATOCMS_BASE_EDITING_URL}/environments/${DATOCMS_ENVIRONMENT}`
  : DATOCMS_BASE_EDITING_URL;
const wrap = "group pointer-events-none fixed bottom-1 left-0 z-50 flex items-center";
const trigger =
  "pointer-events-auto absolute left-0 top-1/2 z-10 h-[48px] w-[24px] -translate-y-1/2 cursor-pointer overflow-hidden rounded-r-full bg-[#FF593D] shadow-lift transition-[width] duration-300 ease-material hover:w-[28px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF593D]";
const bar =
  "pointer-events-auto relative ml-1 flex max-w-[calc(100vw-24px)] flex-wrap items-center gap-x-1 gap-y-[6px] rounded-[24px] bg-ink py-[8px] pl-2 pr-[8px] text-smallprint font-bold text-white shadow-lift " +
  "invisible -translate-x-[calc(100%+12px)] opacity-0 transition-[translate,opacity,visibility] duration-300 ease-material " +
  "group-data-open:visible group-data-open:translate-x-0 group-data-open:opacity-100";
const group = "flex items-center gap-[2px] rounded-full bg-white/10 p-[2px]";
const option = "rounded-full px-1 py-[4px] transition-colors duration-300 ease-material";
const active = "bg-white text-ink hover:text-ink";
const idle = "text-white/70 hover:bg-white/10 hover:text-white";
const divider = "hidden h-[20px] w-px bg-white/20 tab:block";
---

{isDev && <datocms-dev-bar project-url={DATOCMS_BASE_EDITING_URL} environment={DATOCMS_ENVIRONMENT} />}
{
  draftModeEnabled && (
    <div class={wrap} data-draft-bar data-datocms-noindex>
      <button type="button" class={trigger} aria-label="Preview settings" aria-expanded="false" data-draft-bar-trigger>
        <span class="absolute left-0 top-1/2 size-[16px] -translate-1/2 rounded-full bg-white" aria-hidden="true" />
      </button>
      <div class={bar}>
        <span class="flex items-center gap-1">
          <span class="size-[8px] rounded-full bg-aqua" aria-hidden="true" />
          Viewing drafts
        </span>
        <a href={exitHref} class="rounded-full bg-white/10 px-1 py-[4px] text-white hover:bg-white/20 hover:text-white">Exit</a>
        <span class="flex items-center gap-1">
          <span class={divider} aria-hidden="true" />
          Visual editing
          <span class={group} role="group" aria-label="Visual editing">
            <a href={visualHref("on")} class:list={[option, visualEditing ? active : idle]} aria-current={visualEditing ? "true" : undefined}>on</a>
            <a href={visualHref("off")} class:list={[option, visualEditing ? idle : active]} aria-current={visualEditing ? undefined : "true"}>off</a>
          </span>
        </span>
        <span class="flex items-center gap-1">
          <span class={divider} aria-hidden="true" />
          <a href={datoHref} target="_blank" rel="noopener" class="rounded-full bg-white/10 px-1 py-[4px] text-white hover:bg-white/20 hover:text-white">
            DatoCMS <span aria-hidden="true">↗</span><span class="sr-only">(opens in a new window)</span>
          </a>
        </span>
      </div>
    </div>
  )
}

<script>
  // In sviluppo la barra viene dal pacchetto; in produzione il ramo sparisce dal bundle
  if (import.meta.env.DEV) import("@spleenteo/datocms-dev-bar");

  // Online: la linguetta apre e chiude la barra; lo stato sopravvive ai ricaricamenti (gli interruttori sono link)
  const KEY = "draft-bar-open";
  const root = document.querySelector<HTMLElement>("[data-draft-bar]");
  const trigger = root?.querySelector<HTMLButtonElement>("[data-draft-bar-trigger]");
  const setOpen = (open: boolean) => {
    root!.toggleAttribute("data-open", open);
    trigger!.setAttribute("aria-expanded", String(open));
  };
  if (root && trigger) {
    try {
      if (sessionStorage.getItem(KEY) === "1") setOpen(true);
    } catch {}
    trigger.addEventListener("click", () => {
      const open = !root.hasAttribute("data-open");
      setOpen(open);
      try {
        sessionStorage.setItem(KEY, open ? "1" : "0");
      } catch {}
    });
  }
</script>
```

- [ ] **Step 5: Build and check**

Run: `npm run check && npm run build`
Expected: no errors. Then check that the package's element code is not in the production client bundle:
Run: `grep -l "datocms-dev-bar:open" dist/client/_astro/*.js`
Expected: no output (only development loads the element).

- [ ] **Step 6: Check by hand in development**

Run: `npm run dev`, open `http://localhost:4321`.
Expected: the package's bar (accent `#FF593D`, half dot). `published` shows the published content; `Visual editing off` removes the orange click-to-edit boxes; `?datocms=published` on any URL works on first load; the DatoCMS link opens the project. Stop the server.

- [ ] **Step 7: Commit on the branch**

```bash
git add package.json package-lock.json src/lib/draftMode.ts src/components/DraftModeBanner/Component.astro
git commit -m "feat: local draft/published switch from @spleenteo/datocms-dev-bar"
```

Push the branch; do not merge.

---

### Task 8: Publish and merge (needs the owner)

This task acts on public services. Each step waits for the owner's go-ahead.

- [ ] **Step 1: Public repository (owner confirms the name)**

Run: `gh repo create spleenteo/datocms-dev-bar --public --source ~/Sites/datocms-dev-bar --push`
Expected: repository created, `main` pushed. Add `"repository": { "type": "git", "url": "git+https://github.com/spleenteo/datocms-dev-bar.git" }` to `package.json` and commit.

- [ ] **Step 2: Publish to npm (owner runs it)**

The owner runs `! npm login`, then: `npm publish --dry-run` (check the file list: `dist/`, `README.md`, `LICENSE`, `package.json` only), then `npm publish`.
Expected: `@spleenteo/datocms-dev-bar@0.1.0` on npm; `https://cdn.jsdelivr.net/npm/@spleenteo/datocms-dev-bar` serves `dist/index.js`.

- [ ] **Step 3: Switch gestart-astro to the published version and merge**

On `feat/datocms-dev-bar`: `npm install @spleenteo/datocms-dev-bar@^0.1.0`, then `npm run build`.
Expected: `package.json` points at `^0.1.0`, build passes. Commit, then merge into `main` with the owner's go-ahead.
