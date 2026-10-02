import { expect, it } from "vitest";

it("can be imported where there is no DOM (server rendering)", async () => {
  expect(typeof (globalThis as { HTMLElement?: unknown }).HTMLElement).toBe("undefined");
  const mod = await import("../src/index");
  expect(mod.TAG_NAME).toBe("datocms-dev-bar");
  expect(mod.CHANGE_EVENT).toBe("datocms-dev-bar:change");
  expect(typeof (globalThis as { customElements?: unknown }).customElements).toBe("undefined");
});
