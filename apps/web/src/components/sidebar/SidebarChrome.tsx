import {
  ArchiveIcon,
  ArrowLeftIcon,
  ChartNoAxesColumnIcon,
  CheckSquareIcon,
  SettingsIcon,
  TerminalSquareIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { memo, useCallback } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useNotes, useNotesSheetState } from "../../lib/notesStore";

import { useEnvironmentIdentificationMode } from "../../hooks/useSettings";
import { cn } from "../../lib/utils";
import { usePullRequestsSupported } from "../../state/environments";
import { T3Wordmark } from "../T3Wordmark";
import { AutoCodeIcon } from "../AutoCodeIcon";
import {
  resolveEnvironmentIdentificationPillLabel,
  resolveSidebarStageBackdropVariant,
  SidebarStageBackdrop,
  useEnvironmentStageLabel,
} from "../SidebarStageBackdrop";
import { Badge } from "../ui/badge";
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { readPullRequestListPreferences } from "../pullRequest/pullRequestListPreferences";
import { isSidebarUtilityPage, useNavigateToMainApp } from "./mainAppLocation";
import { SidebarThreadUndoNotice } from "./SidebarThreadUndoNotice";
import { SidebarProviderUpdatePill } from "./SidebarProviderUpdatePill";
import { SidebarUpdateArchitectureWarning, SidebarUpdatePill } from "./SidebarUpdatePill";
import { PullRequestGlyph } from "~/components/pullRequest/pullRequestIcons";
import { useTerminalStore, terminalStore } from "../chat/terminal";

export const SidebarChromeHeader = memo(function SidebarChromeHeader({
  isElectron,
}: {
  isElectron: boolean;
}) {
  const stageLabel = useEnvironmentStageLabel();
  const environmentIdentificationMode = useEnvironmentIdentificationMode();
  const backdropVariant = resolveSidebarStageBackdropVariant(
    stageLabel,
    environmentIdentificationMode === "artwork",
  );
  const pillLabel =
    environmentIdentificationMode === "pill"
      ? resolveEnvironmentIdentificationPillLabel(stageLabel)
      : null;

  return (
    // The titlebar row, not a padded SidebarHeader: it aligns to the window controls.
    <div
      className={cn(
        "relative flex h-[var(--workspace-topbar-height)] shrink-0 flex-row items-center gap-2 px-3 md:pl-0",
        isElectron && "drag-region",
      )}
    >
      {backdropVariant ? <SidebarStageBackdrop variant={backdropVariant} /> : null}
      <SidebarTrigger
        // Over the stage artwork: the media viewer's control-on-imagery treatment.
        variant={backdropVariant ? "media-navigation" : "ghost"}
        className="relative top-auto z-10 translate-y-0 md:hidden"
      />
      {/* One visible line: the pill wraps onto the clipped second line once it no longer fits.
          The padding keeps the brand's focus ring inside the clip. */}
      <div className="relative z-10 flex h-8 min-w-0 flex-1 flex-wrap content-start items-center gap-x-2 overflow-hidden py-0.5">
        <SidebarBrand onBackdrop={backdropVariant !== null} />
        {pillLabel ? (
          <div className="ml-1 flex h-7 items-center">
            <Badge data-environment-identification="pill" size="sm" variant="secondary">
              {pillLabel}
            </Badge>
          </div>
        ) : null}
      </div>
    </div>
  );
});

// Measures the brand at its titlebar inset, plus the header's right padding and the
// sidebar border, so the sidebar minimum follows font size, zoom and macOS window controls.
export function SidebarBrandWidthProbe({
  onWidthChange,
}: {
  onWidthChange: (width: number) => void;
}) {
  const observeWidth = useCallback(
    (probe: HTMLDivElement) => {
      const observer = new ResizeObserver(([entry]) => {
        if (entry) onWidthChange(entry.borderBoxSize[0]?.inlineSize ?? probe.offsetWidth);
      });
      observer.observe(probe);
      return () => observer.disconnect();
    },
    [onWidthChange],
  );

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none invisible fixed top-0 left-0 flex w-max border-r border-transparent pr-3"
      ref={observeWidth}
    >
      <div className="ml-[var(--workspace-titlebar-content-left)] flex">
        <SidebarBrandMark onBackdrop={false} />
      </div>
    </div>
  );
}

function SidebarBrand({ onBackdrop }: { onBackdrop: boolean }) {
  return (
    <Link
      aria-label="Go to threads"
      className={cn(
        "relative z-10 ml-[var(--workspace-titlebar-content-left)] hidden h-7 w-fit min-w-0 shrink-0 items-center overflow-hidden rounded-md outline-hidden ring-ring focus-visible:ring-2 md:flex",
        onBackdrop ? "text-white" : "text-foreground",
      )}
      to="/"
    >
      <SidebarBrandMark onBackdrop={onBackdrop} />
    </Link>
  );
}

function SidebarBrandMark({ onBackdrop }: { onBackdrop: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-sm font-semibold tracking-tight">
      <AutoCodeIcon aria-label="AutoCode" className="h-4 w-4 shrink-0 text-foreground" />
      <span className="inline-flex items-baseline font-bold tracking-tight">
        <span className={onBackdrop ? "text-white" : "text-foreground"}>Auto</span>
        <span
          className={cn(
            "truncate [text-box:trim-both_cap_alphabetic]",
            onBackdrop ? "text-white/80" : "text-muted-foreground",
          )}
        >
          Code
        </span>
      </span>
    </span>
  );
}

function SidebarUtilityItem({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <SidebarMenuItem className="shrink-0">
      <Tooltip>
        <TooltipTrigger
          render={
            <SidebarMenuButton aria-label={label} onClick={onClick} size="icon">
              {icon}
            </SidebarMenuButton>
          }
        />
        <TooltipPopup side="top">{label}</TooltipPopup>
      </Tooltip>
    </SidebarMenuItem>
  );
}

export const SidebarUtilityMenu = memo(function SidebarUtilityMenu() {
  const navigate = useNavigate();
  const navigateToMainApp = useNavigateToMainApp();
  const { isMobile, setOpenMobile } = useSidebar();
  const isOnUtilityPage = useLocation({
    select: (location) => isSidebarUtilityPage(location.pathname),
  });
  const pullRequestsSupported = usePullRequestsSupported();
  const closeMobileSidebar = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [isMobile, setOpenMobile]);
  const handlePullRequestsClick = useCallback(() => {
    closeMobileSidebar();
    void navigate({
      to: "/pull-requests",
      search: readPullRequestListPreferences(),
    });
  }, [closeMobileSidebar, navigate]);
  const handleSettingsClick = useCallback(() => {
    closeMobileSidebar();
    void navigate({ to: "/settings" });
  }, [closeMobileSidebar, navigate]);

  const handleUsageClick = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
    void navigate({ to: "/usage" });
  }, [isMobile, navigate, setOpenMobile]);

  const handleBackClick = useCallback(() => {
    closeMobileSidebar();
    void navigateToMainApp();
  }, [closeMobileSidebar, navigateToMainApp]);

  return (
    <SidebarMenu className="flex-row items-center">
      {isOnUtilityPage ? (
        <SidebarMenuItem className="min-w-0 flex-1">
          <SidebarMenuButton onClick={handleBackClick}>
            <ArrowLeftIcon />
            <span>Back</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ) : (
        <>
          <SidebarUtilityItem
            icon={<SettingsIcon />}
            label="Settings"
            onClick={handleSettingsClick}
          />
          {pullRequestsSupported ? (
            <SidebarUtilityItem
              icon={<PullRequestGlyph.pullRequest />}
              label="Pull Requests"
              onClick={handlePullRequestsClick}
            />
          ) : null}
          <SidebarUtilityItem
            icon={<ChartNoAxesColumnIcon />}
            label="Usage"
            onClick={handleUsageClick}
          />
        </>
      )}
      <SidebarUpdatePill />
    </SidebarMenu>
  );
});

export const SidebarAiTerminalItem = memo(function SidebarAiTerminalItem() {
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const terminalState = useTerminalStore();
  const isTerminalOpen = terminalState.isQuickBarOpen;

  const handleClick = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
    if (
      typeof window !== "undefined" &&
      (window.location.pathname.startsWith("/settings") ||
        window.location.pathname === "/usage" ||
        window.location.pathname === "/pull-requests")
    ) {
      void navigate({ to: "/" });
    }
    terminalStore.setQuickBarOpen(!isTerminalOpen);
  }, [isMobile, navigate, setOpenMobile, isTerminalOpen]);

  return (
    <SidebarMenu className="mb-1">
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={isTerminalOpen}
          onClick={handleClick}
          size="default"
          className={cn(
            "w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-all group font-medium cursor-pointer",
            isTerminalOpen
              ? "bg-primary/15 text-primary border border-primary/30 shadow-sm"
              : "text-sidebar-foreground/80 hover:bg-sidebar-row-hover hover:text-sidebar-foreground border border-transparent",
          )}
        >
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "size-5 rounded-md flex items-center justify-center transition-transform group-hover:scale-105",
                isTerminalOpen
                  ? "bg-primary/20 text-primary"
                  : "bg-emerald-500/10 border border-emerald-500/25 text-emerald-400",
              )}
            >
              <TerminalSquareIcon className="size-3.5" />
            </div>
            <span className="font-semibold tracking-tight">AI Terminal</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "size-1.5 rounded-full",
                isTerminalOpen ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground/35",
              )}
            />
            <span className="text-3xs font-mono px-1.5 py-0.5 rounded-full bg-sidebar-muted/30 text-sidebar-muted-foreground border border-border/30 group-hover:border-emerald-500/30 group-hover:text-emerald-400 transition-colors">
              {isTerminalOpen ? "Active" : "Shell"}
            </span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
});

export const SidebarArchiveItem = memo(function SidebarArchiveItem() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const isArchiveOpen = location.pathname === "/settings/archived";

  const handleClick = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
    if (isArchiveOpen) {
      void navigate({ to: "/" });
    } else {
      void navigate({ to: "/settings/archived" });
    }
  }, [isMobile, setOpenMobile, isArchiveOpen, navigate]);

  return (
    <SidebarMenu className="mb-1">
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={isArchiveOpen}
          onClick={handleClick}
          size="default"
          className={cn(
            "w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-all group font-medium cursor-pointer",
            isArchiveOpen
              ? "bg-primary/15 text-primary border border-primary/30 shadow-sm"
              : "text-sidebar-foreground/80 hover:bg-sidebar-row-hover hover:text-sidebar-foreground border border-transparent",
          )}
        >
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "size-5 rounded-md flex items-center justify-center transition-transform group-hover:scale-105",
                isArchiveOpen
                  ? "bg-primary/20 text-primary"
                  : "bg-sky-500/10 border border-sky-500/25 text-sky-400",
              )}
            >
              <ArchiveIcon className="size-3.5" />
            </div>
            <span className="font-semibold tracking-tight">Archive</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-3xs font-mono px-1.5 py-0.5 rounded-full bg-sidebar-muted/30 text-sidebar-muted-foreground border border-border/30 group-hover:border-sky-500/30 group-hover:text-sky-400 transition-colors">
              Threads
            </span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
});

export const SidebarNotesItem = memo(function SidebarNotesItem() {
  const { activeCount, notes } = useNotes();
  const [isOpen, setIsOpen] = useNotesSheetState();
  const { isMobile, setOpenMobile } = useSidebar();

  const handleClick = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
    setIsOpen(!isOpen);
  }, [isMobile, setOpenMobile, isOpen, setIsOpen]);

  return (
    <SidebarMenu className="mb-1">
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={isOpen}
          onClick={handleClick}
          size="default"
          className={cn(
            "w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-all group font-medium cursor-pointer",
            isOpen
              ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-sm"
              : "text-sidebar-foreground/80 hover:bg-sidebar-row-hover hover:text-sidebar-foreground border border-transparent",
          )}
        >
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "size-5 rounded-md flex items-center justify-center transition-transform group-hover:scale-105",
                isOpen
                  ? "bg-amber-500/20 text-amber-300"
                  : "bg-amber-500/10 border border-amber-500/25 text-amber-400",
              )}
            >
              <CheckSquareIcon className="size-3.5" />
            </div>
            <span className="font-semibold tracking-tight">Notes & Reminders</span>
          </div>
          <div className="flex items-center gap-1.5">
            {activeCount > 0 ? (
              <span className="text-3xs font-mono font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                {activeCount} active
              </span>
            ) : notes.length > 0 ? (
              <span className="text-3xs font-mono px-1.5 py-0.5 rounded-full bg-sidebar-muted/30 text-sidebar-muted-foreground border border-border/30">
                {notes.length}
              </span>
            ) : (
              <span className="text-3xs text-sidebar-muted-foreground">0</span>
            )}
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
});

export const SidebarChromeFooter = memo(function SidebarChromeFooter() {
  return (
    <SidebarFooter>
      <SidebarThreadUndoNotice />
      <SidebarProviderUpdatePill />
      <SidebarUpdateArchitectureWarning />
      <SidebarAiTerminalItem />
      <SidebarArchiveItem />
      <SidebarNotesItem />
      <SidebarUtilityMenu />
    </SidebarFooter>
  );
});
