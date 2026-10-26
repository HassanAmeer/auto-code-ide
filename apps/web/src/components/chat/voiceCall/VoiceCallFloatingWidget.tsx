import { memo } from "react";
import { PhoneCall, PhoneOff } from "lucide-react";
import { cn } from "~/lib/utils";
import type { VoiceCallStatus } from "./VoiceVisualizerWaves";
import { CircularVoiceWaves } from "./VoiceCallButton";

export interface VoiceCallFloatingWidgetProps {
  isCallActive: boolean;
  callStatus: VoiceCallStatus;
  analyserNode: AnalyserNode | null;
  onToggleCall: () => void;
  onInterrupt: () => void;
  callLanguage: "urdu" | "english";
  onSwitchLanguage: (lang: "urdu" | "english") => void;
  liveTranscript?: string;
  assistantSpokenText?: string;
  isMicMuted?: boolean;
  onToggleMicMute?: () => void;
  className?: string;
}

export const VoiceCallFloatingWidget = memo(function VoiceCallFloatingWidget({
  isCallActive,
  callStatus,
  analyserNode,
  onToggleCall,
  onInterrupt,
  callLanguage,
  onSwitchLanguage,
  className,
}: VoiceCallFloatingWidgetProps) {
  return (
    <aside
      aria-label="Floating Voice Call Assistant"
      className={cn(
        "fixed bottom-20 right-5 sm:bottom-22 sm:right-7 z-40 select-none pointer-events-auto",
        className,
      )}
    >
      {/* Single Unified Vertical Docked Capsule */}
      <div
        className={cn(
          "relative flex flex-col items-center p-1 rounded-full border backdrop-blur-xl transition-all duration-300 shadow-2xl",
          isCallActive
            ? "bg-zinc-950/90 border-zinc-700/80 shadow-[0_8px_32px_rgba(0,0,0,0.65)]"
            : "bg-zinc-950/80 hover:bg-zinc-900/90 border-zinc-800/80 hover:border-zinc-700 shadow-lg",
        )}
      >
        {/* Top Attached Flag: 🇵🇰 Urdu */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSwitchLanguage("urdu");
            if (!isCallActive) {
              onToggleCall();
            }
          }}
          className={cn(
            "flex size-8 items-center justify-center rounded-full text-base transition-all duration-200 cursor-pointer",
            callLanguage === "urdu"
              ? "bg-emerald-500/25 border border-emerald-400/80 shadow-[0_0_12px_rgba(16,185,129,0.5)] scale-105"
              : "border border-transparent opacity-70 hover:opacity-100 hover:bg-zinc-800/70",
          )}
          title="اردو میں کال کریں / اردو زبان (Click to switch / call in Urdu)"
        >
          🇵🇰
        </button>

        {/* Center Main Call Button with 360-degree Waves */}
        <div className="relative my-1 flex items-center justify-center size-12 sm:size-13">
          {/* Circular Voice Waves (Grey for thinking, Light green for speaking, Blue for user) */}
          {isCallActive && (
            <CircularVoiceWaves callStatus={callStatus} analyserNode={analyserNode} />
          )}

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (isCallActive && (callStatus === "speaking" || callStatus === "thinking")) {
                onInterrupt();
              }
              onToggleCall();
            }}
            className={cn(
              "relative z-10 flex size-11 sm:size-12 items-center justify-center rounded-full transition-all duration-200 cursor-pointer shadow-md active:scale-95",
              isCallActive
                ? "border-2 border-red-500/80 text-red-400 bg-red-950/40 hover:bg-red-500/30 shadow-[0_0_16px_rgba(239,68,68,0.5)]"
                : "border-2 border-zinc-500/60 text-zinc-300 hover:text-white hover:border-zinc-400 bg-zinc-900/90 hover:bg-zinc-800 shadow-[0_0_12px_rgba(0,0,0,0.5)]",
            )}
            title={
              isCallActive ? "End Voice Call (کال بند کریں)" : "Start Voice Call (کال شروع کریں)"
            }
          >
            {isCallActive ? <PhoneOff className="size-5" /> : <PhoneCall className="size-5" />}
          </button>
        </div>

        {/* Bottom Attached Flag: 🇺🇸 English */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSwitchLanguage("english");
            if (!isCallActive) {
              onToggleCall();
            }
          }}
          className={cn(
            "flex size-8 items-center justify-center rounded-full text-base transition-all duration-200 cursor-pointer",
            callLanguage === "english"
              ? "bg-blue-500/25 border border-blue-400/80 shadow-[0_0_12px_rgba(59,130,246,0.5)] scale-105"
              : "border border-transparent opacity-70 hover:opacity-100 hover:bg-zinc-800/70",
          )}
          title="English Voice Call (Click to switch / call in English)"
        >
          🇺🇸
        </button>
      </div>
    </aside>
  );
});
