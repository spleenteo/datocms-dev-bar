/** Link to the DatoCMS project, or to one of its environments. */
export function projectHref(projectUrl: string | null, environment: string | null): string | null {
  const base = projectUrl?.trim().replace(/\/+$/, "");
  if (!base) return null;
  const env = environment?.trim();
  return env ? `${base}/environments/${encodeURIComponent(env)}` : base;
}

export type EnvironmentInfo = { name: string | null; primary: boolean };

/**
 * Which environment the site reads. No `environment` attribute means the primary one (the default
 * for sites that leave the environment unset). A named environment counts as primary only when
 * the `environment-primary` attribute says so.
 */
export function environmentInfo(environment: string | null, markedPrimary: boolean): EnvironmentInfo {
  const name = environment?.trim() || null;
  return { name, primary: name === null || markedPrimary };
}
