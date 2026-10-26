import { memo, useEffect, useRef } from "react";
import { PhoneCall, PhoneOff } from "lucide-react";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import type { VoiceCallStatus } from "./VoiceVisualizerWaves";

export interface VoiceCallButtonProps {
  isCallActive: boolean;
  onToggleCall: () => void;
  callStatus?: VoiceCallStatus;
  analyserNode?: AnalyserNode | null;
  onInterrupt?: () => void;
  className?: string;
  disabled?: boolean;
}

// Dual Concentric Wave Configuration:
// 1. Larger Outer Wave Ring (Radius ~23px)
const NUM_OUTER_BARS = 30;
const OUTER_RADIUS = 22;
const MIN_OUTER_H = 2.5;
const MAX_OUTER_H = 10;

// 2. Inner Wave Ring below the outer one (Radius ~15px)
const NUM_INNER_BARS = 22;
const INNER_RADIUS = 15;
const MIN_INNER_H = 1.8;
const MAX_INNER_H = 6;

interface RadialBarCoords {
  cos: number;
  sin: number;
  x1: number;
  y1: number;
}

const OUTER_RADIAL_BARS: RadialBarCoords[] = Array.from({ length: NUM_OUTER_BARS }, (_, i) => {
  const angle = (i / NUM_OUTER_BARS) * 2 * Math.PI - Math.PI / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    cos,
    sin,
    x1: cos * OUTER_RADIUS,
    y1: sin * OUTER_RADIUS,
  };
});

const INNER_RADIAL_BARS: RadialBarCoords[] = Array.from({ length: NUM_INNER_BARS }, (_, i) => {
  const angle = (i / NUM_INNER_BARS) * 2 * Math.PI - Math.PI / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    cos,
    sin,
    x1: cos * INNER_RADIUS,
    y1: sin * INNER_RADIUS,
  };
});

export function CircularVoiceWaves({
  callStatus,
  analyserNode,
}: {
  callStatus: VoiceCallStatus;
  analyserNode: AnalyserNode | null;
}) {
  const outerLinesRef = useRef<(SVGLineElement | null)[]>([]);
  const innerLinesRef = useRef<(SVGLineElement | null)[]>([]);
  const outerHeightsRef = useRef<number[]>(new Array(NUM_OUTER_BARS).fill(MIN_OUTER_H));
  const innerHeightsRef = useRef<number[]>(new Array(NUM_INNER_BARS).fill(MIN_INNER_H));

  useEffect(() => {
    let animId: number;
    let running = true;
    const freqData = analyserNode ? new Uint8Array(analyserNode.frequencyBinCount) : null;

    const tick = (timestamp: number) => {
      if (!running) return;

      const outerLines = outerLinesRef.current;
      const innerLines = innerLinesRef.current;
      const outerH = outerHeightsRef.current;
      const innerH = innerHeightsRef.current;

      const isAnalysing = callStatus === "user-speaking" && analyserNode && freqData;
      if (isAnalysing) {
        analyserNode.getByteFrequencyData(freqData);
      }

      let micEnergy = 0;
      if (isAnalysing && freqData) {
        let sum = 0;
        const count = Math.min(32, freqData.length);
        for (let k = 2; k < count; k++) {
          sum += freqData[k] || 0;
        }
        micEnergy = sum / (count - 2);
      }

      // 1. Update Outer Larger Wave Ring
      for (let i = 0; i < NUM_OUTER_BARS; i++) {
        const line = outerLines[i];
        if (!line) continue;

        let targetH = MIN_OUTER_H;

        switch (callStatus) {
          case "idle":
          case "listening": {
            // Calm breathing wave in gray circle
            const breath = Math.sin(timestamp * 0.0025 + (i / NUM_OUTER_BARS) * Math.PI * 2);
            targetH = MIN_OUTER_H + 0.9 * breath;
            break;
          }

          case "user-speaking": {
            // Blue reactive wave
            if (isAnalysing && freqData) {
              if (micEnergy < 12) {
                targetH = MIN_OUTER_H;
              } else {
                const distFromTop = Math.abs(i - NUM_OUTER_BARS / 2) / (NUM_OUTER_BARS / 2);
                const bin = Math.min(freqData.length - 1, 2 + Math.floor((1 - distFromTop) * 20));
                const val = (freqData[bin] || 0) / 255;
                targetH = MIN_OUTER_H + val * (MAX_OUTER_H - MIN_OUTER_H);
              }
            } else {
              const wave = Math.sin(timestamp * 0.008 + i * 0.45) * 0.5 + 0.5;
              targetH = MIN_OUTER_H + wave * (MAX_OUTER_H - MIN_OUTER_H) * 0.75;
            }
            break;
          }

          case "thinking": {
            // Orange rotating wave
            const phase = (timestamp * 0.0045 - (i / NUM_OUTER_BARS) * Math.PI * 2) % (Math.PI * 2);
            const wave = Math.pow(Math.max(0, Math.cos(phase)), 3);
            targetH = MIN_OUTER_H + wave * 7;
            break;
          }

          case "speaking": {
            // Green response wave
            const cadence = Math.abs(
              Math.sin(timestamp * 0.006) *
                Math.cos(timestamp * 0.0025 + (i / NUM_OUTER_BARS) * Math.PI),
            );
            const formant = Math.sin(timestamp * 0.004 + i * 0.35) * 0.5 + 0.5;
            targetH = MIN_OUTER_H + cadence * formant * (MAX_OUTER_H - MIN_OUTER_H);
            break;
          }
        }

        outerH[i] = outerH[i]! + (targetH - outerH[i]!) * 0.35;
        const h = outerH[i]!;

        const bar = OUTER_RADIAL_BARS[i]!;
        const x2 = (OUTER_RADIUS + h) * bar.cos;
        const y2 = (OUTER_RADIUS + h) * bar.sin;

        line.setAttribute("x2", x2.toFixed(2));
        line.setAttribute("y2", y2.toFixed(2));
      }

      // 2. Update Inner Secondary Wave Ring (Below Outer)
      for (let i = 0; i < NUM_INNER_BARS; i++) {
        const line = innerLines[i];
        if (!line) continue;

        let targetH = MIN_INNER_H;

        switch (callStatus) {
          case "idle":
          case "listening": {
            const breath = Math.cos(timestamp * 0.0022 + (i / NUM_INNER_BARS) * Math.PI * 2);
            targetH = MIN_INNER_H + 0.6 * breath;
            break;
          }

          case "user-speaking": {
            const wave = Math.sin(timestamp * 0.009 + i * 0.5) * 0.5 + 0.5;
            targetH = MIN_INNER_H + wave * (MAX_INNER_H - MIN_INNER_H) * 0.7;
            break;
          }

          case "thinking": {
            const phase = (timestamp * 0.004 - (i / NUM_INNER_BARS) * Math.PI * 2) % (Math.PI * 2);
            const wave = Math.pow(Math.max(0, Math.cos(phase)), 2);
            targetH = MIN_INNER_H + wave * 4.5;
            break;
          }

          case "speaking": {
            const cadence = Math.abs(
              Math.sin(timestamp * 0.005) *
                Math.sin(timestamp * 0.003 + (i / NUM_INNER_BARS) * Math.PI),
            );
            targetH = MIN_INNER_H + cadence * (MAX_INNER_H - MIN_INNER_H);
            break;
          }
        }

        innerH[i] = innerH[i]! + (targetH - innerH[i]!) * 0.35;
        const h = innerH[i]!;

        const bar = INNER_RADIAL_BARS[i]!;
        const x2 = (INNER_RADIUS + h) * bar.cos;
        const y2 = (INNER_RADIUS + h) * bar.sin;

        line.setAttribute("x2", x2.toFixed(2));
        line.setAttribute("y2", y2.toFixed(2));
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(animId);
    };
  }, [callStatus, analyserNode]);

  const getStrokeAndFilter = () => {
    switch (callStatus) {
      case "idle":
      case "listening":
        // Idle / Preparing / No one speaking: Calm waves in gray circle
        return {
          outerStroke: "rgba(156, 163, 175, 0.65)",
          innerStroke: "rgba(156, 163, 175, 0.45)",
          filter: "drop-shadow(0 0 2px rgba(156, 163, 175, 0.3))",
        };
      case "user-speaking":
        // Someone speaking: Blue waves
        return {
          outerStroke: "rgba(59, 130, 246, 0.95)",
          innerStroke: "rgba(96, 165, 250, 0.75)",
          filter: "drop-shadow(0 0 5px rgba(59, 130, 246, 0.65))",
        };
      case "thinking":
        // Thinking: Orange waves
        return {
          outerStroke: "rgba(249, 115, 22, 0.95)",
          innerStroke: "rgba(251, 146, 60, 0.8)",
          filter: "drop-shadow(0 0 5px rgba(249, 115, 22, 0.7))",
        };
      case "speaking":
        // Response / AI Speaking: Green waves
        return {
          outerStroke: "rgba(34, 197, 94, 0.9)",
          innerStroke: "rgba(74, 222, 128, 0.75)",
          filter: "drop-shadow(0 0 5px rgba(34, 197, 94, 0.6))",
        };
    }
  };

  const style = getStrokeAndFilter();

  return (
    <svg
      aria-hidden="true"
      viewBox="-38 -38 76 76"
      className="pointer-events-none absolute -inset-[11px] size-[76px] overflow-visible z-0 transition-all duration-200"
      style={{ filter: style.filter }}
    >
      {/* 1. Outer Larger Wave Ring */}
      {OUTER_RADIAL_BARS.map((bar, i) => (
        <line
          key={`outer-${i}`}
          ref={(el) => {
            outerLinesRef.current[i] = el;
          }}
          x1={bar.x1.toFixed(2)}
          y1={bar.y1.toFixed(2)}
          x2={((OUTER_RADIUS + MIN_OUTER_H) * bar.cos).toFixed(2)}
          y2={((OUTER_RADIUS + MIN_OUTER_H) * bar.sin).toFixed(2)}
          stroke={style.outerStroke}
          strokeWidth="2.1"
          strokeLinecap="round"
          className="transition-colors duration-200"
        />
      ))}

      {/* 2. Inner Secondary Wave Ring (Below Outer) */}
      {INNER_RADIAL_BARS.map((bar, i) => (
        <line
          key={`inner-${i}`}
          ref={(el) => {
            innerLinesRef.current[i] = el;
          }}
          x1={bar.x1.toFixed(2)}
          y1={bar.y1.toFixed(2)}
          x2={((INNER_RADIUS + MIN_INNER_H) * bar.cos).toFixed(2)}
          y2={((INNER_RADIUS + MIN_INNER_H) * bar.sin).toFixed(2)}
          stroke={style.innerStroke}
          strokeWidth="1.8"
          strokeLinecap="round"
          className="transition-colors duration-200"
        />
      ))}
    </svg>
  );
}

export const VoiceCallButton = memo(function VoiceCallButton({
  isCallActive,
  onToggleCall,
  callStatus = "idle",
  analyserNode = null,
  onInterrupt,
  className,
  disabled = false,
}: VoiceCallButtonProps) {
  const label = isCallActive
    ? callStatus === "speaking"
      ? "End Call · Click to interrupt assistant"
      : callStatus === "thinking"
        ? "End Call · Assistant is thinking"
        : "End Voice Call"
    : "Start Voice Call";

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <CircularVoiceWaves callStatus={callStatus} analyserNode={analyserNode} />
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              disabled={disabled}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (
                  isCallActive &&
                  (callStatus === "speaking" || callStatus === "thinking") &&
                  onInterrupt
                ) {
                  onInterrupt();
                }
                onToggleCall();
              }}
              aria-label={label}
              className={cn(
                "relative z-10 flex size-8 items-center justify-center rounded-full transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
                isCallActive
                  ? "bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30 shadow-[0_0_12px_rgba(239,68,68,0.35)]"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40",
              )}
            />
          }
        >
          {isCallActive ? (
            <PhoneOff className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
          ) : (
            <PhoneCall className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
          )}
        </TooltipTrigger>
        <TooltipPopup>
          <p>{label}</p>
        </TooltipPopup>
      </Tooltip>
    </div>
  );
});
