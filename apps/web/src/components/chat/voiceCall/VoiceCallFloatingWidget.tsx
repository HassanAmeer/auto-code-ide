import { memo } from "react";
import { PhoneCall, PhoneOff, Mic, MicOff, Square } from "lucide-react";
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
  liveTranscript = "",
  assistantSpokenText = "",
  isMicMuted = false,
  onToggleMicMute,
  className,
}: VoiceCallFloatingWidgetProps) {
  const getStatusText = () => {
    const isUrdu = callLanguage === "urdu";
    switch (callStatus) {
      case "idle":
      case "listening":
        return isUrdu ? "بولیں، سن رہا ہوں..." : "Listening...";
      case "user-speaking":
        return isUrdu ? "آپ بول رہے ہیں..." : "Speaking...";
      case "thinking":
        return isUrdu ? "سوچ رہا ہوں..." : "Thinking...";
      case "speaking":
        return isUrdu ? "جواب دے رہا ہوں..." : "Responding...";
    }
  };

  return (
    <aside
      aria-label="Floating Voice Call Assistant"
      className={cn(
        "fixed bottom-24 right-5 sm:bottom-24 sm:right-7 z-40 flex items-center gap-3 select-none pointer-events-auto",
        className,
      )}
    >
      {/* Active Call Floating Status Pill (Left of FAB) */}
      {isCallActive && (
        <div
          className={cn(
            "flex items-center gap-2.5 px-3 py-1.5 rounded-full border shadow-xl backdrop-blur-xl animate-in fade-in slide-in-from-right-4 duration-200",
            "bg-zinc-950/90 border-zinc-700/60 text-zinc-200",
          )}
        >
          {/* Status Dot & Label */}
          <div className="flex items-center gap-1.5 pr-1">
            <span
              className={cn(
                "size-2 rounded-full",
                callStatus === "user-speaking"
                  ? "bg-blue-400 animate-ping"
                  : callStatus === "thinking"
                    ? "bg-zinc-400 animate-pulse"
                    : callStatus === "speaking"
                      ? "bg-emerald-400 animate-pulse"
                      : "bg-emerald-500",
              )}
            />
            <span className="text-xs font-medium text-zinc-300 whitespace-nowrap">
              {getStatusText()}
            </span>
          </div>

          {/* Quick Mic Mute Toggle */}
          {onToggleMicMute && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleMicMute();
              }}
              className={cn(
                "flex size-6.5 items-center justify-center rounded-full transition-colors cursor-pointer",
                isMicMuted
                  ? "bg-red-500/20 text-red-400 border border-red-500/40"
                  : "bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700",
              )}
              title={isMicMuted ? "Unmute Mic" : "Mute Mic"}
            >
              {isMicMuted ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
            </button>
          )}

          {/* Stop / Interrupt AI Button */}
          {(callStatus === "speaking" || callStatus === "thinking") && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onInterrupt();
              }}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 text-[11px] font-medium transition-colors cursor-pointer"
              title="Stop Speaking / روکیں"
            >
              <Square className="size-2.5 fill-current" />
              <span>روکیں</span>
            </button>
          )}
        </div>
      )}

      {/* Main Floating Action Button Column: [🇵🇰] -> (📞 Waves) -> [🇬🇧] */}
      <div className="flex flex-col items-center gap-1">
        {/* Top Attached Flag Button: 🇵🇰 Urdu */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!isCallActive) {
              onSwitchLanguage("urdu");
              onToggleCall();
            } else {
              onSwitchLanguage("urdu");
            }
          }}
          className={cn(
            "flex size-7.5 sm:size-8 items-center justify-center rounded-full text-base transition-all duration-200 cursor-pointer shadow-md",
            "bg-zinc-900/95 hover:bg-zinc-800 border active:scale-95",
            callLanguage === "urdu" && isCallActive
              ? "border-emerald-500 bg-emerald-950/50 shadow-[0_0_12px_rgba(16,185,129,0.5)] scale-110"
              : "border-zinc-700/80 hover:border-zinc-500 opacity-85 hover:opacity-100",
          )}
          title="اردو میں کال کریں / بات کریں (Click to Call in Urdu)"
        >
          🇵🇰
        </button>

        {/* Center Main Call Button with 360-degree Radial Circular Waves */}
        <div className="relative flex items-center justify-center size-12 sm:size-13">
          {/* Circular Voice Waves (Grey for thinking, Light green for speaking, Blue for user) */}
          {isCallActive && (
            <CircularVoiceWaves callStatus={callStatus} analyserNode={analyserNode} />
          )}

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleCall();
            }}
            className={cn(
              "relative z-10 flex size-11 sm:size-12 items-center justify-center rounded-full transition-all duration-200 cursor-pointer shadow-lg active:scale-95",
              "backdrop-blur-md",
              isCallActive
                ? "border-2 border-red-500/70 text-red-400 bg-red-950/30 hover:bg-red-500/25 shadow-[0_0_16px_rgba(239,68,68,0.4)]"
                : "border-2 border-zinc-500/60 text-zinc-300 hover:text-white hover:border-zinc-400 bg-zinc-900/80 hover:bg-zinc-800 shadow-[0_0_12px_rgba(0,0,0,0.5)]",
            )}
            title={
              isCallActive
                ? "End Voice Call (کال بند کریں)"
                : "Start Voice Call (کال اسسٹنٹ شروع کریں)"
            }
          >
            {isCallActive ? <PhoneOff className="size-5" /> : <PhoneCall className="size-5" />}
          </button>
        </div>

        {/* Bottom Attached Flag Button: 🇬🇧 English */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!isCallActive) {
              onSwitchLanguage("english");
              onToggleCall();
            } else {
              onSwitchLanguage("english");
            }
          }}
          className={cn(
            "flex size-7.5 sm:size-8 items-center justify-center rounded-full text-base transition-all duration-200 cursor-pointer shadow-md",
            "bg-zinc-900/95 hover:bg-zinc-800 border active:scale-95",
            callLanguage === "english" && isCallActive
              ? "border-blue-500 bg-blue-950/50 shadow-[0_0_12px_rgba(59,130,246,0.5)] scale-110"
              : "border-zinc-700/80 hover:border-zinc-500 opacity-85 hover:opacity-100",
          )}
          title="English Voice Call (Click to Call in English)"
        >
          🇬🇧
        </button>
      </div>
    </aside>
  );
});
