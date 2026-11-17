import { ChevronDownIcon, ChevronUpIcon, PinIcon } from "lucide-react";
import { memo } from "react";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { cn } from "~/lib/utils";
import { formatPinnedCount } from "./pinnedMessages.logic";
import { selectPinnedIds, selectPinnedNav, usePinnedMessagesStore } from "~/pinnedMessagesStore";

interface PinnedMessagesNavProps {
  readonly threadKey: string;
  readonly className?: string;
}

/**
 * Compact up / pin / down control for jumping between pinned assistant
 * responses. Sits next to the Export button in the header with no background
 * or outline; the count is plain text on the right. Hidden until something is
 * pinned.
 */
export const PinnedMessagesNav = memo(function PinnedMessagesNav({
  threadKey,
  className,
}: PinnedMessagesNavProps) {
  const pinnedIds = usePinnedMessagesStore((state) => selectPinnedIds(state, threadKey));
  const nav = usePinnedMessagesStore((state) => selectPinnedNav(state, threadKey));
  const requestJump = usePinnedMessagesStore((state) => state.requestJump);

  const total = nav.rowIndices.length;
  if (pinnedIds.length === 0 || total === 0) return null;

  return (
    <div
      className={cn("flex shrink-0 items-center gap-0.5", className)}
      data-pinned-nav
      data-pinned-count={total}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label="Previous pinned response"
              onClick={() => requestJump(threadKey, -1)}
            />
          }
        >
          <ChevronUpIcon className="size-3.5" />
        </TooltipTrigger>
        <TooltipPopup side="bottom">Previous pinned response</TooltipPopup>
      </Tooltip>

      <span className="flex size-4 items-center justify-center text-muted-foreground" aria-hidden>
        <PinIcon className="size-3.5 fill-current" />
      </span>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label="Next pinned response"
              onClick={() => requestJump(threadKey, 1)}
            />
          }
        >
          <ChevronDownIcon className="size-3.5" />
        </TooltipTrigger>
        <TooltipPopup side="bottom">Next pinned response</TooltipPopup>
      </Tooltip>

      <span className="ml-1 text-xs tabular-nums text-muted-foreground" aria-live="polite">
        {formatPinnedCount(nav.activeIndex, total)}
      </span>
    </div>
  );
});
