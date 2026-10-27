import { memo, useEffect, useRef } from "react";
import { cn } from "~/lib/utils";
import type { VoiceCallStatus } from "./VoiceVisualizerWaves";

export interface GrokGeometricVoiceWavesProps {
  callStatus: VoiceCallStatus;
  analyserNode: AnalyserNode | null;
  className?: string;
}

// ── Stardust Particle Definition (15% scale reduction) ──
interface StardustParticle {
  x: number;
  y: number;
  size: number;
  baseAlpha: number;
  speed: number;
  phase: number;
}

// Pre-generate 36 ambient stardust glitter particles (scaled down by 15%: 0.85)
const PARTICLES: StardustParticle[] = Array.from({ length: 36 }, (_, i) => ({
  x: (((i * 19.3) % 360) - 180) * 0.85,
  y: (((i * 29.7) % 64) - 32) * 0.9 * 0.85,
  size: ((i % 3 === 0 ? 1.4 : 0.8) + (i % 2) * 0.3) * 0.85,
  baseAlpha: 0.25 + ((i * 7) % 10) * 0.05,
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

      // Handle Resize / DPR with ample unclipped canvas height
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = rect.width || 460;
      const height = rect.height || 110;

      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const scale = 0.85; // 15% scale reduction
      const W = Math.min(width * 0.48, 220 * scale); // 187px half-width
      const R_core = 20.0; // 20% smaller core radius matching smaller transparent center button

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
      const attack = 0.4;
      const release = 0.12;
      smoothedEnergy +=
        (rawMicEnergy - smoothedEnergy) * (rawMicEnergy > smoothedEnergy ? attack : release);

      // Color Palette Configurations - stylish GREY for idle/listening instead of bright white
      type ColorConfig = {
        primaryRgb: string;
        accentRgb: string;
        glowColor: string;
        glowBlur: number;
      };

      const colorMap: Record<VoiceCallStatus, ColorConfig> = {
        idle: {
          primaryRgb: "161, 161, 170", // Zinc-400 stylish gray
          accentRgb: "113, 113, 122", // Zinc-500
          glowColor: "rgba(161, 161, 170, 0.4)",
          glowBlur: 6,
        },
        listening: {
          primaryRgb: "161, 161, 170", // Zinc-400 stylish gray
          accentRgb: "113, 113, 122", // Zinc-500
          glowColor: "rgba(161, 161, 170, 0.4)",
          glowBlur: 6,
        },
        "user-speaking": {
          primaryRgb: "59, 130, 246", // Electric blue
          accentRgb: "147, 197, 253",
          glowColor: "rgba(59, 130, 246, 0.85)",
          glowBlur: 10,
        },
        thinking: {
          primaryRgb: "249, 115, 22", // Cosmic orange
          accentRgb: "253, 186, 116",
          glowColor: "rgba(249, 115, 22, 0.85)",
          glowBlur: 10,
        },
        speaking: {
          primaryRgb: "34, 197, 94", // Emerald green
          accentRgb: "134, 239, 172",
          glowColor: "rgba(34, 197, 94, 0.85)",
          glowBlur: 10,
        },
      };

      const colors = colorMap[callStatus];
      const isGreyMode = callStatus === "idle" || callStatus === "listening";

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

      // ── 2. Compact Gravitational Lensing Orbital Rings around 20% Smaller Center ──
      const rings = [
        { r: R_core + 1.8, alpha: 0.65, lw: 1.1 },
        { r: R_core + 5.5, alpha: 0.45, lw: 0.85 },
        { r: R_core + 11.0, alpha: 0.28, lw: 0.7 },
        { r: R_core + 17.5, alpha: 0.15, lw: 0.55 },
      ];

      for (const ring of rings) {
        ctx.beginPath();
        ctx.arc(cx, cy, ring.r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${colors.accentRgb}, ${ring.alpha})`;
        ctx.lineWidth = ring.lw;
        ctx.stroke();
      }

      // ── 3. Flowing Silk Ribbon Strands (Speech Crossing & Undulation Dynamics) ──
      const numStrands = 14;
      const tSec = timestamp * 0.001;

      // Dynamics multipliers - calm, normal, realistic speed (NOT hyperactive)
      let waveSpeed = 0.0015;
      let waveAmp = 4.5 * scale;

      // AI speech rhythm synthesis (cadence with natural pauses)
      let aiSpeechCadence = 0;
      if (callStatus === "speaking") {
        const syllable = Math.sin(tSec * 2 * Math.PI * 3.4) * 0.5 + 0.5;
        const phrase = Math.sin(tSec * 2 * Math.PI * 0.8);
        const pauseFactor = phrase < -0.65 ? 0.2 : 1.0;
        aiSpeechCadence =
          Math.pow(syllable, 1.3) * (0.35 + 0.65 * Math.max(0, phrase)) * pauseFactor;
      }

      if (callStatus === "user-speaking") {
        const speechNorm = Math.min(1.0, smoothedEnergy / 150);
        waveSpeed = 0.0018 + speechNorm * 0.001; // Calm, normal speed
        waveAmp = (3.5 + speechNorm * 6.5) * scale;
      } else if (callStatus === "speaking") {
        waveSpeed = 0.0018 + aiSpeechCadence * 0.0008; // Normal speech speed
        waveAmp = (3.8 + aiSpeechCadence * 4.5) * scale;
      } else if (callStatus === "thinking") {
        waveSpeed = 0.0035; // Gentle left-to-right drift
        waveAmp = 5.2 * scale;
      } else {
        // idle / listening: tranquil slow breathing
        const breath = Math.sin(timestamp * 0.0012) * 0.5 + 0.5;
        waveSpeed = 0.0012;
        waveAmp = (3.2 + breath * 1.2) * scale;
      }

      ctx.shadowColor = colors.glowColor;
      ctx.shadowBlur = colors.glowBlur;

      // Draw Top and Bottom Silk Streamlines
      for (const side of [-1, 1]) {
        for (let s = 0; s < numStrands; s++) {
          const norm_s = s / (numStrands - 1); // 0 to 1
          const C = (1.0 + norm_s * 28.0) * scale;

          // Alpha distribution: bright primary core ribbons, delicate ethereal outer filaments
          const distFromCore = Math.abs(norm_s - 0.38);
          const strandAlpha = Math.max(0.12, 0.95 - Math.pow(distFromCore, 1.2) * 1.0);
          const isCoreStrand = s === 4 || s === 5;
          const lw = isCoreStrand ? 1.85 : 0.82;

          // Per-strand speech harmonic reactivity
          let strandEnergyBonus = 0;
          if (callStatus === "user-speaking" && freqData) {
            const binIdx = Math.min(freqData.length - 1, Math.floor(2 + norm_s * 24));
            strandEnergyBonus = ((freqData[binIdx] || 0) / 255) * 2.8 * scale;
          } else if (callStatus === "speaking") {
            strandEnergyBonus =
              aiSpeechCadence * (0.6 + Math.sin(s * 1.2 + timestamp * 0.004) * 0.5) * scale;
          }

          const effectiveStrandAmp = waveAmp + strandEnergyBonus;

          ctx.beginPath();
          let started = false;

          const step = 3;
          for (let x = -W; x <= W; x += step) {
            const u = x / W; // -1 to 1
            const abs_u = Math.abs(u);
            const envelope = Math.pow(Math.max(0, 1.0 - abs_u * abs_u), 1.35);

            // Deflection formula for fluid streamline around circular black hole
            const deflection = (R_core * R_core * C) / Math.max(R_core * R_core, x * x + C * C);
            const y_base = C + deflection;

            // Phase and Undulation Math:
            // Thinking: waves smoothly travel from LEFT to RIGHT
            // Speech: alternating strands drift in counter-directions creating realistic crossing / weaving motions
            let phase: number;
            let waveFactor: number;

            if (callStatus === "thinking") {
              // Left-to-right traveling wave: sin(k*u - omega*t)
              phase = u * Math.PI * 3.2 - timestamp * 0.0045 + s * 0.18;
              waveFactor =
                Math.sin(u * Math.PI * 3.2 + phase) *
                (effectiveStrandAmp + norm_s * 3.5 * scale) *
                Math.exp(-Math.pow(abs_u - 0.42, 2) / 0.09);
            } else if (callStatus === "user-speaking" || callStatus === "speaking") {
              // Organic crossing wave motion:
              // Alternating strands have opposite direction drift so they gently cross over each other vertically
              const strandDir = s % 2 === 0 ? 1 : -1;
              phase = timestamp * (waveSpeed * 0.9) * strandDir + (s * Math.PI) / 4.5;

              // Dual-harmonic crossing wave
              const w1 = Math.sin(u * Math.PI * 2.8 + phase);
              const w2 = Math.cos(u * Math.PI * 4.2 - phase * 0.75 + s * 0.35);
              const crossHarmonic = w1 * 0.75 + w2 * 0.35;

              waveFactor =
                crossHarmonic *
                (effectiveStrandAmp + norm_s * 2.6 * scale) *
                Math.exp(-Math.pow(abs_u - 0.42, 2) / 0.09);
            } else {
              // Idle / listening: calm breathing
              phase = timestamp * waveSpeed + s * 0.18;
              waveFactor =
                Math.sin(u * Math.PI * 3.2 + phase) *
                (effectiveStrandAmp + norm_s * 3.5 * scale) *
                Math.exp(-Math.pow(abs_u - 0.42, 2) / 0.09);
            }

            let y_actual = (y_base + waveFactor) * envelope;

            // Strict circular clearance at center event horizon
            if (abs_u * W < R_core + 2.0) {
              const x_dist = abs_u * W;
              const void_y =
                Math.sqrt(Math.max(0, (R_core + 2.0) * (R_core + 2.0) - x_dist * x_dist)) +
                0.8 +
                s * 1.3 * scale;
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

          // Core strand color: Zinc-300 light grey for idle/listening, white for colored voice states
          const coreColor = isGreyMode
            ? `rgba(212, 212, 216, ${strandAlpha})`
            : `rgba(255, 255, 255, ${strandAlpha})`;

          ctx.strokeStyle = isCoreStrand ? coreColor : `rgba(${colors.primaryRgb}, ${strandAlpha})`;
          ctx.lineWidth = lw;
          ctx.stroke();
        }
      }

      ctx.shadowBlur = 0; // Reset shadow for fine particles

      // ── 4. Twinkling Stardust Glitter Particles (with Left-to-Right drift during thinking) ──
      for (const p of PARTICLES) {
        const twinkle = Math.sin(timestamp * p.speed + p.phase) * 0.4 + 0.6;
        const pAlpha = p.baseAlpha * twinkle;

        let px = cx + p.x;
        if (callStatus === "thinking") {
          // Left-to-right particle drift
          px = cx + (((p.x + 180 + timestamp * 0.04) % 360) - 180);
        }

        ctx.beginPath();
        ctx.arc(px, cy + p.y, p.size, 0, Math.PI * 2);
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
        "w-[340px] sm:w-[420px] md:w-[460px] h-[96px] sm:h-[110px] overflow-visible z-0 select-none",
        className,
      )}
    >
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
});
