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
