export type ShortcutAction = "toggle-mode" | "toggle-visual" | "toggle-bar";

type KeyLike = { altKey: boolean; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; code: string };

// `code` and not `key`: on macOS Alt changes the character (Alt+Shift+D gives "Î").
const ACTIONS: Record<string, ShortcutAction> = { KeyD: "toggle-mode", KeyV: "toggle-visual", KeyB: "toggle-bar" };

export function shortcutFor(event: KeyLike, editableTarget: boolean): ShortcutAction | null {
  if (editableTarget || !event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return null;
  return ACTIONS[event.code] ?? null;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as Element | null;
  if (!element || typeof element.closest !== "function") return false;
  return element.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])") !== null;
}
