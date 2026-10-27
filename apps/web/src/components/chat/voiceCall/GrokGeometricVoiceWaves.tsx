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
      const width = rect.width || 284;
      const height = rect.height || 56;

      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const W = Math.min(width * 0.46, 138.0); // Exact 2px clearance before model dropdown & mic
      const R_core = 16.0; // 30% smaller black hole core matching center call button

      // Audio analysis
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
      smoothedEnergy += (rawMicEnergy - smoothedEnergy) * 0.22;

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
          glowBlur: 9,
        },
        thinking: {
          primaryRgb: "249, 115, 22", // Cosmic orange
          accentRgb: "253, 186, 116",
          glowColor: "rgba(249, 115, 22, 0.85)",
          glowBlur: 9,
        },
        speaking: {
          primaryRgb: "34, 197, 94", // Emerald green
          accentRgb: "134, 239, 172",
          glowColor: "rgba(34, 197, 94, 0.85)",
          glowBlur: 9,
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
        { r: R_core + 1.2, alpha: 0.6, lw: 1.1 },
        { r: R_core + 4.2, alpha: 0.38, lw: 0.8 },
        { r: R_core + 8.0, alpha: 0.22, lw: 0.6 },
        { r: R_core + 12.5, alpha: 0.1, lw: 0.5 },
      ];

      for (const ring of rings) {
        ctx.beginPath();
        ctx.arc(cx, cy, ring.r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${colors.accentRgb}, ${ring.alpha})`;
        ctx.lineWidth = ring.lw;
        ctx.stroke();
      }

      // ── 3. Flowing Silk Ribbon Strands (Exact Original Black Hole Accretion Math) ──
      const numStrands = 14;

      // Dynamics multipliers - smooth, majestic, calm flow (NO fast agitation)
      let waveSpeed = 0.0022;
      let waveAmp = 4.5;

      if (callStatus === "user-speaking") {
        waveSpeed = 0.0026;
        waveAmp = 3.6 + (smoothedEnergy / 255) * 4.2;
      } else if (callStatus === "thinking") {
        waveSpeed = 0.0042;
        waveAmp = 4.2;
      } else if (callStatus === "speaking") {
        waveSpeed = 0.0026;
        waveAmp = 4.8;
      } else {
        // idle / listening
        waveSpeed = 0.0016;
        waveAmp = 2.8;
      }

      ctx.shadowColor = colors.glowColor;
      ctx.shadowBlur = colors.glowBlur;

      // Draw Top and Bottom Silk Streamlines
      for (const side of [-1, 1]) {
        for (let s = 0; s < numStrands; s++) {
          const norm_s = s / (numStrands - 1); // 0 to 1
          const C = 0.8 + norm_s * 7.5; // Compact vertical dispersion for smaller button

          // Alpha distribution: bright primary core ribbons, delicate ethereal outer filaments
          const distFromCore = Math.abs(norm_s - 0.38);
          const strandAlpha = Math.max(0.12, 0.95 - Math.pow(distFromCore, 1.2) * 1.0);
          const isCoreStrand = s === 4 || s === 5;
          const lw = isCoreStrand ? 1.7 : 0.8;

          ctx.beginPath();
          let started = false;

          const step = 2.5;
          for (let x = -W; x <= W; x += step) {
            const u = x / W; // -1 to 1
            const abs_u = Math.abs(u);
            const envelope = Math.pow(Math.max(0, 1.0 - abs_u * abs_u), 1.35);

            // Exact original deflection formula around circular black hole
            const deflection = (R_core * R_core * C) / Math.max(R_core * R_core, x * x + C * C);
            const y_base = C + deflection;

            // Pure smooth harmonic fluid undulation (NO electric jitter)
            let phase: number;
            if (callStatus === "thinking") {
              // Smooth wave moving from left to right across the accretion disk!
              phase = u * Math.PI * 3.2 - timestamp * 0.0045 + s * 0.18;
            } else {
              phase = timestamp * waveSpeed + s * 0.18;
            }

            const waveFactor =
              Math.sin(u * Math.PI * 3.2 + phase) *
              (waveAmp + norm_s * 1.8) *
              Math.exp(-Math.pow(abs_u - 0.42, 2) / 0.09);

            let y_actual = (y_base + waveFactor) * envelope;

            // Strict circular clearance at center event horizon around 30% smaller button
            if (abs_u * W < R_core + 1.8) {
              const x_dist = abs_u * W;
              const void_y =
                Math.sqrt(Math.max(0, (R_core + 1.8) * (R_core + 1.8) - x_dist * x_dist)) +
                0.8 +
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
        const pAlpha = p.baseAlpha * twinkle;

        let px = cx + p.x;
        if (callStatus === "thinking") {
          // Subtle left to right drift during thinking
          px = cx + (((p.x + 120 + timestamp * 0.035) % 240) - 120);
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
        "w-[240px] sm:w-[270px] md:w-[290px] h-[52px] sm:h-[56px] overflow-visible z-0 select-none",
        className,
      )}
    >
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
});
