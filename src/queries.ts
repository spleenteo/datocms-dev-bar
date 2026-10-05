/**
 * What the dev bar knows about the queries a page ran: parsed from the response headers
 * of the Content Delivery API on the server, shown by the bar in the browser.
 */
export type CacheStatus = "hit" | "miss" | "bypass" | "unknown";
/** `not-requested`: the query did not ask for cache tags (drafts never do). `missing`: asked, none came back. */
export type CacheTagsStatus = "active" | "not-requested" | "missing";

export type QueryReport = {
  operation: string | null;
  environment: string | null;
  timingsTotalMs: number | null;
  complexity: number | null;
  maxComplexity: number | null;
  queryLength: number | null;
  queryLengthLimit: number | null;
  cache: CacheStatus;
  cacheTags: CacheTagsStatus;
  /** The query text and its variables (as JSON), when the site hands them over. */
  query: string | null;
  variables: string | null;
};

export type HeaderSource = { get(name: string): string | null };
export type ReadQueryReportOptions = {
  cacheTagsRequested: boolean;
  operation?: string | null;
  /** The query text, to show and copy in the bar. */
  query?: string | null;
  /** The variables: anything JSON can hold. */
  variables?: unknown;
};

function variablesAsJson(variables: unknown): string | null {
  if (variables === undefined || variables === null) return null;
  try {
    const json = JSON.stringify(variables, null, 2);
    return json === "{}" ? null : (json ?? null);
  } catch {
    return null;
  }
}

const toNumber = (value: string | null | undefined): number | null => {
  if (value === null || value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function cacheStatusOf(value: string | null | undefined): CacheStatus {
  switch (value?.trim().toUpperCase()) {
    case "HIT":
    case "STALE":
    case "REVALIDATED":
    case "UPDATING":
      return "hit";
    case "MISS":
    case "EXPIRED":
      return "miss";
    case "BYPASS":
    case "DYNAMIC":
      return "bypass";
    default:
      return "unknown";
  }
}

/** Reads the headers of one Content Delivery API response. Never throws. */
export function readQueryReport(headers: HeaderSource, options: ReadQueryReportOptions): QueryReport {
  const [length, limit] = (headers.get("x-cacheable-on-cdn-query-length-limit") ?? "").split("/");
  const seconds = toNumber(headers.get("x-timings-total"));
  const tags = headers.get("x-cache-tags")?.trim();
  return {
    operation: options.operation?.trim() || null,
    environment: headers.get("x-environment")?.trim() || null,
    timingsTotalMs: seconds === null ? null : Math.round(seconds * 1000),
    complexity: toNumber(headers.get("x-complexity")),
    maxComplexity: toNumber(headers.get("x-max-complexity")),
    queryLength: toNumber(length),
    queryLengthLimit: toNumber(limit),
    cache: cacheStatusOf(headers.get("cf-cache-status")),
    cacheTags: !options.cacheTagsRequested ? "not-requested" : tags ? "active" : "missing",
    query: options.query?.trim() || null,
    variables: variablesAsJson(options.variables),
  };
}

import type { ProjectInfo, RecordInfo } from "./project";

/** Everything the site hands to the bar: the queries of the page and, with a CMA token, project data. */
export type DevBarData = { queries: QueryReport[]; project: ProjectInfo | null };

/** Like `serializeQueryReports`, with project data as well. */
export function serializeDevBarData(data: DevBarData): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** Reads what the site wrote: the full object, or the plain array of queries. Anything malformed is dropped. */
export function parseDevBarData(json: string | null | undefined): DevBarData {
  let data: unknown;
  try {
    data = JSON.parse(json ?? "");
  } catch {
    return { queries: [], project: null };
  }
  if (Array.isArray(data)) return { queries: parseQueryReports(json), project: null };
  if (typeof data !== "object" || data === null) return { queries: [], project: null };
  const { queries, project } = data as { queries?: unknown; project?: unknown };
  return { queries: parseQueryReports(JSON.stringify(queries ?? [])), project: parseProject(project) };
}

function anchorFrom(value: unknown): RecordInfo["anchor"] {
  if (typeof value !== "object" || value === null) return null;
  const { recordId, fieldPath } = value as Record<string, unknown>;
  return typeof recordId === "string" && typeof fieldPath === "string" ? { recordId, fieldPath } : null;
}

function parseProject(value: unknown): ProjectInfo | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null) : []);
  return {
    environments: list(raw.environments)
      .filter((env) => typeof env.name === "string")
      .map((env) => ({ name: env.name as string, primary: env.primary === true })),
    records: list(raw.records)
      .filter((r) => typeof r.id === "string")
      .map(
        (r): RecordInfo => ({
          id: r.id as string,
          model: text(r.model),
          modelApiKey: text(r.modelApiKey),
          title: text(r.title),
          block: r.block === true,
          status: oneOf(r.status, ["published", "updated", "draft", "unknown"], "unknown"),
          updatedAt: text(r.updatedAt),
          editUrl: typeof r.editUrl === "string" && /^https:\/\//.test(r.editUrl) ? r.editUrl : null,
          anchor: anchorFrom(r.anchor),
        }),
      ),
    moreRecords: count(raw.moreRecords) ?? 0,
    blocks: count(raw.blocks) ?? 0,
    error: text(raw.error),
  };
}

/** JSON for a `<script type="application/json">` tag: `<` is escaped so the data cannot close the tag. */
export function serializeQueryReports(reports: QueryReport[]): string {
  return JSON.stringify(reports).replace(/</g, "\\u003c");
}

const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
const count = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

/** Reads the JSON written by `serializeQueryReports`. Anything malformed is dropped. */
export function parseQueryReports(json: string | null | undefined): QueryReport[] {
  let data: unknown;
  try {
    data = JSON.parse(json ?? "");
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  return data
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      operation: text(item.operation),
      environment: text(item.environment),
      timingsTotalMs: count(item.timingsTotalMs),
      complexity: count(item.complexity),
      maxComplexity: count(item.maxComplexity),
      queryLength: count(item.queryLength),
      queryLengthLimit: count(item.queryLengthLimit),
      cache: oneOf(item.cache, ["hit", "miss", "bypass", "unknown"], "unknown"),
      cacheTags: oneOf(item.cacheTags, ["active", "not-requested", "missing"], "not-requested"),
      query: text(item.query),
      variables: text(item.variables),
    }));
}

export type SummaryRows = {
  environment: string;
  time: string;
  complexity: string;
  queryLength: string;
  cache: string;
  cacheTags: string;
};

const NOT_AVAILABLE = "n/a";
const number = (value: number) => value.toLocaleString("en-US");

function highest<T>(items: T[], score: (item: T) => number | null): T | undefined {
  let best: T | undefined;
  let bestScore = -Infinity;
  for (const item of items) {
    const value = score(item);
    if (value !== null && value > bestScore) {
      best = item;
      bestScore = value;
    }
  }
  return best;
}

/** The six values of the X-ray panel, as text, for all the queries of one page. */
export function summarizeReports(reports: QueryReport[]): SummaryRows {
  const many = reports.length > 1;
  const environments = [...new Set(reports.map((r) => r.environment).filter((e): e is string => e !== null))];

  const times = reports.map((r) => r.timingsTotalMs).filter((t): t is number => t !== null);
  const time = times.length
    ? `${number(times.reduce((a, b) => a + b, 0))} ms${many ? ` across ${reports.length} queries` : ""}`
    : NOT_AVAILABLE;

  const heaviest = highest(reports, (r) => r.complexity);
  const complexity = heaviest
    ? `${number(heaviest.complexity!)}${heaviest.maxComplexity !== null ? ` of ${number(heaviest.maxComplexity)}` : ""}${many ? " (highest)" : ""}`
    : NOT_AVAILABLE;

  const longest = highest(reports, (r) => r.queryLength);
  const queryLength = longest
    ? `${number(longest.queryLength!)}${longest.queryLengthLimit !== null ? ` of ${number(longest.queryLengthLimit)}` : ""}${many ? " (longest)" : ""}`
    : NOT_AVAILABLE;

  return {
    environment: environments.length ? environments.join(", ") : NOT_AVAILABLE,
    time,
    complexity,
    queryLength,
    cache: describeCache(reports),
    cacheTags: describeCacheTags(reports),
  };
}

function describeCache(reports: QueryReport[]): string {
  const total = reports.length;
  if (total === 0) return NOT_AVAILABLE;
  const hits = reports.filter((r) => r.cache === "hit").length;
  if (hits === total) return total === 1 ? "Yes, from cache" : `Yes, all ${total} from cache`;
  if (hits > 0) return `Partly, ${hits} of ${total} from cache`;
  if (reports.some((r) => r.cache === "miss")) return "No, computed fresh (cached for next time)";
  if (reports.some((r) => r.cache === "bypass")) return "No, cache bypassed";
  return "Unknown";
}

function describeCacheTags(reports: QueryReport[]): string {
  const total = reports.length;
  if (total === 0) return NOT_AVAILABLE;
  const active = reports.filter((r) => r.cacheTags === "active").length;
  if (active === total) return total === 1 ? "Active" : `Active on all ${total}`;
  if (active > 0) return `Partly, active on ${active} of ${total}`;
  if (reports.some((r) => r.cacheTags === "missing")) return "Missing: asked for, none returned";
  return "Not requested";
}

/** Where a query starts to deserve a look. Rules of thumb, not DatoCMS limits (except the length limit). */
export const SLOW_MS = 500;
export const HEAVY_SHARE = 0.05;
export const NEAR_LIMIT_SHARE = 0.75;

export type Flag = { kind: "slow" | "heavy" | "near-limit"; label: string; why: string };

const percent = (share: number) => `${share < 0.01 ? "<1" : Math.round(share * 100)}%`;

/** The weight lens: what is worth a look in one query. An empty list means nothing stands out. */
export function assessReport(report: QueryReport): Flag[] {
  const flags: Flag[] = [];
  if (report.timingsTotalMs !== null && report.timingsTotalMs >= SLOW_MS) {
    flags.push({
      kind: "slow",
      label: "slow",
      why: `${number(report.timingsTotalMs)} ms at DatoCMS, from ${SLOW_MS} ms up it is worth a look.${report.cache === "hit" ? " On a cache hit this repeats the time of the original run." : ""}`,
    });
  }
  if (report.complexity !== null && report.maxComplexity) {
    const share = report.complexity / report.maxComplexity;
    if (share >= HEAVY_SHARE) {
      flags.push({
        kind: "heavy",
        label: `heavy ${percent(share)}`,
        why: `Complexity is ${percent(share)} of the maximum DatoCMS accepts. Fewer nested levels or smaller lists lower it.`,
      });
    }
  }
  if (report.queryLength !== null && report.queryLengthLimit) {
    const share = report.queryLength / report.queryLengthLimit;
    if (share >= NEAR_LIMIT_SHARE) {
      flags.push({
        kind: "near-limit",
        label: `length ${percent(share)}`,
        why: `The query text is ${percent(share)} of the limit for being cached on the CDN. Past it the query is not cacheable there.`,
      });
    }
  }
  return flags;
}

/** The three measures of a query as short text, for its row: time, share of max complexity, share of the length limit. */
export function describeWeight(report: QueryReport): { time: string; complexity: string; length: string } {
  const share = (value: number | null, max: number | null) => (value !== null && max ? percent(value / max) : NOT_AVAILABLE);
  return {
    time: report.timingsTotalMs === null ? NOT_AVAILABLE : `${number(report.timingsTotalMs)} ms`,
    complexity: share(report.complexity, report.maxComplexity),
    length: share(report.queryLength, report.queryLengthLimit),
  };
}
