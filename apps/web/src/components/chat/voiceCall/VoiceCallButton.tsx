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

const NUM_RADIAL_BARS = 28;
const INNER_RADIUS = 18;
const MIN_BAR_HEIGHT = 2.5; // ~20% height when calm/silent
const MAX_BAR_HEIGHT = 12;

interface RadialBarCoords {
  cos: number;
  sin: number;
  x1: number;
  y1: number;
}

// Pre-compute 360-degree radial bar angles around the circle
const RADIAL_BARS: RadialBarCoords[] = Array.from({ length: NUM_RADIAL_BARS }, (_, i) => {
  // Start from top (12 o'clock: -PI/2) and go clockwise around the circle
  const angle = (i / NUM_RADIAL_BARS) * 2 * Math.PI - Math.PI / 2;
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
  const linesRef = useRef<(SVGLineElement | null)[]>([]);
  const currentHeightsRef = useRef<number[]>(new Array(NUM_RADIAL_BARS).fill(MIN_BAR_HEIGHT));

  useEffect(() => {
    let animId: number;
    let running = true;
    const freqData = analyserNode ? new Uint8Array(analyserNode.frequencyBinCount) : null;

    const tick = (timestamp: number) => {
      if (!running) return;

      const lines = linesRef.current;
      const heights = currentHeightsRef.current;

      const isAnalysing = callStatus === "user-speaking" && analyserNode && freqData;
      if (isAnalysing) {
        analyserNode.getByteFrequencyData(freqData);
      }

      // Calculate microphone voice energy level
      let micEnergy = 0;
      if (isAnalysing && freqData) {
        let sum = 0;
        const count = Math.min(32, freqData.length);
        for (let k = 2; k < count; k++) {
          sum += freqData[k] || 0;
        }
        micEnergy = sum / (count - 2);
      }

      for (let i = 0; i < NUM_RADIAL_BARS; i++) {
        const line = lines[i];
        if (!line) continue;

        let targetH = MIN_BAR_HEIGHT;

        switch (callStatus) {
          case "idle":
          case "listening": {
            // State 1: Sakin / Calm breathing (20% height subtle wave)
            const breath = Math.sin(timestamp * 0.0025 + (i / NUM_RADIAL_BARS) * Math.PI * 2);
            targetH = MIN_BAR_HEIGHT + 0.8 * breath;
            break;
          }

          case "user-speaking": {
            // State 2: Live microphone reactivity
            if (isAnalysing && freqData) {
              if (micEnergy < 12) {
                // Calm/silent: settle down to ~20% height
                targetH = MIN_BAR_HEIGHT;
              } else {
                // Map frequencies symmetrically from top to bottom
                const distFromTop = Math.abs(i - NUM_RADIAL_BARS / 2) / (NUM_RADIAL_BARS / 2);
                const bin = Math.min(freqData.length - 1, 2 + Math.floor((1 - distFromTop) * 20));
                const val = (freqData[bin] || 0) / 255;
                targetH = MIN_BAR_HEIGHT + val * (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT);
              }
            } else {
              const wave = Math.sin(timestamp * 0.008 + i * 0.45) * 0.5 + 0.5;
              targetH = MIN_BAR_HEIGHT + wave * (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT) * 0.7;
            }
            break;
          }

          case "thinking": {
            // State 3: Rotating golden wave around the circular perimeter
            const phase =
              (timestamp * 0.0045 - (i / NUM_RADIAL_BARS) * Math.PI * 2) % (Math.PI * 2);
            const wave = Math.pow(Math.max(0, Math.cos(phase)), 3);
            targetH = MIN_BAR_HEIGHT + wave * 7.5;
            break;
          }

          case "speaking": {
            // State 4: Assistant speaking cadence & formant harmonics
            const cadence = Math.abs(
              Math.sin(timestamp * 0.006) *
                Math.cos(timestamp * 0.0025 + (i / NUM_RADIAL_BARS) * Math.PI),
            );
            const formant = Math.sin(timestamp * 0.004 + i * 0.35) * 0.5 + 0.5;
            targetH = MIN_BAR_HEIGHT + cadence * formant * (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT);
            break;
          }
        }

        // Smooth lerp interpolation for liquid organic movement
        heights[i] = heights[i]! + (targetH - heights[i]!) * 0.35;
        const h = heights[i]!;

        const bar = RADIAL_BARS[i]!;
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
        return {
          stroke: "rgba(161, 161, 170, 0.4)",
          filter: "drop-shadow(0 0 2px rgba(161, 161, 170, 0.25))",
        };
      case "user-speaking":
        // User speaking: Blue color with 40% - 50% opacity
        return {
          stroke: "rgba(59, 130, 246, 0.45)",
          filter: "drop-shadow(0 0 4px rgba(59, 130, 246, 0.45))",
        };
      case "thinking":
        // Thinking: Grey color
        return {
          stroke: "rgba(156, 163, 175, 0.8)",
          filter: "drop-shadow(0 0 3px rgba(156, 163, 175, 0.5))",
        };
      case "speaking":
        // Assistant speaking: Light green with 30% - 40% opacity
        return {
          stroke: "rgba(74, 222, 128, 0.35)",
          filter: "drop-shadow(0 0 4px rgba(74, 222, 128, 0.35))",
        };
    }
  };

  const style = getStrokeAndFilter();

  return (
    <svg
      aria-hidden="true"
      viewBox="-32 -32 64 64"
      className="pointer-events-none absolute -inset-[14px] size-[60px] overflow-visible z-0 transition-all duration-200"
      style={{ filter: style.filter }}
    >
      {RADIAL_BARS.map((bar, i) => (
        <line
          key={i}
          ref={(el) => {
            linesRef.current[i] = el;
          }}
          x1={bar.x1.toFixed(2)}
          y1={bar.y1.toFixed(2)}
          x2={((INNER_RADIUS + MIN_BAR_HEIGHT) * bar.cos).toFixed(2)}
          y2={((INNER_RADIUS + MIN_BAR_HEIGHT) * bar.sin).toFixed(2)}
          stroke={style.stroke}
          strokeWidth="2.2"
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
      {isCallActive && <CircularVoiceWaves callStatus={callStatus} analyserNode={analyserNode} />}
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
            <PhoneOff className="size-4.5" aria-hidden="true" />
          ) : (
            <PhoneCall className="size-4.5" aria-hidden="true" />
          )}
        </TooltipTrigger>
        <TooltipPopup>
          <p>{label}</p>
        </TooltipPopup>
      </Tooltip>
    </div>
  );
});
