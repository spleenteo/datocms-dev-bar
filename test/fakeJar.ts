/** Minimal stand-in for document.cookie: a setter that stores one cookie, max-age=0 deletes. */
export class FakeJar {
  private store = new Map<string, string>();
  constructor(private readonly writable = true) {}
  get cookie(): string {
    return [...this.store].map(([name, value]) => `${name}=${value}`).join("; ");
  }
  set cookie(value: string) {
    if (!this.writable) return;
    const [pair, ...attributes] = value.split(";");
    const separator = pair.indexOf("=");
    const name = pair.slice(0, separator).trim();
    if (attributes.some((a) => a.trim().toLowerCase() === "max-age=0")) this.store.delete(name);
    else this.store.set(name, pair.slice(separator + 1).trim());
  }
}
