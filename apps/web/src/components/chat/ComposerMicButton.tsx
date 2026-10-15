import { memo, useState, useRef, useEffect } from "react";
import { Mic, MicOff } from "lucide-react";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { createSttSession, type SttController, loadSttSettings } from "~/lib/speech/stt";
import { cn } from "~/lib/utils";

export const ComposerMicButton = memo(function ComposerMicButton({
  onTranscript,
  className,
}: {
  onTranscript?: (text: string) => void;
  className?: string;
}) {
  const [listening, setListening] = useState(false);
  const sessionRef = useRef<SttController | null>(null);

  useEffect(() => {
    return () => {
      sessionRef.current?.stop();
    };
  }, []);

  const toggleMic = () => {
    if (listening) {
      sessionRef.current?.stop();
      setListening(false);
      window.dispatchEvent(new CustomEvent("t3:speech-interim", { detail: { text: "" } }));
    } else {
      const session = createSttSession({
        onResult: (text, isFinal) => {
          if (isFinal && text.trim()) {
            if (onTranscript) {
              onTranscript(text.trim());
            } else {
              // Dispatch custom event that composer listens to
              window.dispatchEvent(
                new CustomEvent("t3:insert-speech-text", { detail: { text: text.trim() } }),
              );
            }
          }
        },
        onInterim: (interim) => {
          window.dispatchEvent(new CustomEvent("t3:speech-interim", { detail: { text: interim } }));
        },
        onStateChange: (active) => {
          setListening(active);
          if (!active) {
            window.dispatchEvent(new CustomEvent("t3:speech-interim", { detail: { text: "" } }));
          }
        },
        onError: (err) => {
          console.warn("STT error:", err);
          setListening(false);
          window.dispatchEvent(new CustomEvent("t3:speech-interim", { detail: { text: "" } }));
        },
      });

      sessionRef.current = session;
      session.start();
      setListening(true);
    }
  };

  const currentSettings = loadSttSettings();
  const label = listening
    ? "Listening... Click to stop"
    : `Dictate (${currentSettings.language.replace("-", " ")})`;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={toggleMic}
            aria-label={label}
            className={cn(
              "relative isolate flex h-8 w-8 items-center justify-center rounded-full transition-all duration-150 cursor-pointer",
              listening
                ? "bg-red-500 text-white animate-pulse shadow-md shadow-red-500/30"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/80",
              className,
            )}
          />
        }
      >
        {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
      </TooltipTrigger>
      <TooltipPopup>
        <p>{label}</p>
      </TooltipPopup>
    </Tooltip>
  );
});
