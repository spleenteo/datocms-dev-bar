import { beforeEach, describe, expect, it, vi } from "vitest";
import { collectRecordIds, fetchProjectInfo } from "../src/project";
import { parseDevBarData, serializeDevBarData } from "../src/queries";

describe("collectRecordIds", () => {
  it("finds ids at any depth, once each", () => {
    expect(collectRecordIds({ home: { id: "a", blocks: [{ id: "b" }, { id: "a" }] } })).toEqual(["a", "b"]);
  });
  it("finds records behind Content Link metadata", () => {
    const decode = (text: string) =>
      text === "stega" ? { href: "https://p.admin.datocms.com/environments/main/editor/item_types/T1/items/R9/edit#fieldPath=title" } : null;
    expect(collectRecordIds({ title: "stega", other: "plain" }, decode)).toEqual(["R9"]);
  });
  it("never throws on a link it cannot read or a decoder that fails", () => {
    const malformed = () => ({ href: "https://p.admin.datocms.com/editor/item_types/T1/items/%E0%A4%A/edit" });
    expect(collectRecordIds({ title: "text" }, malformed)).toEqual(["%E0%A4%A"]);
    const failing = () => {
      throw new Error("boom");
    };
    expect(collectRecordIds({ id: "a", title: "text" }, failing)).toEqual(["a"]);
  });
});

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

describe("fetchProjectInfo", () => {
  let calls: string[];
  let fakeFetch: typeof fetch;
  beforeEach(() => {
    calls = [];
    fakeFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/environments")) return json({ data: [{ id: "main", meta: { primary: true } }, { id: "fork", meta: { primary: false } }] });
      if (url.endsWith("/item-types")) {
        return json({
          data: [
            { id: "T1", attributes: { name: "Home page", api_key: "home_page", modular_block: false }, relationships: { presentation_title_field: { data: { id: "F1" } } } },
            { id: "TB", attributes: { name: "Button", api_key: "button", modular_block: true } },
          ],
        });
      }
      if (url.endsWith("/item-types/T1/fields")) return json({ data: [{ id: "F1", attributes: { api_key: "headline" } }] });
      if (url.includes("/items?")) {
        return json({
          data: [
            {
              id: "R1",
              attributes: { headline: { it: "", en: "  Welcome   to a very long headline that goes on and on and on past sixty characters " }, buttons: ["B2"] },
              meta: { status: "updated", updated_at: "2026-10-05T10:00:00Z" },
              relationships: { item_type: { data: { id: "T1" } } },
            },
            { id: "B2", attributes: { label: "Sign up" }, meta: { status: "published" }, relationships: { item_type: { data: { id: "TB" } } } },
          ],
        });
      }
      return json({}, 404);
    }) as unknown as typeof fetch;
  });

  it("returns environments and the records, with edit links", async () => {
    const info = await fetchProjectInfo({ token: "tok-a1", environment: "fork", recordIds: ["R1", "B2"], projectUrl: "https://p.admin.datocms.com/", fetch: fakeFetch });
    expect(info.error).toBeNull();
    expect(info.environments).toEqual([{ name: "main", primary: true }, { name: "fork", primary: false }]);
    expect(info.records).toEqual([
      {
        id: "R1",
        model: "Home page",
        modelApiKey: "home_page",
        title: "Welcome to a very long headline that goes on and on and on…",
        block: false,
        status: "updated",
        updatedAt: "2026-10-05T10:00:00Z",
        editUrl: "https://p.admin.datocms.com/environments/fork/editor/item_types/T1/items/R1/edit",
        anchor: { recordId: "R1", fieldPath: "" },
        blockCount: 0,
      },
      {
        id: "B2",
        model: "Button",
        modelApiKey: "button",
        title: "Sign up",
        block: true,
        status: "published",
        updatedAt: null,
        editUrl: null,
        anchor: { recordId: "R1", fieldPath: "buttons.0" },
        blockCount: null,
      },
    ]);
    expect(info.blocks).toBe(1);
    expect(calls.some((c) => c.includes("filter[ids]=R1,B2"))).toBe(true);
  });

  it("reports a failure instead of throwing", async () => {
    const failing = (async () => json({ errors: [{ attributes: { code: "INVALID_AUTHORIZATION_HEADER" } }] }, 401)) as unknown as typeof fetch;
    const info = await fetchProjectInfo({ token: "tok-b2", recordIds: ["R1"], fetch: failing });
    expect(info.error).toBe("CMA /environments answered 401 (INVALID_AUTHORIZATION_HEADER)");
    expect(info.records).toEqual([]);
  });

  it("reports a missing token instead of throwing", async () => {
    const info = await fetchProjectInfo({ token: undefined as unknown as string, recordIds: ["R1"], fetch: fakeFetch });
    expect(info.error).toBe("no Content Management API token was given");
    expect(calls).toEqual([]);
  });

  it("keeps what it caches apart for tokens that end the same way", async () => {
    const environmentsOf = (name: string) => (async () => json({ data: [{ id: name, meta: { primary: true } }] })) as unknown as typeof fetch;
    const first = await fetchProjectInfo({ token: "project-one-SAME66", recordIds: [], fetch: environmentsOf("one") });
    const second = await fetchProjectInfo({ token: "project-two-SAME66", recordIds: [], fetch: environmentsOf("two") });
    expect(first.environments[0].name).toBe("one");
    expect(second.environments[0].name).toBe("two");
  });

  it("caps the records looked up", async () => {
    const info = await fetchProjectInfo({ token: "tok-c3", recordIds: ["R1", "x", "y"], maxRecords: 1, fetch: fakeFetch });
    expect(info.moreRecords).toBe(2);
  });
});

describe("parseDevBarData", () => {
  it("reads the project data back", () => {
    const project = { environments: [{ name: "main", primary: true }], records: [], moreRecords: 0, blocks: 3, blockCounts: [{ model: "Button", modelApiKey: "button", count: 2 }], error: null };
    expect(parseDevBarData(serializeDevBarData({ queries: [], project })).project).toEqual(project);
  });
  it("drops edit links that are not https", () => {
    const data = { queries: [], project: { records: [{ id: "R1", editUrl: "javascript:alert(1)" }] } };
    expect(parseDevBarData(JSON.stringify(data)).project?.records[0].editUrl).toBeNull();
  });
});

describe("block counts", () => {
  it("counts every nested block by model, in all locales, once", async () => {
    const button = (id: string) => ({ id, type: "item", attributes: { label: id }, relationships: { item_type: { data: { id: "TB" } } } });
    const section = {
      id: "S1",
      type: "item",
      attributes: { buttons: [button("B1"), button("B2")] },
      relationships: { item_type: { data: { id: "TS" } } },
    };
    const fakeFetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/environments")) return json({ data: [{ id: "main", meta: { primary: true } }] });
      if (url.endsWith("/item-types")) {
        return json({
          data: [
            { id: "TP", attributes: { name: "Page", api_key: "page", modular_block: false } },
            { id: "TS", attributes: { name: "Section", api_key: "section", modular_block: true } },
            { id: "TB", attributes: { name: "Button", api_key: "button", modular_block: true } },
          ],
        });
      }
      expect(url).toContain("nested=true");
      return json({
        data: [
          // A localized modular content field: the Italian and English blocks both count
          { id: "P1", attributes: { content: { it: [section], en: [button("B3")] } }, meta: {}, relationships: { item_type: { data: { id: "TP" } } } },
          // The section also arrives on its own: it must not be counted twice
          { ...section, meta: {} },
        ],
      });
    }) as unknown as typeof fetch;
    const info = await fetchProjectInfo({ token: "tok-d4", recordIds: ["P1", "S1"], fetch: fakeFetch });
    expect(info.error).toBeNull();
    expect(info.blockCounts).toEqual([
      { model: "Button", modelApiKey: "button", count: 3 },
      { model: "Section", modelApiKey: "section", count: 1 },
    ]);
    expect(info.records.find((r) => r.id === "S1")?.anchor).toEqual({ recordId: "P1", fieldPath: "content.it.0" });
    // The page holds the section, its two buttons and the English button; the section is a block and counts none
    expect(info.records.map((r) => [r.id, r.blockCount])).toEqual([["P1", 4], ["S1", null]]);
  });
});
