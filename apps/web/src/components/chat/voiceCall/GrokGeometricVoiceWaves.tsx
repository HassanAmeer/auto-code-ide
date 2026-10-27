import { memo, useEffect, useRef } from "react";
import { cn } from "~/lib/utils";
import type { VoiceCallStatus } from "./VoiceVisualizerWaves";

export interface GrokGeometricVoiceWavesProps {
  callStatus: VoiceCallStatus;
  analyserNode: AnalyserNode | null;
  className?: string;
}

// ── Exact Black Hole Accretion Disk Mathematical Specification ──
// Mathematical formula: H(x) = H_peak * (1 - (x / W)^2)^2
// Creates the exact continuous curved accretion lens/eye profile of a black hole.
const HALF_WIDTH = 108.0;
const BAR_SPACING = 3.4;
const CENTER_VOID_RADIUS = 17.0; // Snug radius around the 32px center call button
const MAX_BAR_HEIGHT = 44.0; // Peak reach of outer accretion arch at center

interface BarDef {
  index: number;
  x: number;
  normDist: number; // 0 at center, 1 at outer tips
  baseH: number; // True curved black hole envelope height
  isSplit: boolean; // Over/under the center event horizon
  innerVoidY: number; // Inner circular boundary cutoff
  strokeWidth: number;
  opacity: number;
}

const BARS: BarDef[] = [];
for (let x = -102; x <= 102; x += BAR_SPACING) {
  const normDist = Math.abs(x) / HALF_WIDTH;
  const isSplit = Math.abs(x) < CENTER_VOID_RADIUS;
  const innerVoidY = isSplit
    ? Math.sqrt(Math.max(0, CENTER_VOID_RADIUS * CENTER_VOID_RADIUS - x * x)) + 1.2
    : 0;

  // True Black Hole Accretion Envelope: H(x) = H_peak * (1 - u^2)^2
  const u = Math.min(1.0, Math.abs(x) / HALF_WIDTH);
  const baseH = Math.max(0.6, MAX_BAR_HEIGHT * Math.pow(1.0 - u * u, 2));

  // Smooth subpixel taper at outer tips (2.1px -> 0.9px)
  const strokeWidth = u > 0.72 ? Math.max(0.9, 2.1 - (u - 0.72) * 4.2) : 2.1;
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

  // Bar current heights
  const heightsRef = useRef<number[]>(BARS.map((b) => b.baseH * 0.92));

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

      // Update Bar Heights following the Black Hole Accretion Lens
      for (let i = 0; i < BARS.length; i++) {
        const bar = BARS[i]!;
        let targetH = bar.baseH * 0.92;

        switch (callStatus) {
          case "idle":
          case "listening": {
            // Calm, elegant breathing of the black hole accretion disk (maintains full eye shape)
            const breath = Math.sin(timestamp * 0.0024 + bar.normDist * 2.8) * 0.1 + 0.9;
            targetH = Math.max(0.6, bar.baseH * breath);
            break;
          }

          case "user-speaking": {
            // High-energy audio equalizer bounded dynamically within the accretion curve
            if (isAnalysing && freqData) {
              if (micEnergy < 8) {
                targetH = bar.baseH * 0.45;
              } else {
                const bin = Math.min(freqData.length - 1, 2 + Math.floor((1 - bar.normDist) * 22));
                const val = (freqData[bin] || 0) / 255;
                targetH = Math.max(0.6, bar.baseH * (0.35 + 0.65 * val));
              }
            } else {
              const energy = Math.sin(timestamp * 0.008 + bar.normDist * 4.5) * 0.5 + 0.5;
              targetH = Math.max(0.6, bar.baseH * (0.45 + 0.55 * energy));
            }
            break;
          }

          case "thinking": {
            // Luminous cosmic orbital shimmer sweeping across the black hole
            const phase = timestamp * 0.0055 - bar.normDist * 4.2;
            const shimmer = Math.pow(Math.max(0, Math.sin(phase)), 2.2);
            targetH = Math.max(0.6, bar.baseH * (0.55 + 0.45 * shimmer));
            break;
          }

          case "speaking": {
            // Smooth undulating speech cadence
            const cadence = Math.abs(
              Math.sin(timestamp * 0.0068) * Math.cos(timestamp * 0.0032 + bar.normDist * 3.0),
            );
            const formant = Math.sin(timestamp * 0.005 + bar.normDist * 5.0) * 0.5 + 0.5;
            targetH = Math.max(0.6, bar.baseH * (0.5 + 0.5 * cadence * formant));
            break;
          }
        }

        hArray[i] = hArray[i]! + (targetH - hArray[i]!) * 0.32;
        const currentH = hArray[i]!;

        const lineTop = solidLinesTopRef.current[i];
        const lineBottom = solidLinesBottomRef.current[i];

        if (bar.isSplit) {
          // Arches over and under the center black hole
          const topStart = -bar.innerVoidY;
          const topEnd = -Math.max(bar.innerVoidY + 2.5, currentH);
          if (lineTop) {
            lineTop.setAttribute("y1", topStart.toFixed(1));
            lineTop.setAttribute("y2", topEnd.toFixed(1));
          }

          const botStart = bar.innerVoidY;
          const botEnd = Math.max(bar.innerVoidY + 2.5, currentH);
          if (lineBottom) {
            lineBottom.setAttribute("y1", botStart.toFixed(1));
            lineBottom.setAttribute("y2", botEnd.toFixed(1));
          }
        } else {
          // Continuous vertical bar outside the black hole core
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
          barStroke: "rgba(228, 228, 231, 0.92)", // Sleek zinc-200 (reference image monochrome)
          ringStroke: "rgba(212, 212, 216, 0.45)",
          lineColor: "rgba(212, 212, 216, 0.4)",
          glow: "drop-shadow(0 0 5px rgba(255, 255, 255, 0.18))",
        };
      case "user-speaking":
        return {
          barStroke: "rgba(59, 130, 246, 0.98)", // Electric blue
          ringStroke: "rgba(59, 130, 246, 0.65)",
          lineColor: "rgba(59, 130, 246, 0.5)",
          glow: "drop-shadow(0 0 8px rgba(59, 130, 246, 0.7))",
        };
      case "thinking":
        return {
          barStroke: "rgba(249, 115, 22, 0.98)", // Luminous orange
          ringStroke: "rgba(249, 115, 22, 0.65)",
          lineColor: "rgba(249, 115, 22, 0.5)",
          glow: "drop-shadow(0 0 8px rgba(249, 115, 22, 0.7))",
        };
      case "speaking":
        return {
          barStroke: "rgba(34, 197, 94, 0.98)", // Emerald green
          ringStroke: "rgba(34, 197, 94, 0.65)",
          lineColor: "rgba(34, 197, 94, 0.5)",
          glow: "drop-shadow(0 0 8px rgba(34, 197, 94, 0.7))",
        };
    }
  })();

  return (
    <svg
      aria-hidden="true"
      viewBox="-125 -48 250 96"
      className={cn(
        "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
        "w-[240px] sm:w-[260px] h-[78px] sm:h-[88px] overflow-visible z-0 transition-all duration-300 select-none",
        className,
      )}
      style={{ filter: palette.glow }}
    >
      <defs>
        {/* Seamless linear gradient for the baseline horizontal connector */}
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
          <stop offset="100%" stopColor={palette.barStroke} stopOpacity="0.28" />
        </radialGradient>
      </defs>

      {/* 1. Baseline Connector Line (Melts waves seamlessly into the page's horizontal divider) */}
      <line x1="-124" y1="0" x2="124" y2="0" stroke="url(#blackHoleLineFade)" strokeWidth="1" />

      {/* 2. Solid Equalizer Soundwave Bars (Eye Contour & Black Hole Accretion Arch) */}
      {BARS.map((bar, i) => {
        if (bar.isSplit) {
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
                y2={-bar.baseH}
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
      <circle cx="0" cy="0" r={CENTER_VOID_RADIUS + 2.5} fill="url(#blackHoleCoreGlow)" />

      {/* 4. Event Horizon Clean Circular Rim */}
      <circle
        cx="0"
        cy="0"
        r={CENTER_VOID_RADIUS - 0.2}
        fill="none"
        stroke={palette.ringStroke}
        strokeWidth="1.0"
      />
    </svg>
  );
});
