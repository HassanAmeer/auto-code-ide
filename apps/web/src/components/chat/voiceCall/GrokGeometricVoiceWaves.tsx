import { memo, useEffect, useRef } from "react";
import { cn } from "~/lib/utils";
import type { VoiceCallStatus } from "./VoiceVisualizerWaves";

export interface GrokGeometricVoiceWavesProps {
  callStatus: VoiceCallStatus;
  analyserNode: AnalyserNode | null;
  className?: string;
}

// Compact Geometric Soundwave Configuration
// Total width ~230px, sleek height ~52px (zero overlap with model picker or side buttons)
const HALF_WIDTH = 115;
const BAR_SPACING = 5;
const CENTER_APERTURE_RADIUS = 25;
const MAX_BAR_HEIGHT = 25;

interface BarDef {
  index: number;
  x: number;
  normDist: number; // 0 at center, 1 at tips
  baseArchH: number; // Curved height envelope at this x
  isApertureSplit: boolean;
  innerVoidY: number; // Void cutoff if intersecting center circle
}

const BARS: BarDef[] = [];
for (let x = -HALF_WIDTH; x <= HALF_WIDTH; x += BAR_SPACING) {
  const normDist = Math.abs(x) / HALF_WIDTH;
  // Eye curve arch envelope: max near center, tapering smoothly to tips
  const angle = normDist * (Math.PI / 2);
  const baseArchH = Math.max(2.5, Math.pow(Math.cos(angle), 0.7) * MAX_BAR_HEIGHT);

  const isApertureSplit = Math.abs(x) < CENTER_APERTURE_RADIUS;
  const innerVoidY = isApertureSplit
    ? Math.sqrt(Math.max(0, CENTER_APERTURE_RADIUS * CENTER_APERTURE_RADIUS - x * x)) + 1.5
    : 0;

  BARS.push({
    index: BARS.length,
    x,
    normDist,
    baseArchH,
    isApertureSplit,
    innerVoidY,
  });
}

// Radial tick mark coordinates around center aperture
const NUM_OUTER_TICKS = 28;
const OUTER_TICK_R = 20.5;
const NUM_INNER_TICKS = 20;
const INNER_TICK_R = 14;

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

      // 1. Update Equalizer Bars
      for (let i = 0; i < BARS.length; i++) {
        const bar = BARS[i]!;
        let targetH = bar.baseArchH * 0.4;

        switch (callStatus) {
          case "idle":
          case "listening": {
            // Calm subtle breathing wave in gray/silver
            const breath = Math.sin(timestamp * 0.0028 + bar.normDist * 3.5) * 0.2 + 0.8;
            targetH = Math.max(2.5, bar.baseArchH * (0.4 + 0.25 * breath));
            break;
          }

          case "user-speaking": {
            // Real audio frequency reactive wave in blue
            if (isAnalysing && freqData) {
              if (micEnergy < 8) {
                targetH = bar.baseArchH * 0.25;
              } else {
                const bin = Math.min(freqData.length - 1, 2 + Math.floor((1 - bar.normDist) * 22));
                const val = (freqData[bin] || 0) / 255;
                targetH = Math.max(3, bar.baseArchH * (0.35 + 0.7 * val));
              }
            } else {
              const energy = Math.sin(timestamp * 0.008 + bar.normDist * 5) * 0.5 + 0.5;
              targetH = Math.max(3, bar.baseArchH * (0.4 + 0.6 * energy));
            }
            break;
          }

          case "thinking": {
            // Travelling pulse wave in orange
            const phase = timestamp * 0.005 - bar.normDist * 5;
            const shimmer = Math.pow(Math.max(0, Math.sin(phase)), 2.2);
            targetH = Math.max(3, bar.baseArchH * (0.35 + 0.65 * shimmer));
            break;
          }

          case "speaking": {
            // Vocal cadence undulations in green
            const cadence = Math.abs(
              Math.sin(timestamp * 0.0065) * Math.cos(timestamp * 0.003 + bar.normDist * 3),
            );
            const formant = Math.sin(timestamp * 0.005 + bar.normDist * 6) * 0.5 + 0.5;
            targetH = Math.max(3, bar.baseArchH * (0.35 + 0.65 * cadence * formant));
            break;
          }
        }

        hArray[i] = hArray[i]! + (targetH - hArray[i]!) * 0.35;
        const currentH = hArray[i]!;

        const lineTop = solidLinesTopRef.current[i];
        const lineBottom = solidLinesBottomRef.current[i];

        if (bar.isApertureSplit) {
          // Top bar segment above center circle
          const topStart = -bar.innerVoidY;
          const topEnd = -Math.max(bar.innerVoidY + 1.5, currentH);
          if (lineTop) {
            lineTop.setAttribute("y1", topStart.toFixed(1));
            lineTop.setAttribute("y2", topEnd.toFixed(1));
          }

          // Bottom bar segment below center circle
          const botStart = bar.innerVoidY;
          const botEnd = Math.max(bar.innerVoidY + 1.5, currentH);
          if (lineBottom) {
            lineBottom.setAttribute("y1", botStart.toFixed(1));
            lineBottom.setAttribute("y2", botEnd.toFixed(1));
          }
        } else {
          // Continuous single bar
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
        let tickLen = 2.8;

        if (callStatus === "user-speaking") {
          tickLen = 2.8 + (micEnergy / 255) * 4;
        } else if (callStatus === "thinking") {
          const rotPhase =
            (timestamp * 0.005 - (k / NUM_OUTER_TICKS) * Math.PI * 2) % (Math.PI * 2);
          tickLen = 2.5 + Math.pow(Math.max(0, Math.cos(rotPhase)), 2) * 3.5;
        } else if (callStatus === "speaking") {
          const pulse = Math.sin(timestamp * 0.006 + k * 0.35) * 0.5 + 0.5;
          tickLen = 2.5 + pulse * 3.2;
        } else {
          const breath = Math.sin(timestamp * 0.0025 + k * 0.25) * 0.5 + 0.5;
          tickLen = 2.5 + breath * 1;
        }

        tickEl.setAttribute("x2", ((OUTER_TICK_R + tickLen) * tickDef.cos).toFixed(1));
        tickEl.setAttribute("y2", ((OUTER_TICK_R + tickLen) * tickDef.sin).toFixed(1));
      }

      for (let k = 0; k < NUM_INNER_TICKS; k++) {
        const tickEl = innerTicksRef.current[k];
        if (!tickEl) continue;
        const tickDef = RADIAL_TICKS_INNER[k]!;
        let tickLen = 2;

        if (callStatus === "user-speaking") {
          tickLen = 2 + (micEnergy / 255) * 3;
        } else if (callStatus === "thinking") {
          const rotPhase =
            (timestamp * 0.004 + (k / NUM_INNER_TICKS) * Math.PI * 2) % (Math.PI * 2);
          tickLen = 1.8 + Math.pow(Math.max(0, Math.cos(rotPhase)), 2) * 2.8;
        } else if (callStatus === "speaking") {
          const pulse = Math.cos(timestamp * 0.005 + k * 0.4) * 0.5 + 0.5;
          tickLen = 1.8 + pulse * 2.8;
        } else {
          const breath = Math.cos(timestamp * 0.0022 + k * 0.3) * 0.5 + 0.5;
          tickLen = 1.8 + breath * 0.8;
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

  // Color Mapping:
  // Idle: Silver/Gray (Same as image)
  // User Speaking: Electric Blue
  // Thinking: Orange
  // AI TTS: Emerald Green
  const palette = (() => {
    switch (callStatus) {
      case "idle":
      case "listening":
        return {
          barStroke: "rgba(228, 228, 231, 0.9)", // zinc-200
          outerRingStroke: "rgba(212, 212, 216, 0.8)",
          innerRingStroke: "rgba(161, 161, 170, 0.6)",
          glow: "drop-shadow(0 0 2px rgba(255, 255, 255, 0.15))",
        };
      case "user-speaking":
        return {
          barStroke: "rgba(59, 130, 246, 0.95)", // blue-500
          outerRingStroke: "rgba(59, 130, 246, 0.95)",
          innerRingStroke: "rgba(147, 197, 253, 0.85)",
          glow: "drop-shadow(0 0 6px rgba(59, 130, 246, 0.65))",
        };
      case "thinking":
        return {
          barStroke: "rgba(249, 115, 22, 0.95)", // orange-500
          outerRingStroke: "rgba(249, 115, 22, 0.95)",
          innerRingStroke: "rgba(253, 186, 116, 0.85)",
          glow: "drop-shadow(0 0 6px rgba(249, 115, 22, 0.65))",
        };
      case "speaking":
        return {
          barStroke: "rgba(34, 197, 94, 0.95)", // green-500
          outerRingStroke: "rgba(34, 197, 94, 0.95)",
          innerRingStroke: "rgba(134, 239, 172, 0.85)",
          glow: "drop-shadow(0 0 6px rgba(34, 197, 94, 0.65))",
        };
    }
  })();

  return (
    <svg
      aria-hidden="true"
      viewBox="-125 -30 250 60"
      className={cn(
        "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
        "w-[230px] sm:w-[250px] h-[54px] sm:h-[58px] overflow-visible z-0 transition-all duration-300 select-none",
        className,
      )}
      style={{ filter: palette.glow }}
    >
      {/* 1. Solid Equalizer Soundwave Bars (No outer outline borders, no whiskers) */}
      {BARS.map((bar, i) => {
        if (bar.isApertureSplit) {
          return (
            <g key={`bar-split-${bar.index}`}>
              {/* Top half */}
              <line
                ref={(el) => {
                  solidLinesTopRef.current[i] = el;
                }}
                x1={bar.x}
                y1={-bar.innerVoidY}
                x2={bar.x}
                y2={-bar.baseArchH}
                stroke={palette.barStroke}
                strokeWidth="2.3"
                strokeLinecap="round"
                className="transition-colors duration-200"
              />
              {/* Bottom half */}
              <line
                ref={(el) => {
                  solidLinesBottomRef.current[i] = el;
                }}
                x1={bar.x}
                y1={bar.innerVoidY}
                x2={bar.x}
                y2={bar.baseArchH}
                stroke={palette.barStroke}
                strokeWidth="2.3"
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
            strokeWidth="2.3"
            strokeLinecap="round"
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
        strokeWidth="1"
        opacity={0.3}
      />

      {/* 3. Outer Radial Tick Ring (around the center phone button) */}
      {RADIAL_TICKS_OUTER.map((tick, k) => (
        <line
          key={`radial-outer-${k}`}
          ref={(el) => {
            outerTicksRef.current[k] = el;
          }}
          x1={tick.x1.toFixed(1)}
          y1={tick.y1.toFixed(1)}
          x2={((OUTER_TICK_R + 2.8) * tick.cos).toFixed(1)}
          y2={((OUTER_TICK_R + 2.8) * tick.sin).toFixed(1)}
          stroke={palette.outerRingStroke}
          strokeWidth="1.8"
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
          x2={((INNER_TICK_R + 2) * tick.cos).toFixed(1)}
          y2={((INNER_TICK_R + 2) * tick.sin).toFixed(1)}
          stroke={palette.innerRingStroke}
          strokeWidth="1.5"
          strokeLinecap="round"
          className="transition-colors duration-200"
        />
      ))}
    </svg>
  );
});
