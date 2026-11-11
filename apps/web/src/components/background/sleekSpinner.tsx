import { cn } from "../../lib/utils";

/**
 * Sleek circular spinner ring matching the exact screenshot layout.
 * Arc spans ~270 degrees with a smooth gap on the top-right and spins clockwise.
 */
export function SleekSpinnerRing({ className }: { className?: string }) {
  return (
    <svg
      className={cn("size-3.5 shrink-0 animate-spin text-muted-foreground", className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}
