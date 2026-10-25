/**
 * Programmatic OpenCode Limit Reset Utility
 *
 * Runs canonical session minting, proxy health checks, and smoke tests
 * from Node.js / TypeScript.
 */

import { execSync } from "node:child_process";

export interface ResetResult {
  ok: boolean;
  sessionId: string;
  egressIp: string;
  proxyActive: boolean;
  modelsTested: Record<string, boolean>;
  timestamp: number;
}

export function mintCanonicalSession(): string {
  const ts = BigInt(Date.now());
  const counter = BigInt(Math.floor(Math.random() * 62) + 1);
  const raw = ~((ts << 12n) | counter) & 0xffffffffffffn;
  const timePart = raw.toString(16).padStart(12, "0");
  const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let rand = "";
  for (let i = 0; i < 14; i++) {
    rand += BASE62[Math.floor(Math.random() * BASE62.length)];
  }
  return `ses_${timePart}${rand}`;
}

export async function getEgressIp(proxyUrl = "http://127.0.0.1:8118"): Promise<string> {
  try {
    const ip = execSync(`curl -s -x ${proxyUrl} --max-time 5 https://api.ipify.org 2>/dev/null`, {
      encoding: "utf-8",
    }).trim();
    if (ip && ip.length >= 7 && ip.length <= 45) {
      return ip;
    }
  } catch {}
  return "UNKNOWN";
}

export async function executeLimitReset(): Promise<ResetResult> {
  const sessionId = mintCanonicalSession();
  const egressIp = await getEgressIp();
  const proxyActive = egressIp !== "UNKNOWN";

  const modelsTested: Record<string, boolean> = {};

  // Smoke test deepseek on daemon port 4099 if available
  try {
    const sessionRes = execSync(
      `curl -s -u opencode:autocode123 -X POST "http://127.0.0.1:4099/api/session" -H "Content-Type: application/json" -d '{"model":{"id":"deepseek-v4.1-flash-free","providerID":"opencode"}}' 2>/dev/null`,
      { encoding: "utf-8" },
    );
    const parsed = JSON.parse(sessionRes);
    modelsTested["deepseek-v4.1-flash-free"] = Boolean(parsed?.data?.id);
  } catch {
    modelsTested["deepseek-v4.1-flash-free"] = false;
  }

  return {
    ok: proxyActive,
    sessionId,
    egressIp,
    proxyActive,
    modelsTested,
    timestamp: Date.now(),
  };
}

if (process.argv[1] && process.argv[1].endsWith("reset.ts")) {
  executeLimitReset().then((res) => {
    console.log(JSON.stringify(res, null, 2));
  });
}
