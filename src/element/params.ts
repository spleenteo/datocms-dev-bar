import { MODE_PARAM, VISUAL_PARAM, parseMode, parseVisual, type Mode } from "../contract";

export type UrlOverrides = { mode?: Mode; visualEditing?: boolean };

/**
 * Reads ?datocms= and ?datocms-visual= from a URL. When either is present it also
 * returns the URL without them (path + query + hash) for history.replaceState.
 */
export function takeUrlParams(href: string): { overrides: UrlOverrides; cleanedHref: string | null } {
  const url = new URL(href);
  if (!url.searchParams.has(MODE_PARAM) && !url.searchParams.has(VISUAL_PARAM)) {
    return { overrides: {}, cleanedHref: null };
  }
  const overrides: UrlOverrides = {};
  const mode = parseMode(url.searchParams.get(MODE_PARAM));
  if (mode) overrides.mode = mode;
  const visual = parseVisual(url.searchParams.get(VISUAL_PARAM));
  if (visual !== undefined) overrides.visualEditing = visual;
  url.searchParams.delete(MODE_PARAM);
  url.searchParams.delete(VISUAL_PARAM);
  return { overrides, cleanedHref: url.pathname + url.search + url.hash };
}
