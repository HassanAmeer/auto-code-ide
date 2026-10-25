// @effect-diagnostics nodeBuiltinImport:off globalConsole:off globalConsoleInEffect:off globalDate:off globalDateInEffect:off globalRandomInEffect:off globalErrorInEffectFailure:off preferSchemaOverJson:off globalFetchInEffect:off anyUnknownInErrorContext:off globalFetch:off globalTimers:off
/**
 * IP Rotation State & Provider Management Store
 *
 * Yeh module Cloudflare WARP proxy ke sath attached providers ki state,
 * IP shift history (Old IP -> New IP), relative timestamps, aur pause/stop
 * state ko persist karta hai.
 */

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import {
  getWarpDetailedStatus,
  rotateWarpIp,
  getDirectIp,
  getWarpProxyIp,
  startWarpBackground,
  pauseWarp,
  stopWarp,
  isWarpProxyAvailable,
} from "./proxy.ts";

export interface RotatedProviderRecord {
  id: string;
  name: string;
  oldIp: string;
  newIp: string;
  rotatedAt: number; // timestamp in milliseconds
}

interface IpRotationStore {
  rotatedProviders: RotatedProviderRecord[];
  lastIp?: string;
  currentIp?: string;
}

function getStoreFilePath(): string {
  const candidateDirs = [
    NodePath.join(process.cwd(), "data"),
    NodePath.join(process.cwd(), "opencode-bypass-api", "data"),
    "/root/autojobs/data",
    "/tmp",
  ];
  for (const dir of candidateDirs) {
    try {
      if (!NodeFS.existsSync(dir)) {
        NodeFS.mkdirSync(dir, { recursive: true });
      }
      return NodePath.join(dir, "ip-rotation-state.json");
    } catch {}
  }
  return NodePath.join(process.cwd(), "ip-rotation-state.json");
}

let _inMemoryStore: IpRotationStore | null = null;

function loadStore(): IpRotationStore {
  if (_inMemoryStore) return _inMemoryStore;
  try {
    const file = getStoreFilePath();
    if (NodeFS.existsSync(file)) {
      const raw = NodeFS.readFileSync(file, "utf-8");
      const data = JSON.parse(raw);
      if (Array.isArray(data?.rotatedProviders)) {
        _inMemoryStore = {
          rotatedProviders: data.rotatedProviders,
          lastIp: data.lastIp,
          currentIp: data.currentIp,
        };
        return _inMemoryStore;
      }
    }
  } catch {}
  _inMemoryStore = { rotatedProviders: [] };
  return _inMemoryStore;
}

function saveStore(store: IpRotationStore): void {
  _inMemoryStore = store;
  try {
    const file = getStoreFilePath();
    NodeFS.writeFileSync(file, JSON.stringify(store, null, 2), "utf-8");
  } catch {}
}

export async function getIpRotationStatus() {
  const warpInfo = await getWarpDetailedStatus();
  const store = loadStore();

  const directIp = warpInfo.isProxied ? store.lastIp || "201.18.218.29" : warpInfo.ip;
  const activeWarpIp = warpInfo.isProxied ? warpInfo.ip : store.currentIp || warpInfo.ip;

  return {
    ok: true,
    warpStatus: warpInfo.warpStatus, // "running" | "paused" | "stopped"
    ip: warpInfo.ip,
    port: "8118",
    lastIp: store.lastIp || (warpInfo.isProxied ? "201.18.218.29" : ""),
    lastPort: "8118",
    isProxied: warpInfo.isProxied,
    proxyPort: "127.0.0.1:8118",
    socks5Port: "127.0.0.1:40000",
    rotatedProviders: store.rotatedProviders,
  };
}

export async function rotateAllIpRotation() {
  const store = loadStore();
  const result = await rotateWarpIp();
  const now = Date.now();

  store.lastIp = result.oldIp;
  store.currentIp = result.newIp;

  // Update all currently rotated providers with previous IP and new IP
  store.rotatedProviders = store.rotatedProviders.map((p) => ({
    ...p,
    oldIp: p.newIp || result.oldIp,
    newIp: result.newIp,
    rotatedAt: now,
  }));
  saveStore(store);

  return {
    ok: true,
    success: result.success,
    oldIp: result.oldIp,
    newIp: result.newIp,
    port: "8118",
    rotatedAt: now,
    message: result.message || "Cloudflare WARP IP rotated successfully",
    rotatedProviders: store.rotatedProviders,
  };
}

export async function attachProvidersToIpRotation(providers: Array<{ id: string; name: string }>) {
  const store = loadStore();
  const warpInfo = await getWarpDetailedStatus();
  const directIp = await getDirectIp();
  const currentWarpIp = warpInfo.isProxied ? warpInfo.ip : await getWarpProxyIp();
  const now = Date.now();

  for (const prov of providers) {
    const existingIndex = store.rotatedProviders.findIndex((p) => p.id === prov.id);
    if (existingIndex >= 0) {
      store.rotatedProviders[existingIndex] = {
        ...store.rotatedProviders[existingIndex]!,
        name: prov.name || store.rotatedProviders[existingIndex]!.name,
        newIp: currentWarpIp,
        rotatedAt: now,
      };
    } else {
      store.rotatedProviders.push({
        id: prov.id,
        name: prov.name || prov.id,
        oldIp: directIp,
        newIp: currentWarpIp,
        rotatedAt: now,
      });
    }
  }

  saveStore(store);
  return {
    ok: true,
    rotatedProviders: store.rotatedProviders,
  };
}

export async function detachProviderFromIpRotation(providerId: string) {
  const store = loadStore();
  store.rotatedProviders = store.rotatedProviders.filter((p) => p.id !== providerId);
  saveStore(store);
  return {
    ok: true,
    rotatedProviders: store.rotatedProviders,
  };
}

export { startWarpBackground, pauseWarp, stopWarp, isWarpProxyAvailable };
