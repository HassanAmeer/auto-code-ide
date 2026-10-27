import { memo, useEffect, useRef } from "react";
import { cn } from "~/lib/utils";
import type { VoiceCallStatus } from "./VoiceVisualizerWaves";

export interface GrokGeometricVoiceWavesProps {
  callStatus: VoiceCallStatus;
  analyserNode: AnalyserNode | null;
  className?: string;
}

// ── Compact, Low-Profile Black Hole Accretion Disk Specification ──
// Mathematical formula: H(x) = H_peak * (1 - (x / W)^2)^1.6
// Scaled proportionally: total height is ~44px (peak 22px above/below line), sleek and compact.
const HALF_WIDTH = 96.0;
const BAR_SPACING = 3.0;
const CENTER_VOID_RADIUS = 15.0; // Snug radius around the 29px compact center button
const MAX_BAR_HEIGHT = 22.5; // Peak height of accretion envelope

interface BarDef {
  index: number;
  x: number;
  normDist: number; // 0 at center, 1 at tips
  baseH: number; // Low-profile curved envelope height
  isSplit: boolean; // Over/under center button
  innerVoidY: number; // Inner circular rim cutoff
  strokeWidth: number;
  opacity: number;
}

const BARS: BarDef[] = [];
for (let x = -90; x <= 90; x += BAR_SPACING) {
  const normDist = Math.abs(x) / HALF_WIDTH;
  const isSplit = Math.abs(x) < CENTER_VOID_RADIUS;
  const innerVoidY = isSplit
    ? Math.sqrt(Math.max(0, CENTER_VOID_RADIUS * CENTER_VOID_RADIUS - x * x)) + 1.0
    : 0;

  // Compact Black Hole Accretion Curve: H(x) = H_peak * (1 - u^2)^1.6
  const u = Math.min(1.0, Math.abs(x) / HALF_WIDTH);
  const rawH = MAX_BAR_HEIGHT * Math.pow(1.0 - u * u, 1.6);
  // Ensure the outer curve is always convex and strictly clears the inner rim
  const baseH = isSplit ? Math.max(innerVoidY + 3.2, rawH) : Math.max(0.5, rawH);

  // Subtle stroke tapering at the outer tips (1.8px -> 0.8px)
  const strokeWidth = u > 0.72 ? Math.max(0.8, 1.8 - (u - 0.72) * 3.6) : 1.8;
  const opacity = u > 0.82 ? Math.max(0.2, 1.0 - (u - 0.82) * 4.4) : 1.0;

  BARS.push({
    index: BARS.length,
    x,
    normDist,
    baseH,
    isSplit,
    innerVoidY,
    strokeWidth,
    opacity,
  });
}

export const GrokGeometricVoiceWaves = memo(function GrokGeometricVoiceWaves({
  callStatus,
  analyserNode,
  className,
}: GrokGeometricVoiceWavesProps) {
  const solidLinesTopRef = useRef<(SVGLineElement | null)[]>([]);
  const solidLinesBottomRef = useRef<(SVGLineElement | null)[]>([]);

  // Current heights
  const heightsRef = useRef<number[]>(BARS.map((b) => b.baseH * 0.9));

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

      // Calculate smooth energy scaling for each bar
      for (let i = 0; i < BARS.length; i++) {
        const bar = BARS[i]!;
        let energyFactor = 0.92;

        switch (callStatus) {
          case "idle":
          case "listening": {
            // Calm, low-profile breathing of the accretion wave
            energyFactor = 0.9 + 0.08 * Math.sin(timestamp * 0.0022 + bar.normDist * 2.4);
            break;
          }

          case "user-speaking": {
            if (isAnalysing && freqData) {
              if (micEnergy < 8) {
                energyFactor = 0.72;
              } else {
                const bin = Math.min(freqData.length - 1, 2 + Math.floor((1 - bar.normDist) * 20));
                const val = (freqData[bin] || 0) / 255;
                energyFactor = 0.65 + 0.4 * val;
              }
            } else {
              const energy = Math.sin(timestamp * 0.008 + bar.normDist * 4.0) * 0.5 + 0.5;
              energyFactor = 0.75 + 0.3 * energy;
            }
            break;
          }

          case "thinking": {
            // Smooth shimmer wave across the lens
            const phase = timestamp * 0.005 - bar.normDist * 3.8;
            const shimmer = Math.pow(Math.max(0, Math.sin(phase)), 2.0);
            energyFactor = 0.78 + 0.28 * shimmer;
            break;
          }

          case "speaking": {
            // Undulating speech rhythm
            const cadence = Math.abs(
              Math.sin(timestamp * 0.0065) * Math.cos(timestamp * 0.003 + bar.normDist * 2.6),
            );
            energyFactor = 0.75 + 0.3 * cadence;
            break;
          }
        }

        let targetH = bar.baseH * energyFactor;
        if (bar.isSplit) {
          targetH = Math.max(bar.innerVoidY + 2.2, targetH);
        }

        hArray[i] = hArray[i]! + (targetH - hArray[i]!) * 0.32;
        const currentH = hArray[i]!;

        const lineTop = solidLinesTopRef.current[i];
        const lineBottom = solidLinesBottomRef.current[i];

        if (bar.isSplit) {
          const topStart = -bar.innerVoidY;
          const topEnd = -currentH;
          if (lineTop) {
            lineTop.setAttribute("y1", topStart.toFixed(1));
            lineTop.setAttribute("y2", topEnd.toFixed(1));
          }

          const botStart = bar.innerVoidY;
          const botEnd = currentH;
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
          barStroke: "rgba(228, 228, 231, 0.92)", // Metallic zinc-200
          ringStroke: "rgba(212, 212, 216, 0.4)",
          lineColor: "rgba(212, 212, 216, 0.4)",
          glow: "drop-shadow(0 0 3px rgba(255, 255, 255, 0.15))",
        };
      case "user-speaking":
        return {
          barStroke: "rgba(59, 130, 246, 0.98)", // Electric blue
          ringStroke: "rgba(59, 130, 246, 0.6)",
          lineColor: "rgba(59, 130, 246, 0.5)",
          glow: "drop-shadow(0 0 6px rgba(59, 130, 246, 0.65))",
        };
      case "thinking":
        return {
          barStroke: "rgba(249, 115, 22, 0.98)", // Luminous orange
          ringStroke: "rgba(249, 115, 22, 0.6)",
          lineColor: "rgba(249, 115, 22, 0.5)",
          glow: "drop-shadow(0 0 6px rgba(249, 115, 22, 0.65))",
        };
      case "speaking":
        return {
          barStroke: "rgba(34, 197, 94, 0.98)", // Emerald green
          ringStroke: "rgba(34, 197, 94, 0.6)",
          lineColor: "rgba(34, 197, 94, 0.5)",
          glow: "drop-shadow(0 0 6px rgba(34, 197, 94, 0.65))",
        };
    }
  })();

  return (
    <svg
      aria-hidden="true"
      viewBox="-108 -26 216 52"
      className={cn(
        "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
        "w-[210px] sm:w-[226px] h-[46px] sm:h-[50px] overflow-visible z-0 transition-all duration-300 select-none",
        className,
      )}
      style={{ filter: palette.glow }}
    >
      <defs>
        {/* Seamless linear gradient for the baseline connector */}
        <linearGradient id="blackHoleLineFade" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="transparent" />
          <stop offset="12%" stopColor={palette.lineColor} stopOpacity="0.2" />
          <stop offset="35%" stopColor={palette.lineColor} stopOpacity="0.5" />
          <stop offset="50%" stopColor={palette.lineColor} stopOpacity="0.8" />
          <stop offset="65%" stopColor={palette.lineColor} stopOpacity="0.5" />
          <stop offset="88%" stopColor={palette.lineColor} stopOpacity="0.2" />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>

        {/* Soft Radial Glow around the Event Horizon */}
        <radialGradient id="blackHoleCoreGlow" cx="50%" cy="50%" r="50%">
          <stop offset="50%" stopColor="transparent" />
          <stop offset="80%" stopColor={palette.barStroke} stopOpacity="0.1" />
          <stop offset="100%" stopColor={palette.barStroke} stopOpacity="0.25" />
        </radialGradient>
      </defs>

      {/* 1. Baseline Connector Line */}
      <line x1="-106" y1="0" x2="106" y2="0" stroke="url(#blackHoleLineFade)" strokeWidth="1" />

      {/* 2. Compact Soundwave Bars (Eye Contour & Black Hole Accretion Arch) */}
      {BARS.map((bar, i) => {
        if (bar.isSplit) {
          return (
            <g key={`bar-split-${bar.index}`} opacity={bar.opacity}>
              {/* Upper Arch */}
              <line
                ref={(el) => {
                  solidLinesTopRef.current[i] = el;
                }}
                x1={bar.x}
                y1={-bar.innerVoidY}
                x2={bar.x}
                y2={-bar.baseH}
                stroke={palette.barStroke}
                strokeWidth={bar.strokeWidth}
                strokeLinecap="round"
                className="transition-colors duration-200"
              />
              {/* Lower Arch */}
              <line
                ref={(el) => {
                  solidLinesBottomRef.current[i] = el;
                }}
                x1={bar.x}
                y1={bar.innerVoidY}
                x2={bar.x}
                y2={bar.baseH}
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
            y1={-bar.baseH}
            x2={bar.x}
            y2={bar.baseH}
            stroke={palette.barStroke}
            strokeWidth={bar.strokeWidth}
            strokeLinecap="round"
            opacity={bar.opacity}
            className="transition-colors duration-200"
          />
        );
      })}

      {/* 3. Event Horizon Soft Radial Glow */}
      <circle cx="0" cy="0" r={CENTER_VOID_RADIUS + 2.0} fill="url(#blackHoleCoreGlow)" />

      {/* 4. Event Horizon Clean Circular Rim */}
      <circle
        cx="0"
        cy="0"
        r={CENTER_VOID_RADIUS - 0.2}
        fill="none"
        stroke={palette.ringStroke}
        strokeWidth="0.9"
      />
    </svg>
  );
});
