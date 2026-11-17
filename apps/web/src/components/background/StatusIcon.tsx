import { AlertCircle, CheckCircle2, Clock3, Square, X } from "lucide-react";

import { cn } from "../../lib/utils";
import { SleekSpinnerRing } from "./sleekSpinner";

/**
 * Single source of truth for status icons across Goals, Subagents and Watchdog.
 * One icon, no text label — the status is conveyed by shape/colour and a
 * native tooltip (title) on the row's action buttons.
 */

export function CancelledCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "size-3.5 shrink-0 text-muted-foreground"}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </svg>
  );
}

export type StatusKind = "running" | "completed" | "failed" | "cancelled" | "pending";

/** Maps every status string used by goals/workers/watchdogs onto one of five kinds. */
export function normalizeStatus(status?: string | undefined): StatusKind {
  const value = (status ?? "").toLowerCase();
  if (["completed", "done", "verified", "success"].includes(value)) return "completed";
  if (["failed", "error"].includes(value)) return "failed";
  if (["cancelled", "canceled", "stopped", "aborted"].includes(value)) return "cancelled";
  if (["pending", "queued", "waiting"].includes(value)) return "pending";
  // running, watching, reviewing, building, testing and unknown values all spin.
  return "running";
}

export function StatusIcon({
  status,
  className,
  small = false,
}: {
  status?: string | undefined;
  className?: string | undefined;
  small?: boolean | undefined;
}) {
  const size = small ? "size-3" : "size-3.5";
  switch (normalizeStatus(status)) {
    case "completed":
      return <CheckCircle2 className={cn(size, "shrink-0 text-muted-foreground", className)} />;
    case "failed":
      return <AlertCircle className={cn(size, "shrink-0 text-rose-400", className)} />;
    case "cancelled":
      return <CancelledCircleIcon className={cn(size, "shrink-0 text-muted-foreground", className)} />;
    case "pending":
      return <Clock3 className={cn(size, "shrink-0 text-muted-foreground", className)} />;
    default:
      return (
        <SleekSpinnerRing className={cn(size, "shrink-0 text-cyan-400 animate-spin", className)} />
      );
  }
}

/** Icon-only stop control. No text label — hover for the native tooltip. */
export function StopIconButton({
  onClick,
  disabled = false,
  busy = false,
  label = "Stop",
  className,
}: {
  onClick: (event: React.MouseEvent) => void;
  disabled?: boolean | undefined;
  busy?: boolean | undefined;
  label?: string | undefined;
  className?: string | undefined;
}) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-busy={busy || undefined}
      className={cn(
        "p-0.5 rounded text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer disabled:opacity-40 shrink-0 flex items-center justify-center",
        className,
      )}
    >
      {busy ? (
        <SleekSpinnerRing className="size-3 text-rose-400 animate-spin" />
      ) : (
        <Square className="size-2.5 fill-current" />
      )}
    </button>
  );
}

/** Icon-only delete control. No text label — hover for the native tooltip. */
export function DeleteIconButton({
  onClick,
  label = "Delete",
  className,
}: {
  onClick: (event: React.MouseEvent) => void;
  label?: string | undefined;
  className?: string | undefined;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "p-0.5 rounded text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer shrink-0 flex items-center justify-center",
        className,
      )}
    >
      <X className="size-3" />
    </button>
  );
}
