import type { OrchestrationV2ProviderFailureClass } from "@t3tools/contracts";
import { memo, useMemo, useState } from "react";
import { Alert, AlertAction, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import {
  CircleAlertIcon,
  ChevronDown,
  ChevronUp,
  RotateCcwIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
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
  currentModelName,
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
  currentModelName?: string | null | undefined;
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
  const parsed = parseErrorDetails(error, currentModelName);
  const shortFallback = truncateModelName(nextFallbackModelName);
  const modelDisplayName = currentModelName || parsed.shortModel;

  const cleanCompactDetails = useMemo(() => {
    if (!error) return "";
    const lines = error
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const meaningful = lines.filter(
      (l) =>
        !l.startsWith("at ") &&
        !l.startsWith("node:") &&
        !l.includes("node_modules") &&
        !l.includes("EffectPrimitive"),
    );
    if (meaningful.length > 0) {
      return meaningful.slice(0, 2).join(" · ");
    }
    return lines[0] || error.slice(0, 140);
  }, [error]);

  return (
    <div className="pointer-events-auto mx-auto w-fit max-w-[min(48rem,calc(100%-2rem))] pt-2.5">
      <Alert
        variant={variant}
        surface="glass"
        controlAlignment="first-line"
        data-variant={variant}
        className="rounded-xl border border-white/10 shadow-lg backdrop-blur-xl py-2.5 px-3.5 text-xs"
      >
        {chatGptUsageLimit ? (
          <OpenAI className="size-4 text-foreground!" aria-hidden="true" />
        ) : (
          <CircleAlertIcon />
        )}
        <AlertDescription className="w-full">
          {chatGptUsageLimit ? (
            <div className="space-y-1">
              <p className="font-medium text-foreground">ChatGPT usage limit reached</p>
              <p className="text-muted-foreground">
                Review your usage settings in ChatGPT to continue.
              </p>
            </div>
          ) : (
            <div className="min-w-0 w-full space-y-1.5">
              {/* Title & Right-Aligned Mandatory Collapse/Uncollapse Button */}
              <div className="flex items-center justify-between gap-3 w-full">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-rose-500/15 border border-rose-500/30 text-rose-500 dark:text-rose-400 shrink-0">
                    {parsed.statusCode ? `HTTP ${parsed.statusCode}` : "Response Error"}
                  </span>
                  {modelDisplayName ? (
                    <span
                      className="text-2xs font-normal text-muted-foreground/80 tracking-wide shrink-0 truncate max-w-[220px]"
                      title={currentModelName || parsed.fullModel || undefined}
                    >
                      {modelDisplayName}
                    </span>
                  ) : null}
                </div>

                {/* Mandatory Collapse / Uncollapse button on the right */}
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setExpanded((prev) => !prev)}
                  className="h-6 px-2 text-2xs text-muted-foreground hover:text-foreground flex items-center gap-1 shrink-0 ml-auto cursor-pointer"
                  aria-expanded={expanded}
                  title={expanded ? "Collapse full error details" : "Uncollapse full error details"}
                >
                  <span>{expanded ? "Collapse" : "Details"}</span>
                  {expanded ? (
                    <ChevronUp className="size-3.5" />
                  ) : (
                    <ChevronDown className="size-3.5" />
                  )}
                </Button>
              </div>

              {/* Subtitle in Gray */}
              <div className="text-xs text-muted-foreground leading-normal">
                {parsed.shortReason
                  ? `${parsed.shortReason}. Please retry or switch to the next favorited model.`
                  : "An error occurred with this model response. Please retry or switch models."}
              </div>

              {/* On collapse: readable summary details without full dump */}
              {!expanded ? (
                <div className="text-2xs font-mono text-muted-foreground/80 line-clamp-2 leading-relaxed bg-muted/20 px-2 py-1 rounded border border-border/20 select-text">
                  {cleanCompactDetails}
                </div>
              ) : null}

              {/* Uncollapsed / Expanded full error panel */}
              {expanded ? (
                <div className="mt-2 text-2xs font-mono text-muted-foreground bg-muted/40 p-2.5 rounded-lg border border-border/50 select-text max-h-48 overflow-y-auto leading-relaxed whitespace-pre-wrap break-all animate-in fade-in duration-150">
                  {error}
                </div>
              ) : null}

              {/* Retry actions & Small Buttons */}
              {onRetryNow ||
              (onSwitchModelNow && nextFallbackModelName) ||
              (autoRetryCountdown !== null && autoRetryCountdown !== undefined) ? (
                <div className="flex flex-wrap items-center gap-2 font-sans pt-1 border-t border-border/30">
                  {autoRetryCountdown !== null && autoRetryCountdown !== undefined ? (
                    <span className="text-xs font-medium text-amber-500 dark:text-amber-400 flex items-center gap-1.5 mr-1">
                      <span className="inline-block size-2 rounded-full bg-amber-500 animate-pulse" />
                      Auto-retrying in {autoRetryCountdown}s
                      {autoRetryAttempt !== undefined && autoRetryMaxRetries !== undefined
                        ? ` (${autoRetryAttempt + 1}/${autoRetryMaxRetries})`
                        : ""}
                      ...
                    </span>
                  ) : null}

                  {onRetryNow ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="default"
                      onClick={onRetryNow}
                      className="h-6 text-xs px-2.5 rounded-md font-medium flex items-center gap-1 shadow-sm"
                    >
                      <RotateCcwIcon className="size-3" />
                      Retry
                    </Button>
                  ) : null}

                  {/* Small Buttons: Next Model (clickable, moves to next favorited model) */}
                  {onSwitchModelNow && nextFallbackModelName ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={onSwitchModelNow}
                      className="h-6 text-2xs px-2 rounded-md border-primary/40 text-primary hover:bg-primary/10 flex items-center gap-1"
                      title={`Switch to favorited model: ${nextFallbackModelName} and retry`}
                    >
                      <SparklesIcon className="size-3" />
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
                      className="h-6 text-2xs px-2 text-muted-foreground hover:text-foreground"
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
