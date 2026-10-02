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
