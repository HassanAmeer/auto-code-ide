import {
  memo,
  useState,
  useRef,
  useEffect,
  type MouseEventHandler,
  type PointerEventHandler,
  type ReactNode,
} from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  Minimize2Icon,
  PlayIcon,
  Mic,
  MicOff,
  Globe,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import { CornerUpRight, ListPlus } from "lucide";
import { MorphIcon } from "~/components/MorphIcon";
import { useEnvironmentIdentificationMode } from "~/hooks/useSettings";
import { formatContextWindowTokens } from "~/lib/contextWindow";
import { cn } from "~/lib/utils";
import { createSttSession, type SttController, loadSttSettings } from "~/lib/speech/stt";
import { isComposerWebSearchEnabled, setComposerWebSearchEnabled } from "~/lib/webSearchService";
import { useShortcutModifierState } from "../../shortcutModifierState";
import { StageBackdropButtonArt, useSidebarStageBackdropVariant } from "../SidebarStageBackdrop";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Spinner } from "../ui/spinner";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { composerFloatingLayerProps } from "./composerEventScope";
import {
  alternateComposerDispatchAction,
  resolveComposerDispatchMode,
} from "@t3tools/client-runtime/state/composer-dispatch";

interface PendingActionState {
  questionIndex: number;
  isLastQuestion: boolean;
  canAdvance: boolean;
  isResponding: boolean;
  isComplete: boolean;
}

interface ComposerPrimaryActionsProps {
  compact: boolean;
  canOperateThread: boolean;
  pendingAction: PendingActionState | null;
  /** The turn is running: sending steers or queues instead of starting a turn. */
  isRunning: boolean;
  /** Stop can reach a run, including one still preparing or starting. */
  canInterrupt: boolean;
  followUpBehavior?: "queue" | "steer";
  alternateShortcutLabel?: string | null;
  showPlanFollowUpPrompt: boolean;
  promptHasText: boolean;
  isPolishingPrompt?: boolean;
  canUndoPolish?: boolean;
  onPolishPrompt?: () => void;
  onUndoPolish?: () => void;
  isSendBusy: boolean;
  sendDisabledReason: string | null;
  isConnecting: boolean;
  isEnvironmentUnavailable: boolean;
  isPreparingWorktree: boolean;
  hasSendableContent: boolean;
  canResume?: boolean;
  preserveComposerFocusOnPointerDown?: boolean;
  isEditingQueuedMessage?: boolean;
  onSubmitMessage?: MouseEventHandler<HTMLButtonElement>;
  onResume?: () => void;
  onPreviousPendingQuestion: () => void;
  onInterrupt: () => void;
  onImplementPlanInNewThread: () => void;
  /** Tokens a stale session would re-read. When set, a Compact chip shows the count and Enter compacts first. */
  compactBeforeSendTokens?: number | null;
  /** The Compact chip is turned off, so the next send keeps full history. */
  keepFullHistory?: boolean;
  onToggleKeepFullHistory?: () => void;
}

const formatPendingPrimaryActionLabel = (input: {
  compact: boolean;
  isLastQuestion: boolean;
  isResponding: boolean;
  questionIndex: number;
}) => {
  if (input.isResponding) {
    return "Submitting...";
  }
  if (input.compact) {
    return input.isLastQuestion ? "Submit" : "Next";
  }
  if (!input.isLastQuestion) {
    return "Next question";
  }
  return input.questionIndex > 0 ? "Submit answers" : "Submit answer";
};

// The composer's labeled primary actions (Submit, Refine, Implement) share the send button's
// message-action pill, so they are composer-owned buttons rather than restyled Buttons.
const messageActionPillClassName =
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-message-action font-medium text-base text-message-action-foreground shadow-xs shadow-message-action/24 outline-none hover:bg-message-action-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-64 disabled:shadow-none sm:text-sm";

const preventPointerFocus: PointerEventHandler<HTMLElement> = (event) => {
  event.preventDefault();
};

export const ComposerPrimaryActions = memo(function ComposerPrimaryActions({
  compact,
  canOperateThread,
  pendingAction,
  isRunning,
  canInterrupt,
  followUpBehavior = "steer",
  alternateShortcutLabel = null,
  showPlanFollowUpPrompt,
  promptHasText,
  isPolishingPrompt = false,
  canUndoPolish = false,
  onPolishPrompt,
  onUndoPolish,
  isSendBusy,
  sendDisabledReason,
  isConnecting,
  isEnvironmentUnavailable,
  isPreparingWorktree,
  hasSendableContent,
  canResume = false,
  preserveComposerFocusOnPointerDown = false,
  isEditingQueuedMessage = false,
  onSubmitMessage,
  onResume,
  onPreviousPendingQuestion,
  onInterrupt,
  onImplementPlanInNewThread,
  compactBeforeSendTokens = null,
  keepFullHistory = false,
  onToggleKeepFullHistory,
}: ComposerPrimaryActionsProps) {
  const pointerFocusProps = preserveComposerFocusOnPointerDown
    ? { onPointerDown: preventPointerFocus }
    : undefined;
  const environmentIdentificationMode = useEnvironmentIdentificationMode();
  const shortcutModifiers = useShortcutModifierState();
  const [isDictating, setIsDictating] = useState(false);
  const [isWebSearchActive, setIsWebSearchActive] = useState<boolean>(() =>
    isComposerWebSearchEnabled(),
  );
  const sttSessionRef = useRef<SttController | null>(null);

  useEffect(() => {
    return () => {
      sttSessionRef.current?.stop();
    };
  }, []);

  const handleToggleDictation = () => {
    if (isDictating) {
      sttSessionRef.current?.stop();
      setIsDictating(false);
      window.dispatchEvent(new CustomEvent("t3:speech-stream", { detail: { finalize: true } }));
      window.dispatchEvent(new CustomEvent("t3:speech-stream", { detail: { reset: true } }));
    } else {
      const session = createSttSession({
        onResult: (text, isFinal, cumulative) => {
          window.dispatchEvent(
            new CustomEvent("t3:speech-stream", {
              detail: { text: text.trim(), isFinal, cumulative: cumulative?.trim() },
            }),
          );
        },
        onStateChange: (active) => {
          setIsDictating(active);
          if (!active) {
            window.dispatchEvent(new CustomEvent("t3:speech-stream", { detail: { reset: true } }));
          }
        },
        onError: (err) => {
          console.warn("STT error:", err);
          setIsDictating(false);
          window.dispatchEvent(new CustomEvent("t3:speech-stream", { detail: { reset: true } }));
        },
      });
      sttSessionRef.current = session;
      session.start();
      setIsDictating(true);
    }
  };

  const isQueuing =
    !isEditingQueuedMessage &&
    resolveComposerDispatchMode({
      running: isRunning,
      activeTurnDefault: followUpBehavior,
      alternateModifier: shortcutModifiers.metaKey || shortcutModifiers.ctrlKey,
    }) === "queue";
  const alternateAction = alternateComposerDispatchAction(followUpBehavior);
  const isSendDisabled = false;
  const stageBackdropVariant = useSidebarStageBackdropVariant(
    environmentIdentificationMode === "artwork",
  );

  const renderStopGenerationButton = (insidePendingAction: boolean) => (
    <Tooltip key="interrupt">
      <TooltipTrigger
        render={
          <button
            type="button"
            className={cn(
              "flex cursor-pointer items-center justify-center rounded-full bg-destructive/90 text-white shadow-xs shadow-destructive/24 inset-shadow-control-highlight transition-all duration-150 hover:bg-destructive hover:scale-105 active:inset-shadow-control-pressed active:shadow-none [&_svg]:pointer-events-none",
              insidePendingAction ? "size-8 sm:size-7" : "size-8 sm:h-8 sm:w-8",
            )}
            {...pointerFocusProps}
            disabled={!canOperateThread}
            onClick={() => {
              if (canOperateThread) onInterrupt();
            }}
            aria-label="Stop generation"
          />
        }
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
          <rect x="2" y="2" width="8" height="8" rx="1.5" />
        </svg>
      </TooltipTrigger>
      <TooltipPopup>Interrupt</TooltipPopup>
    </Tooltip>
  );

  if (pendingAction) {
    return (
      <div className={cn("flex items-center justify-end", compact ? "gap-1.5" : "gap-2")}>
        {canInterrupt ? renderStopGenerationButton(true) : null}
        {pendingAction.questionIndex > 0 ? (
          compact ? (
            <Button
              size="icon-sm"
              variant="outline"
              {...pointerFocusProps}
              onClick={onPreviousPendingQuestion}
              disabled={pendingAction.isResponding}
              aria-label="Previous question"
            >
              <ChevronLeftIcon className="size-3.5" />
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              {...pointerFocusProps}
              onClick={onPreviousPendingQuestion}
              disabled={pendingAction.isResponding}
            >
              Previous
            </Button>
          )
        ) : null}
        <button
          type="submit"
          className={cn(messageActionPillClassName, "h-8 sm:h-7", compact ? "px-3" : "px-4")}
          {...pointerFocusProps}
          disabled={
            !canOperateThread ||
            isEnvironmentUnavailable ||
            pendingAction.isResponding ||
            (pendingAction.isLastQuestion ? !pendingAction.isComplete : !pendingAction.canAdvance)
          }
        >
          {formatPendingPrimaryActionLabel({
            compact,
            isLastQuestion: pendingAction.isLastQuestion,
            isResponding: pendingAction.isResponding,
            questionIndex: pendingAction.questionIndex,
          })}
        </button>
      </div>
    );
  }

  if (showPlanFollowUpPrompt && (promptHasText || !canResume)) {
    if (promptHasText) {
      return (
        <button
          type="submit"
          className={cn(messageActionPillClassName, "h-9 sm:h-8", compact ? "px-3" : "px-4")}
          {...pointerFocusProps}
          disabled={isSendBusy || isSendDisabled || isConnecting || isEnvironmentUnavailable}
        >
          {isConnecting || isSendBusy ? "Sending..." : "Refine"}
        </button>
      );
    }

    return (
      <div data-chat-composer-implement-actions="true" className="flex items-center justify-end">
        <button
          type="submit"
          className={cn(messageActionPillClassName, "h-9 rounded-r-none px-4 sm:h-8")}
          {...pointerFocusProps}
          disabled={isSendBusy || isSendDisabled || isConnecting || isEnvironmentUnavailable}
        >
          {isConnecting || isSendBusy ? "Sending..." : "Implement"}
        </button>
        <Menu>
          <MenuTrigger
            render={
              <button
                type="button"
                className={cn(
                  messageActionPillClassName,
                  "h-9 rounded-l-none border-l border-message-action-foreground/20 px-2 sm:h-8",
                )}
                aria-label="Implementation actions"
                {...pointerFocusProps}
                disabled={isSendBusy || isSendDisabled || isConnecting || isEnvironmentUnavailable}
              />
            }
          >
            <ChevronDownIcon className="size-3.5" />
          </MenuTrigger>
          <MenuPopup align="end" side="top" {...composerFloatingLayerProps}>
            <MenuItem
              disabled={isSendBusy || isSendDisabled || isConnecting || isEnvironmentUnavailable}
              onClick={() => {
                if (canOperateThread) onImplementPlanInNewThread();
              }}
            >
              Implement in a new thread
            </MenuItem>
          </MenuPopup>
        </Menu>
      </div>
    );
  }

  if (canInterrupt && !hasSendableContent && !isEditingQueuedMessage) {
    return renderStopGenerationButton(false);
  }

  const showResume = canResume && !hasSendableContent && !isEditingQueuedMessage;

  const compactTokens =
    compactBeforeSendTokens !== null && !showResume && !isEditingQueuedMessage
      ? formatContextWindowTokens(compactBeforeSendTokens)
      : null;
  const compactsBeforeSend = compactTokens !== null && !keepFullHistory;

  const submitLabel = showResume
    ? "Resume thread"
    : isEditingQueuedMessage
      ? "Update queued message"
      : compactsBeforeSend
        ? "Compact and send"
        : isQueuing
          ? "Queue message"
          : isRunning
            ? "Steer message"
            : "Submit message";
  const submitStatus = isEnvironmentUnavailable
    ? "Environment disconnected"
    : (sendDisabledReason ??
      (isConnecting
        ? "Connecting"
        : isPreparingWorktree
          ? "Preparing worktree"
          : isSendBusy
            ? isEditingQueuedMessage
              ? "Updating queued message"
              : "Submitting message"
            : null));
  const submitTooltip =
    submitStatus ??
    (compactsBeforeSend
      ? `Summarize ${compactTokens} tokens of history, then send`
      : isRunning && !isEditingQueuedMessage
        ? `Click to ${followUpBehavior}, Ctrl/⌘-click${alternateShortcutLabel ? ` or ${alternateShortcutLabel}` : ""} to ${alternateAction}`
        : submitLabel);

  const handleSendClick: MouseEventHandler<HTMLButtonElement> = (e) => {
    if (isDictating) {
      sttSessionRef.current?.stop();
      setIsDictating(false);
      window.dispatchEvent(new CustomEvent("t3:speech-stream", { detail: { reset: true } }));
    }
    if (showResume) {
      onResume?.();
    } else {
      onSubmitMessage?.(e);
    }
  };

  const sendButton = (
    <button
      type={showResume ? "button" : "submit"}
      className={cn(
        "relative isolate flex size-8 items-center justify-center overflow-hidden rounded-full shadow-xs transition-all duration-150 enabled:cursor-pointer enabled:inset-shadow-control-highlight hover:scale-105 active:inset-shadow-control-pressed active:shadow-none disabled:pointer-events-none disabled:opacity-64 disabled:shadow-none disabled:hover:scale-100 sm:size-8 [&_svg]:pointer-events-none",
        stageBackdropVariant
          ? "bg-transparent text-white enabled:shadow-black/24 enabled:hover:brightness-110"
          : "bg-message-action text-message-action-foreground enabled:shadow-message-action/24 hover:bg-message-action-hover",
      )}
      {...pointerFocusProps}
      onClick={handleSendClick}
      disabled={isSendBusy || (!hasSendableContent && !showResume)}
      aria-label={submitStatus ?? submitLabel}
    >
      {stageBackdropVariant ? (
        <span className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
          <StageBackdropButtonArt variant={stageBackdropVariant} />
        </span>
      ) : null}
      {isConnecting || isSendBusy ? (
        <Spinner size="sm" aria-hidden="true" />
      ) : showResume ? (
        <PlayIcon className="size-4 fill-current" aria-hidden="true" />
      ) : isEditingQueuedMessage ? (
        <CheckIcon className="size-4" aria-hidden="true" />
      ) : isRunning ? (
        <MorphIcon className="size-4" icon={isQueuing ? ListPlus : CornerUpRight} />
      ) : (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path
            d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );

  const handleToggleWebSearch = () => {
    setIsWebSearchActive((prev) => {
      const next = !prev;
      setComposerWebSearchEnabled(next);
      return next;
    });
  };

  const webSearchButton = (
    <Tooltip key="web-search-toggle">
      <TooltipTrigger
        render={
          <button
            type="button"
            className="flex size-7 sm:size-8 items-center justify-center cursor-pointer outline-none transition-all duration-200 rounded-full hover:bg-muted/60"
            {...pointerFocusProps}
            onClick={handleToggleWebSearch}
            aria-label={
              isWebSearchActive
                ? "Web search active (Live internet research enabled)"
                : "Web search paused (Click to enable live search)"
            }
          >
            <Globe
              className={cn(
                "size-3.5 sm:size-4 transition-colors duration-150",
                isWebSearchActive ? "web-search-shimmer" : "text-zinc-500 hover:text-zinc-300",
              )}
              aria-hidden="true"
            />
          </button>
        }
      />
      <TooltipPopup>
        {isWebSearchActive
          ? "Web Search: ON (Live internet search & URL extraction active)"
          : "Web Search: OFF (Click to turn on live search)"}
      </TooltipPopup>
    </Tooltip>
  );

  const sttSettings = loadSttSettings();
  const currentLang = sttSettings.language.replace("-", " ");

  const micButton = (
    <Tooltip key="mic-dictate">
      <TooltipTrigger
        render={
          <button
            type="button"
            className={cn(
              "relative isolate flex size-8 items-center justify-center overflow-hidden rounded-full shadow-xs transition-all duration-150 cursor-pointer sm:size-8",
              isDictating
                ? "border border-red-400/60 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 hover:scale-105 active:scale-95"
                : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground hover:scale-105 active:scale-95",
            )}
            {...pointerFocusProps}
            onClick={handleToggleDictation}
            aria-label={
              isDictating
                ? "Stop voice dictation (Listening continuously)"
                : `Dictate message (${currentLang})`
            }
          >
            {isDictating ? (
              <MicOff className="size-4 animate-bounce" aria-hidden="true" />
            ) : (
              <Mic className="size-4" aria-hidden="true" />
            )}
          </button>
        }
      />
      <TooltipPopup>
        {isDictating ? "Listening continuously... Click to stop" : `Voice typing (${currentLang})`}
      </TooltipPopup>
    </Tooltip>
  );

  const sendButtonElement = (
    <Tooltip key="submit">
      <TooltipTrigger render={<span className="inline-flex" />}>{sendButton}</TooltipTrigger>
      <TooltipPopup>{submitTooltip}</TooltipPopup>
    </Tooltip>
  );

  const unifiedPrimaryButton = isDictating
    ? micButton
    : hasSendableContent || showResume || isEditingQueuedMessage
      ? sendButtonElement
      : micButton;

  const polishDisabled =
    !canOperateThread ||
    isEnvironmentUnavailable ||
    isConnecting ||
    isSendBusy ||
    (!canUndoPolish && !promptHasText);

  const polishButton = (
    <Tooltip key="polish-prompt">
      <TooltipTrigger
        render={
          <button
            type="button"
            className={cn(
              "relative flex size-7 items-center justify-center rounded-full outline-none transition-all duration-200 hover:bg-muted/60 disabled:pointer-events-none disabled:opacity-48 sm:size-8",
              canUndoPolish
                ? "text-amber-300 hover:text-amber-200"
                : "text-muted-foreground hover:text-foreground",
            )}
            {...pointerFocusProps}
            onClick={canUndoPolish ? onUndoPolish : onPolishPrompt}
            disabled={polishDisabled}
            aria-label={
              canUndoPolish ? "Restore original prompt" : "Correct spelling and grammar with AI"
            }
          >
            {isPolishingPrompt ? (
              <Spinner size="sm" aria-hidden="true" />
            ) : canUndoPolish ? (
              <Undo2 className="size-4" aria-hidden="true" />
            ) : (
              <Sparkles className="size-4" aria-hidden="true" />
            )}
          </button>
        }
      />
      <TooltipPopup>
        {canUndoPolish
          ? "Restore the prompt you started with"
          : isPolishingPrompt
            ? "Correcting spelling and grammar..."
            : "Correct spelling and grammar with AI"}
      </TooltipPopup>
    </Tooltip>
  );

  const actions = (
    <div className="flex items-center gap-1 sm:gap-1.5">
      {webSearchButton}
      {polishButton}
      {unifiedPrimaryButton}
    </div>
  );

  if (compactTokens === null) return actions;

  return (
    <div data-chat-composer-compact-send="true" className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className={cn(
                "flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-xs tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-64 [&_svg]:pointer-events-none [&_svg]:size-3.5",
                keepFullHistory
                  ? "border-border text-muted-foreground hover:text-foreground"
                  : "border-warning/40 text-warning hover:bg-warning/8",
              )}
              {...pointerFocusProps}
              aria-pressed={!keepFullHistory}
              aria-label={`Compact ${compactTokens} tokens of history before sending`}
              disabled={!canOperateThread}
              onClick={onToggleKeepFullHistory}
            />
          }
        >
          <Minimize2Icon aria-hidden="true" />
          {keepFullHistory ? "Full" : "Compact"}
          <span>{compactTokens}</span>
        </TooltipTrigger>
        <TooltipPopup>
          {keepFullHistory
            ? `Next send keeps all ${compactTokens} tokens. Click to compact first`
            : `Next send compacts ${compactTokens} tokens first. Click to keep full history`}
        </TooltipPopup>
      </Tooltip>
      {actions}
    </div>
  );
});
