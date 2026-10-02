import { describe, expect, it } from "vitest";
import { parseCookies } from "../src/contract";
import { cookiesWork, writeCookie } from "../src/element/cookies";
import { FakeJar } from "./fakeJar";

describe("writeCookie", () => {
  it("writes a readable, encoded value", () => {
    const jar = new FakeJar();
    writeCookie(jar, "datocms-mode", "published");
    writeCookie(jar, "x", "a b");
    expect(parseCookies(jar.cookie).get("datocms-mode")).toBe("published");
    expect(parseCookies(jar.cookie).get("x")).toBe("a b");
  });
});

describe("cookiesWork", () => {
  it("is true when cookies stick, and cleans up its probe", () => {
    const jar = new FakeJar();
    expect(cookiesWork(jar)).toBe(true);
    expect(jar.cookie).toBe("");
  });
  it("is false when writes are ignored", () => {
    expect(cookiesWork(new FakeJar(false))).toBe(false);
  });
  it("is false when the setter throws", () => {
    const jar = {
      get cookie() {
        return "";
      },
      set cookie(_value: string) {
        throw new Error("blocked");
      },
    };
    expect(cookiesWork(jar)).toBe(false);
  });
});
