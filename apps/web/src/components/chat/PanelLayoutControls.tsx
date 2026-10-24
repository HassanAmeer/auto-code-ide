import {
  DownloadIcon,
  GitForkIcon,
  PanelBottomIcon,
  PanelRightIcon,
  SquareMenuIcon,
} from "lucide-react";
import { Maximize2, Minimize2 } from "lucide";
import { MorphIcon } from "~/components/MorphIcon";
import { memo, type ReactElement } from "react";

import type { ThreadPanelPresentation } from "../../rightPanelLayout";
import { PopoverCreateHandle, PopoverTrigger } from "../ui/popover";
import { Toggle } from "../ui/toggle";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";

export interface PanelLayoutControlsProps {
  showThreadPanelControl?: boolean;
  showTerminalControl?: boolean;
  showRightPanelControl?: boolean;
  terminalAvailable: boolean;
  terminalOpen: boolean;
  terminalShortcutLabel: string | null;
  threadPanelOpen: boolean;
  threadPanelPresentation: ThreadPanelPresentation;
  threadPanelPopoverHandle?: ReturnType<typeof PopoverCreateHandle>;
  threadPanelShortcutLabel: string | null;
  rightPanelAvailable: boolean;
  rightPanelOpen: boolean;
  rightPanelShortcutLabel: string | null;
  rightPanelUnavailableLabel?: string;
  onToggleTerminal: () => void;
  onToggleThreadPanel: () => void;
  onToggleRightPanel: () => void;
  // Session fork & export
  isServerThread?: boolean;
  onForkCurrentThread?: (() => void) | undefined;
  onExportCurrentThread?: ((format: "json" | "markdown") => void) | undefined;
}

export const PanelLayoutControls = memo(function PanelLayoutControls({
  showThreadPanelControl = true,
  showTerminalControl = true,
  showRightPanelControl = true,
  terminalAvailable,
  terminalOpen,
  terminalShortcutLabel,
  threadPanelOpen,
  threadPanelPresentation,
  threadPanelPopoverHandle,
  threadPanelShortcutLabel,
  rightPanelAvailable,
  rightPanelOpen,
  rightPanelShortcutLabel,
  rightPanelUnavailableLabel = "Right panel is unavailable",
  onToggleTerminal,
  onToggleThreadPanel,
  onToggleRightPanel,
  isServerThread = false,
  onForkCurrentThread,
  onExportCurrentThread,
}: PanelLayoutControlsProps) {
  const threadPanelToggle = (
    <Toggle
      className="relative shrink-0 [-webkit-app-region:no-drag] h-7 w-7 min-w-7 p-0 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 data-pressed:bg-accent data-pressed:text-accent-foreground"
      pressed={threadPanelOpen}
      aria-label="Toggle thread details panel"
      variant="ghost"
      size="compact"
    >
      <SquareMenuIcon className="size-3.5 shrink-0" />
    </Toggle>
  );
  const threadPanelTooltip = (trigger: ReactElement) => (
    <Tooltip>
      <TooltipTrigger
        render={trigger}
        {...(threadPanelPresentation === "popover" ? {} : { onClick: onToggleThreadPanel })}
      />
      <TooltipPopup side="bottom">
        Toggle thread details
        {threadPanelShortcutLabel ? ` (${threadPanelShortcutLabel})` : ""}
      </TooltipPopup>
    </Tooltip>
  );

  return (
    <div
      className="flex h-full shrink-0 items-center gap-1 [-webkit-app-region:no-drag]"
      data-panel-layout-controls
    >
      {/* Fork Session Button */}
      {isServerThread && onForkCurrentThread && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="compact"
                onClick={onForkCurrentThread}
                className="h-7 w-7 min-w-7 sm:w-auto p-0 sm:px-2 gap-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer rounded-md shrink-0 flex items-center justify-center"
                aria-label="Fork session into a new branch"
              >
                <GitForkIcon className="size-3.5 text-primary shrink-0" />
                <span className="hidden sm:inline">Fork</span>
              </Button>
            }
          />
          <TooltipPopup side="bottom">Fork session (Shakha) into a new branch</TooltipPopup>
        </Tooltip>
      )}

      {/* Export Session Menu Button */}
      {isServerThread && onExportCurrentThread && (
        <Menu>
          <Tooltip>
            <TooltipTrigger
              render={
                <MenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="compact"
                      className="h-7 w-7 min-w-7 sm:w-auto p-0 sm:px-2 gap-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer rounded-md shrink-0 flex items-center justify-center"
                      aria-label="Export chat session"
                    >
                      <DownloadIcon className="size-3.5 shrink-0" />
                      <span className="hidden sm:inline">Export</span>
                    </Button>
                  }
                />
              }
            />
            <TooltipPopup side="bottom">Export session (JSON / Markdown)</TooltipPopup>
          </Tooltip>
          <MenuPopup side="bottom" align="end" className="w-48">
            <MenuItem onClick={() => onExportCurrentThread("json")}>
              Export as JSON (.json)
            </MenuItem>
            <MenuItem onClick={() => onExportCurrentThread("markdown")}>
              Export as Markdown (.md)
            </MenuItem>
          </MenuPopup>
        </Menu>
      )}

      {/* Thread details toggle */}
      {showThreadPanelControl
        ? threadPanelPresentation === "popover"
          ? threadPanelTooltip(
              <PopoverTrigger handle={threadPanelPopoverHandle} render={threadPanelToggle} />,
            )
          : threadPanelTooltip(threadPanelToggle)
        : null}

      {/* Terminal drawer toggle */}
      {showTerminalControl ? (
        <Tooltip>
          <TooltipTrigger render={<span className="flex shrink-0" />}>
            <Toggle
              className="shrink-0 [-webkit-app-region:no-drag] h-7 w-7 min-w-7 p-0 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 data-pressed:bg-accent data-pressed:text-accent-foreground"
              pressed={terminalOpen}
              onPressedChange={onToggleTerminal}
              aria-label="Toggle terminal drawer"
              variant="ghost"
              size="compact"
              disabled={!terminalAvailable}
            >
              <PanelBottomIcon className="size-3.5 shrink-0" />
            </Toggle>
          </TooltipTrigger>
          <TooltipPopup side="bottom">
            {terminalAvailable
              ? `Toggle terminal drawer${terminalShortcutLabel ? ` (${terminalShortcutLabel})` : ""}`
              : "Terminal drawer is unavailable"}
          </TooltipPopup>
        </Tooltip>
      ) : null}

      {/* Right panel toggle */}
      {showRightPanelControl ? (
        <Tooltip>
          <TooltipTrigger render={<span className="flex shrink-0" />}>
            <Toggle
              className="shrink-0 [-webkit-app-region:no-drag] h-7 w-7 min-w-7 p-0 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 data-pressed:bg-accent data-pressed:text-accent-foreground"
              pressed={rightPanelOpen}
              onPressedChange={onToggleRightPanel}
              aria-label="Toggle right panel"
              variant="ghost"
              size="compact"
              disabled={!rightPanelAvailable}
            >
              <PanelRightIcon className="size-3.5 shrink-0" />
            </Toggle>
          </TooltipTrigger>
          <TooltipPopup side="bottom">
            {rightPanelAvailable
              ? `Toggle right panel${rightPanelShortcutLabel ? ` (${rightPanelShortcutLabel})` : ""}`
              : rightPanelUnavailableLabel}
          </TooltipPopup>
        </Tooltip>
      ) : null}
    </div>
  );
});

export const RightPanelMaximizeControl = memo(function RightPanelMaximizeControl({
  maximized,
  onToggle,
}: {
  maximized: boolean;
  onToggle: () => void;
}) {
  const label = maximized ? "Restore panel size" : "Maximize panel";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Toggle
            className="shrink-0 [-webkit-app-region:no-drag] h-7 w-7 min-w-7 p-0 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 data-pressed:bg-accent data-pressed:text-accent-foreground"
            pressed={maximized}
            onPressedChange={onToggle}
            aria-label={label}
            variant="ghost"
            size="compact"
          >
            <MorphIcon className="size-3.5 shrink-0" icon={maximized ? Minimize2 : Maximize2} />
          </Toggle>
        }
      />
      <TooltipPopup side="bottom">{label}</TooltipPopup>
    </Tooltip>
  );
});
