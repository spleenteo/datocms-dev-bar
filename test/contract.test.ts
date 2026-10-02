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
