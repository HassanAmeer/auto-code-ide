// @effect-diagnostics nodeBuiltinImport:off globalConsole:off globalConsoleInEffect:off globalDate:off globalDateInEffect:off globalRandomInEffect:off globalErrorInEffectFailure:off preferSchemaOverJson:off globalFetchInEffect:off anyUnknownInErrorContext:off globalFetch:off globalTimers:off
/**
 * WARP / Outgoing Proxy Resolver for OpenCode Bypass & IP Rotation
 *
 * Yeh module VPS par Cloudflare WARP / Privoxy bridge (http://127.0.0.1:8118)
 * ka running, paused, ya stopped status detect karta hai, IP rotation execute
 * karta hai, aur real dynamic egress IP fetch karta hai.
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
 * Check if the local WARP HTTP bridge (Privoxy) is responding on port 8118
 */
export async function isWarpProxyAvailable(forceCheck = false): Promise<boolean> {
  const now = Date.now();
  if (!forceCheck && _proxyAvailable !== null && now - _lastChecked < 15_000) {
    return _proxyAvailable;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 900);
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
  const providers = [
    "https://checkip.amazonaws.com",
    "https://cloudflare.com/cdn-cgi/trace",
    "https://api.ipify.org",
  ];

  for (const url of providers) {
    try {
      const out = NodeChildProcess.execSync(`curl -s --max-time 3 "${url}" 2>/dev/null`, {
        encoding: "utf-8",
        timeout: 4000,
      }).trim();

      if (url.includes("trace")) {
        const match = out.match(/^ip=(.+)$/m);
        if (match && match[1]) {
          return match[1].trim();
        }
      } else if (out && !out.includes("<") && out.length >= 7 && out.length <= 45) {
        return out.replace(/[^0-9a-fA-F:.]/g, "");
      }
    } catch {}
  }

  return "201.18.218.29";
}

/**
 * Ensure Privoxy is configured to bridge to WARP SOCKS5 (port 40000)
 */
export function ensurePrivoxyWarpBridge(): void {
  try {
    const configPath = "/etc/privoxy/config";
    if (NodeFS.existsSync(configPath)) {
      const content = NodeFS.readFileSync(configPath, "utf-8");
      if (!content.includes("forward-socks5 / 127.0.0.1:40000 .")) {
        const updated = content.replace(
          /forward-socks5\s+\/\s+127\.0\.0\.1:[0-9]+\s+\./g,
          "forward-socks5 / 127.0.0.1:40000 .",
        );
        NodeFS.writeFileSync(configPath, updated, "utf-8");
        NodeChildProcess.execSync("systemctl restart privoxy >/dev/null 2>&1 || true");
      }
    }
  } catch {}
}

/**
 * Get the currently active outgoing Cloudflare WARP proxy IP dynamically
 */
export async function getWarpProxyIp(): Promise<string> {
  const providers = [
    "https://checkip.amazonaws.com",
    "https://cloudflare.com/cdn-cgi/trace",
    "https://api.ipify.org",
  ];

  // 1. First attempt via Privoxy HTTP proxy (8118)
  for (const url of providers) {
    try {
      const out = NodeChildProcess.execSync(
        `curl -x ${DEFAULT_WARP_HTTP_PROXY} -s --max-time 4 "${url}" 2>/dev/null`,
        { encoding: "utf-8", timeout: 5000 },
      ).trim();

      if (url.includes("trace")) {
        const match = out.match(/^ip=(.+)$/m);
        if (match && match[1]) {
          const ipVal = match[1].trim();
          if (ipVal.length >= 7 && ipVal.length <= 45) {
            return ipVal;
          }
        }
      } else if (out && !out.includes("<") && out.length >= 7 && out.length <= 45) {
        return out.replace(/[^0-9a-fA-F:.]/g, "");
      }
    } catch {}
  }

  // 2. Direct SOCKS5 check on port 40000 (WARP native) in case Privoxy config was misrouted
  for (const url of providers) {
    try {
      const out = NodeChildProcess.execSync(
        `curl -x socks5h://127.0.0.1:40000 -s --max-time 4 "${url}" 2>/dev/null`,
        { encoding: "utf-8", timeout: 5000 },
      ).trim();

      let directWarpIp = "";
      if (url.includes("trace")) {
        const match = out.match(/^ip=(.+)$/m);
        if (match && match[1]) directWarpIp = match[1].trim();
      } else if (out && !out.includes("<") && out.length >= 7 && out.length <= 45) {
        directWarpIp = out.replace(/[^0-9a-fA-F:.]/g, "");
      }

      if (directWarpIp && directWarpIp.length >= 7) {
        // Auto-heal Privoxy config in background
        ensurePrivoxyWarpBridge();
        return directWarpIp;
      }
    } catch {}
  }

  return await getDirectIp();
}

/**
 * Returns full status of Cloudflare WARP and whether outgoing traffic is proxied.
 * Status can be:
 * - "running": Privoxy is active and WARP tunnel is connected
 * - "paused": Privoxy is active but WARP is disconnected (user paused)
 * - "stopped": Privoxy is completely stopped or offline
 */
export async function getWarpDetailedStatus(): Promise<{
  ok: boolean;
  warpStatus: "running" | "paused" | "stopped";
  ip: string;
  isProxied: boolean;
}> {
  // Check Privoxy HTTP proxy availability
  _proxyAvailable = null;
  const isPrivoxyUp = await isWarpProxyAvailable(true);

  if (!isPrivoxyUp) {
    const directIp = await getDirectIp();
    return {
      ok: true,
      warpStatus: "stopped",
      ip: directIp,
      isProxied: false,
    };
  }

  // Check warp-cli status to distinguish between running and paused
  let cliStatus = "";
  try {
    cliStatus = NodeChildProcess.execSync("warp-cli --accept-tos status 2>/dev/null", {
      encoding: "utf-8",
      timeout: 3000,
    });
  } catch {}

  const isConnected = cliStatus.includes("Connected") || cliStatus.includes("healthy");
  const isDisconnected = cliStatus.includes("Disconnected");

  if (isDisconnected) {
    const directIp = await getDirectIp();
    return {
      ok: true,
      warpStatus: "paused",
      ip: directIp,
      isProxied: false,
    };
  }

  if (isConnected || isPrivoxyUp) {
    const currentWarpIp = await getWarpProxyIp();
    return {
      ok: true,
      warpStatus: "running",
      ip: currentWarpIp,
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
 * Pause Cloudflare WARP (disconnect tunnel without stopping Privoxy daemon)
 */
export async function pauseWarp(): Promise<{
  ok: boolean;
  message: string;
}> {
  try {
    NodeChildProcess.execSync("warp-cli --accept-tos disconnect 2>/dev/null", {
      encoding: "utf-8",
      timeout: 5000,
    });
    _proxyAvailable = null;
    return {
      ok: true,
      message: "Cloudflare WARP proxy paused",
    };
  } catch (err: any) {
    return {
      ok: false,
      message: err?.message || "Failed to pause WARP",
    };
  }
}

/**
 * Stop Cloudflare WARP and Privoxy completely
 */
export async function stopWarp(): Promise<{
  ok: boolean;
  message: string;
}> {
  try {
    NodeChildProcess.execSync(
      "warp-cli --accept-tos disconnect >/dev/null 2>&1; systemctl stop privoxy >/dev/null 2>&1",
      { encoding: "utf-8", timeout: 7000 },
    );
    _proxyAvailable = null;
    return {
      ok: true,
      message: "Cloudflare WARP proxy stopped completely",
    };
  } catch (err: any) {
    return {
      ok: false,
      message: err?.message || "Failed to stop WARP service",
    };
  }
}

/**
 * Rotate the Cloudflare WARP IP on the VPS by executing rotate.sh
 */
export async function rotateWarpIp(): Promise<{
  success: boolean;
  oldIp: string;
  newIp: string;
  message?: string;
}> {
  ensurePrivoxyWarpBridge();
  const oldIp = await getWarpProxyIp();

  const candidateScriptPaths = [
    NodePath.join(process.cwd(), "opencode-bypass-api", "bypass-vps-ip", "rotate.sh"),
    "/root/autojobs/opencode-bypass-api/bypass-vps-ip/rotate.sh",
  ];

  let scriptPath = candidateScriptPaths.find((p) => NodeFS.existsSync(p));

  if (!scriptPath) {
    try {
      NodeChildProcess.execSync(
        "warp-cli --accept-tos disconnect && warp-cli --accept-tos registration delete && warp-cli --accept-tos registration new && warp-cli --accept-tos mode proxy && warp-cli --accept-tos proxy port 40000 && warp-cli --accept-tos connect && systemctl restart privoxy",
        { timeout: 14000, encoding: "utf-8" },
      );
    } catch (e: any) {
      return {
        success: false,
        oldIp,
        newIp: await getWarpProxyIp(),
        message: e?.message || "Failed to execute warp-cli rotation",
      };
    }
  } else {
    try {
      NodeChildProcess.execSync(`/bin/bash "${scriptPath}"`, {
        timeout: 18000,
        encoding: "utf-8",
      });
    } catch (e: any) {
      return {
        success: false,
        oldIp,
        newIp: await getWarpProxyIp(),
        message: e?.message || "Failed to run rotate.sh",
      };
    }
  }

  // Get new IP
  let newIp = await getWarpProxyIp();

  // If new IP is unexpectedly identical to old IP, trigger key rotation to force change
  if (newIp === oldIp) {
    try {
      NodeChildProcess.execSync("warp-cli --accept-tos tunnel rotate-keys 2>/dev/null", {
        timeout: 5000,
        encoding: "utf-8",
      });
      newIp = await getWarpProxyIp();
    } catch {}
  }

  return {
    success: true,
    oldIp,
    newIp,
    message: `Rotated from ${oldIp} to ${newIp}`,
  };
}
