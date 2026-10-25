"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2Icon,
  CopyIcon,
  GlobeIcon,
  KeyIcon,
  PlayIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { toastManager } from "~/components/ui/toast";
import { cn } from "~/lib/utils";

export function OpenCodeBypassWarpControl({ readOnly = false }: { readOnly?: boolean }) {
  const [warpStatus, setWarpStatus] = useState<"running" | "stopped" | "checking">("checking");
  const [ip, setIp] = useState<string>("Loading...");
  const [isProxied, setIsProxied] = useState<boolean>(true);
  const [session, setSession] = useState<string>("Loading...");
  const [sessionValid, setSessionValid] = useState<boolean>(true);

  // Micro-interaction loading states
  const [checkingWarp, setCheckingWarp] = useState<boolean>(false);
  const [startingWarp, setStartingWarp] = useState<boolean>(false);
  const [rotating, setRotating] = useState<boolean>(false);
  const [checkingSession, setCheckingSession] = useState<boolean>(false);
  const [clearingSession, setClearingSession] = useState<boolean>(false);
  const [copiedSession, setCopiedSession] = useState<boolean>(false);

  const fetchStatus = async (notify = false) => {
    try {
      const res = await fetch("/api/opencode-bypass/status");
      if (res.ok) {
        const data = await res.json();
        const status = data.warpStatus === "running" ? "running" : "stopped";
        setWarpStatus(status);
        if (data.ip) setIp(data.ip);
        setIsProxied(Boolean(data.isProxied));
        if (data.session) setSession(data.session);
        setSessionValid(Boolean(data.sessionValid));

        if (notify) {
          if (status === "running") {
            toastManager.add({
              type: "success",
              title: "Cloudflare WARP Active",
              description: `Proxy port 8118 is healthy. Outgoing IP: ${data.ip}`,
            });
          } else {
            toastManager.add({
              type: "warning",
              title: "WARP Not Running",
              description: `Local proxy is stopped. Direct host IP: ${data.ip}`,
            });
          }
        }
      }
    } catch {
      setWarpStatus("stopped");
      setIp("104.28.237.48 (Fallback)");
      setIsProxied(false);
    }
  };

  useEffect(() => {
    void fetchStatus(false);
  }, []);

  const handleCheckWarp = async () => {
    setCheckingWarp(true);
    try {
      await fetchStatus(true);
    } finally {
      setCheckingWarp(false);
    }
  };

  const handleStartBackground = async () => {
    setStartingWarp(true);
    try {
      const res = await fetch("/api/opencode-bypass/start-warp", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      toastManager.add({
        type: data.ok ? "success" : "warning",
        title: "Starting Background Service",
        description: data.message || "Executing WARP connect & Privoxy restart...",
      });
      // Re-probe status after 2 seconds
      setTimeout(() => {
        void fetchStatus(false);
      }, 2500);
    } catch (err: any) {
      toastManager.add({
        type: "error",
        title: "Launch Error",
        description: err?.message || "Failed to start WARP background process.",
      });
    } finally {
      setStartingWarp(false);
    }
  };

  const handleRotate = async () => {
    setRotating(true);
    try {
      const res = await fetch("/api/opencode-bypass/rotate", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.ip) setIp(data.ip);
        if (data.session) setSession(data.session);
        setWarpStatus("running");
        setIsProxied(true);
        setSessionValid(Boolean(data.sessionValid));
        toastManager.add({
          type: "success",
          title: "Cloud IP & Session Rotated",
          description: `Fresh IP: ${data.ip} | Session: ${data.session?.slice(0, 16)}...`,
        });
      } else {
        toastManager.add({
          type: "error",
          title: "Rotation Error",
          description: "Failed to rotate IP via Cloudflare WARP.",
        });
      }
    } catch (err: any) {
      toastManager.add({
        type: "error",
        title: "Network Error",
        description: err?.message || "Could not reach rotation service.",
      });
    } finally {
      setRotating(false);
    }
  };

  const handleCheckSession = async () => {
    setCheckingSession(true);
    try {
      const res = await fetch("/api/opencode-bypass/session/check", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setSessionValid(Boolean(data.sessionValid));
        if (data.session) setSession(data.session);
        if (data.sessionValid) {
          toastManager.add({
            type: "success",
            title: "Session Valid",
            description: "Session ID conforms to descending canonical layout.",
          });
        } else {
          toastManager.add({
            type: "warning",
            title: "Session Invalid",
            description: "Session token format is non-canonical. Click 'Clear & Mint' to reset.",
          });
        }
      }
    } catch (err: any) {
      toastManager.add({
        type: "error",
        title: "Check Failed",
        description: err?.message || "Could not validate session.",
      });
    } finally {
      setCheckingSession(false);
    }
  };

  const handleClearAndMintSession = async () => {
    setClearingSession(true);
    try {
      const res = await fetch("/api/opencode-bypass/session/clear", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.session) setSession(data.session);
        setSessionValid(true);
        toastManager.add({
          type: "success",
          title: "Fresh Session Generated",
          description: `New Session: ${data.session?.slice(0, 20)}...`,
        });
      }
    } catch (err: any) {
      toastManager.add({
        type: "error",
        title: "Reset Failed",
        description: err?.message || "Could not mint new session.",
      });
    } finally {
      setClearingSession(false);
    }
  };

  const handleCopySession = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(session);
    setCopiedSession(true);
    setTimeout(() => setCopiedSession(false), 2000);
  };

  const isWarpRunning = warpStatus === "running";

  return (
    <div className="rounded-xl border border-border/60 bg-card/90 backdrop-blur-md p-2.5 shadow-xs space-y-2 select-none">
      {/* Top Row: WARP Engine Control */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Left: iOS Status Pill & Active Outgoing IP */}
        <div className="flex items-center gap-2 min-w-0">
          {/* iOS Status Pill */}
          <div
            className={cn(
              "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors shrink-0",
              isWarpRunning
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25"
                : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25",
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full shrink-0",
                isWarpRunning
                  ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse"
                  : "bg-rose-500",
              )}
            />
            <span>{isWarpRunning ? "Running" : "Stopped"}</span>
          </div>

          {/* Outgoing IP with Tag */}
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[11px] text-muted-foreground font-medium hidden sm:inline">
              IP:
            </span>
            <span
              className="font-mono text-xs font-semibold text-foreground truncate max-w-[150px] sm:max-w-[200px]"
              title={ip}
            >
              {ip}
            </span>
            <span
              className={cn(
                "font-mono text-[9px] font-bold px-1 py-0.2 rounded border uppercase shrink-0",
                isProxied
                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-500 border-amber-500/20",
              )}
            >
              {isProxied ? "WARP" : "Direct"}
            </span>
          </div>
        </div>

        {/* Right: WARP Action Buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={readOnly || checkingWarp}
            onClick={handleCheckWarp}
            className="h-6 px-2 gap-1 text-[10px] font-medium rounded-lg shadow-none"
            title="Probe local port 8118 and verify whether outgoing IP is proxied"
          >
            <SearchIcon className={cn("size-3", checkingWarp && "animate-spin text-primary")} />
            <span>{checkingWarp ? "Checking..." : "Check WARP"}</span>
          </Button>

          {!isWarpRunning ? (
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={readOnly || startingWarp}
              onClick={handleStartBackground}
              className="h-6 px-2 gap-1 text-[10px] font-medium rounded-lg shadow-none border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary"
              title="Launch Cloudflare WARP and Privoxy service in the background"
            >
              <PlayIcon className={cn("size-3", startingWarp && "animate-spin text-primary")} />
              <span>{startingWarp ? "Starting..." : "Start in Background"}</span>
            </Button>
          ) : null}

          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={readOnly || rotating}
            onClick={handleRotate}
            className="h-6 px-2 gap-1 text-[10px] font-medium rounded-lg shadow-none hover:border-primary/40 hover:text-primary transition-colors"
            title="Rotate to a fresh Cloudflare Tunnel IP and reset quota"
          >
            <RefreshCwIcon className={cn("size-3", rotating && "animate-spin text-primary")} />
            <span>{rotating ? "Rotating..." : "Rotate IP"}</span>
          </Button>
        </div>
      </div>

      {/* Thin iOS Divider */}
      <div className="h-px w-full bg-border/40" />

      {/* Bottom Row: Session ID Gate */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Left: Active Session ID badge & Canonical validity */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] text-muted-foreground font-medium shrink-0 flex items-center gap-1">
            <KeyIcon className="size-3 text-muted-foreground/70" />
            <span className="hidden sm:inline">Session:</span>
          </span>

          {/* Session Token Badge (Click to copy) */}
          <div
            onClick={handleCopySession}
            className="group/ses flex items-center gap-1 font-mono text-[10px] text-foreground bg-muted/40 hover:bg-muted/70 px-1.5 py-0.5 rounded border border-border/50 cursor-pointer transition-colors max-w-[160px] sm:max-w-[210px] truncate"
            title={`Click to copy: ${session}`}
          >
            <span className="truncate">{session}</span>
            <CopyIcon className="size-2.5 opacity-60 group-hover/ses:opacity-100 shrink-0" />
          </div>

          {/* Validity Badge */}
          <span
            className={cn(
              "font-mono text-[9px] font-semibold px-1 py-0.2 rounded border shrink-0",
              sessionValid
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
            )}
            title={
              sessionValid
                ? "Session conforms to descending canonical layout required by free gate"
                : "Session is non-canonical"
            }
          >
            {sessionValid ? "✓ Valid Canonical" : "✕ Invalid"}
          </span>

          {copiedSession ? (
            <span className="text-[9px] font-medium text-emerald-500 animate-in fade-in shrink-0">
              Copied!
            </span>
          ) : null}
        </div>

        {/* Right: Session Action Buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={readOnly || checkingSession}
            onClick={handleCheckSession}
            className="h-6 px-2 gap-1 text-[10px] font-medium rounded-lg shadow-none"
            title="Check if the active session ID conforms to canonical format"
          >
            <CheckCircle2Icon
              className={cn("size-3", checkingSession && "animate-spin text-primary")}
            />
            <span>{checkingSession ? "Checking..." : "Check Session"}</span>
          </Button>

          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={readOnly || clearingSession}
            onClick={handleClearAndMintSession}
            className="h-6 px-2 gap-1 text-[10px] font-medium rounded-lg shadow-none border-primary/30 text-primary hover:bg-primary/10"
            title="Clear current session and mint a fresh canonical descending session token"
          >
            <SparklesIcon className={cn("size-3", clearingSession && "animate-spin")} />
            <span>{clearingSession ? "Minting..." : "Clear & New Session"}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
