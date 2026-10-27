import { memo, useEffect, useRef } from "react";
import { cn } from "~/lib/utils";
import type { VoiceCallStatus } from "./VoiceVisualizerWaves";

export interface GrokGeometricVoiceWavesProps {
  callStatus: VoiceCallStatus;
  analyserNode: AnalyserNode | null;
  className?: string;
}

// Geometric Soundwave Configuration
// Spanning ~420px total width horizontally like an eye / accretion disk
const HALF_WIDTH = 200;
const BAR_SPACING = 7;
const CENTER_APERTURE_RADIUS = 28;
const MAX_BAR_HEIGHT = 46;

// Precompute bar positions along the X-axis
interface BarDef {
  index: number;
  x: number;
  normDist: number; // 0 at center, 1 at outer tips
  baseArchH: number; // Max curved height at this x
  isApertureSplit: boolean;
  innerVoidY: number; // Void cutoff if inside aperture
}

const BARS: BarDef[] = [];
for (let x = -HALF_WIDTH; x <= HALF_WIDTH; x += BAR_SPACING) {
  const normDist = Math.abs(x) / HALF_WIDTH;
  // Smooth cosine arch envelope: 1 at center, ~0.05 at outer tips
  const angle = normDist * (Math.PI / 2);
  const baseArchH = Math.max(3, Math.pow(Math.cos(angle), 0.65) * MAX_BAR_HEIGHT);

  const isApertureSplit = Math.abs(x) < CENTER_APERTURE_RADIUS;
  const innerVoidY = isApertureSplit
    ? Math.sqrt(Math.max(0, CENTER_APERTURE_RADIUS * CENTER_APERTURE_RADIUS - x * x)) + 2.5
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
const NUM_OUTER_TICKS = 32;
const OUTER_TICK_R = 22;
const NUM_INNER_TICKS = 22;
const INNER_TICK_R = 15;

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
  // References for direct DOM SVG manipulation for 60fps+ fluid performance
  const solidLinesTopRef = useRef<(SVGLineElement | null)[]>([]);
  const solidLinesBottomRef = useRef<(SVGLineElement | null)[]>([]);
  const whiskersTopRef = useRef<(SVGLineElement | null)[]>([]);
  const whiskersBottomRef = useRef<(SVGLineElement | null)[]>([]);
  const outerTicksRef = useRef<(SVGLineElement | null)[]>([]);
  const innerTicksRef = useRef<(SVGLineElement | null)[]>([]);

  // Current smoothed heights for each bar
  const heightsRef = useRef<number[]>(BARS.map((b) => b.baseArchH * 0.4));

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

      // 1. Update Equalizer Bars & Whiskers
      for (let i = 0; i < BARS.length; i++) {
        const bar = BARS[i]!;
        let targetH = bar.baseArchH * 0.35;

        switch (callStatus) {
          case "idle":
          case "listening": {
            // Calm rhythmic breathing wave across the horizontal horizon in silver/gray
            const breath = Math.sin(timestamp * 0.0025 + bar.normDist * 4) * 0.25 + 0.75;
            targetH = Math.max(2.5, bar.baseArchH * (0.4 + 0.3 * breath));
            break;
          }

          case "user-speaking": {
            // Microphone reactive wave in bright blue
            if (isAnalysing && freqData) {
              if (micEnergy < 10) {
                targetH = bar.baseArchH * 0.25;
              } else {
                const bin = Math.min(freqData.length - 1, 2 + Math.floor((1 - bar.normDist) * 24));
                const val = (freqData[bin] || 0) / 255;
                targetH = Math.max(3, bar.baseArchH * (0.3 + 0.75 * val));
              }
            } else {
              const energy = Math.sin(timestamp * 0.008 + bar.normDist * 5) * 0.5 + 0.5;
              targetH = Math.max(3, bar.baseArchH * (0.35 + 0.65 * energy));
            }
            break;
          }

          case "thinking": {
            // Warm orange travelling shimmer wave rippling outwards from center to ends
            const phase = timestamp * 0.0045 - bar.normDist * 5.5;
            const shimmer = Math.pow(Math.max(0, Math.sin(phase)), 2.5);
            targetH = Math.max(3, bar.baseArchH * (0.3 + 0.7 * shimmer));
            break;
          }

          case "speaking": {
            // Assistant speaking / TTS in emerald green with vocal formants
            const cadence = Math.abs(
              Math.sin(timestamp * 0.0065) * Math.cos(timestamp * 0.0028 + bar.normDist * 3.5),
            );
            const formant = Math.sin(timestamp * 0.005 + bar.normDist * 7) * 0.5 + 0.5;
            targetH = Math.max(3, bar.baseArchH * (0.3 + 0.7 * cadence * formant));
            break;
          }
        }

        // Smooth easing towards target height
        hArray[i] = hArray[i]! + (targetH - hArray[i]!) * 0.35;
        const currentH = hArray[i]!;

        const lineTop = solidLinesTopRef.current[i];
        const lineBottom = solidLinesBottomRef.current[i];
        const whiskerTop = whiskersTopRef.current[i];
        const whiskerBottom = whiskersBottomRef.current[i];

        if (bar.isApertureSplit) {
          // Top bar above center circle
          const topStart = -bar.innerVoidY;
          const topEnd = -Math.max(bar.innerVoidY + 2, currentH);
          if (lineTop) {
            lineTop.setAttribute("y1", topStart.toFixed(1));
            lineTop.setAttribute("y2", topEnd.toFixed(1));
          }
          if (whiskerTop) {
            whiskerTop.setAttribute("y1", topEnd.toFixed(1));
            whiskerTop.setAttribute("y2", (topEnd - 10 * (1 - bar.normDist)).toFixed(1));
          }

          // Bottom bar below center circle
          const botStart = bar.innerVoidY;
          const botEnd = Math.max(bar.innerVoidY + 2, currentH);
          if (lineBottom) {
            lineBottom.setAttribute("y1", botStart.toFixed(1));
            lineBottom.setAttribute("y2", botEnd.toFixed(1));
          }
          if (whiskerBottom) {
            whiskerBottom.setAttribute("y1", botEnd.toFixed(1));
            whiskerBottom.setAttribute("y2", (botEnd + 10 * (1 - bar.normDist)).toFixed(1));
          }
        } else {
          // Continuous single bar spanning through horizontal baseline
          const topY = -currentH;
          const botY = currentH;

          if (lineTop) {
            lineTop.setAttribute("y1", topY.toFixed(1));
            lineTop.setAttribute("y2", botY.toFixed(1));
          }
          if (whiskerTop) {
            whiskerTop.setAttribute("y1", topY.toFixed(1));
            whiskerTop.setAttribute("y2", (topY - 12 * (1 - bar.normDist)).toFixed(1));
          }
          if (whiskerBottom) {
            whiskerBottom.setAttribute("y1", botY.toFixed(1));
            whiskerBottom.setAttribute("y2", (botY + 12 * (1 - bar.normDist)).toFixed(1));
          }
        }
      }

      // 2. Update Central Aperture Radial Ticks
      for (let k = 0; k < NUM_OUTER_TICKS; k++) {
        const tickEl = outerTicksRef.current[k];
        if (!tickEl) continue;
        const tickDef = RADIAL_TICKS_OUTER[k]!;
        let tickLen = 3.5;

        if (callStatus === "user-speaking") {
          tickLen = 3.5 + (micEnergy / 255) * 6;
        } else if (callStatus === "thinking") {
          const rotPhase =
            (timestamp * 0.005 - (k / NUM_OUTER_TICKS) * Math.PI * 2) % (Math.PI * 2);
          tickLen = 3 + Math.pow(Math.max(0, Math.cos(rotPhase)), 2) * 5;
        } else if (callStatus === "speaking") {
          const pulse = Math.sin(timestamp * 0.006 + k * 0.3) * 0.5 + 0.5;
          tickLen = 3 + pulse * 4.5;
        } else {
          const breath = Math.sin(timestamp * 0.002 + k * 0.2) * 0.5 + 0.5;
          tickLen = 3 + breath * 1.5;
        }

        tickEl.setAttribute("x2", ((OUTER_TICK_R + tickLen) * tickDef.cos).toFixed(1));
        tickEl.setAttribute("y2", ((OUTER_TICK_R + tickLen) * tickDef.sin).toFixed(1));
      }

      for (let k = 0; k < NUM_INNER_TICKS; k++) {
        const tickEl = innerTicksRef.current[k];
        if (!tickEl) continue;
        const tickDef = RADIAL_TICKS_INNER[k]!;
        let tickLen = 2.5;

        if (callStatus === "user-speaking") {
          tickLen = 2.5 + (micEnergy / 255) * 4;
        } else if (callStatus === "thinking") {
          const rotPhase =
            (timestamp * 0.004 + (k / NUM_INNER_TICKS) * Math.PI * 2) % (Math.PI * 2);
          tickLen = 2.5 + Math.pow(Math.max(0, Math.cos(rotPhase)), 2) * 3.5;
        } else if (callStatus === "speaking") {
          const pulse = Math.cos(timestamp * 0.005 + k * 0.4) * 0.5 + 0.5;
          tickLen = 2.5 + pulse * 3.5;
        } else {
          const breath = Math.cos(timestamp * 0.0022 + k * 0.25) * 0.5 + 0.5;
          tickLen = 2.5 + breath * 1.2;
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

  // Color & Theme Mapping based on user requirements:
  // 1. Idle/Silent in call: Silver/Gray (Same as image)
  // 2. User Speaking: Electric Blue
  // 3. Thinking/Waiting: Warm Glowing Orange
  // 4. AI Speaking (TTS): Vivid Emerald Green
  const palette = (() => {
    switch (callStatus) {
      case "idle":
      case "listening":
        return {
          barStroke: "rgba(228, 228, 231, 0.88)", // zinc-200
          whiskerStroke: "rgba(161, 161, 170, 0.45)", // zinc-400
          arcStroke: "rgba(161, 161, 170, 0.55)",
          outerRingStroke: "rgba(212, 212, 216, 0.75)",
          innerRingStroke: "rgba(161, 161, 170, 0.55)",
          apertureGlow: "drop-shadow(0 0 4px rgba(255, 255, 255, 0.18))",
        };
      case "user-speaking":
        return {
          barStroke: "rgba(59, 130, 246, 0.95)", // blue-500
          whiskerStroke: "rgba(147, 197, 253, 0.55)", // blue-300
          arcStroke: "rgba(96, 165, 250, 0.65)", // blue-400
          outerRingStroke: "rgba(59, 130, 246, 0.95)",
          innerRingStroke: "rgba(147, 197, 253, 0.8)",
          apertureGlow: "drop-shadow(0 0 8px rgba(59, 130, 246, 0.7))",
        };
      case "thinking":
        return {
          barStroke: "rgba(249, 115, 22, 0.95)", // orange-500
          whiskerStroke: "rgba(253, 186, 116, 0.55)", // orange-300
          arcStroke: "rgba(251, 146, 60, 0.65)", // orange-400
          outerRingStroke: "rgba(249, 115, 22, 0.95)",
          innerRingStroke: "rgba(253, 186, 116, 0.8)",
          apertureGlow: "drop-shadow(0 0 8px rgba(249, 115, 22, 0.7))",
        };
      case "speaking":
        return {
          barStroke: "rgba(34, 197, 94, 0.95)", // green-500
          whiskerStroke: "rgba(134, 239, 172, 0.55)", // green-300
          arcStroke: "rgba(74, 222, 128, 0.65)", // emerald-400
          outerRingStroke: "rgba(34, 197, 94, 0.95)",
          innerRingStroke: "rgba(134, 239, 172, 0.8)",
          apertureGlow: "drop-shadow(0 0 8px rgba(34, 197, 94, 0.7))",
        };
    }
  })();

  return (
    <svg
      aria-hidden="true"
      viewBox="-240 -60 480 120"
      className={cn(
        "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
        "w-[340px] sm:w-[460px] md:w-[500px] h-[96px] sm:h-[110px] overflow-visible z-0 transition-all duration-300 select-none",
        className,
      )}
      style={{ filter: palette.apertureGlow }}
    >
      <defs>
        {/* Horizontal subtle gradient fading out at far left and right edges */}
        <linearGradient id="horizontalBaselineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="transparent" />
          <stop offset="15%" stopColor={palette.arcStroke} stopOpacity="0.4" />
          <stop offset="50%" stopColor={palette.arcStroke} stopOpacity="0.8" />
          <stop offset="85%" stopColor={palette.arcStroke} stopOpacity="0.4" />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
      </defs>

      {/* 1. Fine Horizontal Baseline Line cutting across through the accretion disk */}
      <line
        x1="-235"
        y1="0"
        x2="235"
        y2="0"
        stroke="url(#horizontalBaselineGrad)"
        strokeWidth="1"
      />

      {/* 2. Concentric Elliptical Gravitational Arcs (Upper & Lower Eyebrow Curves) */}
      {/* Inner Arcs */}
      <path
        d="M -70,-16 Q 0,-34 70,-16"
        fill="none"
        stroke={palette.arcStroke}
        strokeWidth="1.2"
        strokeDasharray="2 3"
        opacity={0.65}
      />
      <path
        d="M -70,16 Q 0,34 70,16"
        fill="none"
        stroke={palette.arcStroke}
        strokeWidth="1.2"
        strokeDasharray="2 3"
        opacity={0.65}
      />

      {/* Mid Arcs */}
      <path
        d="M -115,-18 Q 0,-42 115,-18"
        fill="none"
        stroke={palette.arcStroke}
        strokeWidth="1.3"
        opacity={0.75}
      />
      <path
        d="M -115,18 Q 0,42 115,18"
        fill="none"
        stroke={palette.arcStroke}
        strokeWidth="1.3"
        opacity={0.75}
      />

      {/* Outer Arcs */}
      <path
        d="M -165,-14 Q 0,-48 165,-14"
        fill="none"
        stroke={palette.arcStroke}
        strokeWidth="1.1"
        strokeDasharray="3 4"
        opacity={0.5}
      />
      <path
        d="M -165,14 Q 0,48 165,14"
        fill="none"
        stroke={palette.arcStroke}
        strokeWidth="1.1"
        strokeDasharray="3 4"
        opacity={0.5}
      />

      {/* 3. Dotted Extension Whiskers (Frequency telemetry lines extending above & below bars) */}
      {BARS.map((bar, i) => (
        <g key={`whisker-group-${bar.index}`}>
          <line
            ref={(el) => {
              whiskersTopRef.current[i] = el;
            }}
            x1={bar.x}
            y1={-bar.baseArchH}
            x2={bar.x}
            y2={-bar.baseArchH - 10}
            stroke={palette.whiskerStroke}
            strokeWidth="1.1"
            strokeDasharray="1.5 3"
          />
          <line
            ref={(el) => {
              whiskersBottomRef.current[i] = el;
            }}
            x1={bar.x}
            y1={bar.baseArchH}
            x2={bar.x}
            y2={bar.baseArchH + 10}
            stroke={palette.whiskerStroke}
            strokeWidth="1.1"
            strokeDasharray="1.5 3"
          />
        </g>
      ))}

      {/* 4. Solid Equalizer Soundwave Bars */}
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
                strokeWidth="2.8"
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
                strokeWidth="2.8"
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
            strokeWidth="2.8"
            strokeLinecap="round"
            className="transition-colors duration-200"
          />
        );
      })}

      {/* 5. Center Void Perimeter Ring */}
      <circle
        cx="0"
        cy="0"
        r={CENTER_APERTURE_RADIUS - 0.5}
        fill="none"
        stroke={palette.outerRingStroke}
        strokeWidth="1"
        opacity={0.4}
      />

      {/* 6. Outer Radial Tick Ring (around the center phone button) */}
      {RADIAL_TICKS_OUTER.map((tick, k) => (
        <line
          key={`radial-outer-${k}`}
          ref={(el) => {
            outerTicksRef.current[k] = el;
          }}
          x1={tick.x1.toFixed(1)}
          y1={tick.y1.toFixed(1)}
          x2={((OUTER_TICK_R + 3.5) * tick.cos).toFixed(1)}
          y2={((OUTER_TICK_R + 3.5) * tick.sin).toFixed(1)}
          stroke={palette.outerRingStroke}
          strokeWidth="2"
          strokeLinecap="round"
          className="transition-colors duration-200"
        />
      ))}

      {/* 7. Inner Radial Tick Ring (inside outer ring, encircling the center icon) */}
      {RADIAL_TICKS_INNER.map((tick, k) => (
        <line
          key={`radial-inner-${k}`}
          ref={(el) => {
            innerTicksRef.current[k] = el;
          }}
          x1={tick.x1.toFixed(1)}
          y1={tick.y1.toFixed(1)}
          x2={((INNER_TICK_R + 2.5) * tick.cos).toFixed(1)}
          y2={((INNER_TICK_R + 2.5) * tick.sin).toFixed(1)}
          stroke={palette.innerRingStroke}
          strokeWidth="1.6"
          strokeLinecap="round"
          className="transition-colors duration-200"
        />
      ))}
    </svg>
  );
});
