import React, { useState, useEffect } from "react";
import { WhatsAppSheet } from "./WhatsAppSheet";

export function WhatsAppIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="currentColor"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

export function WhatsAppHeaderButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [sessionInfo, setSessionInfo] = useState<{
    name?: string;
    phone?: string;
    pushName?: string;
  } | null>(null);
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
          const active = sessions.find((s: any) => s.id === activeId || s.name === activeId);
          if (active) {
            setSessionInfo({
              name: active.name,
              phone: active.phone,
              pushName: active.pushName,
            });
          } else {
            setSessionInfo(null);
          }
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

  const tooltipText = sessionInfo?.name
    ? `WhatsApp: ${sessionInfo.name}${sessionInfo.phone ? ` (+${sessionInfo.phone})` : ""} (${isConnected ? "Connected" : "Offline"})`
    : activeSession
      ? `WhatsApp: ${activeSession} (${isConnected ? "Connected" : "Setup needed"})`
      : "WhatsApp Manager (Tap to open)";

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="group/wa pointer-events-auto relative inline-flex items-center justify-center size-8 sm:size-7 shrink-0 cursor-pointer rounded-lg border border-[#25D366]/40 bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#25D366] shadow-xs transition-all active:scale-95 focus-visible:outline-hidden"
        title={tooltipText}
        aria-label="Open WhatsApp Gateway Manager"
      >
        <WhatsAppIcon className="size-4.5 sm:size-4 text-[#25D366] transition-transform group-hover/wa:scale-110 drop-shadow-[0_0_6px_rgba(37,211,102,0.6)]" />
        {isConnected && (
          <span className="absolute -top-0.5 -right-0.5 flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#25D366] opacity-75" />
            <span className="relative inline-flex size-2.5 rounded-full bg-[#25D366] border border-black" />
          </span>
        )}
      </button>

      <WhatsAppSheet isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
