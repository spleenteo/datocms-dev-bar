import { describe, expect, it } from "vitest";
import { isAllowedHost } from "../src/element/hosts";

describe("isAllowedHost", () => {
  it.each(["localhost", "LOCALHOST", "127.0.0.1", "[::1]", "::1", "mysite.local", "app.localhost", "gestart.test"])(
    "allows %s",
    (host) => expect(isAllowedHost(host)).toBe(true),
  );
  it.each(["example.com", "localhost.example.com", "test.com", "mytest", "www.gestart.it"])("refuses %s", (host) =>
    expect(isAllowedHost(host)).toBe(false),
  );
  it("allows extra hosts, ignoring blanks and case", () => {
    expect(isAllowedHost("devbox", ["", " DevBox "])).toBe(true);
    expect(isAllowedHost("other", ["", "devbox"])).toBe(false);
  });
});
