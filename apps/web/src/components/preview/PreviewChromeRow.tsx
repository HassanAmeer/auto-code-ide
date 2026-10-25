import { RefreshIcon } from "~/components/ui/refresh-icon";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  ExternalLink,
  Minus,
  MousePointerClick,
  PictureInPicture2,
  Plus,
  Smartphone,
  Terminal,
} from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import { Button } from "~/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "~/components/ui/input-group";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

interface Props {
  url: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  refreshDisabled: boolean;
  inputDisabled?: boolean | undefined;
  /** Bumping this value re-focuses and selects the URL input. */
  focusUrlNonce?: number | undefined;
  onBack: () => void;
  onForward: () => void;
  onRefresh: () => void;
  onSubmit: (url: string) => void;
  /** When provided, renders an "Open in browser" affordance to the right. */
  onOpenInBrowser?: (() => void) | undefined;
  onCapture?: ((record: boolean) => void) | undefined;
  captureDisabled?: boolean | undefined;
  recording?: boolean | undefined;
  onPictureInPicture?: (() => void) | undefined;
  pictureInPicture?: boolean | undefined;
  pictureInPictureDisabled?: boolean | undefined;
  onToggleLogs?: (() => void) | undefined;
  logsOpen?: boolean | undefined;
  logsErrorCount?: number | undefined;
  /**
   * When provided, renders an annotation-mode toggle button to the right of
   * the URL input. Pressed while annotation mode is active (button shows in `pressed`
   * state). Disabled in `pickDisabled` mode.
   */
  onPickElement?: (() => void) | undefined;
  pickActive?: boolean | undefined;
  pickDisabled?: boolean | undefined;
  /** Optional reason string surfaced in the disabled tooltip. */
  pickDisabledReason?: string | undefined;
  onToggleDeviceToolbar?: (() => void) | undefined;
  deviceToolbarVisible?: boolean | undefined;
  zoomFactor?: number | undefined;
  onZoomIn?: (() => void) | undefined;
  onZoomOut?: (() => void) | undefined;
  onResetZoom?: (() => void) | undefined;
  /**
   * Trailing slot rendered after the URL input. Used by the preview view
   * to mount the three-dot menu (hard reload, devtools, zoom, clear data).
   */
  trailingActions?: ReactNode;
  /**
   * Slot between the nav buttons and the URL input. The preview view uses it
   * to name the tab's browser profile, which is otherwise invisible.
   */
  leadingActions?: ReactNode;
}

const NOOP = () => {};

export function PreviewChromeRow({
  url,
  loading,
  canGoBack,
  canGoForward,
  refreshDisabled,
  inputDisabled,
  focusUrlNonce,
  onBack,
  onForward,
  onRefresh,
  onSubmit,
  onOpenInBrowser,
  onCapture,
  captureDisabled,
  recording,
  onPictureInPicture,
  pictureInPicture,
  pictureInPictureDisabled,
  onToggleLogs,
  logsOpen,
  logsErrorCount = 0,
  onPickElement,
  pickActive,
  pickDisabled,
  pickDisabledReason,
  onToggleDeviceToolbar,
  deviceToolbarVisible,
  zoomFactor,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  trailingActions,
  leadingActions,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState(url);
  const [inputFocused, setInputFocused] = useState(false);

  useEffect(() => {
    if (focusUrlNonce == null) return;
    const node = inputRef.current;
    if (!node) return;
    node.focus();
  }, [focusUrlNonce]);

  const submit = (event?: FormEvent | KeyboardEvent) => {
    event?.preventDefault();
    const next = draft.trim();
    if (next.length === 0) return;
    onSubmit(next);
    inputRef.current?.blur();
  };

  return (
    <div className="relative">
      <form
        onSubmit={submit}
        className="flex h-10 min-h-10 shrink-0 items-center gap-1 border-b border-border/60 bg-background px-2 in-data-[preview-panel-mode=inline]:mb-3 in-data-[preview-panel-mode=inline]:h-7 in-data-[preview-panel-mode=inline]:min-h-7 in-data-[preview-panel-mode=inline]:border-b-transparent"
        data-surface-subheader
      >
        <div className="flex items-center gap-0.5" role="group" aria-label="Navigation">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={canGoBack ? onBack : NOOP}
                  disabled={!canGoBack}
                  aria-label="Back"
                  type="button"
                />
              }
            >
              <ArrowLeft />
            </TooltipTrigger>
            <TooltipPopup>Back</TooltipPopup>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={canGoForward ? onForward : NOOP}
                  disabled={!canGoForward}
                  aria-label="Forward"
                  type="button"
                />
              }
            >
              <ArrowRight />
            </TooltipTrigger>
            <TooltipPopup>Forward</TooltipPopup>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={refreshDisabled ? NOOP : onRefresh}
                  disabled={refreshDisabled}
                  aria-label={loading ? "Stop" : "Refresh"}
                  type="button"
                />
              }
            >
              <RefreshIcon refreshing={loading} />
            </TooltipTrigger>
            <TooltipPopup>{loading ? "Loading…" : "Refresh"}</TooltipPopup>
          </Tooltip>
        </div>

        {leadingActions}

        <InputGroup variant="ghost" className="group/address h-7 flex-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <InputGroupInput
                  ref={inputRef}
                  value={inputFocused ? draft : url}
                  onChange={(event) => setDraft(event.target.value)}
                  onFocus={() => {
                    setDraft(url);
                    setInputFocused(true);
                    queueMicrotask(() => inputRef.current?.select());
                  }}
                  onBlur={() => {
                    setInputFocused(false);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") submit(event);
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setDraft(url);
                      inputRef.current?.blur();
                    }
                  }}
                  placeholder="Search or enter URL"
                  spellCheck={false}
                  disabled={inputDisabled}
                  data-preview-url-input
                  size="sm"
                />
              }
            />
          </Tooltip>
          {onOpenInBrowser && !inputFocused ? (
            <InputGroupAddon align="inline-end">
              {/* Revealed on hover so a resting address bar reads as plain text. */}
              <span className="pointer-events-none flex opacity-0 transition-opacity focus-within:pointer-events-auto focus-within:opacity-100 group-hover/address:pointer-events-auto group-hover/address:opacity-100">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={onOpenInBrowser}
                        aria-label="Open in system browser"
                        type="button"
                      />
                    }
                  >
                    <ExternalLink />
                  </TooltipTrigger>
                  <TooltipPopup>Open in system browser</TooltipPopup>
                </Tooltip>
              </span>
            </InputGroupAddon>
          ) : null}
        </InputGroup>

        {onPickElement ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant={pickActive ? "secondary" : "ghost"}
                  size="icon-xs"
                  onClick={onPickElement}
                  disabled={pickDisabled}
                  aria-label={pickActive ? "Cancel annotation" : "Annotate preview"}
                  aria-pressed={pickActive ? "true" : "false"}
                  type="button"
                  className="hidden md:inline-flex"
                />
              }
            >
              <MousePointerClick className={cn(pickActive && "text-primary")} />
            </TooltipTrigger>
            <TooltipPopup>
              {pickDisabled && pickDisabledReason
                ? pickDisabledReason
                : pickActive
                  ? "Cancel annotation (Esc)"
                  : "Annotate elements, regions, and drawings"}
            </TooltipPopup>
          </Tooltip>
        ) : null}
        {onCapture ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant={recording ? "secondary" : "ghost"}
                  size="icon-xs"
                  onClick={(event) => onCapture(event.shiftKey)}
                  aria-label={recording ? "Stop recording" : "Capture screenshot"}
                  type="button"
                  className="relative hidden md:inline-flex"
                  disabled={captureDisabled}
                />
              }
            >
              <Camera className={cn(recording && "text-destructive")} />
              {recording ? (
                <span className="absolute right-0.5 top-0.5 size-1.5 animate-status-pulse rounded-full bg-destructive" />
              ) : null}
            </TooltipTrigger>
            <TooltipPopup>
              {recording ? "Stop recording" : "Screenshot · Shift-click to record"}
            </TooltipPopup>
          </Tooltip>
        ) : null}
        {onPictureInPicture ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant={pictureInPicture ? "secondary" : "ghost"}
                  size="icon-xs"
                  onClick={onPictureInPicture}
                  aria-label={
                    pictureInPicture ? "Close floating preview" : "Float preview over chat"
                  }
                  aria-pressed={pictureInPicture ? "true" : "false"}
                  type="button"
                  disabled={pictureInPictureDisabled}
                  className="hidden md:inline-flex"
                />
              }
            >
              <PictureInPicture2 className={cn(pictureInPicture && "text-primary")} />
            </TooltipTrigger>
            <TooltipPopup>
              {pictureInPicture ? "Close floating preview" : "Float preview over chat"}
            </TooltipPopup>
          </Tooltip>
        ) : null}
        {onToggleLogs ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant={logsOpen ? "secondary" : "ghost"}
                  size="icon-xs"
                  onClick={onToggleLogs}
                  aria-label={logsOpen ? "Close browser logs" : "Open browser logs"}
                  aria-pressed={logsOpen ? "true" : "false"}
                  type="button"
                  className="relative hidden md:inline-flex"
                />
              }
            >
              <Terminal className={cn("size-3.5", logsOpen && "text-primary")} />
              {logsErrorCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-destructive px-0.5 text-[8px] font-bold leading-none text-destructive-foreground">
                  {logsErrorCount > 99 ? "99+" : logsErrorCount}
                </span>
              ) : null}
            </TooltipTrigger>
            <TooltipPopup>
              {logsOpen ? "Close browser logs" : "Browser logs & network"}
              {logsErrorCount > 0
                ? ` (${logsErrorCount} error${logsErrorCount === 1 ? "" : "s"})`
                : ""}
            </TooltipPopup>
          </Tooltip>
        ) : null}
        {onToggleDeviceToolbar ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant={deviceToolbarVisible ? "secondary" : "ghost"}
                  size="icon-xs"
                  onClick={onToggleDeviceToolbar}
                  aria-label={
                    deviceToolbarVisible ? "Hide responsive toolbar" : "Show responsive toolbar"
                  }
                  aria-pressed={deviceToolbarVisible ? "true" : "false"}
                  type="button"
                  className="hidden md:inline-flex"
                />
              }
            >
              <Smartphone className={cn("size-3.5", deviceToolbarVisible && "text-primary")} />
            </TooltipTrigger>
            <TooltipPopup>
              {deviceToolbarVisible ? "Hide responsive toolbar" : "Responsive device toolbar"}
            </TooltipPopup>
          </Tooltip>
        ) : null}
        {onZoomIn && onZoomOut ? (
          <div className="hidden md:flex items-center gap-0.5 rounded-md border border-border/50 bg-muted/40 px-1 py-0.5">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={onZoomOut}
                    aria-label="Zoom out"
                    type="button"
                    className="size-5 h-5 w-5 p-0"
                  />
                }
              >
                <Minus className="size-3" />
              </TooltipTrigger>
              <TooltipPopup>Zoom out</TooltipPopup>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={onResetZoom}
                    className="min-w-7 px-0.5 text-center text-[10px] font-semibold tabular-nums text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {Math.round((zoomFactor ?? 1) * 100)}%
                  </button>
                }
              />
              <TooltipPopup>Reset zoom to 100%</TooltipPopup>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={onZoomIn}
                    aria-label="Zoom in"
                    type="button"
                    className="size-5 h-5 w-5 p-0"
                  />
                }
              >
                <Plus className="size-3" />
              </TooltipTrigger>
              <TooltipPopup>Zoom in</TooltipPopup>
            </Tooltip>
          </div>
        ) : null}
        {trailingActions}
      </form>
      <div
        aria-hidden
        data-loading={loading}
        className="preview-loading-progress pointer-events-none absolute bottom-0 left-0 z-10 h-0.5 w-full origin-left rounded-r-full bg-primary"
        style={{ boxShadow: "0 0 6px 1px var(--color-ring)" }}
      />
    </div>
  );
}
