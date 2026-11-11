/**
 * POSIX-safe single-quote escaping for values interpolated into /bin/sh command strings.
 * Wraps the value in single quotes and escapes embedded single quotes as '\''.
 * Prevents command substitution ($(...), backticks), globbing and quote-breakouts.
 */
export function shq(value: string): string {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}
