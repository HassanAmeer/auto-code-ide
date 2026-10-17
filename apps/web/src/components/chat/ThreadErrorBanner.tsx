import type { OrchestrationV2ProviderFailureClass } from "@t3tools/contracts";
import { memo, useState } from "react";
import { Alert, AlertAction, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import { CircleAlertIcon, ChevronDown, ChevronUp, XIcon } from "lucide-react";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { OpenAI } from "../Icons";
import { ChatGptUsageButton } from "../settings/ChatGptUsageButton";
import { parseErrorDetails, truncateModelName } from "~/lib/compactErrorFormatter";

export function getThreadErrorBannerKey(threadKey: string, error: string | null): string | null {
  return error === null ? null : `${threadKey}\u0000${error}`;
}

export function shouldShowThreadErrorBanner(
  threadKey: string,
  error: string | null,
  isDismissed: boolean,
): boolean {
  return getThreadErrorBannerKey(threadKey, error) !== null && !isDismissed;
}

// Session-scoped (module-level so it survives ChatView remounts, e.g. route
// changes between threads). Mirrors the branch-mismatch banner: a dismissal
// is remembered per thread key plus message, so navigating away to a thread
// with no error cannot resurrect the banner, while a different error message
// on the same thread still appears.
const sessionDismissedThreadErrorBannerKeys = new Set<string>();

export function dismissThreadErrorBannerForSession(bannerKey: string | null): void {
  if (bannerKey !== null) {
    sessionDismissedThreadErrorBannerKeys.add(bannerKey);
  }
}

export function isThreadErrorBannerDismissedForSession(bannerKey: string | null): boolean {
  return bannerKey !== null && sessionDismissedThreadErrorBannerKeys.has(bannerKey);
}

export const ThreadErrorBanner = memo(function ThreadErrorBanner({
  error,
  onDismiss,
  errorClass,
  chatGptUsageLimit = false,
  autoRetryCountdown,
  autoRetryAttempt,
  autoRetryMaxRetries,
  onRetryNow,
  onCancelAutoRetry,
  onSwitchModelNow,
  nextFallbackModelName,
}: {
  error: string | null;
  errorClass?: OrchestrationV2ProviderFailureClass | null | undefined;
  onDismiss?: (() => void) | undefined;
  chatGptUsageLimit?: boolean | undefined;
  autoRetryCountdown?: number | null | undefined;
  autoRetryAttempt?: number | undefined;
  autoRetryMaxRetries?: number | undefined;
  onRetryNow?: (() => void) | undefined;
  onCancelAutoRetry?: (() => void) | undefined;
  onSwitchModelNow?: (() => void) | undefined;
  nextFallbackModelName?: string | null | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!error) return null;
  const variant = errorClass === "usage_limit" ? "warning" : "error";
  const parsed = parseErrorDetails(error);
  const shortFallback = truncateModelName(nextFallbackModelName);

  return (
    <div className="pointer-events-auto mx-auto w-fit max-w-[min(48rem,calc(100%-2rem))] pt-2.5">
      <Alert
        variant={variant}
        surface="glass"
        controlAlignment="first-line"
        data-variant={variant}
        className="rounded-xl border border-white/10 shadow-lg backdrop-blur-xl py-2 px-3 text-xs"
      >
        {chatGptUsageLimit ? (
          <OpenAI className="size-4 text-foreground!" aria-hidden="true" />
        ) : (
          <CircleAlertIcon />
        )}
        <AlertDescription>
          {chatGptUsageLimit ? (
            <div className="space-y-1">
              <p className="font-medium">ChatGPT usage limit reached</p>
              <p>Review your usage settings in ChatGPT to continue.</p>
            </div>
          ) : (
            <div className="min-w-0">
              {/* Compact Cupertino single-line error summary */}
              <div className="flex flex-wrap items-center gap-1.5 leading-snug">
                {parsed.statusCode ? (
                  <span className="font-mono text-3xs font-semibold px-1.5 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 dark:text-rose-300 shrink-0">
                    {parsed.statusCode}
                  </span>
                ) : null}
                {parsed.shortModel ? (
                  <span
                    className="font-medium text-foreground/90 shrink-0"
                    title={parsed.fullModel || undefined}
                  >
                    {parsed.shortModel}
                  </span>
                ) : null}
                {parsed.shortModel && parsed.shortReason ? (
                  <span className="text-muted-foreground/50 text-3xs">•</span>
                ) : null}
                <span className="text-muted-foreground truncate max-w-[280px] sm:max-w-[380px]">
                  {parsed.shortReason}
                </span>
                <button
                  type="button"
                  onClick={() => setExpanded((prev) => !prev)}
                  className="inline-flex items-center gap-0.5 text-3xs font-medium text-primary hover:underline ml-1 cursor-pointer shrink-0"
                  aria-expanded={expanded}
                  title={expanded ? "Hide error details" : "Uncollapse full error details"}
                >
                  <span>{expanded ? "Hide" : "Details"}</span>
                  {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                </button>
              </div>

              {/* Uncollapsed / Expanded full error panel */}
              {expanded ? (
                <div className="mt-2 text-2xs font-mono text-muted-foreground bg-muted/30 p-2.5 rounded-lg border border-border/40 select-text max-h-44 overflow-y-auto leading-relaxed whitespace-pre-wrap break-all animate-in fade-in duration-150">
                  {error}
                </div>
              ) : null}

              {/* Retry actions & countdown */}
              {onRetryNow ||
              (onSwitchModelNow && nextFallbackModelName) ||
              (autoRetryCountdown !== null && autoRetryCountdown !== undefined) ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 font-sans">
                  {autoRetryCountdown !== null && autoRetryCountdown !== undefined ? (
                    <span className="text-xs font-medium text-amber-500 dark:text-amber-400 flex items-center gap-1.5">
                      <span className="inline-block size-2 rounded-full bg-amber-500 animate-pulse" />
                      Auto-retrying in {autoRetryCountdown}s
                      {autoRetryAttempt !== undefined && autoRetryMaxRetries !== undefined
                        ? ` (Attempt ${autoRetryAttempt + 1} of ${autoRetryMaxRetries})`
                        : ""}
                      ...
                    </span>
                  ) : null}
                  {onRetryNow ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={onRetryNow}
                      className="h-5 text-2xs px-2 rounded-md"
                    >
                      Retry now
                    </Button>
                  ) : null}
                  {onSwitchModelNow && nextFallbackModelName ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={onSwitchModelNow}
                      className="h-5 text-2xs px-2 rounded-md border-primary/40 text-primary hover:bg-primary/10"
                      title={`Switch to ${nextFallbackModelName} and retry`}
                    >
                      Next Model ({shortFallback || nextFallbackModelName})
                    </Button>
                  ) : null}
                  {autoRetryCountdown !== null &&
                  autoRetryCountdown !== undefined &&
                  onCancelAutoRetry ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={onCancelAutoRetry}
                      className="h-5 text-2xs px-2 text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </AlertDescription>
        {(chatGptUsageLimit || onDismiss) && (
          <AlertAction>
            {chatGptUsageLimit ? <ChatGptUsageButton variant="default" size="sm" /> : null}
            {onDismiss ? (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Dismiss error"
                onClick={onDismiss}
                className="rounded-full"
              >
                <XIcon />
              </Button>
            ) : null}
          </AlertAction>
        )}
      </Alert>
    </div>
  );
});
