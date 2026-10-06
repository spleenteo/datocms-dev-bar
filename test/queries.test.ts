import { describe, expect, it } from "vitest";
import type { ProjectInfo, RecordInfo } from "../src/project";
import { assessReport, describeBlocks, describeCalls, describeWeight, formatBytes, parseDevBarData, readQueryReport, serializeDevBarData, summarizeReports, type QueryReport } from "../src/queries";

const headers = (values: Record<string, string>) => ({ get: (name: string) => values[name.toLowerCase()] ?? null });

const REAL = {
  "x-environment": "main-26",
  "x-timings-total": "0.035",
  "x-complexity": "102",
  "x-max-complexity": "21294900",
  "x-cacheable-on-cdn-query-length-limit": "192/12000",
  "cf-cache-status": "HIT",
  "x-cache-tags": "$o ace= \"s56(_",
};

const report = (over: Partial<QueryReport> = {}): QueryReport => ({
  operation: null,
  environment: "main-26",
  timingsTotalMs: 35,
  complexity: 102,
  maxComplexity: 21294900,
  queryLength: 192,
  queryLengthLimit: 12000,
  cache: "hit",
  cacheTags: "active",
  responseBytes: null,
  query: null,
  variables: null,
  ...over,
});

describe("readQueryReport", () => {
  it("reads the headers DatoCMS sends", () => {
    expect(readQueryReport(headers(REAL), { cacheTagsRequested: true, operation: "Home" })).toEqual({
      operation: "Home",
      environment: "main-26",
      timingsTotalMs: 35,
      complexity: 102,
      maxComplexity: 21294900,
      queryLength: 192,
      queryLengthLimit: 12000,
      cache: "hit",
      cacheTags: "active",
      responseBytes: null,
      query: null,
      variables: null,
    });
  });
  it("keeps the query text and the variables as JSON", () => {
    const r = readQueryReport(headers(REAL), { cacheTagsRequested: true, query: "  query A { a }  ", variables: { slug: "x" } });
    expect(r.query).toBe("query A { a }");
    expect(r.variables).toBe('{\n  "slug": "x"\n}');
    expect(readQueryReport(headers(REAL), { cacheTagsRequested: true, variables: {} }).variables).toBeNull();
    expect(readQueryReport(headers(REAL), { cacheTagsRequested: true, variables: 10n }).variables).toBeNull();
  });
  it("copes with missing headers", () => {
    const r = readQueryReport(headers({}), { cacheTagsRequested: false });
    expect(r).toMatchObject({ environment: null, timingsTotalMs: null, complexity: null, queryLength: null, cache: "unknown" });
  });
  it("tells apart the three cache tag states", () => {
    expect(readQueryReport(headers(REAL), { cacheTagsRequested: true }).cacheTags).toBe("active");
    expect(readQueryReport(headers({}), { cacheTagsRequested: true }).cacheTags).toBe("missing");
    expect(readQueryReport(headers(REAL), { cacheTagsRequested: false }).cacheTags).toBe("not-requested");
  });
  it("maps the Cloudflare cache status", () => {
    const status = (value: string) => readQueryReport(headers({ "cf-cache-status": value }), { cacheTagsRequested: false }).cache;
    expect([status("HIT"), status("miss"), status("BYPASS"), status("DYNAMIC"), status("weird")]).toEqual([
      "hit",
      "miss",
      "bypass",
      "bypass",
      "unknown",
    ]);
  });
});

describe("serialize and parse", () => {
  const queriesOf = (json: string | null) => parseDevBarData(json).queries;
  it("round-trips", () => {
    const queries = [report({ operation: "Home" })];
    expect(parseDevBarData(serializeDevBarData({ queries, project: null }))).toEqual({ queries, project: null });
  });
  it("escapes < so the data cannot close the script tag", () => {
    const json = serializeDevBarData({ queries: [report({ operation: "</script><b>" })], project: null });
    expect(json).not.toContain("<");
    expect(queriesOf(json)[0].operation).toBe("</script><b>");
  });
  it("drops malformed input", () => {
    expect(queriesOf("not json")).toEqual([]);
    expect(queriesOf('{"a":1}')).toEqual([]);
    expect(queriesOf("[]")).toEqual([]);
    expect(queriesOf(null)).toEqual([]);
    expect(queriesOf('{"queries":[1,"x",{"cache":"nope","complexity":"12"}]}')).toEqual([
      report({ operation: null, environment: null, timingsTotalMs: null, complexity: null, maxComplexity: null, queryLength: null, queryLengthLimit: null, cache: "unknown", cacheTags: "not-requested", responseBytes: null, query: null, variables: null }),
    ]);
  });
});

describe("summarizeReports", () => {
  it("describes one cached query", () => {
    expect(summarizeReports([report()])).toEqual({
      environment: "main-26",
      time: "35 ms",
      complexity: "102 of 21,294,900",
      queryLength: "192 of 12,000",
      cache: "Yes, from cache",
      cacheTags: "Active",
      size: "n/a",
    });
  });
  it("sums times and picks the extremes across queries", () => {
    const s = summarizeReports([report({ timingsTotalMs: 30 }), report({ timingsTotalMs: 12, complexity: 900, queryLength: 400 })]);
    expect(s.time).toBe("42 ms across 2 queries");
    expect(s.complexity).toBe("900 of 21,294,900 (highest)");
    expect(s.queryLength).toBe("400 of 12,000 (longest)");
  });
  it("explains a miss, a bypass and a mix", () => {
    expect(summarizeReports([report({ cache: "miss" })]).cache).toBe("No, computed fresh (cached for next time)");
    expect(summarizeReports([report({ cache: "bypass" })]).cache).toBe("No, cache bypassed");
    expect(summarizeReports([report(), report({ cache: "miss" })]).cache).toBe("Partly, 1 of 2 from cache");
  });
  it("explains cache tags in drafts and when they go missing", () => {
    expect(summarizeReports([report({ cacheTags: "not-requested" })]).cacheTags).toBe("Not requested");
    expect(summarizeReports([report({ cacheTags: "missing" })]).cacheTags).toBe("Missing: asked for, none returned");
    expect(summarizeReports([report(), report({ cacheTags: "missing" })]).cacheTags).toBe("Partly, active on 1 of 2");
  });
  it("answers n/a without queries", () => {
    expect(Object.values(summarizeReports([]))).toEqual(Array(7).fill("n/a"));
  });
});

describe("assessReport", () => {
  it("flags nothing for a light, quick query", () => {
    expect(assessReport(report())).toEqual([]);
  });
  it("flags a slow query and says a cache hit repeats the old time", () => {
    const [flag] = assessReport(report({ timingsTotalMs: 567 }));
    expect(flag.kind).toBe("slow");
    expect(flag.why).toContain("567 ms");
    expect(flag.why).toContain("cache hit");
    expect(assessReport(report({ timingsTotalMs: 567, cache: "miss" }))[0].why).not.toContain("cache hit");
  });
  it("flags heavy complexity by its share of the maximum", () => {
    expect(assessReport(report({ complexity: 1_100_000 })).map((f) => f.label)).toEqual(["heavy 5%"]);
    expect(assessReport(report({ complexity: 1_000_000 }))).toEqual([]);
  });
  it("flags a query close to the CDN length limit", () => {
    expect(assessReport(report({ queryLength: 9_500 })).map((f) => f.label)).toEqual(["length 79%"]);
  });
  it("can flag several things at once and ignores missing numbers", () => {
    expect(assessReport(report({ timingsTotalMs: 900, queryLength: 11_000 })).map((f) => f.kind)).toEqual(["slow", "near-limit"]);
    expect(assessReport(report({ timingsTotalMs: null, complexity: null, queryLength: null }))).toEqual([]);
  });
});

describe("describeBlocks", () => {
  const rec = (id: string, blockCount: number | null, block = false): RecordInfo => ({ id, model: "Page", modelApiKey: "page", title: `T${id}`, block, status: "published", updatedAt: null, editUrl: null, anchor: null, blockCount });
  const project = (records: RecordInfo[]): ProjectInfo => ({ environments: [], records, moreRecords: 0, blocks: 0, blockCounts: [], error: null });
  it("sums the blocks and names the record with the most", () => {
    expect(describeBlocks(project([rec("1", 12), rec("2", 480), rec("3", null, true)]))).toBe("492 in 2 records, up to 480 in T2");
    expect(describeBlocks(project([rec("1", 7)]))).toBe("7 in T1");
    expect(describeBlocks(project([rec("1", 0), rec("2", 0)]))).toBe("none in 2 records");
    expect(describeBlocks(project([rec("3", null, true)]))).toBe("n/a");
  });
});

describe("describeCalls", () => {
  it("counts calls and distinct queries, sums the weight, counts the flagged", () => {
    const q = (query: string, over: Partial<QueryReport> = {}) => report({ query, responseBytes: 1_000, ...over });
    expect(describeCalls([q("a"), q("a"), q("b", { timingsTotalMs: 600 })])).toBe("3 calls · 2 distinct queries · 670 ms · 2.9 KB · 1 flagged");
    expect(describeCalls([report({ timingsTotalMs: null })])).toBe("1 call · 1 distinct query");
  });
});

describe("describeWeight", () => {
  it("shows time and the shares of the two limits", () => {
    expect(describeWeight(report({ timingsTotalMs: 1830, complexity: 5121, queryLength: 1552 }))).toEqual({
      time: "1,830 ms",
      complexity: "<1%",
      length: "13%",
      size: "n/a",
    });
  });
  it("answers n/a when a number is missing", () => {
    expect(describeWeight(report({ timingsTotalMs: null, maxComplexity: null, queryLengthLimit: null }))).toEqual({
      time: "n/a",
      complexity: "n/a",
      length: "n/a",
      size: "n/a",
    });
  });
});

describe("response size", () => {
  it("measures the result as UTF-8 JSON, else trusts Content-Length", () => {
    expect(readQueryReport(headers({}), { cacheTagsRequested: false, result: { a: "è" } }).responseBytes).toBe(10);
    expect(readQueryReport(headers({ "content-length": "2048" }), { cacheTagsRequested: false }).responseBytes).toBe(2048);
    expect(readQueryReport(headers({}), { cacheTagsRequested: false }).responseBytes).toBeNull();
  });
  it("does not take the Content-Length of a compressed response for the size of the JSON", () => {
    expect(readQueryReport(headers({ "content-length": "512", "content-encoding": "br" }), { cacheTagsRequested: false }).responseBytes).toBeNull();
  });
  it("sums sizes and flags a large response", () => {
    const s = summarizeReports([report({ responseBytes: 3_000 }), report({ responseBytes: 250_000 })]);
    expect(s.size).toBe("247 KB in total, largest 244 KB");
    expect(assessReport(report({ responseBytes: 250_000 })).map((f) => f.label)).toEqual(["large 244 KB"]);
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(5_000)).toBe("4.9 KB");
    expect(formatBytes(3_000_000)).toBe("2.9 MB");
  });
});
