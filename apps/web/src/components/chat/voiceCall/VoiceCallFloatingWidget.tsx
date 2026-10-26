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
      <div className="relative flex flex-col items-center">
        {/* Top Attached Flag: 🇵🇰 Pakistani Flag (Hidden during call) */}
        {!isCallActive && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSwitchLanguage("urdu");
              onToggleCall();
            }}
            className={cn(
              "relative z-20 flex items-center justify-center w-11 h-7.5 rounded-[5px] transition-all duration-200 cursor-pointer shadow-md -mb-1.5 animate-in fade-in zoom-in-95",
              callLanguage === "urdu"
                ? "border-2 border-emerald-400 bg-emerald-950/90 shadow-[0_0_12px_rgba(16,185,129,0.55)] scale-105"
                : "border border-zinc-600/80 bg-zinc-900/95 hover:border-zinc-400 opacity-80 hover:opacity-100",
            )}
            title="اردو (Urdu) - Click to call in Urdu"
          >
            <span className="text-2xl leading-none select-none">🇵🇰</span>
          </button>
        )}

        {/* Center Voice Wave Avatar (Borderless) */}
        <div
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (isCallActive) {
              if (callStatus === "speaking" || callStatus === "thinking") {
                onInterrupt();
              }
              onToggleCall();
            }
          }}
          className={cn(
            "relative z-10 flex items-center justify-center size-14 sm:size-15 rounded-full transition-all duration-300 cursor-pointer",
            "bg-zinc-950/90 backdrop-blur-xl shadow-xl",
            isCallActive && "shadow-[0_0_24px_rgba(0,0,0,0.7)]",
          )}
        >
          {/* Dual Voice Waves (Active whenever call is active or preparing) */}
          <CircularVoiceWaves callStatus={callStatus} analyserNode={analyserNode} />

          {/* Centered Small Icon (Subtle Red during call, Gray when idle) */}
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
              "relative z-20 flex size-7 items-center justify-center rounded-full transition-all duration-200 cursor-pointer active:scale-90",
              isCallActive
                ? "text-red-400/90 hover:text-red-400 bg-red-950/30 hover:bg-red-500/20 border border-red-500/30 shadow-[0_0_8px_rgba(239,68,68,0.3)]"
                : "text-zinc-300 hover:text-white bg-zinc-800/60 hover:bg-zinc-700/70 border border-zinc-600/40 shadow-sm",
            )}
            title={
              isCallActive ? "End Voice Call (کال بند کریں)" : "Start Voice Call (کال شروع کریں)"
            }
          >
            {isCallActive ? (
              <PhoneOff className="size-3.5" strokeWidth={2.5} />
            ) : (
              <PhoneCall className="size-3.5" strokeWidth={2.5} />
            )}
          </button>
        </div>

        {/* Bottom Attached Flag: 🇺🇸 US Flag (Hidden during call) */}
        {!isCallActive && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSwitchLanguage("english");
              onToggleCall();
            }}
            className={cn(
              "relative z-20 flex items-center justify-center w-11 h-7.5 rounded-[8px] transition-all duration-200 cursor-pointer shadow-md -mt-1.5 animate-in fade-in zoom-in-95",
              callLanguage === "english"
                ? "border-2 border-blue-400 bg-blue-950/90 shadow-[0_0_12px_rgba(59,130,246,0.55)] scale-105"
                : "border border-zinc-600/80 bg-zinc-900/95 hover:border-zinc-400 opacity-80 hover:opacity-100",
            )}
            title="English - Click to call in English"
          >
            <span className="text-2xl leading-none select-none">🇺🇸</span>
          </button>
        )}
      </div>
    </aside>
  );
});
