import { memo, useState, useEffect, useRef } from "react";
import {
  PhoneCall,
  PhoneOff,
  Mic,
  MicOff,
  Square,
  ChevronDown,
  ChevronUp,
  Volume2,
  Sparkles,
} from "lucide-react";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import type { VoiceCallStatus } from "./VoiceVisualizerWaves";

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

const NUM_WAVE_BARS = 28;

function MiniWaveVisualizer({
  callStatus,
  analyserNode,
}: {
  callStatus: VoiceCallStatus;
  analyserNode: AnalyserNode | null;
}) {
  const barsRef = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    let animId: number;
    let running = true;
    const freqData = analyserNode ? new Uint8Array(analyserNode.frequencyBinCount) : null;

    const tick = (timestamp: number) => {
      if (!running) return;

      const isAnalysing = callStatus === "user-speaking" && analyserNode && freqData;
      if (isAnalysing) {
        analyserNode.getByteFrequencyData(freqData);
      }

      const bars = barsRef.current;
      for (let i = 0; i < NUM_WAVE_BARS; i++) {
        const bar = bars[i];
        if (!bar) continue;

        // Symmetric curved bell curve
        const d = Math.abs(i - NUM_WAVE_BARS / 2) / (NUM_WAVE_BARS / 2);
        const bell = Math.pow(Math.cos((d * Math.PI) / 2), 0.8);

        let heightPx = 5;

        switch (callStatus) {
          case "idle":
          case "listening": {
            const breath = Math.sin(timestamp * 0.003 + i * 0.22);
            heightPx = Math.max(4, 5 + 10 * bell * (0.6 + 0.4 * breath));
            break;
          }
          case "user-speaking": {
            if (freqData) {
              const bin = Math.min(freqData.length - 1, 2 + Math.floor((1 - d) * 20));
              const val = (freqData[bin] || 0) / 255;
              heightPx = Math.max(5, Math.min(36, 6 + val * 30 * (0.35 + 0.65 * bell)));
            } else {
              const wave = Math.sin(timestamp * 0.008 + i * 0.45) * 0.5 + 0.5;
              heightPx = Math.max(5, 6 + 26 * wave * bell);
            }
            break;
          }
          case "thinking": {
            const shimmer = Math.sin(timestamp * 0.0045 + i * 0.35);
            heightPx = Math.max(5, 12 + 12 * shimmer * (0.4 + 0.6 * bell));
            break;
          }
          case "speaking": {
            const cadence = Math.abs(
              Math.sin(timestamp * 0.006) * Math.cos(timestamp * 0.0025 + i * 0.09),
            );
            const formant = Math.sin(timestamp * 0.004 + i * 0.3) * 0.5 + 0.5;
            heightPx = Math.max(5, 7 + 28 * cadence * formant * (0.35 + 0.65 * bell));
            break;
          }
        }

        bar.style.height = `${Math.round(heightPx)}px`;
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(animId);
    };
  }, [callStatus, analyserNode]);

  const getBarColor = () => {
    switch (callStatus) {
      case "idle":
      case "listening":
        return "bg-gradient-to-t from-emerald-600 to-teal-400 shadow-[0_0_6px_rgba(16,185,129,0.4)]";
      case "user-speaking":
        return "bg-gradient-to-t from-sky-500 to-cyan-300 shadow-[0_0_8px_rgba(56,189,248,0.7)]";
      case "thinking":
        return "bg-gradient-to-t from-amber-600 to-yellow-300 shadow-[0_0_8px_rgba(245,158,11,0.6)]";
      case "speaking":
        return "bg-gradient-to-t from-purple-600 via-indigo-500 to-violet-300 shadow-[0_0_8px_rgba(168,85,247,0.7)]";
    }
  };

  return (
    <div
      className="flex h-10 w-full items-center justify-center gap-[2.5px] px-2 py-1 overflow-hidden"
      aria-hidden="true"
    >
      {Array.from({ length: NUM_WAVE_BARS }).map((_, i) => (
        <div
          key={i}
          ref={(el) => {
            barsRef.current[i] = el;
          }}
          className={cn(
            "w-[3.5px] rounded-full transition-[height,background-color] duration-75",
            getBarColor(),
          )}
          style={{ height: "6px" }}
        />
      ))}
    </div>
  );
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
  const [isMinimized, setIsMinimized] = useState(false);

  // Auto expand when call activates
  useEffect(() => {
    if (isCallActive) {
      setIsMinimized(false);
    }
  }, [isCallActive]);

  // Status Badge Label & Colors
  const getStatusInfo = () => {
    const isUrdu = callLanguage === "urdu";
    switch (callStatus) {
      case "idle":
      case "listening":
        return {
          label: isUrdu ? "بولیں، سن رہا ہوں..." : "Listening...",
          badge: isUrdu ? "سن رہا ہے" : "Listening",
          color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
          dot: "bg-emerald-400 animate-pulse",
        };
      case "user-speaking":
        return {
          label: isUrdu ? "آپ بول رہے ہیں..." : "Listening to you...",
          badge: isUrdu ? "آپ کی آواز" : "Speaking",
          color: "text-sky-400 bg-sky-500/10 border-sky-500/30",
          dot: "bg-sky-400 animate-ping",
        };
      case "thinking":
        return {
          label: isUrdu ? "سوچ رہا ہوں..." : "Thinking...",
          badge: isUrdu ? "سوچ رہا ہے" : "Thinking",
          color: "text-amber-400 bg-amber-500/10 border-amber-500/30",
          dot: "bg-amber-400 animate-bounce",
        };
      case "speaking":
        return {
          label: isUrdu
            ? "جواب دے رہا ہوں (روکنے کیلئے کلک کریں)"
            : "Assistant speaking (click to interrupt)",
          badge: isUrdu ? "بول رہا ہے" : "Responding",
          color: "text-purple-400 bg-purple-500/10 border-purple-500/30",
          dot: "bg-purple-400 animate-pulse",
        };
    }
  };

  const statusInfo = getStatusInfo();

  // If call is NOT active: Render sleek floating action button (FAB)
  if (!isCallActive) {
    return (
      <div
        className={cn(
          "fixed bottom-24 right-5 sm:bottom-24 sm:right-7 z-40 flex items-center select-none",
          className,
        )}
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleCall();
                }}
                className={cn(
                  "group relative flex items-center gap-2 rounded-full px-3.5 py-2.5 sm:px-4 sm:py-3",
                  "bg-zinc-900/95 hover:bg-zinc-800 text-zinc-100",
                  "border border-zinc-700/80 hover:border-indigo-500/60",
                  "shadow-[0_10px_30px_rgba(0,0,0,0.5),0_0_20px_rgba(99,102,241,0.2)]",
                  "hover:shadow-[0_12px_36px_rgba(0,0,0,0.6),0_0_28px_rgba(99,102,241,0.45)]",
                  "backdrop-blur-xl transition-all duration-200 cursor-pointer active:scale-95",
                )}
                aria-label="Start Voice Call Assistant"
              >
                {/* Glowing ring animation on hover */}
                <div className="absolute -inset-[1px] rounded-full bg-gradient-to-r from-indigo-500/40 via-purple-500/30 to-pink-500/40 opacity-0 blur-[2px] transition-opacity duration-300 group-hover:opacity-100 pointer-events-none" />

                <div className="relative flex size-6 sm:size-7 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-600 to-violet-500 text-white shadow-[0_0_10px_rgba(99,102,241,0.5)]">
                  <PhoneCall className="size-3.5 sm:size-4 transition-transform duration-200 group-hover:scale-110" />
                </div>

                <div className="relative hidden sm:flex flex-col text-left pr-1">
                  <span className="text-xs font-semibold tracking-wide text-zinc-100 flex items-center gap-1.5">
                    Call Assistant
                    <span className="inline-flex items-center rounded px-1.5 py-0.2 text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      {callLanguage === "urdu" ? "🇵🇰 اردو" : "🇬🇧 EN"}
                    </span>
                  </span>
                  <span className="text-[10px] text-zinc-400">
                    {callLanguage === "urdu" ? "آواز سے اردو میں بات کریں" : "Speak to assistant"}
                  </span>
                </div>

                {/* Mobile language badge */}
                <span className="sm:hidden text-[10px] font-bold text-indigo-300 bg-indigo-500/20 px-1.5 py-0.5 rounded border border-indigo-500/30">
                  {callLanguage === "urdu" ? "🇵🇰 اردو" : "EN"}
                </span>
              </button>
            }
          />
          <TooltipPopup>
            <p className="text-xs">
              {callLanguage === "urdu"
                ? "اردو میں آواز سے بات کریں (Urdu Voice Call)"
                : "Start Voice Call (English / Urdu)"}
            </p>
          </TooltipPopup>
        </Tooltip>
      </div>
    );
  }

  // Active Call: Minimized Floating Pill
  if (isMinimized) {
    return (
      <div
        className={cn(
          "fixed bottom-24 right-5 sm:bottom-24 sm:right-7 z-40 flex items-center select-none animate-in fade-in zoom-in-95 duration-200",
          className,
        )}
      >
        <div
          onClick={() => setIsMinimized(false)}
          className={cn(
            "group relative flex items-center gap-2.5 rounded-full px-3 py-2",
            "bg-zinc-950/95 border border-zinc-700/80 shadow-[0_12px_40px_rgba(0,0,0,0.7),0_0_24px_rgba(99,102,241,0.25)]",
            "backdrop-blur-xl cursor-pointer hover:border-indigo-500/60 transition-all",
          )}
        >
          <div className="flex size-7 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
            <span className={cn("size-2 rounded-full", statusInfo.dot)} />
          </div>

          <div className="flex flex-col text-left">
            <span className="text-[11px] font-medium text-zinc-200 flex items-center gap-1.5">
              {statusInfo.badge}
              <span className="text-[10px] font-bold text-indigo-400">
                {callLanguage === "urdu" ? "🇵🇰" : "🇬🇧"}
              </span>
            </span>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsMinimized(false);
            }}
            className="rounded-full p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            title="Expand Voice Assistant"
          >
            <ChevronUp className="size-4" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleCall();
            }}
            className="flex size-7 items-center justify-center rounded-full bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30 transition-all"
            title="End Call"
          >
            <PhoneOff className="size-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // Active Call: Full Floating Dynamic Capsule Console
  return (
    <aside
      aria-label="Active Voice Call Assistant"
      className={cn(
        "fixed bottom-24 right-4 sm:bottom-24 sm:right-7 z-40 select-none",
        "w-[calc(100vw-2rem)] sm:w-[380px] max-w-[390px]",
        "rounded-3xl p-4 sm:p-4.5 flex flex-col gap-3.5",
        "bg-zinc-950/92 backdrop-blur-2xl border border-zinc-700/60",
        "shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8),0_0_30px_rgba(99,102,241,0.18)]",
        "transition-all duration-200 animate-in fade-in zoom-in-95",
        className,
      )}
    >
      {/* Top Header: Status + Window Controls */}
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <span className={cn("size-2 rounded-full", statusInfo.dot)} />
          <span
            className={cn(
              "text-xs font-semibold px-2 py-0.5 rounded-full border",
              statusInfo.color,
            )}
          >
            {statusInfo.badge}
          </span>
          <span className="text-[11px] text-zinc-400 truncate max-w-[130px] sm:max-w-[150px]">
            {statusInfo.label}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsMinimized(true)}
            className="flex size-7 items-center justify-center rounded-full text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 transition-colors"
            title="Minimize"
          >
            <ChevronDown className="size-4" />
          </button>
          <button
            type="button"
            onClick={onToggleCall}
            className="flex size-7 items-center justify-center rounded-full text-red-400 hover:bg-red-500/20 transition-colors"
            title="End Call"
          >
            <PhoneOff className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Live Audio Visualizer Waves */}
      <div
        onClick={() => {
          if ((callStatus === "speaking" || callStatus === "thinking") && onInterrupt) {
            onInterrupt();
          }
        }}
        className={cn(
          "rounded-2xl bg-zinc-900/60 border border-zinc-800/80 px-2 py-2 flex flex-col items-center justify-center transition-all",
          (callStatus === "speaking" || callStatus === "thinking") &&
            "cursor-pointer hover:border-indigo-500/40",
        )}
        title={
          callStatus === "speaking" || callStatus === "thinking"
            ? "Click anywhere on waves to interrupt"
            : undefined
        }
      >
        <MiniWaveVisualizer callStatus={callStatus} analyserNode={analyserNode} />
      </div>

      {/* Core Feature: Urdu & English Language Switcher Segment */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[11px] px-1 text-zinc-400 font-medium">
          <span className="flex items-center gap-1">
            <Sparkles className="size-3 text-indigo-400" />
            STT Language (بات چیت کی زبان)
          </span>
          <span className="text-[10px] text-zinc-500">Live switch</span>
        </div>

        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-zinc-900/80 border border-zinc-800">
          <button
            type="button"
            onClick={() => onSwitchLanguage("urdu")}
            className={cn(
              "flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer",
              callLanguage === "urdu"
                ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-[0_0_12px_rgba(16,185,129,0.35)]"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60",
            )}
          >
            <span>🇵🇰</span>
            <span>اردو (Urdu)</span>
          </button>

          <button
            type="button"
            onClick={() => onSwitchLanguage("english")}
            className={cn(
              "flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer",
              callLanguage === "english"
                ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-[0_0_12px_rgba(99,102,241,0.35)]"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60",
            )}
          >
            <span>🇬🇧</span>
            <span>English</span>
          </button>
        </div>
      </div>

      {/* Real-time Subtitle / Live Transcript Preview */}
      <div className="rounded-xl bg-zinc-900/60 border border-zinc-800/60 px-3 py-2 text-xs min-h-[46px] flex items-center">
        {callStatus === "speaking" && assistantSpokenText ? (
          <div className="flex items-start gap-2 text-purple-300 animate-in fade-in">
            <Volume2 className="size-4 shrink-0 mt-0.5 text-purple-400 animate-pulse" />
            <p className="line-clamp-2 leading-relaxed">{assistantSpokenText}</p>
          </div>
        ) : liveTranscript ? (
          <div className="flex items-start gap-2 text-sky-200 animate-in fade-in">
            <Mic className="size-4 shrink-0 mt-0.5 text-sky-400" />
            <p className="line-clamp-2 leading-relaxed italic">"{liveTranscript}"</p>
          </div>
        ) : (
          <p className="text-zinc-500 text-[11px] italic">
            {callLanguage === "urdu"
              ? "اب اردو میں بات کریں، اسسٹنٹ فوراً سنے گا اور جواب دے گا..."
              : "Speak now in English or Urdu, assistant is listening..."}
          </p>
        )}
      </div>

      {/* Bottom Actions Bar: Mic Mute, Interrupt AI, Hangup */}
      <div className="flex items-center justify-between gap-2 pt-1">
        {/* Mic Mute / Unmute */}
        <button
          type="button"
          onClick={onToggleMicMute}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all cursor-pointer",
            isMicMuted
              ? "bg-red-500/15 text-red-400 border-red-500/40 hover:bg-red-500/25"
              : "bg-zinc-900/80 text-zinc-300 border-zinc-800 hover:bg-zinc-800 hover:text-white",
          )}
        >
          {isMicMuted ? (
            <>
              <MicOff className="size-3.5 text-red-400" />
              <span>Unmute</span>
            </>
          ) : (
            <>
              <Mic className="size-3.5 text-zinc-400" />
              <span>Mute</span>
            </>
          )}
        </button>

        {/* Interrupt / Stop Button: Active when AI is speaking or thinking */}
        {(callStatus === "speaking" || callStatus === "thinking") && (
          <button
            type="button"
            onClick={onInterrupt}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-amber-500/15 text-amber-300 border border-amber-500/40 hover:bg-amber-500/25 transition-all cursor-pointer animate-in fade-in"
          >
            <Square className="size-3 fill-current" />
            <span>روکیں / Stop</span>
          </button>
        )}

        {/* End Call Button */}
        <button
          type="button"
          onClick={onToggleCall}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.4)] transition-all cursor-pointer ml-auto"
        >
          <PhoneOff className="size-3.5" />
          <span>کال ختم / End</span>
        </button>
      </div>
    </aside>
  );
});
