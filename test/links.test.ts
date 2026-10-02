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
