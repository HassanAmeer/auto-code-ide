// @effect-diagnostics nodeBuiltinImport:off globalConsole:off globalConsoleInEffect:off globalDate:off globalDateInEffect:off globalRandomInEffect:off globalErrorInEffectFailure:off preferSchemaOverJson:off globalFetchInEffect:off anyUnknownInErrorContext:off globalFetch:off
/**
 * OpenCode Free Lane — Session Generator
 *
 * Yahan session ID usi descending bitwise encoding se banti hai jo OpenCode ka
 * upstream free-tier gate accept karta hai. Bina is exact encoding ke server
 * 403 FreeTierError deta hai.
 *
 * Reference: https://github.com/Ebony-Vinyl/dsh-our-free-model (src/upstream.js)
 * Original Go reference: https://github.com/jasonxu114514/opencode2api
 *   (internal/identity/request.go → descendingTimePartPattern)
 *
 * ⚠️  Yeh file sirf tab active hoti hai jab `OPENCODE_BYPASS_ENABLED = true` ho.
 *
 * @module provider-opencode/opencode-bypass-setup/session
 */

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

// @effect-diagnostics nodeBuiltinImport:off globalConsole:off globalConsoleInEffect:off globalDate:off globalDateInEffect:off globalRandomInEffect:off globalErrorInEffectFailure:off preferSchemaOverJson:off globalFetchInEffect:off anyUnknownInErrorContext:off globalFetch:off
/** Session ID ka valid format: ses_ + 12 hex + 14 base62 */
export const SESSION_RE = /^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/;

// @effect-diagnostics nodeBuiltinImport:off globalConsole:off globalConsoleInEffect:off globalDate:off globalDateInEffect:off globalRandomInEffect:off globalErrorInEffectFailure:off preferSchemaOverJson:off globalFetchInEffect:off anyUnknownInErrorContext:off globalFetch:off
/**
 * Pehle 12 hex digits ka required pattern:
 *  ~(ts_ms << 12 | counter) se bane hain, counter 1–63 ke beech.
 *  Iska matlab low 12 bits 0xfc0–0xfff ke beech aani chahiye.
 */
export const SESSION_DESCENDING_RE = /^[0-9a-f]{9}f[c-f][0-9a-f]$/;

let _counter = 1;

// @effect-diagnostics nodeBuiltinImport:off globalConsole:off globalConsoleInEffect:off globalDate:off globalDateInEffect:off globalRandomInEffect:off globalErrorInEffectFailure:off preferSchemaOverJson:off globalFetchInEffect:off anyUnknownInErrorContext:off globalFetch:off
/**
 * Check karo ke given session ID upstream gate ke liye valid hai ya nahi.
 */
export function isCanonicalSession(id: string): boolean {
  if (typeof id !== "string") return false;
  const trimmed = id.trim();
  return SESSION_RE.test(trimmed) && SESSION_DESCENDING_RE.test(trimmed.slice(4, 16));
}

// @effect-diagnostics nodeBuiltinImport:off globalConsole:off globalConsoleInEffect:off globalDate:off globalDateInEffect:off globalRandomInEffect:off globalErrorInEffectFailure:off preferSchemaOverJson:off globalFetchInEffect:off anyUnknownInErrorContext:off globalFetch:off
/**
 * Naya valid session ID banao — descending layout me (upstream accept karta hai).
 *
 * Algorithm:
 *   1. ts_ms = Date.now()
 *   2. counter = 1–63 (cycle karta hai)
 *   3. timePart = ~(BigInt(ts_ms) << 12n | BigInt(counter)) — bitwise NOT + masking
 *   4. 12 hex chars + 14 random base62 chars = ses_<12hex><14b62>
 */
export function mintSession(): string {
  const ts = BigInt(Date.now());
  const counter = BigInt(_counter++ % 63 || 1); // 1–63
  // Descending: bitwise NOT of (ts << 12 | counter), mask to 48 bits
  const raw = ~((ts << 12n) | counter) & 0xffffffffffffn;
  const timePart = raw.toString(16).padStart(12, "0");

  // 14 random base62 chars
  const randBytes = new Uint8Array(14);
  crypto.getRandomValues(randBytes);
  const randPart = Array.from(randBytes)
    .map((b) => BASE62[b % 62])
    .join("");

  return `ses_${timePart}${randPart}`;
}

// @effect-diagnostics nodeBuiltinImport:off globalConsole:off globalConsoleInEffect:off globalDate:off globalDateInEffect:off globalRandomInEffect:off globalErrorInEffectFailure:off preferSchemaOverJson:off globalFetchInEffect:off anyUnknownInErrorContext:off globalFetch:off
/**
 * Purani session ID ko canonical (descending) layout me re-encode karo.
 * Ek conversation ek hi session se pinned rehti hai.
 */
export function canonicalizeSession(id: string): string {
  if (isCanonicalSession(id)) return id.trim();
  // Agar bilkul nahi — naya mint karo
  return mintSession();
}
