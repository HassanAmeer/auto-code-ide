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
  // Completely disabled as requested by the user - no floating error popup banner
  return null;
});
