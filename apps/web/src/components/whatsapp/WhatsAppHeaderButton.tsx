import React, { useState, useEffect } from "react";
import { MessageCircle } from "lucide-react";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { WhatsAppSheet } from "./WhatsAppSheet";

export function WhatsAppHeaderButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let unmounted = false;
    const checkStatus = async () => {
      try {
        const [setRes, sessRes] = await Promise.all([
          fetch("/api/whatsapp/settings"),
          fetch("/api/whatsapp/sessions"),
        ]);
        if (unmounted) return;
        if (setRes.ok && sessRes.ok) {
          const setData = await setRes.json();
          const sessData = await sessRes.json();
          const activeId = setData.settings?.activeSessionId;
          setActiveSession(activeId);
          const sessions = sessData.sessions || [];
          const active = sessions.find((s: any) => s.id === activeId);
          setIsConnected(active?.status === "CONNECTED" || active?.status === "AUTHENTICATED");
        }
      } catch {
        // ignore offline
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 15000);
    return () => {
      unmounted = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="group/wa relative inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-zinc-900/80 text-zinc-300 shadow-sm transition-all hover:border-emerald-500/40 hover:bg-emerald-950/20 hover:text-emerald-400 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500"
              aria-label="Open WhatsApp Gateway Manager"
            />
          }
        >
          <MessageCircle className="size-3.5 text-emerald-400 transition-transform group-hover/wa:scale-110 drop-shadow-[0_0_4px_rgba(52,211,153,0.4)]" />
          {isConnected && (
            <span className="absolute -top-0.5 -right-0.5 flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
          )}
        </TooltipTrigger>
        <TooltipPopup side="bottom">
          {activeSession
            ? `WhatsApp: ${activeSession} (${isConnected ? "Connected" : "Setup needed"})`
            : "WhatsApp Manager (Click to connect)"}
        </TooltipPopup>
      </Tooltip>

      <WhatsAppSheet isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
