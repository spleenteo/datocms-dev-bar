const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const LOCAL_SUFFIXES = [".local", ".localhost", ".test"];

/** The bar only shows on development hosts, so it does nothing if it ever reaches production. */
export function isAllowedHost(hostname: string, extraHosts: string[] = []): boolean {
  const host = hostname.toLowerCase();
  if (LOCAL_HOSTS.has(host) || LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  return extraHosts.map((extra) => extra.trim().toLowerCase()).filter(Boolean).includes(host);
}
