/** `decodeURIComponent` that keeps a malformed value as it is instead of throwing. */
export function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
