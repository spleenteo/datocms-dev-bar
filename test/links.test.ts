import { describe, expect, it } from "vitest";
import { environmentInfo, projectHref } from "../src/element/links";

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

describe("environmentInfo", () => {
  it("treats a missing or blank environment as the primary one", () => {
    expect(environmentInfo(null, false)).toEqual({ name: null, primary: true });
    expect(environmentInfo("  ", false)).toEqual({ name: null, primary: true });
  });
  it("treats a named environment as not primary", () => {
    expect(environmentInfo("main-astro-26", false)).toEqual({ name: "main-astro-26", primary: false });
  });
  it("trusts the primary marker on a named environment", () => {
    expect(environmentInfo("main", true)).toEqual({ name: "main", primary: true });
  });
});
