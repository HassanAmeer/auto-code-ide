import { memo } from "react";
import { Mic, MicOff } from "lucide-react";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { loadSttSettings } from "~/lib/speech/stt";
import { cn } from "~/lib/utils";
import { useComposerDictation } from "./composerDictation";

/**
 * Dictation mic fused flush into the top-right corner of the composer card
 * ("corner tile"): its top-right arc continues the card's rounded corner, its
 * top and right edges are collinear with the card border — zero gap. Rendered
 * as a direct child of the composer surface (which is `relative`).
 */
export const ComposerDictationMicButton = memo(function ComposerDictationMicButton({
  className,
}: {
  className?: string;
}) {
  const { isDictating, toggle } = useComposerDictation();
  const currentLang = loadSttSettings().language.replace("-", " ");

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onPointerDown={(event) => event.preventDefault()}
            onClick={toggle}
            aria-label={
              isDictating
                ? "Stop voice dictation (Listening continuously)"
                : `Dictate message (${currentLang})`
            }
            aria-pressed={isDictating}
            className={cn(
              "absolute -top-px -right-px z-10 flex h-[34px] w-[38px] cursor-pointer items-center justify-center border outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring rounded-tr-[23px] rounded-bl-[14px]",
              isDictating
                ? "border-red-400/60 bg-red-500/15 text-red-400 hover:bg-red-500/25 opacity-100"
                : "border-[#2a2a31] bg-[#1a1a20] text-zinc-500 hover:bg-[#222228] hover:text-zinc-400 opacity-50",
              className,
            )}
          >
            {isDictating ? (
              <MicOff className="size-3.5" aria-hidden="true" />
            ) : (
              <Mic className="size-3.5" aria-hidden="true" />
            )}
          </button>
        }
      />
      <TooltipPopup>
        {isDictating ? "Listening continuously... Click to stop" : `Voice typing (${currentLang})`}
      </TooltipPopup>
    </Tooltip>
  );
});
