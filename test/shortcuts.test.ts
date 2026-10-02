import { describe, expect, it } from "vitest";
import { isEditableTarget, shortcutFor } from "../src/element/shortcuts";

const key = (code: string, mods: Partial<{ altKey: boolean; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }> = {}) => ({
  code,
  altKey: true,
  shiftKey: true,
  ctrlKey: false,
  metaKey: false,
  ...mods,
});

describe("shortcutFor", () => {
  it("maps Alt+Shift+D/V/B", () => {
    expect(shortcutFor(key("KeyD"), false)).toBe("toggle-mode");
    expect(shortcutFor(key("KeyV"), false)).toBe("toggle-visual");
    expect(shortcutFor(key("KeyB"), false)).toBe("toggle-bar");
  });
  it("needs exactly Alt+Shift", () => {
    expect(shortcutFor(key("KeyD", { shiftKey: false }), false)).toBeNull();
    expect(shortcutFor(key("KeyD", { altKey: false }), false)).toBeNull();
    expect(shortcutFor(key("KeyD", { ctrlKey: true }), false)).toBeNull();
    expect(shortcutFor(key("KeyD", { metaKey: true }), false)).toBeNull();
  });
  it("ignores other keys and editable targets", () => {
    expect(shortcutFor(key("KeyX"), false)).toBeNull();
    expect(shortcutFor(key("KeyD"), true)).toBeNull();
  });
});

describe("isEditableTarget", () => {
  it("is false for null and for targets without closest()", () => {
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget({} as EventTarget)).toBe(false);
  });
  it("follows closest()", () => {
    expect(isEditableTarget({ closest: () => null } as unknown as EventTarget)).toBe(false);
    expect(isEditableTarget({ closest: () => ({}) } as unknown as EventTarget)).toBe(true);
  });
});
