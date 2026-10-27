import { memo, useEffect, useRef } from "react";
import { cn } from "~/lib/utils";
import type { VoiceCallStatus } from "./VoiceVisualizerWaves";

export interface GrokGeometricVoiceWavesProps {
  callStatus: VoiceCallStatus;
  analyserNode: AnalyserNode | null;
  className?: string;
}

// ── Stardust Particle Definition ──
interface StardustParticle {
  x: number;
  y: number;
  size: number;
  baseAlpha: number;
  speed: number;
  phase: number;
}

// Pre-generate 24 ambient stardust glitter particles within compact bounds
const PARTICLES: StardustParticle[] = Array.from({ length: 24 }, (_, i) => ({
  x: ((i * 19.3) % 240) - 120,
  y: (((i * 29.7) % 40) - 20) * 0.8,
  size: (i % 3 === 0 ? 1.2 : 0.7) + (i % 2) * 0.3,
  baseAlpha: 0.2 + ((i * 7) % 10) * 0.04,
  speed: 0.0015 + (i % 5) * 0.0006,
  phase: (i * Math.PI) / 6,
}));

export const GrokGeometricVoiceWaves = memo(function GrokGeometricVoiceWaves({
  callStatus,
  analyserNode,
  className,
}: GrokGeometricVoiceWavesProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let running = true;
    const freqData = analyserNode ? new Uint8Array(analyserNode.frequencyBinCount) : null;

    // Smoothed audio energy tracker
    let smoothedEnergy = 0;

    const render = (timestamp: number) => {
      if (!running) return;

      // Handle Resize / DPR
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = rect.width || 300;
      const height = rect.height || 64;

      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const W = Math.min(width * 0.46, 142.0); // Compact half-width to avoid model badge & mic button
      const R_core = 23.0; // Black hole core radius around call button

      // Audio analysis with responsive speech attack & smooth release
      let rawMicEnergy = 0;
      if (callStatus === "user-speaking" && analyserNode && freqData) {
        analyserNode.getByteFrequencyData(freqData);
        let sum = 0;
        const count = Math.min(32, freqData.length);
        for (let k = 2; k < count; k++) {
          sum += freqData[k] || 0;
        }
        rawMicEnergy = sum / (count - 2);
      }
      const attack = 0.35;
      const release = 0.14;
      smoothedEnergy +=
        (rawMicEnergy - smoothedEnergy) * (rawMicEnergy > smoothedEnergy ? attack : release);

      // Color Palette Configurations
      type ColorConfig = {
        primaryRgb: string;
        accentRgb: string;
        glowColor: string;
        glowBlur: number;
      };

      const colorMap: Record<VoiceCallStatus, ColorConfig> = {
        idle: {
          primaryRgb: "235, 242, 255",
          accentRgb: "215, 225, 245",
          glowColor: "rgba(255, 255, 255, 0.45)",
          glowBlur: 6,
        },
        listening: {
          primaryRgb: "235, 242, 255",
          accentRgb: "215, 225, 245",
          glowColor: "rgba(255, 255, 255, 0.45)",
          glowBlur: 6,
        },
        "user-speaking": {
          primaryRgb: "59, 130, 246", // Electric blue
          accentRgb: "147, 197, 253",
          glowColor: "rgba(59, 130, 246, 0.85)",
          glowBlur: 8,
        },
        thinking: {
          primaryRgb: "249, 115, 22", // Cosmic orange
          accentRgb: "253, 186, 116",
          glowColor: "rgba(249, 115, 22, 0.85)",
          glowBlur: 8,
        },
        speaking: {
          primaryRgb: "34, 197, 94", // Emerald green
          accentRgb: "134, 239, 172",
          glowColor: "rgba(34, 197, 94, 0.85)",
          glowBlur: 8,
        },
      };

      const colors = colorMap[callStatus];

      // ── 1. Razor-Thin Horizontal Baseline Line with Gradient Fade ──
      const lineGrad = ctx.createLinearGradient(0, cy, width, cy);
      lineGrad.addColorStop(0, "transparent");
      lineGrad.addColorStop(0.12, `rgba(${colors.accentRgb}, 0.2)`);
      lineGrad.addColorStop(0.5, `rgba(${colors.primaryRgb}, 0.75)`);
      lineGrad.addColorStop(0.88, `rgba(${colors.accentRgb}, 0.2)`);
      lineGrad.addColorStop(1, "transparent");

      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(width, cy);
      ctx.strokeStyle = lineGrad;
      ctx.lineWidth = 1;
      ctx.stroke();

      // ── 2. Compact Gravitational Lensing Orbital Rings around the Event Horizon ──
      const rings = [
        { r: R_core + 1.5, alpha: 0.6, lw: 1.1 },
        { r: R_core + 4.5, alpha: 0.4, lw: 0.85 },
        { r: R_core + 8.5, alpha: 0.24, lw: 0.7 },
        { r: R_core + 13.5, alpha: 0.12, lw: 0.55 },
      ];

      for (const ring of rings) {
        ctx.beginPath();
        ctx.arc(cx, cy, ring.r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${colors.accentRgb}, ${ring.alpha})`;
        ctx.lineWidth = ring.lw;
        ctx.stroke();
      }

      // ── 3. Flowing Silk Ribbon Strands (Fluid Accretion Streamlines) ──
      const numStrands = 13;
      const tSec = timestamp * 0.001;

      let baseSpeed = 0.0018;
      let baseAmp = 3.0;

      // Realistic speech rhythm synthesis (cadence, syllable bursts, stress & breathing pauses)
      let aiSpeechPulse = 0;
      if (callStatus === "speaking") {
        const syllable = Math.sin(tSec * 2 * Math.PI * 3.4) * 0.5 + 0.5;
        const phrase = Math.sin(tSec * 2 * Math.PI * 0.85);
        const pauseFactor = phrase < -0.7 ? 0.2 : 1.0;
        aiSpeechPulse = Math.pow(syllable, 1.4) * (0.35 + 0.65 * Math.max(0, phrase)) * pauseFactor;
      }

      if (callStatus === "user-speaking") {
        const speechNorm = Math.min(1.0, smoothedEnergy / 180);
        baseSpeed = 0.0035 + speechNorm * 0.0045;
        baseAmp = 2.4 + speechNorm * 6.8;
      } else if (callStatus === "speaking") {
        baseSpeed = 0.0028 + aiSpeechPulse * 0.0032;
        baseAmp = 2.0 + aiSpeechPulse * 5.4;
      } else if (callStatus === "thinking") {
        const thinkPulse = Math.sin(timestamp * 0.004) * 0.5 + 0.5;
        baseSpeed = 0.0042;
        baseAmp = 2.8 + thinkPulse * 1.8;
      } else {
        // idle / listening
        const breath = Math.sin(timestamp * 0.0018) * 0.5 + 0.5;
        baseSpeed = 0.0014;
        baseAmp = 1.4 + breath * 0.7;
      }

      ctx.shadowColor = colors.glowColor;
      ctx.shadowBlur = colors.glowBlur;

      // Draw Top and Bottom Silk Streamlines
      for (const side of [-1, 1]) {
        for (let s = 0; s < numStrands; s++) {
          const norm_s = s / (numStrands - 1); // 0 to 1
          const C = 0.8 + norm_s * 7.5; // Compact ribbon vertical dispersion

          // Alpha distribution: bright primary core ribbons, delicate ethereal outer filaments
          const distFromCore = Math.abs(norm_s - 0.38);
          const strandAlpha = Math.max(0.12, 0.95 - Math.pow(distFromCore, 1.2) * 1.05);
          const isCoreStrand = s === 4 || s === 5;
          const lw = isCoreStrand ? 1.7 : 0.8;

          // Speech frequency reactivity per strand:
          let strandAmpBonus = 0;
          if (callStatus === "user-speaking" && freqData) {
            const binIdx = Math.min(freqData.length - 1, Math.floor(2 + norm_s * 22));
            const binVal = (freqData[binIdx] || 0) / 255;
            strandAmpBonus = binVal * 3.8;
          } else if (callStatus === "speaking") {
            strandAmpBonus = aiSpeechPulse * (0.8 + Math.sin(s * 1.1 + timestamp * 0.006) * 0.6);
          }

          const strandEffectiveAmp = baseAmp + strandAmpBonus;

          ctx.beginPath();
          let started = false;

          const step = 3;
          for (let x = -W; x <= W; x += step) {
            const u = x / W; // -1 to 1
            const abs_u = Math.abs(u);
            const envelope = Math.pow(Math.max(0, 1.0 - abs_u * abs_u), 1.25);

            // Deflection formula for fluid streamline around circular black hole
            const deflection = (R_core * R_core * C) / Math.max(R_core * R_core, x * x + C * C);
            const y_base = C + deflection;

            // Harmonic fluid undulation across x
            let phase = timestamp * baseSpeed;
            if (callStatus === "thinking") {
              // Shimmer travelling outward from center
              phase -= abs_u * 4.2;
            } else if (callStatus === "speaking") {
              // Outward acoustic wave ripples
              phase -= abs_u * 2.8;
            }

            const waveFactor =
              Math.sin(u * Math.PI * 3.2 + s * 0.22 + phase) *
              (strandEffectiveAmp + norm_s * 1.6) *
              Math.exp(-Math.pow(abs_u - 0.42, 2) / 0.08);

            let y_actual = (y_base + waveFactor) * envelope;

            // Strict circular clearance at center event horizon
            if (abs_u * W < R_core + 2.0) {
              const x_dist = abs_u * W;
              const void_y =
                Math.sqrt(Math.max(0, (R_core + 2.0) * (R_core + 2.0) - x_dist * x_dist)) +
                0.8 +
                s * 0.55;
              y_actual = Math.max(void_y, y_actual);
            }

            const px = cx + x;
            const py = cy + side * y_actual;

            if (!started) {
              ctx.moveTo(px, py);
              started = true;
            } else {
              ctx.lineTo(px, py);
            }
          }

          ctx.strokeStyle = isCoreStrand
            ? `rgba(255, 255, 255, ${strandAlpha})`
            : `rgba(${colors.primaryRgb}, ${strandAlpha})`;
          ctx.lineWidth = lw;
          ctx.stroke();
        }
      }

      ctx.shadowBlur = 0; // Reset shadow for fine particles

      // ── 4. Twinkling Stardust Glitter Particles ──
      for (const p of PARTICLES) {
        const twinkle = Math.sin(timestamp * p.speed + p.phase) * 0.4 + 0.6;
        const pAlpha = p.baseAlpha * twinkle;

        ctx.beginPath();
        ctx.arc(cx + p.x, cy + p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${colors.accentRgb}, ${pAlpha})`;
        ctx.fill();
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => {
      running = false;
      cancelAnimationFrame(animId);
    };
  }, [callStatus, analyserNode]);

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
        "w-[240px] sm:w-[280px] md:w-[320px] h-[56px] sm:h-[64px] overflow-visible z-0 select-none",
        className,
      )}
    >
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
});
