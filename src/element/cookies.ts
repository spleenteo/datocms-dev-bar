import { parseCookies } from "../contract";

export type CookieJar = { cookie: string };

export function writeCookie(jar: CookieJar, name: string, value: string): void {
  jar.cookie = `${name}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
}

const PROBE = "datocms-dev-bar-probe";

/** Writes and reads back a probe cookie: false when the browser blocks cookies. */
export function cookiesWork(jar: CookieJar): boolean {
  try {
    writeCookie(jar, PROBE, "1");
    const works = parseCookies(jar.cookie).get(PROBE) === "1";
    jar.cookie = `${PROBE}=; path=/; max-age=0`;
    return works;
  } catch {
    return false;
  }
}
