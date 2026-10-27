import { memo, useEffect, useRef } from "react";
import { cn } from "~/lib/utils";
import type { VoiceCallStatus } from "./VoiceVisualizerWaves";

export interface GrokGeometricVoiceWavesProps {
  callStatus: VoiceCallStatus;
  analyserNode: AnalyserNode | null;
  className?: string;
}

// Proportional Compact Geometric Soundwave Configuration
// Spans gracefully with subpixel micro-dots at the tips for seamless line blending
const HALF_WIDTH = 106;
const BAR_SPACING = 3.8;
const CENTER_APERTURE_RADIUS = 16.5;
const MAX_BAR_HEIGHT = 16.5;

interface BarDef {
  index: number;
  x: number;
  normDist: number; // 0 at center, 1 at tips
  baseArchH: number; // Curved height envelope at this x
  isApertureSplit: boolean;
  innerVoidY: number; // Void cutoff if intersecting center circle
  strokeWidth: number; // Tapers down at the tips
  opacity: number; // Fades out at the tips
}

const BARS: BarDef[] = [];
for (let x = -HALF_WIDTH; x <= HALF_WIDTH; x += BAR_SPACING) {
  const normDist = Math.abs(x) / HALF_WIDTH;
  const isApertureSplit = Math.abs(x) < CENTER_APERTURE_RADIUS;
  const innerVoidY = isApertureSplit
    ? Math.sqrt(Math.max(0, CENTER_APERTURE_RADIUS * CENTER_APERTURE_RADIUS - x * x)) + 1
    : 0;

  let baseArchH: number;
  let strokeWidth = 1.9;
  let opacity = 1.0;

  if (normDist <= 0.72) {
    // Main Eye Curve Zone
    const angle = normDist * (Math.PI / 2);
    baseArchH = Math.max(3.2, Math.pow(Math.cos(angle), 0.7) * MAX_BAR_HEIGHT);
  } else {
    // Seamless Dissolve Zone: 2px -> 1px -> half-pixel dots fading directly into horizontal line
    const t = (normDist - 0.72) / (1 - 0.72); // 0 at start of taper, 1 at tip
    const taperFactor = Math.pow(Math.max(0, 1 - t), 1.6);
    baseArchH = Math.max(0.35, taperFactor * 3.8);
    strokeWidth = Math.max(0.7, 1.9 - t * 1.2); // Tapers 1.9px -> 0.7px
    opacity = Math.max(0.18, 1.0 - t * 0.82); // Fades 1.0 -> 0.18
  }

  BARS.push({
    index: BARS.length,
    x,
    normDist,
    baseArchH,
    isApertureSplit,
    innerVoidY,
    strokeWidth,
    opacity,
  });
}

// Radial tick mark coordinates around center aperture
const NUM_OUTER_TICKS = 24;
const OUTER_TICK_R = 13.5;
const NUM_INNER_TICKS = 16;
const INNER_TICK_R = 9.2;

const RADIAL_TICKS_OUTER = Array.from({ length: NUM_OUTER_TICKS }, (_, i) => {
  const angle = (i / NUM_OUTER_TICKS) * 2 * Math.PI - Math.PI / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { cos, sin, x1: cos * OUTER_TICK_R, y1: sin * OUTER_TICK_R };
});

const RADIAL_TICKS_INNER = Array.from({ length: NUM_INNER_TICKS }, (_, i) => {
  const angle = (i / NUM_INNER_TICKS) * 2 * Math.PI - Math.PI / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { cos, sin, x1: cos * INNER_TICK_R, y1: sin * INNER_TICK_R };
});

export const GrokGeometricVoiceWaves = memo(function GrokGeometricVoiceWaves({
  callStatus,
  analyserNode,
  className,
}: GrokGeometricVoiceWavesProps) {
  const solidLinesTopRef = useRef<(SVGLineElement | null)[]>([]);
  const solidLinesBottomRef = useRef<(SVGLineElement | null)[]>([]);
  const outerTicksRef = useRef<(SVGLineElement | null)[]>([]);
  const innerTicksRef = useRef<(SVGLineElement | null)[]>([]);

  // Current heights for bars
  const heightsRef = useRef<number[]>(BARS.map((b) => b.baseArchH * 0.45));

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

      let micEnergy = 0;
      if (isAnalysing && freqData) {
        let sum = 0;
        const count = Math.min(32, freqData.length);
        for (let k = 2; k < count; k++) {
          sum += freqData[k] || 0;
        }
        micEnergy = sum / (count - 2);
      }

      const hArray = heightsRef.current;

      // 1. Update Equalizer Bars & Dissolving Micro-dots
      for (let i = 0; i < BARS.length; i++) {
        const bar = BARS[i]!;
        let targetH = bar.baseArchH * 0.4;

        switch (callStatus) {
          case "idle":
          case "listening": {
            const breath = Math.sin(timestamp * 0.0028 + bar.normDist * 3.5) * 0.2 + 0.8;
            targetH = Math.max(0.3, bar.baseArchH * (0.4 + 0.25 * breath));
            break;
          }

          case "user-speaking": {
            if (isAnalysing && freqData) {
              if (micEnergy < 8) {
                targetH = bar.baseArchH * 0.25;
              } else {
                const bin = Math.min(freqData.length - 1, 2 + Math.floor((1 - bar.normDist) * 22));
                const val = (freqData[bin] || 0) / 255;
                targetH = Math.max(0.35, bar.baseArchH * (0.35 + 0.7 * val));
              }
            } else {
              const energy = Math.sin(timestamp * 0.008 + bar.normDist * 5) * 0.5 + 0.5;
              targetH = Math.max(0.35, bar.baseArchH * (0.4 + 0.6 * energy));
            }
            break;
          }

          case "thinking": {
            const phase = timestamp * 0.005 - bar.normDist * 5;
            const shimmer = Math.pow(Math.max(0, Math.sin(phase)), 2.2);
            targetH = Math.max(0.35, bar.baseArchH * (0.35 + 0.65 * shimmer));
            break;
          }

          case "speaking": {
            const cadence = Math.abs(
              Math.sin(timestamp * 0.0065) * Math.cos(timestamp * 0.003 + bar.normDist * 3),
            );
            const formant = Math.sin(timestamp * 0.005 + bar.normDist * 6) * 0.5 + 0.5;
            targetH = Math.max(0.35, bar.baseArchH * (0.35 + 0.65 * cadence * formant));
            break;
          }
        }

        hArray[i] = hArray[i]! + (targetH - hArray[i]!) * 0.35;
        const currentH = hArray[i]!;

        const lineTop = solidLinesTopRef.current[i];
        const lineBottom = solidLinesBottomRef.current[i];

        if (bar.isApertureSplit) {
          const topStart = -bar.innerVoidY;
          const topEnd = -Math.max(bar.innerVoidY + 1.2, currentH);
          if (lineTop) {
            lineTop.setAttribute("y1", topStart.toFixed(1));
            lineTop.setAttribute("y2", topEnd.toFixed(1));
          }

          const botStart = bar.innerVoidY;
          const botEnd = Math.max(bar.innerVoidY + 1.2, currentH);
          if (lineBottom) {
            lineBottom.setAttribute("y1", botStart.toFixed(1));
            lineBottom.setAttribute("y2", botEnd.toFixed(1));
          }
        } else {
          const topY = -currentH;
          const botY = currentH;

          if (lineTop) {
            lineTop.setAttribute("y1", topY.toFixed(1));
            lineTop.setAttribute("y2", botY.toFixed(1));
          }
        }
      }

      // 2. Update Central Aperture Radial Ticks
      for (let k = 0; k < NUM_OUTER_TICKS; k++) {
        const tickEl = outerTicksRef.current[k];
        if (!tickEl) continue;
        const tickDef = RADIAL_TICKS_OUTER[k]!;
        let tickLen = 2.2;

        if (callStatus === "user-speaking") {
          tickLen = 2.2 + (micEnergy / 255) * 3.5;
        } else if (callStatus === "thinking") {
          const rotPhase =
            (timestamp * 0.005 - (k / NUM_OUTER_TICKS) * Math.PI * 2) % (Math.PI * 2);
          tickLen = 2 + Math.pow(Math.max(0, Math.cos(rotPhase)), 2) * 2.8;
        } else if (callStatus === "speaking") {
          const pulse = Math.sin(timestamp * 0.006 + k * 0.35) * 0.5 + 0.5;
          tickLen = 2 + pulse * 2.6;
        } else {
          const breath = Math.sin(timestamp * 0.0025 + k * 0.25) * 0.5 + 0.5;
          tickLen = 2 + breath * 0.8;
        }

        tickEl.setAttribute("x2", ((OUTER_TICK_R + tickLen) * tickDef.cos).toFixed(1));
        tickEl.setAttribute("y2", ((OUTER_TICK_R + tickLen) * tickDef.sin).toFixed(1));
      }

      for (let k = 0; k < NUM_INNER_TICKS; k++) {
        const tickEl = innerTicksRef.current[k];
        if (!tickEl) continue;
        const tickDef = RADIAL_TICKS_INNER[k]!;
        let tickLen = 1.6;

        if (callStatus === "user-speaking") {
          tickLen = 1.6 + (micEnergy / 255) * 2.4;
        } else if (callStatus === "thinking") {
          const rotPhase =
            (timestamp * 0.004 + (k / NUM_INNER_TICKS) * Math.PI * 2) % (Math.PI * 2);
          tickLen = 1.5 + Math.pow(Math.max(0, Math.cos(rotPhase)), 2) * 2.2;
        } else if (callStatus === "speaking") {
          const pulse = Math.cos(timestamp * 0.005 + k * 0.4) * 0.5 + 0.5;
          tickLen = 1.5 + pulse * 2.2;
        } else {
          const breath = Math.cos(timestamp * 0.0022 + k * 0.3) * 0.5 + 0.5;
          tickLen = 1.5 + breath * 0.6;
        }

        tickEl.setAttribute("x2", ((INNER_TICK_R + tickLen) * tickDef.cos).toFixed(1));
        tickEl.setAttribute("y2", ((INNER_TICK_R + tickLen) * tickDef.sin).toFixed(1));
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(animId);
    };
  }, [callStatus, analyserNode]);

  const palette = (() => {
    switch (callStatus) {
      case "idle":
      case "listening":
        return {
          barStroke: "rgba(228, 228, 231, 0.9)", // zinc-200
          outerRingStroke: "rgba(212, 212, 216, 0.8)",
          innerRingStroke: "rgba(161, 161, 170, 0.6)",
          lineColor: "rgba(212, 212, 216, 0.5)",
          glow: "drop-shadow(0 0 2px rgba(255, 255, 255, 0.15))",
        };
      case "user-speaking":
        return {
          barStroke: "rgba(59, 130, 246, 0.95)", // blue-500
          outerRingStroke: "rgba(59, 130, 246, 0.95)",
          innerRingStroke: "rgba(147, 197, 253, 0.85)",
          lineColor: "rgba(59, 130, 246, 0.5)",
          glow: "drop-shadow(0 0 6px rgba(59, 130, 246, 0.65))",
        };
      case "thinking":
        return {
          barStroke: "rgba(249, 115, 22, 0.95)", // orange-500
          outerRingStroke: "rgba(249, 115, 22, 0.95)",
          innerRingStroke: "rgba(253, 186, 116, 0.85)",
          lineColor: "rgba(249, 115, 22, 0.5)",
          glow: "drop-shadow(0 0 6px rgba(249, 115, 22, 0.65))",
        };
      case "speaking":
        return {
          barStroke: "rgba(34, 197, 94, 0.95)", // green-500
          outerRingStroke: "rgba(34, 197, 94, 0.95)",
          innerRingStroke: "rgba(134, 239, 172, 0.85)",
          lineColor: "rgba(34, 197, 94, 0.5)",
          glow: "drop-shadow(0 0 6px rgba(34, 197, 94, 0.65))",
        };
    }
  })();

  return (
    <svg
      aria-hidden="true"
      viewBox="-118 -20 236 40"
      className={cn(
        "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
        "w-[210px] sm:w-[230px] h-[38px] sm:h-[42px] overflow-visible z-0 transition-all duration-300 select-none",
        className,
      )}
      style={{ filter: palette.glow }}
    >
      <defs>
        {/* Seamless linear gradient for the baseline connector to dissolve into the divider */}
        <linearGradient id="grokTaperLineFade" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="transparent" />
          <stop offset="12%" stopColor={palette.lineColor} stopOpacity="0.15" />
          <stop offset="30%" stopColor={palette.lineColor} stopOpacity="0.45" />
          <stop offset="50%" stopColor={palette.lineColor} stopOpacity="0.7" />
          <stop offset="70%" stopColor={palette.lineColor} stopOpacity="0.45" />
          <stop offset="88%" stopColor={palette.lineColor} stopOpacity="0.15" />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
      </defs>

      {/* Baseline Connector Line: Ensures waves melt seamlessly into the page's divider line */}
      <line x1="-116" y1="0" x2="116" y2="0" stroke="url(#grokTaperLineFade)" strokeWidth="1" />

      {/* 1. Solid Equalizer Soundwave Bars & Tapering Micro-dots */}
      {BARS.map((bar, i) => {
        if (bar.isApertureSplit) {
          return (
            <g key={`bar-split-${bar.index}`} opacity={bar.opacity}>
              <line
                ref={(el) => {
                  solidLinesTopRef.current[i] = el;
                }}
                x1={bar.x}
                y1={-bar.innerVoidY}
                x2={bar.x}
                y2={-bar.baseArchH}
                stroke={palette.barStroke}
                strokeWidth={bar.strokeWidth}
                strokeLinecap="round"
                className="transition-colors duration-200"
              />
              <line
                ref={(el) => {
                  solidLinesBottomRef.current[i] = el;
                }}
                x1={bar.x}
                y1={bar.innerVoidY}
                x2={bar.x}
                y2={bar.baseArchH}
                stroke={palette.barStroke}
                strokeWidth={bar.strokeWidth}
                strokeLinecap="round"
                className="transition-colors duration-200"
              />
            </g>
          );
        }

        return (
          <line
            key={`bar-solid-${bar.index}`}
            ref={(el) => {
              solidLinesTopRef.current[i] = el;
            }}
            x1={bar.x}
            y1={-bar.baseArchH * 0.4}
            x2={bar.x}
            y2={bar.baseArchH * 0.4}
            stroke={palette.barStroke}
            strokeWidth={bar.strokeWidth}
            strokeLinecap="round"
            opacity={bar.opacity}
            className="transition-colors duration-200"
          />
        );
      })}

      {/* 2. Center Circular Void Ring */}
      <circle
        cx="0"
        cy="0"
        r={CENTER_APERTURE_RADIUS - 0.5}
        fill="none"
        stroke={palette.outerRingStroke}
        strokeWidth="0.9"
        opacity={0.3}
      />

      {/* 3. Outer Radial Tick Ring */}
      {RADIAL_TICKS_OUTER.map((tick, k) => (
        <line
          key={`radial-outer-${k}`}
          ref={(el) => {
            outerTicksRef.current[k] = el;
          }}
          x1={tick.x1.toFixed(1)}
          y1={tick.y1.toFixed(1)}
          x2={((OUTER_TICK_R + 2.2) * tick.cos).toFixed(1)}
          y2={((OUTER_TICK_R + 2.2) * tick.sin).toFixed(1)}
          stroke={palette.outerRingStroke}
          strokeWidth="1.5"
          strokeLinecap="round"
          className="transition-colors duration-200"
        />
      ))}

      {/* 4. Inner Radial Tick Ring */}
      {RADIAL_TICKS_INNER.map((tick, k) => (
        <line
          key={`radial-inner-${k}`}
          ref={(el) => {
            innerTicksRef.current[k] = el;
          }}
          x1={tick.x1.toFixed(1)}
          y1={tick.y1.toFixed(1)}
          x2={((INNER_TICK_R + 1.6) * tick.cos).toFixed(1)}
          y2={((INNER_TICK_R + 1.6) * tick.sin).toFixed(1)}
          stroke={palette.innerRingStroke}
          strokeWidth="1.3"
          strokeLinecap="round"
          className="transition-colors duration-200"
        />
      ))}
    </svg>
  );
});
