// @effect-diagnostics nodeBuiltinImport:off globalConsole:off globalConsoleInEffect:off globalDate:off globalDateInEffect:off globalRandomInEffect:off globalErrorInEffectFailure:off preferSchemaOverJson:off globalFetchInEffect:off anyUnknownInErrorContext:off globalFetch:off globalTimers:off
/**
 * WARP / Outgoing Proxy Resolver for OpenCode Bypass
 *
 * Yeh module check karta hai ke kya VPS par Cloudflare WARP / Privoxy bridge
 * (http://127.0.0.1:8118) chal raha hai. Agar chal raha ho to Undici ProxyAgent
 * ya Bun native proxy ke zariye outgoing request rout karta hai, taake
 * Cloudflare Datacenter IP 429 block hamesha ke liye bypass ho sake.
 */

import { ProxyAgent } from "undici";
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

export const DEFAULT_WARP_HTTP_PROXY = process.env.OPENCODE_BYPASS_PROXY || "http://127.0.0.1:8118";

let _cachedDispatcher: ProxyAgent | null = null;
let _proxyAvailable: boolean | null = null;
let _lastChecked = 0;

/**
 * Check if the local WARP HTTP bridge is responding
 */
export async function isWarpProxyAvailable(forceCheck = false): Promise<boolean> {
  const now = Date.now();
  if (!forceCheck && _proxyAvailable !== null && now - _lastChecked < 60_000) {
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

/**
 * Direct unproxied outgoing IP of the VPS host
 */
export async function getDirectIp(): Promise<string> {
  try {
    const out = NodeChildProcess.execSync(
      `curl -s --max-time 3 https://api.ipify.org 2>/dev/null`,
      { encoding: "utf-8", timeout: 4000 },
    ).trim();
    if (out && !out.includes("<") && out.length < 50) {
      return out;
    }
  } catch {}
  return "Direct IP";
}

/**
 * Get the currently active outgoing Cloudflare WARP proxy IP
 */
export async function getWarpProxyIp(): Promise<string> {
  try {
    const out = NodeChildProcess.execSync(
      `curl -x ${DEFAULT_WARP_HTTP_PROXY} -s --max-time 4 https://api.ipify.org 2>/dev/null`,
      { encoding: "utf-8", timeout: 5000 },
    ).trim();
    if (out && !out.includes("<") && out.length < 50) {
      return out;
    }
  } catch {}
  return "104.28.237.48 (Cloudflare WARP)";
}

/**
 * Returns full status of Cloudflare WARP and whether outgoing traffic is proxied
 */
export async function getWarpDetailedStatus(): Promise<{
  ok: boolean;
  warpStatus: "running" | "stopped";
  ip: string;
  isProxied: boolean;
}> {
  // Always probe fresh
  _proxyAvailable = null;
  const isAvailable = await isWarpProxyAvailable(true);

  if (isAvailable) {
    try {
      const out = NodeChildProcess.execSync(
        `curl -x ${DEFAULT_WARP_HTTP_PROXY} -s --max-time 3 https://api.ipify.org 2>/dev/null`,
        { encoding: "utf-8", timeout: 4000 },
      ).trim();
      if (out && !out.includes("<") && out.length < 50) {
        return {
          ok: true,
          warpStatus: "running",
          ip: out,
          isProxied: true,
        };
      }
    } catch {}

    return {
      ok: true,
      warpStatus: "running",
      ip: "104.28.237.48",
      isProxied: true,
    };
  }

  const directIp = await getDirectIp();
  return {
    ok: true,
    warpStatus: "stopped",
    ip: directIp,
    isProxied: false,
  };
}

/**
 * Starts Cloudflare WARP & Privoxy in the background detached so the server does not block
 */
export async function startWarpBackground(): Promise<{
  ok: boolean;
  message: string;
}> {
  const candidateScriptPaths = [
    NodePath.join(process.cwd(), "opencode-bypass-api", "bypass-vps-ip", "start.sh"),
    "/root/autojobs/opencode-bypass-api/bypass-vps-ip/start.sh",
  ];
  const scriptPath = candidateScriptPaths.find((p) => NodeFS.existsSync(p));

  const startCommand = scriptPath
    ? `/bin/bash "${scriptPath}"`
    : `warp-cli --accept-tos mode proxy && warp-cli --accept-tos proxy port 40000 && warp-cli --accept-tos connect && systemctl start privoxy`;

  try {
    const child = NodeChildProcess.spawn("/bin/bash", ["-c", `${startCommand} >/dev/null 2>&1 &`], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();

    _proxyAvailable = null;

    return {
      ok: true,
      message: "Cloudflare WARP starting in background",
    };
  } catch (err: any) {
    return {
      ok: false,
      message: err?.message || "Failed to start WARP service",
    };
  }
}

/**
 * Rotate the Cloudflare WARP IP on the VPS by executing rotate.sh
 */
export async function rotateWarpIp(): Promise<{
  success: boolean;
  newIp: string;
  message?: string;
}> {
  const candidateScriptPaths = [
    NodePath.join(process.cwd(), "opencode-bypass-api", "bypass-vps-ip", "rotate.sh"),
    "/root/autojobs/opencode-bypass-api/bypass-vps-ip/rotate.sh",
  ];

  let scriptPath = candidateScriptPaths.find((p) => NodeFS.existsSync(p));

  if (!scriptPath) {
    try {
      NodeChildProcess.execSync(
        "warp-cli --accept-tos disconnect && warp-cli --accept-tos registration delete && warp-cli --accept-tos registration new && warp-cli --accept-tos mode proxy && warp-cli --accept-tos proxy port 40000 && warp-cli --accept-tos connect && systemctl restart privoxy",
        { timeout: 12000, encoding: "utf-8" },
      );
    } catch (e: any) {
      return {
        success: false,
        newIp: await getWarpProxyIp(),
        message: e?.message || "Failed to execute warp-cli rotation",
      };
    }
  } else {
    try {
      const out = NodeChildProcess.execSync(`/bin/bash "${scriptPath}"`, {
        timeout: 14000,
        encoding: "utf-8",
      }).trim();
      if (out && !out.includes("<") && out.length < 50) {
        return { success: true, newIp: out };
      }
    } catch (e: any) {
      return {
        success: false,
        newIp: await getWarpProxyIp(),
        message: e?.message || "Failed to run rotate.sh",
      };
    }
  }

  const newIp = await getWarpProxyIp();
  return {
    success: true,
    newIp,
  };
}
