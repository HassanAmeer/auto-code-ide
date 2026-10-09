import { memo, useState, useEffect } from "react";
import { Volume2, Square } from "lucide-react";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { speakText, stopSpeaking, isCurrentlySpeaking, subscribeSpeechState } from "~/lib/speech/tts";
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

  useEffect(() => {
    return subscribeSpeechState((isSpeaking, speakingText) => {
      // If speaking text matches our text or speech ended
      if (!isSpeaking) {
        setSpeaking(false);
      }
    });
  }, [text]);

  const toggleSpeak = () => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
    } else {
      setSpeaking(true);
      speakText(text, undefined, () => {
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
            className={cn(className, speaking && "text-primary animate-pulse")}
          />
        }
      >
        {speaking ? (
          <Square className="size-3 fill-current" />
        ) : (
          <Volume2 className="size-3" />
        )}
      </TooltipTrigger>
      <TooltipPopup>
        <p>{speaking ? "Stop reading aloud" : "Read aloud"}</p>
      </TooltipPopup>
    </Tooltip>
  );
});
