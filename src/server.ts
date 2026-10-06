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

export { readQueryReport, serializeDevBarData } from "./queries";
export type { CacheStatus, CacheTagsStatus, DevBarData, HeaderSource, QueryReport, ReadQueryReportOptions } from "./queries";
export { collectRecordIds, fetchProjectInfo } from "./project";
export type { FetchProjectInfoOptions, ProjectInfo, RecordInfo, RecordStatus } from "./project";
