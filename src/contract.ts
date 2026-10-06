/**
 * The contract between the bar and the site: cookie and URL parameter names,
 * their values, and how to resolve them. Sites that do not use the server
 * helper can implement this by hand.
 */
import { safeDecode } from "./safeDecode";

export const MODE_COOKIE = "datocms-mode";
export const VISUAL_COOKIE = "datocms-visual";
export const MODE_PARAM = "datocms";
export const VISUAL_PARAM = "datocms-visual";

export type Mode = "draft" | "published";

/** `visualEditing` is the preference; in published mode Content Link stays off regardless. */
export type DevPreviewState = { mode: Mode; visualEditing: boolean };

export const DEFAULT_STATE: DevPreviewState = { mode: "draft", visualEditing: true };

export function parseMode(value: string | null | undefined): Mode | undefined {
  return value === "draft" || value === "published" ? value : undefined;
}

export function parseVisual(value: string | null | undefined): boolean | undefined {
  if (value === "on") return true;
  if (value === "off") return false;
  return undefined;
}

export function serializeVisual(on: boolean): "on" | "off" {
  return on ? "on" : "off";
}

export type RawSource = { mode?: string | null; visual?: string | null };

/** For each field the first source with a valid value wins; otherwise the default. */
export function resolveState(sources: RawSource[]): DevPreviewState {
  let mode: Mode | undefined;
  let visual: boolean | undefined;
  for (const source of sources) {
    mode ??= parseMode(source.mode);
    visual ??= parseVisual(source.visual);
  }
  return { mode: mode ?? DEFAULT_STATE.mode, visualEditing: visual ?? DEFAULT_STATE.visualEditing };
}

/** Parses a Cookie header. The first occurrence of a name wins; malformed encodings are kept raw. */
export function parseCookies(header: string | null | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of (header ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const name = part.slice(0, separator).trim();
    if (!name || cookies.has(name)) continue;
    cookies.set(name, safeDecode(part.slice(separator + 1).trim()));
  }
  return cookies;
}
