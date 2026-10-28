import { memo, useState, useEffect, useMemo, useRef } from "react";
import { Volume2, VolumeX, Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  speakText,
  stopSpeaking,
  subscribeSpeechState,
  sanitizeTextForSpeech,
  loadTtsSettings,
  type TtsSettings,
} from "~/lib/speech/tts";
import { cn } from "~/lib/utils";

export interface ReadAloudButtonProps {
  text: string;
  size?: "xs" | "icon-xs" | "sm";
  variant?: "outline" | "ghost";
  colorScheme?: "default" | "purple";
  className?: string;
  ttsOptions?: Partial<TtsSettings>;
}

export const ReadAloudButton = memo(function ReadAloudButton({
  text,
  size = "xs",
  variant = "ghost",
  colorScheme = "default",
  className,
  ttsOptions,
}: ReadAloudButtonProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "speaking">("idle");
  const cleanText = useMemo(() => sanitizeTextForSpeech(text), [text]);
  const cleanTextRef = useRef(cleanText);
  cleanTextRef.current = cleanText;

  useEffect(() => {
    return subscribeSpeechState((isSpeaking, speakingText) => {
      if (!isSpeaking) {
        setStatus("idle");
      } else if (speakingText && cleanTextRef.current) {
        if (
          speakingText === cleanTextRef.current ||
          cleanTextRef.current.startsWith(speakingText) ||
          speakingText.startsWith(cleanTextRef.current)
        ) {
          setStatus("speaking");
        } else {
          // Another message or speech source took over
          setStatus("idle");
        }
      } else if (isSpeaking) {
        // If isSpeaking is true and we were waiting in loading state
        setStatus((prev) => (prev === "loading" ? "speaking" : prev));
      }
    });
  }, []);

  // Cleanup if unmounted while speaking or loading
  useEffect(() => {
    return () => {
      if (status !== "idle") {
        stopSpeaking();
      }
    };
  }, [status]);

  // If there is no speakable content (e.g. message is 100% code or thinking blocks), hide the Read Aloud button
  if (!cleanText) {
    return null;
  }

  const toggleSpeak = () => {
    if (status !== "idle") {
      // Toggle OFF: immediately stop speech and revert to idle
      stopSpeaking();
      setStatus("idle");
    } else {
      if (!cleanText) return;
      // Toggle ON: stop any ongoing speech from other sources, immediately show shimmer loading state
      stopSpeaking();
      setStatus("loading");
      const effectiveOptions = ttsOptions ?? loadTtsSettings();
      speakText(cleanText, effectiveOptions, () => {
        setStatus("idle");
      });
    }
  };

  const isPurple = colorScheme === "purple";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={
              status === "loading"
                ? "Loading speech..."
                : status === "speaking"
                  ? "Stop Read Aloud"
                  : "Read Aloud"
            }
            onClick={toggleSpeak}
            type="button"
            size={size}
            variant={variant === "ghost" ? "ghost-muted" : variant}
            className={cn(
              "relative transition-all duration-200 overflow-visible group select-none",
              status === "loading" &&
                (isPurple
                  ? "text-purple-300 border border-purple-500/40 shadow-[0_0_14px_rgba(168,85,247,0.35)] animate-tts-shimmer"
                  : "text-primary border border-primary/40 shadow-[0_0_14px_rgba(99,102,241,0.35)] animate-tts-shimmer-primary"),
              status === "speaking" &&
                (isPurple
                  ? "text-purple-300 bg-purple-500/15 border border-purple-500/35 shadow-[0_0_12px_rgba(168,85,247,0.25)]"
                  : "text-primary bg-primary/10 border border-primary/30 shadow-[0_0_12px_rgba(99,102,241,0.25)]"),
              status === "idle" &&
                (isPurple
                  ? "text-zinc-500 hover:text-purple-300 hover:bg-purple-500/10"
                  : "text-muted-foreground hover:text-foreground"),
              className,
            )}
          />
        }
      >
        {status === "loading" ? (
          <span className="relative flex items-center justify-center">
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute -inset-1 rounded-full animate-pulse",
                isPurple ? "bg-purple-500/25" : "bg-primary/25",
              )}
            />
            <Loader2
              className={cn(
                "size-3.5 animate-spin relative z-10 shrink-0",
                isPurple ? "text-purple-400" : "text-primary",
              )}
            />
          </span>
        ) : status === "speaking" ? (
          <span className="relative flex items-center justify-center gap-1">
            {/* Concentric expanding ripple waves radiating in 360 degrees */}
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute -inset-1 rounded-full border animate-tts-ripple",
                isPurple ? "border-purple-400/50" : "border-primary/50",
              )}
            />
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute -inset-1.5 rounded-full border animate-tts-ripple-delayed",
                isPurple ? "border-purple-400/30" : "border-primary/30",
              )}
            />
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute -inset-0.5 rounded-full animate-pulse",
                isPurple ? "bg-purple-500/20" : "bg-primary/20",
              )}
            />

            {/* Jumping 3-bar equalizer animation */}
            <span
              className="flex items-center gap-0.5 h-3.5 px-0.5 relative z-10"
              aria-hidden="true"
            >
              <span
                className={cn(
                  "w-0.5 rounded-full animate-tts-eq-1",
                  isPurple ? "bg-purple-400" : "bg-primary",
                )}
              />
              <span
                className={cn(
                  "w-0.5 rounded-full animate-tts-eq-2",
                  isPurple ? "bg-purple-400" : "bg-primary",
                )}
              />
              <span
                className={cn(
                  "w-0.5 rounded-full animate-tts-eq-3",
                  isPurple ? "bg-purple-400" : "bg-primary",
                )}
              />
            </span>

            <Volume2
              className={cn(
                "size-3.5 transition-colors relative z-10 block group-hover:hidden",
                isPurple ? "text-purple-400" : "text-primary",
              )}
            />
            <VolumeX
              className={cn(
                "size-3.5 transition-colors relative z-10 hidden group-hover:block",
                isPurple ? "text-rose-400" : "text-destructive",
              )}
            />
          </span>
        ) : (
          <span className="relative flex items-center justify-center">
            <Volume2
              className={cn(
                "size-3.5 transition-colors relative z-10",
                isPurple
                  ? "text-zinc-500 group-hover:text-purple-300"
                  : "text-muted-foreground group-hover:text-foreground",
              )}
            />
          </span>
        )}
      </TooltipTrigger>
      <TooltipPopup>
        <p>
          {status === "loading"
            ? "Preparing speech (Click to cancel)..."
            : status === "speaking"
              ? "Stop reading aloud"
              : "Read aloud"}
        </p>
      </TooltipPopup>
    </Tooltip>
  );
});
