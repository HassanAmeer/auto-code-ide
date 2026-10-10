import { memo } from "react";
import { PhoneCall, PhoneOff } from "lucide-react";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

export interface VoiceCallButtonProps {
  isCallActive: boolean;
  onToggleCall: () => void;
  className?: string;
  disabled?: boolean;
}

export const VoiceCallButton = memo(function VoiceCallButton({
  isCallActive,
  onToggleCall,
  className,
  disabled = false,
}: VoiceCallButtonProps) {
  const label = isCallActive ? "End Voice Call" : "Start Voice Call";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            disabled={disabled}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleCall();
            }}
            aria-label={label}
            className={cn(
              "flex size-8 items-center justify-center rounded-full transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
              isCallActive
                ? "text-red-500 hover:text-red-400 animate-pulse bg-red-500/10 shadow-[0_0_12px_rgba(239,68,68,0.35)]"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40",
              className,
            )}
          />
        }
      >
        {isCallActive ? (
          <PhoneOff className="w-5 h-5" aria-hidden="true" />
        ) : (
          <PhoneCall className="w-5 h-5" aria-hidden="true" />
        )}
      </TooltipTrigger>
      <TooltipPopup>
        <p>{label}</p>
      </TooltipPopup>
    </Tooltip>
  );
});
