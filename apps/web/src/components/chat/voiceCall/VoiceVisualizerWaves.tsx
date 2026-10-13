import { memo, useEffect, useRef } from "react";
import { cn } from "~/lib/utils";

export type VoiceCallStatus = "idle" | "listening" | "user-speaking" | "thinking" | "speaking";

const NUM_BARS = 50;

export interface VoiceVisualizerWavesProps {
  callStatus: VoiceCallStatus;
  analyserNode: AnalyserNode | null;
  className?: string;
  onInterrupt?: () => void;
}

export const VoiceVisualizerWaves = memo(function VoiceVisualizerWaves({
  callStatus,
  analyserNode,
  className,
  onInterrupt,
}: VoiceVisualizerWavesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<(HTMLDivElement | null)[]>([]);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    const freqData = analyserNode ? new Uint8Array(analyserNode.frequencyBinCount) : null;

    const animate = (timestamp: number) => {
      if (!active) return;

      const bars = barsRef.current;
      const isAnalysing = callStatus === "user-speaking" && analyserNode && freqData;

      if (isAnalysing) {
        analyserNode.getByteFrequencyData(freqData);
      }

      for (let i = 0; i < NUM_BARS; i++) {
        const bar = bars[i];
        if (!bar) continue;

        // Symmetric curved bell factor: 1 at center, ~0.15 at edges
        const d = Math.abs(i - 24.5) / 24.5;
        const bell = Math.pow(Math.cos((d * Math.PI) / 2), 0.75);

        let height = 6;

        switch (callStatus) {
          case "idle":
          case "listening": {
            // State 1: Sakin / Silent (Subtle idle breathing)
            const breath = Math.sin(timestamp * 0.002 + i * 0.15);
            height = Math.max(4, 5 + 10 * bell * (0.6 + 0.4 * breath));
            break;
          }

          case "user-speaking": {
            // State 2: Real Microphone Reactive
            if (freqData) {
              // Map voice frequencies: center bars get mid/voice bins, outer get harmonics
              const binIndex = Math.min(freqData.length - 1, Math.floor((1 - d) * 22) + 2);
              const val = freqData[binIndex] || 0;
              const normalized = val / 255;
              height = Math.max(5, Math.min(38, 6 + normalized * 34 * (0.35 + 0.65 * bell)));
            } else {
              const energy = Math.sin(timestamp * 0.008 + i * 0.4) * 0.5 + 0.5;
              height = Math.max(5, 6 + 28 * energy * bell);
            }
            break;
          }

          case "thinking": {
            // State 3: Thinking / Travelling shimmer wave (Math.sin(t * 3.5 + i * 0.32))
            const shimmer = Math.sin(timestamp * 0.0035 + i * 0.32);
            height = Math.max(5, 14 + 14 * shimmer * (0.4 + 0.6 * bell));
            break;
          }

          case "speaking": {
            // State 4: Assistant Speaking (Conversational speech cadence & formants)
            const cadence = Math.abs(
              Math.sin(timestamp * 0.006) * Math.cos(timestamp * 0.0025 + i * 0.08),
            );
            const formant = Math.sin(timestamp * 0.004 + i * 0.28) * 0.5 + 0.5;
            height = Math.max(6, 8 + 30 * cadence * formant * (0.35 + 0.65 * bell));
            break;
          }
        }

        bar.style.height = `${Math.round(height)}px`;
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      active = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [callStatus, analyserNode]);

  // Visualizer bar styling per state
  const getBarColorClass = () => {
    switch (callStatus) {
      case "idle":
      case "listening":
        // State 1: Dark grey / muted metallic grey
        return "bg-gradient-to-t from-zinc-700 via-zinc-400 to-slate-200 border border-zinc-500/20 opacity-75";

      case "user-speaking":
        // State 2: Dynamic silver body with active theme-colored border & glowing shadow
        return "bg-gradient-to-t from-zinc-400 via-slate-100 to-white border-[1.5px] border-[var(--primary-color,var(--primary,#6366f1))] shadow-[0_0_8px_var(--primary-glow,rgba(99,102,241,0.5))]";

      case "thinking":
        // State 3: Warm shifting gradient (amber/orange)
        return "bg-gradient-to-t from-amber-950 via-amber-600 to-orange-400 border border-amber-500/40 shadow-[0_0_8px_rgba(245,158,11,0.35)]";

      case "speaking":
        // State 4: Full application theme color gradient
        return "bg-gradient-to-t from-[var(--primary-dark,#4338ca)] via-[var(--primary-color,var(--primary,#6366f1))] to-[var(--primary-dark,#4338ca)] border border-[var(--primary-color,var(--primary,#6366f1))]/60 shadow-[0_0_8px_var(--primary-glow,rgba(99,102,241,0.5))]";
    }
  };

  const getStatusLabel = () => {
    switch (callStatus) {
      case "idle":
      case "listening":
        return "Listening...";
      case "user-speaking":
        return "Listening to you...";
      case "thinking":
        return "Assistant is thinking...";
      case "speaking":
        return "Assistant speaking aloud...";
    }
  };

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="Voice Call Audio Visualizer"
      title={
        callStatus === "speaking"
          ? "Assistant is speaking. Click anywhere or press Esc to stop."
          : callStatus === "thinking"
            ? "Assistant is thinking. Click anywhere or press Esc to cancel."
            : undefined
      }
      onClick={() => {
        if (callStatus === "speaking" || callStatus === "thinking") {
          onInterrupt?.();
        }
      }}
      className={cn(
        "relative flex h-11 w-full items-center justify-between px-3 py-1.5 transition-all duration-200",
        (callStatus === "speaking" || callStatus === "thinking") && "cursor-pointer group",
        className,
      )}
    >
      <div className="flex h-10 w-full items-center justify-center gap-[3px] sm:gap-1 overflow-hidden">
        {Array.from({ length: NUM_BARS }).map((_, i) => (
          <div
            key={i}
            ref={(el) => {
              barsRef.current[i] = el;
            }}
            className={cn(
              "w-[2.5px] sm:w-[3.5px] rounded-full transition-[background-color,border-color,box-shadow] duration-200 ease-out",
              getBarColorClass(),
            )}
            style={{ height: "6px" }}
          />
        ))}
      </div>
      <span className="sr-only">{getStatusLabel()}</span>
    </div>
  );
});
