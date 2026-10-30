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
          setIsConnected(
            active?.status === "CONNECTED" ||
              active?.status === "AUTHENTICATED" ||
              active?.status === "ready",
          );
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
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="group/wa relative inline-flex items-center justify-center size-8 sm:size-7 shrink-0 cursor-pointer rounded-lg border border-emerald-500/30 bg-emerald-950/30 hover:bg-emerald-900/40 text-emerald-400 shadow-xs transition-all active:scale-95 focus-visible:outline-hidden"
        title={
          activeSession
            ? `WhatsApp: ${activeSession} (${isConnected ? "Connected" : "Setup needed"})`
            : "WhatsApp Manager (Tap to open)"
        }
        aria-label="Open WhatsApp Gateway Manager"
      >
        <MessageCircle className="size-4 sm:size-3.5 text-emerald-400 transition-transform group-hover/wa:scale-110 drop-shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
        {isConnected && (
          <span className="absolute -top-0.5 -right-0.5 flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500 border border-black" />
          </span>
        )}
      </button>

      <WhatsAppSheet isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
