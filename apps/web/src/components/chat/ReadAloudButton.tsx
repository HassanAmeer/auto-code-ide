import { memo, useState, useEffect, useMemo, useRef } from "react";
import { Volume2 } from "lucide-react";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  speakText,
  stopSpeaking,
  subscribeSpeechState,
  sanitizeTextForSpeech,
} from "~/lib/speech/tts";
import { cn } from "~/lib/utils";

export const ReadAloudButton = memo(function ReadAloudButton({
  text,
  size = "xs",
  variant = "ghost",
  className,
}: {
  text: string;
  size?: "xs" | "icon-xs";
  variant?: "outline" | "ghost";
  className?: string;
}) {
  const [speaking, setSpeaking] = useState(false);
  const cleanText = useMemo(() => sanitizeTextForSpeech(text), [text]);
  const cleanTextRef = useRef(cleanText);
  cleanTextRef.current = cleanText;

  useEffect(() => {
    return subscribeSpeechState((isSpeaking, speakingText) => {
      if (!isSpeaking) {
        setSpeaking(false);
      } else if (speakingText && cleanTextRef.current && speakingText !== cleanTextRef.current) {
        // Another message or speech source took over
        setSpeaking(false);
      }
    });
  }, []);

  // Cleanup if unmounted while speaking
  useEffect(() => {
    return () => {
      if (speaking) {
        stopSpeaking();
      }
    };
  }, [speaking]);

  const toggleSpeak = () => {
    if (speaking) {
      // Toggle OFF: immediately stop speech and revert to idle gray
      stopSpeaking();
      setSpeaking(false);
    } else {
      if (!cleanText) return;
      // Toggle ON: stop any ongoing speech from other sources, then start reading this message
      stopSpeaking();
      setSpeaking(true);
      speakText(cleanText, undefined, () => {
        setSpeaking(false);
      });
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={speaking ? "Stop Read Aloud" : "Read Aloud"}
            onClick={toggleSpeak}
            type="button"
            size={size}
            variant={variant === "ghost" ? "ghost-muted" : variant}
            className={cn(
              "relative transition-all duration-200 overflow-visible group",
              speaking
                ? "text-primary bg-primary/10 border border-primary/30 shadow-[0_0_12px_rgba(99,102,241,0.25)]"
                : "text-muted-foreground hover:text-foreground",
              className,
            )}
          />
        }
      >
        <span className="relative flex items-center justify-center">
          {speaking && (
            <>
              {/* Concentric expanding ripple waves radiating in 360 degrees */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -inset-1 rounded-full border border-primary/50 animate-tts-ripple"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -inset-1.5 rounded-full border border-primary/30 animate-tts-ripple-delayed"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -inset-0.5 rounded-full bg-primary/20 animate-pulse"
              />
            </>
          )}
          <Volume2
            className={cn(
              "size-3.5 transition-colors relative z-10",
              speaking
                ? "text-primary animate-pulse"
                : "text-muted-foreground group-hover:text-foreground",
            )}
          />
        </span>
      </TooltipTrigger>
      <TooltipPopup>
        <p>{speaking ? "Stop reading aloud" : "Read aloud"}</p>
      </TooltipPopup>
    </Tooltip>
  );
});
