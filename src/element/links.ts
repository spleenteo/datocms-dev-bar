/** Link to the DatoCMS project, or to one of its environments. */
export function projectHref(projectUrl: string | null, environment: string | null): string | null {
  const base = projectUrl?.trim().replace(/\/+$/, "");
  if (!base) return null;
  const env = environment?.trim();
  return env ? `${base}/environments/${encodeURIComponent(env)}` : base;
}
