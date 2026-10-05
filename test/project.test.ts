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

  it("caps the records looked up", async () => {
    const info = await fetchProjectInfo({ token: "tok-c3", recordIds: ["R1", "x", "y"], maxRecords: 1, fetch: fakeFetch });
    expect(info.moreRecords).toBe(2);
  });
});

describe("parseDevBarData", () => {
  it("reads the full object and the old plain array", () => {
    const project = { environments: [{ name: "main", primary: true }], records: [], moreRecords: 0, blocks: 3, error: null };
    expect(parseDevBarData(serializeDevBarData({ queries: [], project })).project).toEqual(project);
    expect(parseDevBarData("[]")).toEqual({ queries: [], project: null });
  });
  it("drops edit links that are not https", () => {
    const data = { queries: [], project: { records: [{ id: "R1", editUrl: "javascript:alert(1)" }] } };
    expect(parseDevBarData(JSON.stringify(data)).project?.records[0].editUrl).toBeNull();
  });
});
