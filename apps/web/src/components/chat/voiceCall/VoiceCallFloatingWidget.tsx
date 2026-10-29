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
              "relative z-20 flex items-center justify-center p-0 bg-transparent border-0 shadow-none outline-none focus:outline-none transition-all duration-200 cursor-pointer -mb-1 animate-in fade-in zoom-in-95",
              callLanguage === "urdu"
                ? "scale-110 opacity-100 drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
                : "opacity-75 hover:opacity-100 hover:scale-105",
            )}
            title="اردو (Urdu) - Click to call in Urdu"
          >
            <span className="text-2xl leading-none select-none">🇵🇰</span>
          </button>
        )}

        {/* Center Voice Wave Avatar (Borderless Button) */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleCall();
          }}
          className={cn(
            "relative z-10 flex items-center justify-center size-14 sm:size-15 rounded-full transition-all duration-300 cursor-pointer select-none border-0 outline-none focus:outline-none",
            "bg-zinc-950/90 backdrop-blur-xl shadow-xl",
            isCallActive && "shadow-[0_0_24px_rgba(0,0,0,0.7)]",
            isCallActive ? "text-red-400 hover:text-red-300" : "text-zinc-300 hover:text-white",
          )}
          title={
            isCallActive ? "End Voice Call (کال بند کریں)" : "Start Voice Call (کال شروع کریں)"
          }
        >
          {/* Dual Voice Waves (Active whenever call is active or preparing) */}
          <CircularVoiceWaves callStatus={callStatus} analyserNode={analyserNode} />

          {/* Centered Small Icon */}
          <span className="relative z-20 flex size-9 items-center justify-center pointer-events-none">
            {isCallActive ? (
              <PhoneOff className="size-4" strokeWidth={2.5} />
            ) : (
              <PhoneCall className="size-4" strokeWidth={2.5} />
            )}
          </span>
        </button>

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
              "relative z-20 flex items-center justify-center p-0 bg-transparent border-0 shadow-none outline-none focus:outline-none transition-all duration-200 cursor-pointer -mt-1 animate-in fade-in zoom-in-95",
              callLanguage === "english"
                ? "scale-110 opacity-100 drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
                : "opacity-75 hover:opacity-100 hover:scale-105",
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
