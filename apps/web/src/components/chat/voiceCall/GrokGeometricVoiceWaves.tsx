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

// Pre-generate 20 ambient stardust glitter particles strictly within compact width bounds
const PARTICLES: StardustParticle[] = Array.from({ length: 20 }, (_, i) => ({
  x: ((i * 19.3) % 160) - 80,
  y: (((i * 29.7) % 32) - 16) * 0.7,
  size: (i % 3 === 0 ? 1.1 : 0.6) + (i % 2) * 0.25,
  baseAlpha: 0.2 + ((i * 7) % 10) * 0.03,
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
      const width = rect.width || 190;
      const height = rect.height || 48;

      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      // W ensures a guaranteed gap of ~8px to 15px+ from the model dropdown and mic button
      const W = Math.min(width * 0.46, 88.0);
      const R_core = 21.5; // Button event horizon radius

      // Audio analysis with responsive speech attack & smooth release
      let rawMicEnergy = 0;
      if (callStatus === "user-speaking" && analyserNode && freqData) {
        analyserNode.getByteFrequencyData(freqData);
        let sum = 0;
        const count = Math.min(24, freqData.length);
        for (let k = 2; k < count; k++) {
          sum += freqData[k] || 0;
        }
        rawMicEnergy = sum / (count - 2);
      }
      const attack = 0.4;
      const release = 0.12;
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
          primaryRgb: "215, 225, 245",
          accentRgb: "255, 255, 255",
          glowColor: "rgba(255, 255, 255, 0.35)",
          glowBlur: 4,
        },
        listening: {
          primaryRgb: "215, 225, 245",
          accentRgb: "255, 255, 255",
          glowColor: "rgba(255, 255, 255, 0.35)",
          glowBlur: 4,
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
      lineGrad.addColorStop(0.15, `rgba(${colors.accentRgb}, 0.25)`);
      lineGrad.addColorStop(0.5, `rgba(${colors.primaryRgb}, 0.75)`);
      lineGrad.addColorStop(0.85, `rgba(${colors.accentRgb}, 0.25)`);
      lineGrad.addColorStop(1, "transparent");

      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(width, cy);
      ctx.strokeStyle = lineGrad;
      ctx.lineWidth = 1;
      ctx.stroke();

      // ── 2. Compact Gravitational Lensing Orbital Rings ──
      const isQuiet = callStatus === "idle" || callStatus === "listening";
      const ringAlpha = isQuiet ? 0.22 : 0.52;
      const rings = [
        { r: R_core + 1.5, alpha: ringAlpha * 0.9, lw: 1.0 },
        { r: R_core + 4.0, alpha: ringAlpha * 0.6, lw: 0.8 },
        { r: R_core + 7.5, alpha: ringAlpha * 0.35, lw: 0.6 },
      ];

      for (const ring of rings) {
        ctx.beginPath();
        ctx.arc(cx, cy, ring.r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${colors.accentRgb}, ${ring.alpha})`;
        ctx.lineWidth = ring.lw;
        ctx.stroke();
      }

      // ── 3. Flowing Silk Ribbon Strands (Fluid Accretion Streamlines) ──
      const numStrands = 11;
      const tSec = timestamp * 0.001;

      let baseSpeed = 0.0012;
      let baseAmp = 0.4; // Default sakin amplitude

      // Realistic speech cadence synthesis (syllable bursts, pauses, speech speed)
      let aiSpeechPulse = 0;
      if (callStatus === "speaking") {
        const syllable = Math.sin(tSec * 2 * Math.PI * 3.4) * 0.5 + 0.5;
        const phrase = Math.sin(tSec * 2 * Math.PI * 0.85);
        const isPause = phrase < -0.55;
        aiSpeechPulse = isPause ? 0.12 : Math.pow(syllable, 1.4) * 0.9 + 0.2;
      }

      if (callStatus === "user-speaking") {
        const speechNorm = Math.min(1.0, smoothedEnergy / 130);
        // Speed and height dynamically scale according to speech volume & pace:
        baseSpeed = 0.0022 + speechNorm * 0.0055;
        baseAmp = 0.5 + speechNorm * 5.0;
      } else if (callStatus === "speaking") {
        // AI Speaking speech speed & amplitude:
        baseSpeed = 0.0022 + aiSpeechPulse * 0.0036;
        baseAmp = 0.6 + aiSpeechPulse * 4.2;
      } else if (callStatus === "thinking") {
        baseSpeed = 0.0042;
        baseAmp = 2.6;
      } else {
        // Sakin / Silent: extremely gentle breathing baseline
        const breath = Math.sin(timestamp * 0.0015) * 0.5 + 0.5;
        baseSpeed = 0.0008;
        baseAmp = 0.35 + breath * 0.15;
      }

      ctx.shadowColor = colors.glowColor;
      ctx.shadowBlur = isQuiet ? 2 : 6;

      // Draw Top and Bottom Silk Streamlines
      for (const side of [-1, 1]) {
        for (let s = 0; s < numStrands; s++) {
          const norm_s = s / (numStrands - 1); // 0 to 1
          const C = 0.6 + norm_s * 3.6; // Sleek and compact vertical dispersion!

          // Alpha distribution: bright primary core ribbons, delicate ethereal outer filaments
          const distFromCore = Math.abs(norm_s - 0.38);
          let strandAlpha = Math.max(0.12, 0.95 - Math.pow(distFromCore, 1.2) * 1.1);
          if (isQuiet) strandAlpha *= 0.55;

          const isCoreStrand = s === 3 || s === 4;
          const lw = isCoreStrand ? 1.6 : 0.75;

          // Speech frequency reactivity per strand:
          let strandAmpBonus = 0;
          if (callStatus === "user-speaking" && freqData) {
            const binIdx = Math.min(freqData.length - 1, Math.floor(2 + norm_s * 18));
            const binVal = (freqData[binIdx] || 0) / 255;
            strandAmpBonus = binVal * 3.2;
          } else if (callStatus === "speaking") {
            strandAmpBonus = aiSpeechPulse * (0.6 + Math.sin(s * 1.1 + timestamp * 0.006) * 0.4);
          }

          const strandEffectiveAmp = baseAmp + strandAmpBonus;

          ctx.beginPath();
          let started = false;

          const step = 2.5;
          for (let x = -W; x <= W; x += step) {
            const u = x / W; // -1 to 1
            const abs_u = Math.abs(u);
            const envelope = Math.pow(Math.max(0, 1.0 - abs_u * abs_u), 1.25);

            // Deflection formula for fluid streamline around circular black hole
            const deflection = (R_core * R_core * C) / Math.max(R_core * R_core, x * x + C * C);
            const y_base = C + deflection;

            let waveFactor = 0;

            if (callStatus === "thinking") {
              // Zigzag wave travelling strictly Left-to-Right
              const phase = -u * 7.0 + timestamp * baseSpeed * 2.4;
              const zigzag = Math.sin(phase) + 0.25 * Math.sin(phase * 3.0);
              waveFactor = zigzag * strandEffectiveAmp * envelope * 0.75;
            } else if (callStatus === "user-speaking") {
              // Acoustic speech modulation:
              const phase = timestamp * baseSpeed + s * 0.25;
              waveFactor =
                Math.sin(u * Math.PI * 3.4 + phase) *
                strandEffectiveAmp *
                Math.exp(-Math.pow(abs_u - 0.42, 2) / 0.08);
            } else if (callStatus === "speaking") {
              // Spoken delivery ripples:
              const phase = timestamp * baseSpeed - abs_u * 2.6 + s * 0.2;
              waveFactor =
                Math.sin(u * Math.PI * 3.2 + phase) *
                strandEffectiveAmp *
                Math.exp(-Math.pow(abs_u - 0.42, 2) / 0.08);
            } else {
              // Sakin / Silent: minimal gentle motion
              const phase = timestamp * baseSpeed + s * 0.15;
              waveFactor = Math.sin(u * Math.PI * 2.0 + phase) * strandEffectiveAmp * envelope;
            }

            let y_actual = (y_base + waveFactor) * envelope;

            // Strict circular clearance at center event horizon
            if (abs_u * W < R_core + 1.5) {
              const x_dist = abs_u * W;
              const void_y =
                Math.sqrt(Math.max(0, (R_core + 1.5) * (R_core + 1.5) - x_dist * x_dist)) +
                0.6 +
                s * 0.45;
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
        const pAlpha = p.baseAlpha * twinkle * (isQuiet ? 0.5 : 1.0);

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
        "w-[176px] sm:w-[186px] md:w-[194px] h-[46px] sm:h-[48px] overflow-visible z-0 select-none",
        className,
      )}
    >
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
});
