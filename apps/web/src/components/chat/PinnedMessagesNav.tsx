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
 * Compact up / pin-count / down control for jumping between pinned assistant
 * responses. Rendered in the chat header; hidden until something is pinned.
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
      className={cn(
        "flex shrink-0 items-center gap-0.5 rounded-md border border-border/70 bg-muted/40 px-0.5 py-0.5",
        className,
      )}
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
          <ChevronUpIcon className="size-3" />
        </TooltipTrigger>
        <TooltipPopup side="bottom">Previous pinned response</TooltipPopup>
      </Tooltip>

      <div className="relative flex size-5 items-center justify-center" aria-hidden>
        <PinIcon className="size-3 fill-current text-primary" />
        <span className="absolute -top-1 right-0 rounded-full bg-primary px-1 text-[8px] font-semibold leading-tight text-primary-foreground tabular-nums">
          {formatPinnedCount(nav.activeIndex, total)}
        </span>
      </div>

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
          <ChevronDownIcon className="size-3" />
        </TooltipTrigger>
        <TooltipPopup side="bottom">Next pinned response</TooltipPopup>
      </Tooltip>
    </div>
  );
});
