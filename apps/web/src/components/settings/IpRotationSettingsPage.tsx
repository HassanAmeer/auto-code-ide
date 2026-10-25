import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  RotateCwIcon,
  ShieldCheckIcon,
  CheckIcon,
  PlayIcon,
  PauseIcon,
  SquareIcon,
  ServerIcon,
  ArrowRightIcon,
  CpuIcon,
  GlobeIcon,
  Loader2Icon,
  NetworkIcon,
  XIcon,
  LayersIcon,
  BotIcon,
  AlertCircleIcon,
} from "lucide-react";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import { SettingsPageContainer } from "./settingsLayout";
import { getCustomProviders, type CustomProvider } from "~/lib/customProviders";

export interface RotatedProviderItem {
  id: string;
  name: string;
  oldIp: string;
  newIp: string;
  rotatedAt: number;
}

interface IpRotationStatusResponse {
  ok: boolean;
  warpStatus: "running" | "paused" | "stopped";
  ip: string;
  port?: string;
  lastIp?: string;
  lastPort?: string;
  isProxied: boolean;
  proxyPort: string;
  socks5Port: string;
  rotatedProviders: RotatedProviderItem[];
}

interface AvailableProviderItem {
  id: string;
  name: string;
  category: "custom" | "builtin";
  typeOrFormat?: string;
  endpoint?: string;
}

// Built-in primary providers
const BUILTIN_PROVIDERS: AvailableProviderItem[] = [
  {
    id: "builtin_opencode_bypass",
    name: "OpenCode Bypass (Free Gate)",
    category: "builtin",
    typeOrFormat: "Cloudflare Reverse Proxy",
    endpoint: "Internal Engine SOCKS5 Bridge",
  },
  {
    id: "builtin_opencode",
    name: "OpenCode Engine (CLI)",
    category: "builtin",
    typeOrFormat: "Local CLI Process",
    endpoint: "http://127.0.0.1:4096",
  },
  {
    id: "builtin_grok",
    name: "Grok AI",
    category: "builtin",
    typeOrFormat: "xAI API",
    endpoint: "api.x.ai",
  },
  {
    id: "builtin_claude",
    name: "Claude AI",
    category: "builtin",
    typeOrFormat: "Anthropic API",
    endpoint: "api.anthropic.com",
  },
  {
    id: "builtin_cursor",
    name: "Cursor Engine",
    category: "builtin",
    typeOrFormat: "Cursor Agent Bridge",
    endpoint: "Internal Dispatcher",
  },
  {
    id: "builtin_muse",
    name: "Muse Code",
    category: "builtin",
    typeOrFormat: "Local LLM Host",
    endpoint: "http://127.0.0.1:8080",
  },
  {
    id: "builtin_pi",
    name: "Pi Agent",
    category: "builtin",
    typeOrFormat: "Pi Orchestrator",
    endpoint: "Internal Gateway",
  },
];

function formatTimeAgo(timestamp: number, now: number): string {
  const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (diffSec < 30) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin === 1) return "1 min ago";
  if (diffMin < 60) return `${diffMin} mins ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours === 1) return "1 hour ago";
  if (diffHours < 24) return `${diffHours} hours ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
}

export function IpRotationSettingsPage() {
  const [warpStatus, setWarpStatus] = useState<"running" | "paused" | "stopped">("stopped");
  const [currentIp, setCurrentIp] = useState<string>("Checking...");
  const [lastIp, setLastIp] = useState<string>("");
  const [port, setPort] = useState<string>("8118");
  const [lastPort, setLastPort] = useState<string>("8118");
  const [isProxied, setIsProxied] = useState<boolean>(false);
  const [proxyPort, setProxyPort] = useState<string>("127.0.0.1:8118");
  const [socks5Port, setSocks5Port] = useState<string>("127.0.0.1:40000");
  const [rotatedProviders, setRotatedProviders] = useState<RotatedProviderItem[]>([]);
  const [customProviders, setCustomProviders] = useState<CustomProvider[]>([]);

  // Selection for Section 2
  const [selectedProviderIds, setSelectedProviderIds] = useState<Set<string>>(new Set());

  // Individual loading states with circular spinners
  const [isCheckingWarp, setIsCheckingWarp] = useState(false);
  const [isStartingWarp, setIsStartingWarp] = useState(false);
  const [isPausingWarp, setIsPausingWarp] = useState(false);
  const [isStoppingWarp, setIsStoppingWarp] = useState(false);
  const [isRotatingIp, setIsRotatingIp] = useState(false);
  const [isAttaching, setIsAttaching] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Live timer tick for relative time updates
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  // Fetch status from backend
  const fetchStatus = useCallback(async (showToast = false) => {
    setIsCheckingWarp(true);
    try {
      const res = await fetch("/api/ip-rotation/status", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as IpRotationStatusResponse;
        setWarpStatus(data.warpStatus || "stopped");
        setCurrentIp(data.ip || "Unknown IP");
        if (data.lastIp) setLastIp(data.lastIp);
        if (data.port) setPort(data.port);
        if (data.lastPort) setLastPort(data.lastPort);
        setIsProxied(Boolean(data.isProxied));
        if (data.proxyPort) setProxyPort(data.proxyPort);
        if (data.socks5Port) setSocks5Port(data.socks5Port);
        if (Array.isArray(data.rotatedProviders)) {
          setRotatedProviders(data.rotatedProviders);
        }
        if (showToast) {
          toastManager.add({
            type:
              data.warpStatus === "running"
                ? "success"
                : data.warpStatus === "paused"
                  ? "warning"
                  : "info",
            title: `WARP is ${data.warpStatus.toUpperCase()}`,
            description: `Active IP: ${data.ip}:${data.port || "8118"} (${data.isProxied ? "Cloudflare WARP Proxied" : "Direct / Paused"})`,
          });
        }
      }
    } catch {
      if (showToast) {
        toastManager.add({
          type: "error",
          title: "Connection Failed",
          description: "Could not retrieve IP rotation status from server.",
        });
      }
    } finally {
      setIsCheckingWarp(false);
    }
  }, []);

  // Load custom providers and initial status on mount
  useEffect(() => {
    setCustomProviders(getCustomProviders());
    void fetchStatus(false);
  }, [fetchStatus]);

  // Combine custom providers and built-in providers
  const allAvailableProviders = useMemo<AvailableProviderItem[]>(() => {
    const customList: AvailableProviderItem[] = customProviders
      .filter((cp) => cp.enabled !== false)
      .map((cp) => ({
        id: cp.id,
        name: cp.name || "Custom Provider",
        category: "custom",
        typeOrFormat: cp.format ? cp.format.toUpperCase() : "Custom",
        endpoint: cp.baseUrl,
      }));

    return [...BUILTIN_PROVIDERS, ...customList];
  }, [customProviders]);

  // Section 2: Providers that are NOT yet rotated in Section 3
  const unrotatedProviders = useMemo(() => {
    const rotatedIds = new Set(rotatedProviders.map((p) => p.id));
    return allAvailableProviders.filter((p) => !rotatedIds.has(p.id));
  }, [allAvailableProviders, rotatedProviders]);

  // Toggle selection in Section 2
  const toggleSelectProvider = (id: string) => {
    setSelectedProviderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllUnrotated = () => {
    if (selectedProviderIds.size === unrotatedProviders.length) {
      setSelectedProviderIds(new Set());
    } else {
      setSelectedProviderIds(new Set(unrotatedProviders.map((p) => p.id)));
    }
  };

  // Section 1: Start / Resume WARP
  const handleStartWarp = async () => {
    setIsStartingWarp(true);
    try {
      const res = await fetch("/api/ip-rotation/start-warp", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      toastManager.add({
        type: data.ok ? "success" : "warning",
        title: "WARP Service Started",
        description: data.message || "Cloudflare WARP starting in background...",
      });
      setTimeout(() => void fetchStatus(false), 2000);
    } catch (err: any) {
      toastManager.add({
        type: "error",
        title: "Start Failed",
        description: err?.message || "Could not start WARP service.",
      });
    } finally {
      setIsStartingWarp(false);
    }
  };

  // Section 1: Pause WARP
  const handlePauseWarp = async () => {
    setIsPausingWarp(true);
    try {
      const res = await fetch("/api/ip-rotation/pause", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        setWarpStatus("paused");
        setIsProxied(false);
        toastManager.add({
          type: "warning",
          title: "WARP Paused",
          description: "WARP proxy tunnel paused. Outbound requests fall back to Direct IP.",
        });
      } else {
        toastManager.add({
          type: "error",
          title: "Pause Failed",
          description: data.message || "Failed to pause WARP.",
        });
      }
    } catch (err: any) {
      toastManager.add({
        type: "error",
        title: "Pause Error",
        description: err?.message || "Network error while pausing.",
      });
    } finally {
      setIsPausingWarp(false);
      void fetchStatus(false);
    }
  };

  // Section 1: Stop WARP completely
  const handleStopWarp = async () => {
    setIsStoppingWarp(true);
    try {
      const res = await fetch("/api/ip-rotation/stop", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        setWarpStatus("stopped");
        setIsProxied(false);
        toastManager.add({
          type: "info",
          title: "WARP Stopped",
          description: "WARP proxy daemon and Privoxy bridge stopped completely.",
        });
      } else {
        toastManager.add({
          type: "error",
          title: "Stop Failed",
          description: data.message || "Failed to stop WARP.",
        });
      }
    } catch (err: any) {
      toastManager.add({
        type: "error",
        title: "Stop Error",
        description: err?.message || "Network error while stopping.",
      });
    } finally {
      setIsStoppingWarp(false);
      void fetchStatus(false);
    }
  };

  // Section 1: Rotate IP now
  const handleRotateIp = async () => {
    setIsRotatingIp(true);
    try {
      const res = await fetch("/api/ip-rotation/rotate", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (data.ok && data.newIp) {
        setLastIp(data.oldIp || currentIp);
        setLastPort(data.port || "8118");
        setCurrentIp(data.newIp);
        setPort(data.port || "8118");
        setWarpStatus("running");
        setIsProxied(true);
        if (Array.isArray(data.rotatedProviders)) {
          setRotatedProviders(data.rotatedProviders);
        }
        toastManager.add({
          type: "success",
          title: "IP Rotated Successfully",
          description: `Shifted from ${data.oldIp}:${data.port || "8118"} ➔ ${data.newIp}:${data.port || "8118"}`,
        });
      } else {
        toastManager.add({
          type: "warning",
          title: "Rotation Notice",
          description: data.message || "Failed to rotate IP.",
        });
      }
    } catch (err: any) {
      toastManager.add({
        type: "error",
        title: "Rotation Error",
        description: err?.message || "Network error while rotating IP.",
      });
    } finally {
      setIsRotatingIp(false);
      void fetchStatus(false);
    }
  };

  // Section 2: Rotate Selected Providers
  const handleRotateSelected = async () => {
    if (selectedProviderIds.size === 0) return;
    setIsAttaching(true);

    const providersToAttach = unrotatedProviders
      .filter((p) => selectedProviderIds.has(p.id))
      .map((p) => ({ id: p.id, name: p.name }));

    try {
      const res = await fetch("/api/ip-rotation/attach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providers: providersToAttach }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok && Array.isArray(data.rotatedProviders)) {
        setRotatedProviders(data.rotatedProviders);
        setSelectedProviderIds(new Set());
        toastManager.add({
          type: "success",
          title: "Providers Attached",
          description: `${providersToAttach.length} provider(s) are now routed through Cloudflare WARP.`,
        });
      } else {
        toastManager.add({
          type: "error",
          title: "Attachment Failed",
          description: "Could not attach selected providers to proxy.",
        });
      }
    } catch (err: any) {
      toastManager.add({
        type: "error",
        title: "Attachment Error",
        description: err?.message || "Could not attach providers.",
      });
    } finally {
      setIsAttaching(false);
    }
  };

  // Section 3: Remove Rotated Provider
  const handleRemoveRotated = async (item: RotatedProviderItem) => {
    setRemovingId(item.id);
    try {
      const res = await fetch("/api/ip-rotation/detach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: item.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok && Array.isArray(data.rotatedProviders)) {
        setRotatedProviders(data.rotatedProviders);
        toastManager.add({
          type: "info",
          title: "Provider Detached",
          description: `Restored direct VPS IP connection for "${item.name}".`,
        });
      } else {
        toastManager.add({
          type: "error",
          title: "Removal Failed",
          description: "Could not detach provider.",
        });
      }
    } catch (err: any) {
      toastManager.add({
        type: "error",
        title: "Error",
        description: err?.message || "Network error while detaching provider.",
      });
    } finally {
      setRemovingId(null);
    }
  };

  const isRunning = warpStatus === "running";
  const isPaused = warpStatus === "paused";
  const isStopped = warpStatus === "stopped";

  return (
    <SettingsPageContainer width="wide" className="space-y-4 pb-12 font-sans antialiased">
      {/* ─────────────────────────────────────────────────────────────────
          SECTION 1: Cloudflare WARP Controller & Background Status
         ───────────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-card/75 p-3 shadow-sm backdrop-blur-md transition-all sm:p-4">
        {/* Header */}
        <div className="flex flex-col gap-1 border-b border-border/30 pb-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <NetworkIcon
                className={`size-4 ${
                  isRunning ? "text-emerald-500" : isPaused ? "text-amber-500" : "text-rose-500"
                }`}
              />
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                Cloudflare WARP Tunnel & Proxy Engine
              </h2>
            </div>
            <p className="text-[11px] leading-tight text-muted-foreground">
              Bypasses 429 rate limits by routing outgoing traffic through Cloudflare Anycast
              residential network.
            </p>
          </div>

          <div className="flex items-center gap-1.5 self-start pt-1 sm:self-auto sm:pt-0">
            {/* Status Pill */}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-all ${
                isRunning
                  ? "border border-emerald-500/25 bg-emerald-500/10 text-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.25)]"
                  : isPaused
                    ? "border border-amber-500/25 bg-amber-500/10 text-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.25)]"
                    : "border border-rose-500/25 bg-rose-500/10 text-rose-500"
              }`}
            >
              <span
                className={`size-2 rounded-full ${
                  isRunning
                    ? "animate-pulse bg-emerald-500"
                    : isPaused
                      ? "bg-amber-500"
                      : "bg-rose-500"
                }`}
              />
              {isRunning ? "Running" : isPaused ? "Paused" : "Stopped"}
            </span>
          </div>
        </div>

        {/* Status Details & Actions Row */}
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* IP & Port Badges (Last IP in Gray, New IP in Green or Orange when Paused) */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Last IP (Gray badge) */}
            {lastIp && (
              <div className="flex items-center gap-1 rounded-lg border border-border/40 bg-muted/40 px-2 py-1 text-xs">
                <span className="text-[10px] uppercase font-semibold text-muted-foreground/70">
                  Last IP:
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {lastIp}:{lastPort || "8118"}
                </span>
              </div>
            )}

            {/* Current Active IP Badge */}
            <div
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-all ${
                isRunning
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                  : isPaused
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
                    : "border-border/40 bg-muted/30 text-muted-foreground"
              }`}
            >
              <ServerIcon className="size-3.5 shrink-0 opacity-80" />
              <span className="text-[10px] uppercase font-bold tracking-wider opacity-75">
                {isRunning ? "Active IP:" : isPaused ? "Paused IP:" : "Direct IP:"}
              </span>
              <span className="font-mono text-[11px] font-bold">
                {currentIp}:{port || "8118"}
              </span>
              <span
                className={`ml-1 rounded px-1.5 py-0.2 text-[9px] font-bold uppercase ${
                  isRunning
                    ? "bg-emerald-500/20 text-emerald-500"
                    : isPaused
                      ? "bg-amber-500/20 text-amber-500"
                      : "bg-rose-500/20 text-rose-500"
                }`}
              >
                {isRunning ? "WARP" : isPaused ? "Paused" : "Direct"}
              </span>
            </div>

            <span className="font-mono text-[10px] text-muted-foreground/70">
              Bridge: {proxyPort} ➔ {socks5Port}
            </span>
          </div>

          {/* Action buttons with circular spinners */}
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Check Status */}
            <Button
              variant="outline"
              size="xs"
              onClick={() => void fetchStatus(true)}
              disabled={isCheckingWarp}
              className="h-7 rounded-lg border-border/50 px-2.5 text-[11px] transition-all hover:bg-muted/70 active:scale-95"
            >
              {isCheckingWarp ? (
                <Loader2Icon className="mr-1 size-3 animate-spin text-muted-foreground" />
              ) : (
                <RotateCwIcon className="mr-1 size-3 text-muted-foreground" />
              )}
              Check Status
            </Button>

            {/* Start / Resume */}
            {(isStopped || isPaused) && (
              <Button
                variant="default"
                size="xs"
                onClick={() => void handleStartWarp()}
                disabled={isStartingWarp}
                className="h-7 rounded-lg bg-emerald-600 px-2.5 text-[11px] font-medium text-white shadow-sm hover:bg-emerald-500 active:scale-95"
              >
                {isStartingWarp ? (
                  <Loader2Icon className="mr-1 size-3 animate-spin text-white" />
                ) : (
                  <PlayIcon className="mr-1 size-3 fill-current" />
                )}
                {isPaused ? "Resume WARP" : "Start in Background"}
              </Button>
            )}

            {/* Pause (Active when running) */}
            {isRunning && (
              <Button
                variant="outline"
                size="xs"
                onClick={() => void handlePauseWarp()}
                disabled={isPausingWarp}
                className="h-7 rounded-lg border-amber-500/30 text-amber-500 px-2.5 text-[11px] font-medium hover:bg-amber-500/10 active:scale-95"
              >
                {isPausingWarp ? (
                  <Loader2Icon className="mr-1 size-3 animate-spin text-amber-500" />
                ) : (
                  <PauseIcon className="mr-1 size-3" />
                )}
                Pause
              </Button>
            )}

            {/* Stop (Active when running or paused) */}
            {!isStopped && (
              <Button
                variant="outline"
                size="xs"
                onClick={() => void handleStopWarp()}
                disabled={isStoppingWarp}
                className="h-7 rounded-lg border-rose-500/30 text-rose-500 px-2 text-[11px] font-medium hover:bg-rose-500/10 active:scale-95"
              >
                {isStoppingWarp ? (
                  <Loader2Icon className="mr-1 size-3 animate-spin text-rose-500" />
                ) : (
                  <SquareIcon className="mr-1 size-3 fill-current" />
                )}
                Stop
              </Button>
            )}

            {/* Rotate IP Now */}
            <Button
              variant="secondary"
              size="xs"
              onClick={() => void handleRotateIp()}
              disabled={isRotatingIp}
              className="h-7 rounded-lg border border-border/40 px-2.5 text-[11px] font-medium transition-all hover:bg-muted/80 active:scale-95"
            >
              {isRotatingIp ? (
                <Loader2Icon className="mr-1 size-3 animate-spin text-emerald-500" />
              ) : (
                <RotateCwIcon className="mr-1 size-3 text-emerald-500" />
              )}
              Rotate IP Now
            </Button>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────
          SECTION 2: Available Enabled Providers (Selection to Rotate)
         ───────────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-card/75 p-3 shadow-sm backdrop-blur-md transition-all sm:p-4">
        {/* Section Header */}
        <div className="flex flex-col gap-1 border-b border-border/30 pb-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <LayersIcon className="size-4 text-sky-500" />
              <h3 className="text-sm font-semibold tracking-tight text-foreground">
                Select Providers for IP Rotation
              </h3>
            </div>
            <p className="text-[11px] leading-tight text-muted-foreground">
              Choose which active providers should have their outbound AI requests routed through
              the Cloudflare WARP rotated IP.
            </p>
          </div>

          {unrotatedProviders.length > 0 && (
            <div className="flex items-center gap-2 pt-1 sm:pt-0">
              <Button
                variant="ghost"
                size="xs"
                onClick={selectAllUnrotated}
                className="h-6 text-[11px] text-muted-foreground hover:text-foreground"
              >
                {selectedProviderIds.size === unrotatedProviders.length
                  ? "Deselect All"
                  : "Select All"}
              </Button>

              <Button
                variant="default"
                size="xs"
                onClick={() => void handleRotateSelected()}
                disabled={selectedProviderIds.size === 0 || isAttaching}
                className="h-7 rounded-lg bg-primary px-3 text-[11px] font-medium text-primary-foreground shadow-sm transition-all active:scale-95 disabled:opacity-40"
              >
                {isAttaching ? (
                  <Loader2Icon className="mr-1.5 size-3 animate-spin" />
                ) : (
                  <ShieldCheckIcon className="mr-1.5 size-3" />
                )}
                Rotate {selectedProviderIds.size > 0 ? `(${selectedProviderIds.size})` : ""}{" "}
                Selected
              </Button>
            </div>
          )}
        </div>

        {/* Provider List */}
        <div className="mt-3">
          {unrotatedProviders.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/50 py-6 text-center">
              <ShieldCheckIcon className="size-6 text-emerald-500/70" />
              <p className="mt-1.5 text-xs font-medium text-foreground">
                All Available Providers Are Currently Rotated
              </p>
              <p className="text-[11px] text-muted-foreground">
                All configured active providers are currently shielded and routed through Cloudflare
                WARP below.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {unrotatedProviders.map((provider) => {
                const isSelected = selectedProviderIds.has(provider.id);
                return (
                  <div
                    key={provider.id}
                    onClick={() => toggleSelectProvider(provider.id)}
                    className={`group relative flex cursor-pointer items-center justify-between rounded-xl border p-2 transition-all select-none ${
                      isSelected
                        ? "border-sky-500/40 bg-sky-500/5 shadow-xs"
                        : "border-border/40 bg-background/50 hover:border-border/80 hover:bg-muted/30"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {/* iOS Circular Checkbox */}
                      <div
                        className={`flex size-4.5 shrink-0 items-center justify-center rounded-full border transition-all ${
                          isSelected
                            ? "border-sky-500 bg-sky-500 text-white shadow-xs"
                            : "border-border/70 bg-card group-hover:border-foreground/40"
                        }`}
                      >
                        {isSelected && <CheckIcon className="size-3 stroke-[3]" />}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          {provider.category === "builtin" ? (
                            <BotIcon className="size-3.5 shrink-0 text-sky-400" />
                          ) : (
                            <CpuIcon className="size-3.5 shrink-0 text-amber-400" />
                          )}
                          <span className="truncate text-xs font-medium text-foreground">
                            {provider.name}
                          </span>
                        </div>
                        {provider.endpoint && (
                          <p className="truncate font-mono text-[10px] text-muted-foreground/80">
                            {provider.endpoint}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="ml-2 flex shrink-0 items-center">
                      <span className="rounded-md border border-border/30 bg-muted/30 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                        Direct VPS IP
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────
          SECTION 3: Active Rotated Providers (History & Management)
         ───────────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-card/75 p-3 shadow-sm backdrop-blur-md transition-all sm:p-4">
        {/* Section Header */}
        <div className="flex flex-col gap-1 border-b border-border/30 pb-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <ShieldCheckIcon
                className={`size-4 ${
                  isRunning ? "text-emerald-500" : isPaused ? "text-amber-500" : "text-rose-500"
                }`}
              />
              <h3 className="text-sm font-semibold tracking-tight text-foreground">
                Active Rotated Providers
              </h3>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-semibold ${
                  isRunning
                    ? "bg-emerald-500/10 text-emerald-500"
                    : isPaused
                      ? "bg-amber-500/10 text-amber-500"
                      : "bg-rose-500/10 text-rose-500"
                }`}
              >
                {rotatedProviders.length} Active
              </span>
            </div>
            <p className="text-[11px] leading-tight text-muted-foreground">
              These providers are currently routing through Cloudflare WARP. Click
              &apos;Remove&apos; anytime to restore direct connection.
            </p>
          </div>
        </div>

        {/* Rotated List */}
        <div className="mt-3">
          {rotatedProviders.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/50 py-8 text-center">
              <GlobeIcon className="size-7 text-muted-foreground/40" />
              <p className="mt-1.5 text-xs font-medium text-muted-foreground">
                No Providers Currently Rotated
              </p>
              <p className="text-[11px] text-muted-foreground/80">
                Select active providers in Section 2 above to shield them with Cloudflare WARP IP
                rotation.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {rotatedProviders.map((item) => {
                const isRemoving = removingId === item.id;
                return (
                  <div
                    key={item.id}
                    className={`flex flex-col gap-2 rounded-xl border p-2.5 transition-all sm:flex-row sm:items-center sm:justify-between ${
                      isPaused
                        ? "border-amber-500/25 bg-amber-500/5"
                        : "border-border/40 bg-background/60"
                    }`}
                  >
                    {/* Provider info & Tag */}
                    <div className="flex min-w-0 items-center gap-2">
                      <div
                        className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${
                          isPaused
                            ? "bg-amber-500/15 text-amber-500"
                            : "bg-emerald-500/10 text-emerald-500"
                        }`}
                      >
                        <ShieldCheckIcon className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-xs font-semibold text-foreground">
                            {item.name}
                          </span>
                          <span
                            className={`rounded px-1.5 py-0.2 text-[9px] font-bold uppercase ${
                              isPaused
                                ? "bg-amber-500/20 text-amber-500 border border-amber-500/30"
                                : "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                            }`}
                          >
                            {isPaused ? "Paused" : "WARP Routed"}
                          </span>
                        </div>

                        {/* Relative Timestamp */}
                        <p className="text-[10px] text-muted-foreground">
                          Shifted {formatTimeAgo(item.rotatedAt, now)}
                        </p>
                      </div>
                    </div>

                    {/* IP Shift Indicator & Remove Action */}
                    <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
                      {/* IP Shift Pill: Old IP in Muted Gray, New IP in Green (or Orange if paused) */}
                      <div className="flex items-center gap-1 rounded-lg border border-border/50 bg-muted/40 px-2 py-0.5 font-mono text-[11px]">
                        <span className="text-muted-foreground">
                          {item.oldIp ? `${item.oldIp}:8118` : "Direct"}
                        </span>
                        <ArrowRightIcon
                          className={`size-3 ${isPaused ? "text-amber-500" : "text-emerald-500"}`}
                        />
                        <span
                          className={`font-bold ${
                            isPaused ? "text-amber-500" : "text-emerald-500"
                          }`}
                        >
                          {item.newIp || currentIp}:8118
                        </span>
                      </div>

                      {/* Remove Button */}
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => void handleRemoveRotated(item)}
                        disabled={isRemoving}
                        className="h-6.5 rounded-lg border-rose-500/30 text-[11px] font-medium text-rose-500 transition-all hover:bg-rose-500/10 active:scale-95"
                      >
                        {isRemoving ? (
                          <Loader2Icon className="mr-1 size-3 animate-spin text-rose-500" />
                        ) : (
                          <XIcon className="mr-1 size-3" />
                        )}
                        Remove
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </SettingsPageContainer>
  );
}
