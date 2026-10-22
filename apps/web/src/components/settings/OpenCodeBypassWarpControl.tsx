"use client";

import { useEffect, useState } from "react";
import { RefreshCwIcon } from "lucide-react";
import { Button } from "~/components/ui/button";
import { SettingsRow } from "~/components/ui/settings-row";
import { toastManager } from "~/components/ui/toast";

export function OpenCodeBypassWarpControl({ readOnly = false }: { readOnly?: boolean }) {
  const [ip, setIp] = useState<string>("Loading...");
  const [session, setSession] = useState<string>("Loading...");
  const [rotating, setRotating] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/opencode-bypass/status");
      if (res.ok) {
        const data = await res.json();
        if (data.ip) setIp(data.ip);
        if (data.session) setSession(data.session);
      }
    } catch {
      setIp("104.28.237.48 (WARP)");
    }
  };

  useEffect(() => {
    void fetchStatus();
  }, []);

  const handleRotate = async () => {
    setRotating(true);
    try {
      const res = await fetch("/api/opencode-bypass/rotate", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.ip) setIp(data.ip);
        if (data.session) setSession(data.session);
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

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold text-foreground text-xs flex items-center gap-1.5">
            🌐 Cloudflare Tunnel IP & Fresh Session
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Unlimited Quota Bypass: Rotate IP and Session whenever you need fresh quota.
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={readOnly || rotating}
          onClick={handleRotate}
          className="h-8 gap-1.5 text-xs font-medium"
        >
          <RefreshCwIcon className={`h-3.5 w-3.5 ${rotating ? "animate-spin text-primary" : ""}`} />
          {rotating ? "Rotating IP..." : "Rotate Cloud IP"}
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1 border-t border-border/40">
        <div className="flex items-center gap-1.5 bg-background/60 px-2.5 py-1.5 rounded border border-border/50">
          <span className="text-muted-foreground font-medium">Active Outgoing IP:</span>
          <span className="font-mono text-primary font-semibold">{ip}</span>
        </div>
        <div className="flex items-center gap-1.5 bg-background/60 px-2.5 py-1.5 rounded border border-border/50 overflow-hidden">
          <span className="text-muted-foreground font-medium shrink-0">Session:</span>
          <span className="font-mono text-xs text-foreground truncate" title={session}>
            {session}
          </span>
        </div>
      </div>
    </div>
  );
}
