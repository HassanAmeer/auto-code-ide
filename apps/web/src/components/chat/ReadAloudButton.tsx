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
              status !== "idle" && "w-auto px-1.5",
              status === "speaking"
                ? "text-white hover:text-white"
                : isPurple
                  ? "text-zinc-400 hover:text-zinc-200"
                  : "text-muted-foreground hover:text-foreground",
              className,
            )}
          />
        }
      >
        {status === "loading" ? (
          <span className="relative flex items-center justify-center gap-1">
            <Volume2 className="size-3.5 shrink-0" />
            <Loader2 className="size-3 animate-spin shrink-0" />
          </span>
        ) : status === "speaking" ? (
          <span className="relative flex items-center justify-center gap-1 text-white">
            <Volume2 className="size-3.5 transition-colors relative z-10 block group-hover:hidden text-white shrink-0" />
            <VolumeX className="size-3.5 transition-colors relative z-10 hidden group-hover:block text-rose-400 shrink-0" />

            {/* Small subtle equalizer sound waves in front of speaker (direction of sound) */}
            <span
              className="flex items-center gap-[2px] h-3 px-0.5 relative z-10 shrink-0"
              aria-hidden="true"
            >
              <span className="w-0.5 rounded-full bg-white animate-tts-eq-1" />
              <span className="w-0.5 rounded-full bg-white animate-tts-eq-2" />
              <span className="w-0.5 rounded-full bg-white animate-tts-eq-3" />
            </span>
          </span>
        ) : (
          <span className="relative flex items-center justify-center">
            <Volume2 className="size-3.5 transition-colors shrink-0" />
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
