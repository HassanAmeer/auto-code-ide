// @effect-diagnostics nodeBuiltinImport:off globalConsole:off globalConsoleInEffect:off globalDate:off globalDateInEffect:off globalRandomInEffect:off globalErrorInEffectFailure:off preferSchemaOverJson:off globalFetchInEffect:off anyUnknownInErrorContext:off globalFetch:off
/**
 * WARP / Outgoing Proxy Resolver for OpenCode Bypass
 *
 * Yeh module check karta hai ke kya VPS par Cloudflare WARP / Privoxy bridge
 * (http://127.0.0.1:8118) chal raha hai. Agar chal raha ho to Undici ProxyAgent
 * ya Bun native proxy ke zariye outgoing request rout karta hai, taake
 * Cloudflare Datacenter IP 429 block hamesha ke liye bypass ho sake.
 */

import { ProxyAgent } from "undici";

export const DEFAULT_WARP_HTTP_PROXY = process.env.OPENCODE_BYPASS_PROXY || "http://127.0.0.1:8118";

let _cachedDispatcher: ProxyAgent | null = null;
let _proxyAvailable: boolean | null = null;
let _lastChecked = 0;

/**
 * Check if the local WARP HTTP bridge is responding
 */
export async function isWarpProxyAvailable(): Promise<boolean> {
  const now = Date.now();
  if (_proxyAvailable !== null && now - _lastChecked < 60_000) {
    return _proxyAvailable;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 800);
    const res = await fetch(DEFAULT_WARP_HTTP_PROXY, {
      method: "GET",
      signal: controller.signal,
    }).catch(() => null);
    clearTimeout(timeout);

    // Privoxy returns 200 or 503 on root request
    _proxyAvailable = res !== null;
  } catch {
    _proxyAvailable = false;
  }

  _lastChecked = now;
  return _proxyAvailable;
}

/**
 * Returns a ProxyAgent dispatcher if WARP proxy is running, else undefined
 */
export async function getBypassDispatcher(): Promise<ProxyAgent | undefined> {
  const available = await isWarpProxyAvailable();
  if (!available) return undefined;

  if (!_cachedDispatcher) {
    _cachedDispatcher = new ProxyAgent(DEFAULT_WARP_HTTP_PROXY);
  }
  return _cachedDispatcher;
}
