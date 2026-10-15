import type { OrchestrationV2ProviderFailureClass } from "@t3tools/contracts";
import { memo } from "react";
import { Alert, AlertAction, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import { CircleAlertIcon, XIcon } from "lucide-react";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { OpenAI } from "../Icons";
import { ChatGptUsageButton } from "../settings/ChatGptUsageButton";

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
  if (!error) return null;
  const variant = errorClass === "usage_limit" ? "warning" : "error";
  return (
    <div className="pointer-events-auto mx-auto w-fit max-w-[min(48rem,calc(100%-2rem))] pt-3">
      <Alert variant={variant} surface="glass" controlAlignment="first-line" data-variant={variant}>
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
            <div>
              <Tooltip>
                <TooltipTrigger render={<div className="line-clamp-3" />}>{error}</TooltipTrigger>
                <TooltipPopup side="top" className="whitespace-pre-wrap">
                  {error}
                </TooltipPopup>
              </Tooltip>
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
                      className="h-5 text-2xs px-2"
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
                      className="h-5 text-2xs px-2 border-primary/40 text-primary hover:bg-primary/10"
                      title={`Switch to ${nextFallbackModelName} and retry`}
                    >
                      Next Model ({nextFallbackModelName})
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
              <Button variant="ghost" size="icon-xs" aria-label="Dismiss error" onClick={onDismiss}>
                <XIcon />
              </Button>
            ) : null}
          </AlertAction>
        )}
      </Alert>
    </div>
  );
});
