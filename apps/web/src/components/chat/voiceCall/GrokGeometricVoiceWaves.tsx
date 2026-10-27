import { memo, useEffect, useRef } from "react";
import { cn } from "~/lib/utils";
import type { VoiceCallStatus } from "./VoiceVisualizerWaves";

export interface GrokGeometricVoiceWavesProps {
  callStatus: VoiceCallStatus;
  analyserNode: AnalyserNode | null;
  className?: string;
}

// ── Black Hole Accretion Disk / Grok Voice Geometric Wave Specs ──
const HALF_WIDTH = 118;
const BAR_SPACING = 3.4;
const CENTER_VOID_RADIUS = 16.5;
const MAX_BAR_HEIGHT = 31.0;

interface BarDef {
  index: number;
  x: number;
  normDist: number; // 0 at center, 1 at wings
  baseArchH: number; // Eye envelope peak height at this x
  isApertureSplit: boolean;
  innerVoidY: number; // Cutoff for the black hole core
  strokeWidth: number;
  opacity: number;
  hasAntenna: boolean; // Subtle dashed frequency line extending outward
  antennaTopExt: number;
  antennaBotExt: number;
}

const BARS: BarDef[] = [];
for (let x = -112; x <= 112; x += BAR_SPACING) {
  const normDist = Math.abs(x) / HALF_WIDTH;
  const isApertureSplit = Math.abs(x) < CENTER_VOID_RADIUS;
  const innerVoidY = isApertureSplit
    ? Math.sqrt(Math.max(0, CENTER_VOID_RADIUS * CENTER_VOID_RADIUS - x * x)) + 1.2
    : 0;

  // Eye / Accretion envelope profile: Smooth cosine-lens curve
  let baseArchH: number;
  let strokeWidth = 2.1;
  let opacity = 1.0;

  if (normDist <= 0.72) {
    // Main Accretion Lensing Zone (peaks at center, arches around black hole)
    const angle = normDist * (Math.PI / 2);
    baseArchH = Math.max(5.5, Math.pow(Math.cos(angle), 0.88) * MAX_BAR_HEIGHT);
  } else {
    // Seamless Dissolve Zone: 2px -> 1px -> 0.35px micro-dots melting into horizontal hairline
    const t = (normDist - 0.72) / (1 - 0.72);
    const taper = Math.pow(Math.max(0, 1 - t), 1.5);
    baseArchH = Math.max(0.4, taper * 5.5);
    strokeWidth = Math.max(0.7, 2.1 - t * 1.4);
    opacity = Math.max(0.15, 1.0 - t * 0.85);
  }

  // Antenna frequency lines on every 3rd bar in the middle region
  const hasAntenna = BARS.length % 3 === 0 && normDist < 0.65;
  const antennaTopExt = hasAntenna ? 4.5 + (1 - normDist) * 4.0 : 0;
  const antennaBotExt = hasAntenna ? 4.5 + (1 - normDist) * 4.0 : 0;

  BARS.push({
    index: BARS.length,
    x,
    normDist,
    baseArchH,
    isApertureSplit,
    innerVoidY,
    strokeWidth,
    opacity,
    hasAntenna,
    antennaTopExt,
    antennaBotExt,
  });
}

// Inner Event Horizon Tick Marks (subtle clock ticks inside the black hole core)
const NUM_INNER_TICKS = 20;
const INNER_TICK_R = 12.0;
const INNER_TICKS = Array.from({ length: NUM_INNER_TICKS }, (_, i) => {
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
  const antennaTopRef = useRef<(SVGLineElement | null)[]>([]);
  const antennaBottomRef = useRef<(SVGLineElement | null)[]>([]);
  const innerTicksRef = useRef<(SVGLineElement | null)[]>([]);

  // Bar current heights
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

      // 1. Dynamic Bar Heights Animation
      for (let i = 0; i < BARS.length; i++) {
        const bar = BARS[i]!;
        let targetH = bar.baseArchH * 0.42;

        switch (callStatus) {
          case "idle":
          case "listening": {
            const breath = Math.sin(timestamp * 0.0025 + bar.normDist * 3.2) * 0.18 + 0.82;
            targetH = Math.max(0.4, bar.baseArchH * (0.42 + 0.22 * breath));
            break;
          }

          case "user-speaking": {
            if (isAnalysing && freqData) {
              if (micEnergy < 8) {
                targetH = bar.baseArchH * 0.28;
              } else {
                const bin = Math.min(freqData.length - 1, 2 + Math.floor((1 - bar.normDist) * 22));
                const val = (freqData[bin] || 0) / 255;
                targetH = Math.max(0.4, bar.baseArchH * (0.35 + 0.72 * val));
              }
            } else {
              const energy = Math.sin(timestamp * 0.008 + bar.normDist * 5.0) * 0.5 + 0.5;
              targetH = Math.max(0.4, bar.baseArchH * (0.38 + 0.62 * energy));
            }
            break;
          }

          case "thinking": {
            const phase = timestamp * 0.005 - bar.normDist * 5.5;
            const shimmer = Math.pow(Math.max(0, Math.sin(phase)), 2.2);
            targetH = Math.max(0.4, bar.baseArchH * (0.36 + 0.64 * shimmer));
            break;
          }

          case "speaking": {
            const cadence = Math.abs(
              Math.sin(timestamp * 0.0065) * Math.cos(timestamp * 0.003 + bar.normDist * 3.2),
            );
            const formant = Math.sin(timestamp * 0.005 + bar.normDist * 6.0) * 0.5 + 0.5;
            targetH = Math.max(0.4, bar.baseArchH * (0.36 + 0.64 * cadence * formant));
            break;
          }
        }

        hArray[i] = hArray[i]! + (targetH - hArray[i]!) * 0.35;
        const currentH = hArray[i]!;

        const lineTop = solidLinesTopRef.current[i];
        const lineBottom = solidLinesBottomRef.current[i];
        const antTop = antennaTopRef.current[i];
        const antBottom = antennaBottomRef.current[i];

        if (bar.isApertureSplit) {
          // Arches over the black hole core
          const topStart = -bar.innerVoidY;
          const topEnd = -Math.max(bar.innerVoidY + 2.0, currentH);
          if (lineTop) {
            lineTop.setAttribute("y1", topStart.toFixed(1));
            lineTop.setAttribute("y2", topEnd.toFixed(1));
          }

          const botStart = bar.innerVoidY;
          const botEnd = Math.max(bar.innerVoidY + 2.0, currentH);
          if (lineBottom) {
            lineBottom.setAttribute("y1", botStart.toFixed(1));
            lineBottom.setAttribute("y2", botEnd.toFixed(1));
          }

          if (antTop) {
            antTop.setAttribute("y1", (topEnd - 1.5).toFixed(1));
            antTop.setAttribute("y2", (topEnd - 1.5 - bar.antennaTopExt).toFixed(1));
          }
          if (antBottom) {
            antBottom.setAttribute("y1", (botEnd + 1.5).toFixed(1));
            antBottom.setAttribute("y2", (botEnd + 1.5 + bar.antennaBotExt).toFixed(1));
          }
        } else {
          // Continuous vertical bar outside the core
          const topY = -currentH;
          const botY = currentH;

          if (lineTop) {
            lineTop.setAttribute("y1", topY.toFixed(1));
            lineTop.setAttribute("y2", botY.toFixed(1));
          }

          if (antTop) {
            antTop.setAttribute("y1", (topY - 1.5).toFixed(1));
            antTop.setAttribute("y2", (topY - 1.5 - bar.antennaTopExt).toFixed(1));
          }
          if (antBottom) {
            antBottom.setAttribute("y1", (botY + 1.5).toFixed(1));
            antBottom.setAttribute("y2", (botY + 1.5 + bar.antennaBotExt).toFixed(1));
          }
        }
      }

      // 2. Inner Horizon Tick Marks Pulse
      for (let k = 0; k < NUM_INNER_TICKS; k++) {
        const tickEl = innerTicksRef.current[k];
        if (!tickEl) continue;
        const tickDef = INNER_TICKS[k]!;
        let tickLen = 1.4;

        if (callStatus === "user-speaking") {
          tickLen = 1.4 + (micEnergy / 255) * 2.2;
        } else if (callStatus === "thinking") {
          const rotPhase =
            (timestamp * 0.005 + (k / NUM_INNER_TICKS) * Math.PI * 2) % (Math.PI * 2);
          tickLen = 1.4 + Math.pow(Math.max(0, Math.cos(rotPhase)), 2) * 2.0;
        } else if (callStatus === "speaking") {
          const pulse = Math.cos(timestamp * 0.006 + k * 0.35) * 0.5 + 0.5;
          tickLen = 1.4 + pulse * 1.8;
        } else {
          const breath = Math.cos(timestamp * 0.0022 + k * 0.3) * 0.5 + 0.5;
          tickLen = 1.4 + breath * 0.6;
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

  // Color Palettes based on state
  const palette = (() => {
    switch (callStatus) {
      case "idle":
      case "listening":
        return {
          barStroke: "rgba(228, 228, 231, 0.9)", // zinc-200
          antennaStroke: "rgba(161, 161, 170, 0.5)",
          lensingStroke: "rgba(212, 212, 216, 0.32)",
          ringStroke: "rgba(212, 212, 216, 0.7)",
          innerTickStroke: "rgba(161, 161, 170, 0.6)",
          lineColor: "rgba(212, 212, 216, 0.4)",
          glow: "drop-shadow(0 0 4px rgba(255, 255, 255, 0.12))",
        };
      case "user-speaking":
        return {
          barStroke: "rgba(59, 130, 246, 0.95)", // electric blue
          antennaStroke: "rgba(96, 165, 250, 0.6)",
          lensingStroke: "rgba(59, 130, 246, 0.45)",
          ringStroke: "rgba(59, 130, 246, 0.9)",
          innerTickStroke: "rgba(147, 197, 253, 0.8)",
          lineColor: "rgba(59, 130, 246, 0.5)",
          glow: "drop-shadow(0 0 8px rgba(59, 130, 246, 0.7))",
        };
      case "thinking":
        return {
          barStroke: "rgba(249, 115, 22, 0.95)", // luminous orange
          antennaStroke: "rgba(251, 146, 60, 0.6)",
          lensingStroke: "rgba(249, 115, 22, 0.45)",
          ringStroke: "rgba(249, 115, 22, 0.9)",
          innerTickStroke: "rgba(253, 186, 116, 0.8)",
          lineColor: "rgba(249, 115, 22, 0.5)",
          glow: "drop-shadow(0 0 8px rgba(249, 115, 22, 0.7))",
        };
      case "speaking":
        return {
          barStroke: "rgba(34, 197, 94, 0.95)", // emerald green
          antennaStroke: "rgba(74, 222, 128, 0.6)",
          lensingStroke: "rgba(34, 197, 94, 0.45)",
          ringStroke: "rgba(34, 197, 94, 0.9)",
          innerTickStroke: "rgba(134, 239, 172, 0.8)",
          lineColor: "rgba(34, 197, 94, 0.5)",
          glow: "drop-shadow(0 0 8px rgba(34, 197, 94, 0.7))",
        };
    }
  })();

  return (
    <svg
      aria-hidden="true"
      viewBox="-130 -36 260 72"
      className={cn(
        "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
        "w-[240px] sm:w-[268px] h-[64px] sm:h-[72px] overflow-visible z-0 transition-all duration-300 select-none",
        className,
      )}
      style={{ filter: palette.glow }}
    >
      <defs>
        {/* Seamless linear gradient for the baseline connector to dissolve into the divider */}
        <linearGradient id="grokTaperLineFade" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="transparent" />
          <stop offset="10%" stopColor={palette.lineColor} stopOpacity="0.15" />
          <stop offset="28%" stopColor={palette.lineColor} stopOpacity="0.4" />
          <stop offset="50%" stopColor={palette.lineColor} stopOpacity="0.75" />
          <stop offset="72%" stopColor={palette.lineColor} stopOpacity="0.4" />
          <stop offset="90%" stopColor={palette.lineColor} stopOpacity="0.15" />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>

        {/* Soft Radial Glow for Black Hole Accretion Horizon */}
        <radialGradient id="grokCoreGlow" cx="50%" cy="50%" r="50%">
          <stop offset="60%" stopColor="transparent" />
          <stop offset="85%" stopColor={palette.barStroke} stopOpacity="0.12" />
          <stop offset="100%" stopColor={palette.barStroke} stopOpacity="0.3" />
        </radialGradient>
      </defs>

      {/* 1. Baseline Connector Line */}
      <line x1="-128" y1="0" x2="128" y2="0" stroke="url(#grokTaperLineFade)" strokeWidth="1" />

      {/* 2. Gravitational Lensing Orbital Ellipses (Space-time warp rings) */}
      <ellipse
        cx="0"
        cy="0"
        rx="26"
        ry="20"
        fill="none"
        stroke={palette.lensingStroke}
        strokeWidth="0.85"
        strokeDasharray="3 2"
        opacity={0.4}
      />
      <ellipse
        cx="0"
        cy="0"
        rx="44"
        ry="25"
        fill="none"
        stroke={palette.lensingStroke}
        strokeWidth="0.75"
        opacity={0.3}
      />
      <ellipse
        cx="0"
        cy="0"
        rx="68"
        ry="30"
        fill="none"
        stroke={palette.lensingStroke}
        strokeWidth="0.65"
        opacity={0.2}
      />

      {/* 3. Dashed Frequency Antenna Lines (Spikes extending outward) */}
      {BARS.map((bar, i) => {
        if (!bar.hasAntenna) return null;
        return (
          <g key={`antenna-${bar.index}`} opacity={bar.opacity * 0.7}>
            <line
              ref={(el) => {
                antennaTopRef.current[i] = el;
              }}
              x1={bar.x}
              y1={-bar.baseArchH - 1.5}
              x2={bar.x}
              y2={-bar.baseArchH - 1.5 - bar.antennaTopExt}
              stroke={palette.antennaStroke}
              strokeWidth="0.9"
              strokeDasharray="1.5 2"
            />
            <line
              ref={(el) => {
                antennaBottomRef.current[i] = el;
              }}
              x1={bar.x}
              y1={bar.baseArchH + 1.5}
              x2={bar.x}
              y2={bar.baseArchH + 1.5 + bar.antennaBotExt}
              stroke={palette.antennaStroke}
              strokeWidth="0.9"
              strokeDasharray="1.5 2"
            />
          </g>
        );
      })}

      {/* 4. Solid Equalizer Soundwave Bars (Eye Contour & Accretion Arch) */}
      {BARS.map((bar, i) => {
        if (bar.isApertureSplit) {
          return (
            <g key={`bar-split-${bar.index}`} opacity={bar.opacity}>
              {/* Upper Arch over black hole */}
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
              {/* Lower Arch under black hole */}
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
            y1={-bar.baseArchH * 0.42}
            x2={bar.x}
            y2={bar.baseArchH * 0.42}
            stroke={palette.barStroke}
            strokeWidth={bar.strokeWidth}
            strokeLinecap="round"
            opacity={bar.opacity}
            className="transition-colors duration-200"
          />
        );
      })}

      {/* 5. Central Black Hole Halo Glow */}
      <circle cx="0" cy="0" r={CENTER_VOID_RADIUS + 2} fill="url(#grokCoreGlow)" />

      {/* 6. Event Horizon Ring */}
      <circle
        cx="0"
        cy="0"
        r={CENTER_VOID_RADIUS - 0.4}
        fill="none"
        stroke={palette.ringStroke}
        strokeWidth="1.0"
        opacity={0.45}
      />

      {/* 7. Inner Radial Horizon Tick Ring */}
      {INNER_TICKS.map((tick, k) => (
        <line
          key={`radial-inner-${k}`}
          ref={(el) => {
            innerTicksRef.current[k] = el;
          }}
          x1={tick.x1.toFixed(1)}
          y1={tick.y1.toFixed(1)}
          x2={((INNER_TICK_R + 1.4) * tick.cos).toFixed(1)}
          y2={((INNER_TICK_R + 1.4) * tick.sin).toFixed(1)}
          stroke={palette.innerTickStroke}
          strokeWidth="1.2"
          strokeLinecap="round"
          className="transition-colors duration-200"
        />
      ))}
    </svg>
  );
});
