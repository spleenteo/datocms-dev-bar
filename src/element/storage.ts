// What the bar remembers from one page to the next. Without sessionStorage it starts closed
// on every page and forgets the open tab; everything else works.

export function recall(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function remember(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Nothing to do: the value lives until the page changes.
  }
}
