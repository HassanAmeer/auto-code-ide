import { useSupportsMultiplePullRequests } from "~/hooks/useSupportsMultiplePullRequests";
import { resolvePrimaryEnvironmentHttpUrl } from "~/environments/primary";
import { resolveThreadCurrentPullRequestLink } from "@t3tools/shared/threadPullRequests";
import { Spinner } from "~/components/ui/spinner";
import {
  ArchiveIcon,
  ArrowUpDownIcon,
  ChevronRightIcon,
  DownloadCloudIcon,
  EraserIcon,
  FileArchiveIcon,
  FolderPlusIcon,
  Globe2Icon,
  MoreVerticalIcon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SearchIcon,
  SquarePenIcon,
  TerminalIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UploadCloudIcon,
} from "lucide-react";
import { downloadProjectZip } from "~/lib/projectZipUtils";
import {
  ChangeRequestStatusIcon,
  prStatusIndicator,
  PrStatusTooltipContent,
  terminalStatusFromRunningIds,
  synchronizeTerminalPulse,
  ThreadStatusLabel,
  ThreadWorktreeIndicator,
  useLinkedThreadPullRequest,
} from "./ThreadStatusIndicators";
import { EnvironmentMachineIcon } from "./EnvironmentMachineIcon";
import { ProjectFavicon } from "./ProjectFavicon";
import { useAtomValue } from "@effect/atom-react";
import { autoAnimate } from "@formkit/auto-animate";
import React, { useCallback, useEffect, memo, useMemo, useRef, useState } from "react";
import { cn } from "~/lib/utils";
import { useShallow } from "zustand/react/shallow";
import {
  DndContext,
  type DragCancelEvent,
  type CollisionDetection,
  PointerSensor,
  type DragStartEvent,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { restrictToFirstScrollableAncestor, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import {
  AuthOrchestrationOperateScope,
  AuthPreviewOperateScope,
  type ContextMenuItem,
  type EnvironmentId,
  ProjectId,
  type ScopedThreadRef,
  type ResolvedKeybindingsConfig,
  type SidebarProjectGroupingMode,
  resolveEnvironmentMachineKind,
  ThreadId,
} from "@t3tools/contracts";
import {
  parseScopedThreadKey,
  scopedProjectKey,
  scopedThreadKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import { safeErrorLogAttributes } from "@t3tools/client-runtime/errors";
import {
  isAtomCommandInterrupted,
  settlePromise,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { threadRuntimeCanArchive } from "@t3tools/client-runtime/state/models";
import { useNavigate, useParams, useRouter } from "@tanstack/react-router";
import {
  MAX_SIDEBAR_THREAD_PREVIEW_COUNT,
  MIN_SIDEBAR_THREAD_PREVIEW_COUNT,
  type SidebarProjectSortOrder,
  type SidebarThreadPreviewCount,
  type SidebarThreadSortOrder,
} from "@t3tools/contracts/settings";
import { isDesktopLocalConnectionTarget, isWslConnectionTarget } from "../connection/desktopLocal";
import { useDesktopLocalBootstraps } from "../connection/useDesktopLocalBootstraps";
import { isElectron } from "../env";
import { useTerminalFocus } from "../hooks/useTerminalFocus";
import { useOpenPrLink } from "../lib/openPullRequestLink";
import { releaseProjectDraftUploads } from "../lib/composerDraftUploads";
import { isTerminalFocused } from "../lib/terminalFocus";
import { isMacPlatform } from "../lib/utils";
import { useSidebarPendingFileDropStore } from "../sidebarPendingFileDropStore";
import { makeWorkspaceFileDropHandlers } from "./chat/workspaceFileDrop";
import {
  readThreadShell,
  useProjects,
  useThreadShells,
  useThreadShellsForProjectRefs,
} from "../state/entities";
import { selectThreadTerminalUiState, useTerminalUiStateStore } from "../terminalUiStateStore";
import { useRightPanelStore } from "../rightPanelStore";
import { DEFAULT_THREAD_TERMINAL_ID } from "~/types";
import { executeTerminalCommand } from "./chat/terminal/terminalClient";
import { useThreadRunningTerminalIds } from "../state/terminalSessions";
import { useThreadDiscoveredPorts } from "../portDiscoveryState";
import { openDiscoveredPort } from "./preview/openDiscoveredPort";
import { useAtomCommand } from "../state/use-atom-command";
import {
  ORCHESTRATION_OPERATE_DENIED_MESSAGE,
  useOrchestrationCommand,
} from "../state/use-orchestration-command";
import { previewEnvironment } from "../state/preview";
import { readEnvironmentScope, useEnvironmentScope } from "../state/session";
import {
  legacyProjectCwdPreferenceKey,
  resolveProjectExpanded,
  useUiStateStore,
} from "../uiStateStore";
import {
  resolveShortcutCommand,
  shortcutLabelForCommand,
  shouldShowThreadJumpHintsForModifiers,
  threadJumpCommandForIndex,
  threadJumpIndexFromCommand,
  threadTraversalDirectionFromCommand,
} from "../keybindings";
import { isModelPickerOpen } from "../modelPickerVisibility";
import { useShortcutModifierState } from "../shortcutModifierState";
import { ensureLocalApi, readLocalApi } from "../localApi";
import { useComposerDraftStore } from "../composerDraftStore";
import { useNewThreadHandler } from "../hooks/useHandleNewThread";
import { useDesktopUpdateState } from "../state/desktopUpdate";

import { useThreadActions } from "../hooks/useThreadActions";
import { projectEnvironment } from "../state/projects";
import { threadEnvironment, useEnvironmentThread } from "../state/threads";
import { useEnvironment, useEnvironments, usePrimaryEnvironmentId } from "../state/environments";
import {
  buildThreadRouteParams,
  resolveActiveThreadRouteRef,
  resolveThreadRouteTarget,
} from "../threadRoutes";
import { stackedThreadToast, toastManager } from "./ui/toast";
import { formatRelativeTimeLabel } from "../timestampFormat";
import { Kbd } from "./ui/kbd";
import {
  getArm64IntelBuildWarningDescription,
  getDesktopUpdateActionError,
  getDesktopUpdateInstallConfirmationMessage,
  isDesktopUpdateButtonDisabled,
  resolveDesktopUpdateButtonAction,
  shouldShowArm64IntelBuildWarning,
  shouldToastDesktopUpdateActionResult,
} from "./desktopUpdate.logic";
import { showDesktopUpdateDownloadedToast } from "./desktopUpdate.toast";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "./ui/alert";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import {
  Menu,
  MenuGroup,
  MenuItem,
  MenuItemLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "./ui/menu";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "./ui/number-field";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "./ui/select";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import {
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "./ui/sidebar";
import {
  getThreadKeysToDeselectAfterDelete,
  useThreadSelectionStore,
} from "../threadSelectionStore";
import { isCommandPaletteOpen, openCommandPalette } from "../commandPaletteBus";
import {
  archiveSelectedThreadEntries,
  buildMultiSelectThreadContextMenuItems,
  deleteSelectedThreadEntries,
  getSidebarThreadIdsToPrewarm,
  resolveAdjacentThreadId,
  isContextMenuPointerDown,
  isSidebarNestedLinkClick,
  isTrailingDoubleClick,
  resolveProjectStatusIndicator,
  resolveThreadRowClassName,
  resolveThreadLastVisitedAt,
  resolveThreadStatusPill,
  orderItemsByPreferredIds,
  shouldClearThreadSelectionOnMouseDown,
  sortProjectsForSidebar,
  useSidebarRowSubscriptionLease,
  useThreadJumpHintVisibility,
  ThreadStatusPill,
} from "./Sidebar.logic";
import { sortThreads } from "../lib/threadSort";
import { SidebarChromeFooter, SidebarChromeHeader } from "./sidebar/SidebarChrome";
import { terminalStore } from "./chat/terminal";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { useIsMobile } from "~/hooks/useMediaQuery";
import { CommandDialogTrigger } from "./ui/command";
import { useClientSettings, useUpdateClientSettings } from "~/hooks/useSettings";
import { primaryServerKeybindingsAtom } from "../state/server";
import {
  derivePhysicalProjectKey,
  deriveProjectGroupingOverrideKey,
  getProjectOrderKey,
  selectProjectGroupingSettings,
} from "../logicalProject";
import type { SidebarThreadSummary } from "../types";
import {
  buildPhysicalToLogicalProjectKeyMap,
  buildSidebarProjectSnapshots,
  type SidebarProjectGroupMember,
  type SidebarProjectSnapshot,
} from "../sidebarProjectGrouping";
import { PullRequestGlyph } from "~/components/pullRequest/pullRequestIcons";
const SIDEBAR_SORT_LABELS: Record<SidebarProjectSortOrder, string> = {
  updated_at: "Last user message",
  created_at: "Created at",
  manual: "Manual",
};
const SIDEBAR_THREAD_SORT_LABELS: Record<SidebarThreadSortOrder, string> = {
  updated_at: "Last user message",
  created_at: "Created at",
};
const SIDEBAR_LIST_ANIMATION_OPTIONS = {
  duration: 180,
  easing: "ease-out",
} as const;
const EMPTY_THREAD_JUMP_LABELS = new Map<string, string>();
const PROJECT_GROUPING_MODE_LABELS: Record<SidebarProjectGroupingMode, string> = {
  repository: "Group by repository",
  repository_path: "Group by repository path",
  separate: "Keep separate",
};
const SIDEBAR_ICON_ACTION_BUTTON_CLASS =
  "inline-flex h-6 min-w-6 cursor-pointer items-center justify-center rounded-md px-0.75 text-icon-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring";

function SidebarThreadDetailPrewarmer({ threadRef }: { readonly threadRef: ScopedThreadRef }) {
  useEnvironmentThread(threadRef.environmentId, threadRef.threadId);
  return null;
}

function clampSidebarThreadPreviewCount(value: number): SidebarThreadPreviewCount {
  return Math.min(
    MAX_SIDEBAR_THREAD_PREVIEW_COUNT,
    Math.max(MIN_SIDEBAR_THREAD_PREVIEW_COUNT, value),
  ) as SidebarThreadPreviewCount;
}

function formatProjectMemberActionLabel(
  member: SidebarProjectGroupMember,
  groupedProjectCount: number,
): string {
  if (groupedProjectCount <= 1) {
    return member.title;
  }

  return member.environmentLabel
    ? `${member.environmentLabel} — ${member.workspaceRoot}`
    : member.workspaceRoot;
}

function projectExpansionPreferenceKeys(project: SidebarProjectSnapshot): string[] {
  return [
    project.projectKey,
    ...project.memberProjects.map((member) => member.physicalProjectKey),
    ...project.memberProjects.map((member) => legacyProjectCwdPreferenceKey(member.workspaceRoot)),
  ];
}

function projectGroupingModeDescription(mode: SidebarProjectGroupingMode): string {
  switch (mode) {
    case "repository":
      return "Projects from the same repository share one sidebar row.";
    case "repository_path":
      return "Projects group only when both the repository and repo-relative path match.";
    case "separate":
      return "Every project path gets its own sidebar row.";
  }
}

function buildThreadJumpLabelMap(input: {
  keybindings: ResolvedKeybindingsConfig;
  platform: string;
  terminalOpen: boolean;
  threadJumpCommandByKey: ReadonlyMap<
    string,
    NonNullable<ReturnType<typeof threadJumpCommandForIndex>>
  >;
}): ReadonlyMap<string, string> {
  if (input.threadJumpCommandByKey.size === 0) {
    return EMPTY_THREAD_JUMP_LABELS;
  }

  const shortcutLabelOptions = {
    platform: input.platform,
    context: {
      terminalFocus: false,
      terminalOpen: input.terminalOpen,
    },
  } as const;
  const mapping = new Map<string, string>();
  for (const [threadKey, command] of input.threadJumpCommandByKey) {
    const label = shortcutLabelForCommand(input.keybindings, command, shortcutLabelOptions);
    if (label) {
      mapping.set(threadKey, label);
    }
  }
  return mapping.size > 0 ? mapping : EMPTY_THREAD_JUMP_LABELS;
}

interface SidebarThreadRowProps {
  thread: SidebarThreadSummary;
  orderedProjectThreadKeys: readonly string[];
  isActive: boolean;
  openPullRequestsInRightPanel: boolean;
  jumpLabel: string | null;
  appSettingsConfirmThreadArchive: boolean;
  renamingThreadKey: string | null;
  renamingTitle: string;
  setRenamingTitle: (title: string) => void;
  startThreadRename: (threadKey: string, title: string) => void;
  renamingInputRef: React.RefObject<HTMLInputElement | null>;
  renamingCommittedRef: React.RefObject<boolean>;
  confirmingArchiveThreadKey: string | null;
  setConfirmingArchiveThreadKey: React.Dispatch<React.SetStateAction<string | null>>;
  confirmArchiveButtonRefs: React.RefObject<Map<string, HTMLButtonElement>>;
  handleThreadClick: (
    event: React.MouseEvent,
    threadRef: ScopedThreadRef,
    orderedProjectThreadKeys: readonly string[],
  ) => void;
  navigateToThread: (threadRef: ScopedThreadRef) => Promise<void>;
  handleMultiSelectContextMenu: (position: { x: number; y: number }) => Promise<void>;
  handleThreadContextMenu: (
    threadRef: ScopedThreadRef,
    position: { x: number; y: number },
  ) => Promise<void>;
  clearSelection: () => void;
  commitRename: (
    threadRef: ScopedThreadRef,
    newTitle: string,
    originalTitle: string,
  ) => Promise<void>;
  cancelRename: () => void;
  attemptArchiveThread: (threadRef: ScopedThreadRef) => Promise<void>;
  openPrLink: (
    event: React.MouseEvent<HTMLElement>,
    prUrl: string,
    threadRef?: ScopedThreadRef,
  ) => boolean;
  onFileDropThreads: (threadRef: ScopedThreadRef, files: File[]) => void;
}

function checkTaskPermission(_environmentId: EnvironmentId): boolean {
  return true;
}

const SidebarThreadRow = memo(function SidebarThreadRow(props: SidebarThreadRowProps) {
  const {
    orderedProjectThreadKeys,
    isActive,
    openPullRequestsInRightPanel,
    jumpLabel,
    appSettingsConfirmThreadArchive,
    renamingThreadKey,
    renamingTitle,
    setRenamingTitle,
    startThreadRename,
    renamingInputRef,
    renamingCommittedRef,
    confirmingArchiveThreadKey,
    setConfirmingArchiveThreadKey,
    confirmArchiveButtonRefs,
    handleThreadClick,
    navigateToThread,
    handleMultiSelectContextMenu,
    handleThreadContextMenu,
    clearSelection,
    commitRename,
    cancelRename,
    attemptArchiveThread,
    openPrLink,
    onFileDropThreads,
    thread,
  } = props;
  const canOperateThread = useEnvironmentScope(thread.environmentId, AuthOrchestrationOperateScope);
  const canOperatePreview = useEnvironmentScope(thread.environmentId, AuthPreviewOperateScope);
  const threadRef = scopeThreadRef(thread.environmentId, thread.id);
  const threadKey = scopedThreadKey(threadRef);
  const [isFileDragOver, setIsFileDragOver] = useState(false);
  const fileDropHandlers = useMemo(
    () =>
      makeWorkspaceFileDropHandlers({
        setDragActive: setIsFileDragOver,
        addFiles: (files) => {
          onFileDropThreads(threadRef, files);
        },
        addFolders: () => {},
      }),
    [onFileDropThreads, threadRef],
  );
  useEffect(() => {
    if (!isFileDragOver) return;
    const clearFileDrag = () => setIsFileDragOver(false);
    window.addEventListener("dragend", clearFileDrag);
    return () => window.removeEventListener("dragend", clearFileDrag);
  }, [isFileDragOver]);
  const { leaseLiveStatus, rowRef } = useSidebarRowSubscriptionLease(isActive);
  const localLastVisitedAt = useUiStateStore((state) => state.threadLastVisitedAtById[threadKey]);
  const lastVisitedAt = resolveThreadLastVisitedAt(thread.lastVisitedAt, localLastVisitedAt);
  const isSelected = useThreadSelectionStore((state) => state.selectedThreadKeys.has(threadKey));
  const runningTerminalIds = useThreadRunningTerminalIds({
    environmentId: thread.environmentId,
    threadId: thread.id,
  });
  const isMobile = useIsMobile();
  const discoveredPorts = useThreadDiscoveredPorts({
    environmentId: thread.environmentId,
    threadId: thread.id,
  });
  const openPreview = useAtomCommand(previewEnvironment.open, {
    reportFailure: false,
  });
  const environment = useEnvironment(thread.environmentId);
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  // No primary (the hosted app) means every thread is remote, and the machine
  // glyph is what tells the environments apart.
  const isRemoteThread = thread.environmentId !== primaryEnvironmentId;
  const remoteEnvLabel = environment?.label ?? null;
  const remoteMachine = resolveEnvironmentMachineKind(environment?.serverConfig ?? null);
  // A desktop-local secondary backend (e.g. the WSL backend) shows up as a
  // bearer environment whose connection id is prefixed "local:". It runs on the
  // user's own machine, so the cloud icon is misleading, label it "Local" and
  // suppress the cloud icon (the project header already shows a
  // local-environment icon for desktop-local projects, see sidebarProjectGrouping).
  const isDesktopLocalThread =
    environment !== null && isDesktopLocalConnectionTarget(environment.entry.target);
  const threadEnvironmentLabel = isRemoteThread
    ? (remoteEnvLabel ?? (isDesktopLocalThread ? "Local" : "Remote"))
    : null;
  const isHighlighted = isActive || isSelected;
  const handleOpenDiscoveredPort = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const port = discoveredPorts[0];
      if (!port || !canOperatePreview) return;
      event.preventDefault();
      event.stopPropagation();
      navigateToThread(threadRef);
      void (async () => {
        const result = await openDiscoveredPort({ threadRef, port, openPreview });
        if (result._tag === "Success" || isAtomCommandInterrupted(result)) {
          return;
        }
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Unable to open preview",
            description:
              error instanceof Error ? error.message : "The preview could not be opened.",
          }),
        );
      })();
    },
    [canOperatePreview, discoveredPorts, navigateToThread, openPreview, threadRef],
  );
  const isThreadRunning = !threadRuntimeCanArchive(thread.runtime);
  const threadStatus = resolveThreadStatusPill({
    thread: {
      ...thread,
      lastVisitedAt,
    },
  });
  const linkedPullRequestStatus = useLinkedThreadPullRequest(
    thread.environmentId,
    thread.linkedPullRequest,
    leaseLiveStatus,
    thread.pullRequests,
    thread.branchPullRequest,
  );
  const pr = linkedPullRequestStatus?.pr ?? null;
  const supportsMultiplePullRequests = useSupportsMultiplePullRequests(thread.environmentId);
  const currentLinkedPr = supportsMultiplePullRequests
    ? resolveThreadCurrentPullRequestLink(thread.pullRequests)
    : null;
  const prStatus = prStatusIndicator(pr, linkedPullRequestStatus?.sourceControlProvider);
  const terminalStatus = terminalStatusFromRunningIds(runningTerminalIds);
  const isConfirmingArchive =
    canOperateThread && confirmingArchiveThreadKey === threadKey && !isThreadRunning;
  const threadMetaClassName = isConfirmingArchive
    ? "pointer-events-none opacity-0"
    : canOperateThread && !isThreadRunning
      ? "pointer-events-none transition-opacity duration-150 max-sm:pr-6 group-hover/menu-sub-item:opacity-0 group-focus-within/menu-sub-item:opacity-0"
      : "pointer-events-none";
  const clearConfirmingArchive = useCallback(() => {
    setConfirmingArchiveThreadKey((current) => (current === threadKey ? null : current));
  }, [setConfirmingArchiveThreadKey, threadKey]);
  const handleMouseLeave = useCallback(() => {
    clearConfirmingArchive();
  }, [clearConfirmingArchive]);
  const handleBlurCapture = useCallback(
    (event: React.FocusEvent<HTMLLIElement>) => {
      const currentTarget = event.currentTarget;
      requestAnimationFrame(() => {
        if (currentTarget.contains(document.activeElement)) {
          return;
        }
        clearConfirmingArchive();
      });
    },
    [clearConfirmingArchive],
  );
  const handleRowClick = useCallback(
    (event: React.MouseEvent) => {
      handleThreadClick(event, threadRef, orderedProjectThreadKeys);
    },
    [handleThreadClick, orderedProjectThreadKeys, threadRef],
  );
  const handleRowDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      if (!readEnvironmentScope(thread.environmentId, AuthOrchestrationOperateScope)) return;
      // Already renaming this row: a double-click on the row chrome (outside the
      // input) must not restart and discard the in-progress edit.
      if (renamingThreadKey === threadKey) return;
      // On mobile the first tap navigates and closes the sidebar sheet, so the
      // inline rename can't be shown. Renaming there stays on the context menu.
      if (isMobile) return;
      // cmd/ctrl/shift double-clicks are multi-select intent, not rename.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      // Ignore double-clicks bubbling from nested controls (PR status, port,
      // archive buttons) — only the row body should enter inline rename.
      if ((event.target as HTMLElement).closest("button, a")) return;
      event.preventDefault();
      startThreadRename(threadKey, thread.title);
    },
    [isMobile, renamingThreadKey, startThreadRename, threadKey, thread.environmentId, thread.title],
  );
  const handleRowKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      navigateToThread(threadRef);
    },
    [navigateToThread, threadRef],
  );
  const handleRowContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      const hasSelection = useThreadSelectionStore.getState().hasSelection();
      if (hasSelection && isSelected) {
        void (async () => {
          const result = await settlePromise(() =>
            handleMultiSelectContextMenu({
              x: event.clientX,
              y: event.clientY,
            }),
          );
          if (result._tag === "Failure") {
            const error = squashAtomCommandFailure(result);
            toastManager.add(
              stackedThreadToast({
                type: "error",
                title: "Thread action failed",
                description: error instanceof Error ? error.message : "An error occurred.",
              }),
            );
          }
        })();
        return;
      }

      if (hasSelection) {
        clearSelection();
      }
      void (async () => {
        const result = await settlePromise(() =>
          handleThreadContextMenu(threadRef, {
            x: event.clientX,
            y: event.clientY,
          }),
        );
        if (result._tag === "Failure") {
          const error = squashAtomCommandFailure(result);
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Thread action failed",
              description: error instanceof Error ? error.message : "An error occurred.",
            }),
          );
        }
      })();
    },
    [clearSelection, handleMultiSelectContextMenu, handleThreadContextMenu, isSelected, threadRef],
  );
  const handlePrClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      const url = prStatus?.url ?? currentLinkedPr?.url;
      if (!url) return;
      const openedInRightPanel = openPrLink(
        event,
        url,
        openPullRequestsInRightPanel ? threadRef : undefined,
      );
      if (openedInRightPanel && openPullRequestsInRightPanel && !isActive) {
        navigateToThread(threadRef);
      }
    },
    [
      isActive,
      navigateToThread,
      openPrLink,
      openPullRequestsInRightPanel,
      prStatus,
      currentLinkedPr,
      threadRef,
    ],
  );
  const handleRenameInputRef = useCallback(
    (element: HTMLInputElement | null) => {
      if (element && renamingInputRef.current !== element) {
        renamingInputRef.current = element;
        element.focus();
        element.select();
      }
    },
    [renamingInputRef],
  );
  const handleRenameInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setRenamingTitle(event.target.value);
    },
    [setRenamingTitle],
  );
  const handleRenameInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        renamingCommittedRef.current = true;
        void commitRename(threadRef, renamingTitle, thread.title);
      } else if (event.key === "Escape") {
        event.preventDefault();
        renamingCommittedRef.current = true;
        cancelRename();
      }
    },
    [cancelRename, commitRename, renamingCommittedRef, renamingTitle, thread.title, threadRef],
  );
  const handleRenameInputBlur = useCallback(() => {
    if (!renamingCommittedRef.current) {
      void commitRename(threadRef, renamingTitle, thread.title);
    }
  }, [commitRename, renamingCommittedRef, renamingTitle, thread.title, threadRef]);
  // Keep clicks/double-clicks inside the rename input from bubbling to the row.
  // Without stopping `dblclick`, double-clicking to select a word would re-fire
  // the row's rename handler and reset the in-progress edit back to the title.
  const handleRenameInputClick = useCallback((event: React.MouseEvent<HTMLInputElement>) => {
    event.stopPropagation();
  }, []);
  const handleConfirmArchiveRef = useCallback(
    (element: HTMLButtonElement | null) => {
      if (element) {
        confirmArchiveButtonRefs.current.set(threadKey, element);
      } else {
        confirmArchiveButtonRefs.current.delete(threadKey);
      }
    },
    [confirmArchiveButtonRefs, threadKey],
  );
  const stopPropagationOnPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
    },
    [],
  );
  const handleConfirmArchiveClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      clearConfirmingArchive();
      void attemptArchiveThread(threadRef);
    },
    [attemptArchiveThread, clearConfirmingArchive, threadRef],
  );
  const handleStartArchiveConfirmation = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (!checkTaskPermission(thread.environmentId)) return;
      setConfirmingArchiveThreadKey(threadKey);
      requestAnimationFrame(() => {
        confirmArchiveButtonRefs.current.get(threadKey)?.focus();
      });
    },
    [confirmArchiveButtonRefs, setConfirmingArchiveThreadKey, threadKey, thread.environmentId],
  );
  const handleArchiveImmediateClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      void attemptArchiveThread(threadRef);
    },
    [attemptArchiveThread, threadRef],
  );

  return (
    <SidebarMenuSubItem
      ref={rowRef}
      className="group/thread-row relative w-full"
      data-thread-item
      {...fileDropHandlers}
      onMouseLeave={handleMouseLeave}
      onBlurCapture={handleBlurCapture}
    >
      {/* Node branch connection line & node dot */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute -left-3 top-1/2 h-[1.5px] w-3 -translate-y-1/2 transition-colors duration-150",
          isActive
            ? "bg-primary"
            : "bg-zinc-400 dark:bg-zinc-500 group-hover/thread-row:bg-primary",
        )}
      />
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute -left-3 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] transition-all duration-150",
          isActive
            ? "border-primary bg-primary scale-110 shadow-[0_0_8px_rgba(var(--primary),0.6)]"
            : "border-zinc-500 dark:border-zinc-300 bg-background dark:bg-zinc-800 group-hover/thread-row:border-primary group-hover/thread-row:bg-primary/20",
        )}
      />
      {/* A thread row is the legacy sidebar's own control (a focusable div that hosts nested
          links and buttons), not a SidebarMenuSubButton, so it owns its look here. */}
      <div
        role="button"
        tabIndex={0}
        data-active={isActive}
        data-slot="sidebar-menu-sub-button"
        data-sidebar="menu-sub-button"
        data-size="sm"
        data-testid={`thread-row-${thread.id}`}
        className={cn(
          "relative isolate flex h-8 w-full min-w-0 cursor-pointer select-none items-center gap-2 overflow-hidden rounded-lg px-2.5 text-left text-[13px] tracking-[-0.01em] outline-hidden focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring group-data-[collapsible=icon]:hidden transition-all duration-150 [&>span:last-child]:truncate [&>svg:not([class*='size-'])]:size-4 [&>svg]:shrink-0 [&>svg]:text-sidebar-muted-foreground",
          isActive
            ? "bg-primary/10 font-medium text-primary shadow-[inset_0_0_0_1px_rgba(var(--primary),0.12)] hover:bg-primary/15"
            : isSelected
              ? "bg-sidebar-row-selected text-sidebar-foreground hover:bg-sidebar-row-active"
              : "text-sidebar-muted-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
          isFileDragOver && "ring-1 ring-inset ring-primary/70",
        )}
        onClick={handleRowClick}
        onDoubleClick={handleRowDoubleClick}
        onKeyDown={handleRowKeyDown}
        onContextMenu={handleRowContextMenu}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
          {prStatus && pr && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <a
                    href={prStatus.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={prStatus.tooltip}
                    className={`inline-flex items-center justify-center ${prStatus.colorClass} cursor-pointer rounded-sm outline-hidden focus-visible:ring-1 focus-visible:ring-ring`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={handlePrClick}
                  >
                    <ChangeRequestStatusIcon
                      state={pr.state}
                      isDraft={pr.isDraft}
                      className="size-3"
                    />
                  </a>
                }
              />
              <TooltipPopup side="top">
                <PrStatusTooltipContent status={prStatus} />
              </TooltipPopup>
            </Tooltip>
          )}
          {!pr && currentLinkedPr ? (
            <a
              href={currentLinkedPr.url}
              target="_blank"
              rel="noopener noreferrer"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={handlePrClick}
              className="text-muted-foreground"
              aria-label={`PR #${currentLinkedPr.number}, status pending`}
            >
              <PullRequestGlyph.pullRequest className="size-3" />
            </a>
          ) : null}
          {threadStatus && <ThreadStatusLabel status={threadStatus} />}
          {canOperateThread && renamingThreadKey === threadKey ? (
            <input
              ref={handleRenameInputRef}
              className="min-w-0 flex-1 truncate rounded border border-ring bg-transparent px-0.5 text-sm outline-none"
              value={renamingTitle}
              onChange={handleRenameInputChange}
              onKeyDown={handleRenameInputKeyDown}
              onBlur={handleRenameInputBlur}
              onClick={handleRenameInputClick}
              onDoubleClick={handleRenameInputClick}
            />
          ) : (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    className="min-w-0 flex-1 truncate text-[13px]"
                    data-testid={`thread-title-${thread.id}`}
                  >
                    {thread.title}
                  </span>
                }
              />
              <TooltipPopup side="top">{thread.title}</TooltipPopup>
            </Tooltip>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {canOperatePreview && discoveredPorts.length > 0 && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label={`Open localhost:${discoveredPorts[0]?.port ?? ""}`}
                    className="inline-flex cursor-pointer items-center justify-center text-success-foreground outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                    onClick={handleOpenDiscoveredPort}
                  />
                }
              >
                <Globe2Icon className="size-3" />
              </TooltipTrigger>
              <TooltipPopup side="top">
                Open localhost:{discoveredPorts[0]?.port}
                {discoveredPorts.length > 1 ? ` (+${discoveredPorts.length - 1})` : ""}
              </TooltipPopup>
            </Tooltip>
          )}
          <ThreadWorktreeIndicator thread={thread} />
          {terminalStatus && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    role="img"
                    aria-label={terminalStatus.label}
                    className={`inline-flex items-center justify-center ${terminalStatus.colorClass}`}
                  />
                }
              >
                <TerminalIcon
                  className={`size-3 ${terminalStatus.pulse ? "motion-safe:animate-status-pulse" : ""}`}
                  onAnimationStart={synchronizeTerminalPulse}
                />
              </TooltipTrigger>
              <TooltipPopup side="top">{terminalStatus.label}</TooltipPopup>
            </Tooltip>
          )}
          <div
            className={`flex min-w-12 justify-end ${
              isRemoteThread ? "max-sm:min-w-24" : "max-sm:min-w-20"
            }`}
          >
            {isConfirmingArchive ? (
              <button
                ref={handleConfirmArchiveRef}
                type="button"
                data-thread-selection-safe
                data-testid={`thread-archive-confirm-${thread.id}`}
                aria-label={`Confirm archive ${thread.title}`}
                className="absolute top-1/2 right-1 inline-flex h-5 -translate-y-1/2 cursor-pointer items-center rounded-md bg-destructive/12 px-2 text-3xs font-medium text-destructive transition-colors hover:bg-destructive/18 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-destructive/40"
                onPointerDown={stopPropagationOnPointerDown}
                onClick={handleConfirmArchiveClick}
              >
                Confirm
              </button>
            ) : canOperateThread && !isThreadRunning ? (
              appSettingsConfirmThreadArchive ? (
                <div className="pointer-events-none absolute top-1/2 right-0.5 -translate-y-1/2 opacity-0 transition-opacity duration-150 max-sm:pointer-events-auto max-sm:opacity-100 group-hover/menu-sub-item:pointer-events-auto group-hover/menu-sub-item:opacity-100 group-focus-within/menu-sub-item:pointer-events-auto group-focus-within/menu-sub-item:opacity-100">
                  <button
                    type="button"
                    data-thread-selection-safe
                    data-testid={`thread-archive-${thread.id}`}
                    aria-label={`Archive ${thread.title}`}
                    className={SIDEBAR_ICON_ACTION_BUTTON_CLASS}
                    onPointerDown={stopPropagationOnPointerDown}
                    onClick={handleStartArchiveConfirmation}
                  >
                    <ArchiveIcon className="size-3.5" />
                  </button>
                </div>
              ) : (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <div className="pointer-events-none absolute top-1/2 right-0.5 -translate-y-1/2 opacity-0 transition-opacity duration-150 max-sm:pointer-events-auto max-sm:opacity-100 group-hover/menu-sub-item:pointer-events-auto group-hover/menu-sub-item:opacity-100 group-focus-within/menu-sub-item:pointer-events-auto group-focus-within/menu-sub-item:opacity-100">
                        <button
                          type="button"
                          data-thread-selection-safe
                          data-testid={`thread-archive-${thread.id}`}
                          aria-label={`Archive ${thread.title}`}
                          className={SIDEBAR_ICON_ACTION_BUTTON_CLASS}
                          onPointerDown={stopPropagationOnPointerDown}
                          onClick={handleArchiveImmediateClick}
                        >
                          <ArchiveIcon className="size-3.5" />
                        </button>
                      </div>
                    }
                  />
                  <TooltipPopup side="top">Archive</TooltipPopup>
                </Tooltip>
              )
            ) : null}
            <span className={threadMetaClassName}>
              <span className="inline-flex items-center gap-1">
                {jumpLabel ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span
                          aria-label={jumpLabel}
                          className="inline-flex h-5 items-center rounded-full border border-border/80 bg-background/90 px-1.5 font-mono text-3xs font-medium tracking-tight text-foreground shadow-sm"
                        />
                      }
                    >
                      {jumpLabel}
                    </TooltipTrigger>
                    <TooltipPopup side="top">{jumpLabel}</TooltipPopup>
                  </Tooltip>
                ) : (
                  <span
                    className={`text-3xs tabular-nums ${
                      isHighlighted ? "text-foreground" : "text-secondary-label"
                    }`}
                  >
                    {formatRelativeTimeLabel(
                      thread.latestUserMessageAt ?? thread.updatedAt ?? thread.createdAt,
                    )}
                  </span>
                )}
              </span>
            </span>
          </div>
        </div>
      </div>
    </SidebarMenuSubItem>
  );
});

interface SidebarProjectThreadListProps {
  projectKey: string;
  projectExpanded: boolean;
  hasOverflowingThreads: boolean;
  hiddenThreadStatus: ThreadStatusPill | null;
  orderedProjectThreadKeys: readonly string[];
  renderedThreads: readonly SidebarThreadSummary[];
  showEmptyThreadState: boolean;
  shouldShowThreadPanel: boolean;
  isThreadListExpanded: boolean;
  activeRouteThreadKey: string | null;
  openPullRequestsInRightPanel: boolean;
  threadJumpLabelByKey: ReadonlyMap<string, string>;
  appSettingsConfirmThreadArchive: boolean;
  renamingThreadKey: string | null;
  renamingTitle: string;
  setRenamingTitle: (title: string) => void;
  startThreadRename: (threadKey: string, title: string) => void;
  renamingInputRef: React.RefObject<HTMLInputElement | null>;
  renamingCommittedRef: React.RefObject<boolean>;
  confirmingArchiveThreadKey: string | null;
  setConfirmingArchiveThreadKey: React.Dispatch<React.SetStateAction<string | null>>;
  confirmArchiveButtonRefs: React.RefObject<Map<string, HTMLButtonElement>>;
  attachThreadListAutoAnimateRef: (node: HTMLElement | null) => void;
  handleThreadClick: (
    event: React.MouseEvent,
    threadRef: ScopedThreadRef,
    orderedProjectThreadKeys: readonly string[],
  ) => void;
  navigateToThread: (threadRef: ScopedThreadRef) => Promise<void>;
  onFileDropThreads: (threadRef: ScopedThreadRef, files: File[]) => void;
  handleMultiSelectContextMenu: (position: { x: number; y: number }) => Promise<void>;
  handleThreadContextMenu: (
    threadRef: ScopedThreadRef,
    position: { x: number; y: number },
  ) => Promise<void>;
  clearSelection: () => void;
  commitRename: (
    threadRef: ScopedThreadRef,
    newTitle: string,
    originalTitle: string,
  ) => Promise<void>;
  cancelRename: () => void;
  attemptArchiveThread: (threadRef: ScopedThreadRef) => Promise<void>;
  openPrLink: (
    event: React.MouseEvent<HTMLElement>,
    prUrl: string,
    threadRef?: ScopedThreadRef,
  ) => boolean;
  expandThreadListForProject: (projectKey: string) => void;
  collapseThreadListForProject: (projectKey: string) => void;
}

const SidebarProjectThreadList = memo(function SidebarProjectThreadList(
  props: SidebarProjectThreadListProps,
) {
  const {
    projectKey,
    projectExpanded,
    hasOverflowingThreads,
    hiddenThreadStatus,
    orderedProjectThreadKeys,
    renderedThreads,
    showEmptyThreadState,
    shouldShowThreadPanel,
    isThreadListExpanded,
    activeRouteThreadKey,
    openPullRequestsInRightPanel,
    threadJumpLabelByKey,
    appSettingsConfirmThreadArchive,
    renamingThreadKey,
    renamingTitle,
    setRenamingTitle,
    startThreadRename,
    renamingInputRef,
    renamingCommittedRef,
    confirmingArchiveThreadKey,
    setConfirmingArchiveThreadKey,
    confirmArchiveButtonRefs,
    attachThreadListAutoAnimateRef,
    handleThreadClick,
    navigateToThread,
    onFileDropThreads,
    handleMultiSelectContextMenu,
    handleThreadContextMenu,
    clearSelection,
    commitRename,
    cancelRename,
    attemptArchiveThread,
    openPrLink,
    expandThreadListForProject,
    collapseThreadListForProject,
  } = props;
  const showMoreButtonRender = useMemo(() => <button type="button" />, []);
  const showLessButtonRender = useMemo(() => <button type="button" />, []);

  if (!shouldShowThreadPanel) {
    return null;
  }

  return (
    <SidebarMenuSub
      ref={attachThreadListAutoAnimateRef}
      className="relative ml-4 mr-0 my-0 py-1.5 w-auto translate-x-0 overflow-hidden border-l-[1.5px] border-zinc-400 dark:border-zinc-500 pl-3 space-y-0.5"
    >
      {shouldShowThreadPanel && showEmptyThreadState ? (
        <SidebarMenuSubItem className="relative w-full" data-thread-selection-safe>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -left-3 top-1/2 h-[1.5px] w-3 -translate-y-1/2 bg-zinc-400 dark:bg-zinc-500"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -left-3 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-zinc-500 dark:border-zinc-300 bg-background dark:bg-zinc-800"
          />
          <div
            data-thread-selection-safe
            className="flex h-7.5 w-full translate-x-0 items-center px-2 text-left text-[12px] italic text-sidebar-muted-foreground/65"
          >
            <span>No chats</span>
          </div>
        </SidebarMenuSubItem>
      ) : null}
      {shouldShowThreadPanel &&
        renderedThreads.map((thread) => {
          const threadKey = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
          return (
            <SidebarThreadRow
              key={threadKey}
              thread={thread}
              orderedProjectThreadKeys={orderedProjectThreadKeys}
              isActive={activeRouteThreadKey === threadKey}
              openPullRequestsInRightPanel={openPullRequestsInRightPanel}
              jumpLabel={threadJumpLabelByKey.get(threadKey) ?? null}
              appSettingsConfirmThreadArchive={appSettingsConfirmThreadArchive}
              renamingThreadKey={renamingThreadKey}
              renamingTitle={renamingTitle}
              setRenamingTitle={setRenamingTitle}
              startThreadRename={startThreadRename}
              renamingInputRef={renamingInputRef}
              renamingCommittedRef={renamingCommittedRef}
              confirmingArchiveThreadKey={confirmingArchiveThreadKey}
              setConfirmingArchiveThreadKey={setConfirmingArchiveThreadKey}
              confirmArchiveButtonRefs={confirmArchiveButtonRefs}
              handleThreadClick={handleThreadClick}
              navigateToThread={navigateToThread}
              onFileDropThreads={onFileDropThreads}
              handleMultiSelectContextMenu={handleMultiSelectContextMenu}
              handleThreadContextMenu={handleThreadContextMenu}
              clearSelection={clearSelection}
              commitRename={commitRename}
              cancelRename={cancelRename}
              attemptArchiveThread={attemptArchiveThread}
              openPrLink={openPrLink}
            />
          );
        })}

      {projectExpanded && hasOverflowingThreads && !isThreadListExpanded && (
        <SidebarMenuSubItem className="relative w-full">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -left-3 top-1/2 h-[1.5px] w-3 -translate-y-1/2 bg-zinc-400 dark:bg-zinc-500"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -left-3 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-zinc-500 dark:border-zinc-300 bg-background dark:bg-zinc-800"
          />
          <SidebarMenuSubButton
            render={showMoreButtonRender}
            data-thread-selection-safe
            size="sm"
            onClick={() => {
              expandThreadListForProject(projectKey);
            }}
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">
              {hiddenThreadStatus && <ThreadStatusLabel status={hiddenThreadStatus} compact />}
              <span>Show more</span>
            </span>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      )}
      {projectExpanded && hasOverflowingThreads && isThreadListExpanded && (
        <SidebarMenuSubItem className="relative w-full">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -left-3 top-1/2 h-[1.5px] w-3 -translate-y-1/2 bg-zinc-400 dark:bg-zinc-500"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -left-3 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-zinc-500 dark:border-zinc-300 bg-background dark:bg-zinc-800"
          />
          <SidebarMenuSubButton
            render={showLessButtonRender}
            data-thread-selection-safe
            size="sm"
            onClick={() => {
              collapseThreadListForProject(projectKey);
            }}
          >
            <span>Show less</span>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      )}
    </SidebarMenuSub>
  );
});

interface SidebarProjectItemProps {
  project: SidebarProjectSnapshot;
  isThreadListExpanded: boolean;
  activeRouteThreadKey: string | null;
  openPullRequestsInRightPanel: boolean;
  newThreadShortcutLabel: string | null;
  handleNewThread: ReturnType<typeof useNewThreadHandler>;
  archiveThread: ReturnType<typeof useThreadActions>["archiveThread"];
  deleteThread: ReturnType<typeof useThreadActions>["deleteThread"];
  markThreadUnread: ReturnType<typeof useThreadActions>["markThreadUnread"];
  threadJumpLabelByKey: ReadonlyMap<string, string>;
  attachThreadListAutoAnimateRef: (node: HTMLElement | null) => void;
  expandThreadListForProject: (projectKey: string) => void;
  collapseThreadListForProject: (projectKey: string) => void;
  dragInProgressRef: React.RefObject<boolean>;
  suppressProjectClickAfterDragRef: React.RefObject<boolean>;
  suppressProjectClickForContextMenuRef: React.RefObject<boolean>;
  isManualProjectSorting: boolean;
  dragHandleProps: SortableProjectHandleProps | null;
}

const SidebarProjectItem = memo(function SidebarProjectItem(props: SidebarProjectItemProps) {
  const {
    project,
    isThreadListExpanded,
    activeRouteThreadKey,
    openPullRequestsInRightPanel,
    newThreadShortcutLabel,
    handleNewThread,
    archiveThread,
    deleteThread,
    markThreadUnread,
    threadJumpLabelByKey,
    attachThreadListAutoAnimateRef,
    expandThreadListForProject,
    collapseThreadListForProject,
    dragInProgressRef,
    suppressProjectClickAfterDragRef,
    suppressProjectClickForContextMenuRef,
    isManualProjectSorting,
    dragHandleProps,
  } = props;
  const environmentMachine = project.allRemoteMembersAreWsl
    ? "linux"
    : project.allRemoteMembersAreDesktopLocal
      ? "laptop"
      : "cloud";
  const threadSortOrder = useClientSettings<SidebarThreadSortOrder>(
    (settings) => settings.sidebarThreadSortOrder,
  );
  const appSettingsConfirmThreadDelete = useClientSettings<boolean>(
    (settings) => settings.confirmThreadDelete,
  );
  const appSettingsConfirmThreadArchive = useClientSettings<boolean>(
    (settings) => settings.confirmThreadArchive,
  );
  const projectGroupingSettings = useClientSettings(selectProjectGroupingSettings);
  const deleteProject = useOrchestrationCommand(projectEnvironment.delete, {
    reportFailure: false,
  });
  const updateProject = useOrchestrationCommand(projectEnvironment.update, {
    reportFailure: false,
  });
  const updateThreadMetadata = useOrchestrationCommand(threadEnvironment.updateMetadata, {
    reportFailure: false,
  });
  const updateSettings = useUpdateClientSettings();
  const sidebarThreadPreviewCount = useClientSettings<SidebarThreadPreviewCount>(
    (settings) => settings.sidebarThreadPreviewCount,
  );
  const router = useRouter();
  const queuePendingFileDrop = useSidebarPendingFileDropStore((s) => s.queuePendingFileDrop);
  const clearPendingFileDrop = useSidebarPendingFileDropStore((s) => s.clearPendingFileDrop);
  const { isMobile, setOpenMobile } = useSidebar();
  const setProjectExpanded = useUiStateStore((state) => state.setProjectExpanded);
  const toggleThreadSelection = useThreadSelectionStore((state) => state.toggleThread);
  const rangeSelectTo = useThreadSelectionStore((state) => state.rangeSelectTo);
  const clearSelection = useThreadSelectionStore((state) => state.clearSelection);
  const removeFromSelection = useThreadSelectionStore((state) => state.removeFromSelection);
  const setSelectionAnchor = useThreadSelectionStore((state) => state.setAnchor);
  const { copyToClipboard: copyThreadIdToClipboard } = useCopyToClipboard<{
    threadId: ThreadId;
  }>({
    onCopy: (ctx) => {
      toastManager.add({
        type: "success",
        title: "Thread ID copied",
        description: ctx.threadId,
      });
    },
    onError: (error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Failed to copy thread ID",
          description: error instanceof Error ? error.message : "An error occurred.",
        }),
      );
    },
  });
  const { copyToClipboard: copyPathToClipboard } = useCopyToClipboard<{
    path: string;
  }>({
    onCopy: (ctx) => {
      toastManager.add({
        type: "success",
        title: "Path copied",
        description: ctx.path,
      });
    },
    onError: (error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Failed to copy path",
          description: error instanceof Error ? error.message : "An error occurred.",
        }),
      );
    },
  });
  const openPrLink = useOpenPrLink();
  const sidebarThreads = useThreadShellsForProjectRefs(project.memberProjectRefs);
  const projectThreads = useMemo(() => {
    const seen = new Set<string>();
    return sidebarThreads.filter((thread) => {
      if (seen.has(thread.id)) return false;
      seen.add(thread.id);
      return true;
    });
  }, [sidebarThreads]);
  const sidebarThreadByKey = useMemo(
    () =>
      new Map(
        projectThreads.map(
          (thread) =>
            [scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)), thread] as const,
        ),
      ),
    [projectThreads],
  );
  // Keep a ref so callbacks can read the latest map without appearing in
  // dependency arrays (avoids invalidating every thread-row memo on each
  // thread-list change).
  const sidebarThreadByKeyRef = useRef(sidebarThreadByKey);
  sidebarThreadByKeyRef.current = sidebarThreadByKey;
  const projectPreferenceKeys = useMemo(() => projectExpansionPreferenceKeys(project), [project]);
  const projectExpanded = useUiStateStore((state) =>
    resolveProjectExpanded(state.projectExpandedById, projectPreferenceKeys),
  );
  const threadLastVisitedAts = useUiStateStore(
    useShallow((state) =>
      projectThreads.map(
        (thread) =>
          state.threadLastVisitedAtById[
            scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))
          ] ?? null,
      ),
    ),
  );
  const [renamingThreadKey, setRenamingThreadKey] = useState<string | null>(null);
  const [renamingTitle, setRenamingTitle] = useState("");
  const [confirmingArchiveThreadKey, setConfirmingArchiveThreadKey] = useState<string | null>(null);
  const [projectRenameTarget, setProjectRenameTarget] = useState<SidebarProjectGroupMember | null>(
    null,
  );
  const [projectRenameTitle, setProjectRenameTitle] = useState("");
  const canRenameProject = useEnvironmentScope(
    projectRenameTarget?.environmentId ?? null,
    AuthOrchestrationOperateScope,
  );
  const [projectGroupingTarget, setProjectGroupingTarget] =
    useState<SidebarProjectGroupMember | null>(null);
  const [projectGroupingSelection, setProjectGroupingSelection] = useState<
    SidebarProjectGroupingMode | "inherit"
  >("inherit");
  const renamingCommittedRef = useRef(false);
  const renamingInputRef = useRef<HTMLInputElement | null>(null);
  const confirmArchiveButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const memberProjectByScopedKey = useMemo(
    () =>
      new Map(
        project.memberProjects.map((member) => [
          scopedProjectKey(scopeProjectRef(member.environmentId, member.id)),
          member,
        ]),
      ),
    [project.memberProjects],
  );
  const memberThreadCountByPhysicalKey = useMemo(() => {
    const counts = new Map<string, number>(
      project.memberProjects.map((member) => [member.physicalProjectKey, 0] as const),
    );
    for (const thread of projectThreads) {
      const member = memberProjectByScopedKey.get(
        scopedProjectKey(scopeProjectRef(thread.environmentId, thread.projectId)),
      );
      if (!member) {
        continue;
      }
      counts.set(member.physicalProjectKey, (counts.get(member.physicalProjectKey) ?? 0) + 1);
    }
    return counts;
  }, [memberProjectByScopedKey, project.memberProjects, projectThreads]);

  const { projectStatus, visibleProjectThreads, orderedProjectThreadKeys } = useMemo(() => {
    const lastVisitedAtByThreadKey = new Map(
      projectThreads.map((thread, index) => [
        scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
        resolveThreadLastVisitedAt(thread.lastVisitedAt, threadLastVisitedAts[index] ?? undefined),
      ]),
    );
    const resolveProjectThreadStatus = (thread: SidebarThreadSummary) => {
      const lastVisitedAt = lastVisitedAtByThreadKey.get(
        scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
      );
      return resolveThreadStatusPill({
        thread: {
          ...thread,
          ...(lastVisitedAt !== null && lastVisitedAt !== undefined ? { lastVisitedAt } : {}),
        },
      });
    };
    const visibleProjectThreads = sortThreads(
      projectThreads.filter((thread) => thread.archivedAt === null),
      threadSortOrder,
    );
    const projectStatus = resolveProjectStatusIndicator(
      visibleProjectThreads.map((thread) => resolveProjectThreadStatus(thread)),
    );
    return {
      orderedProjectThreadKeys: visibleProjectThreads.map((thread) =>
        scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
      ),
      projectStatus,
      visibleProjectThreads,
    };
  }, [projectThreads, threadLastVisitedAts, threadSortOrder]);
  const pinnedCollapsedThread = useMemo(() => {
    const activeThreadKey = activeRouteThreadKey ?? undefined;
    if (!activeThreadKey || projectExpanded) {
      return null;
    }
    return (
      visibleProjectThreads.find(
        (thread) =>
          scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)) === activeThreadKey,
      ) ?? null
    );
  }, [activeRouteThreadKey, projectExpanded, visibleProjectThreads]);

  const {
    hasOverflowingThreads,
    hiddenThreadStatus,
    renderedThreads,
    showEmptyThreadState,
    shouldShowThreadPanel,
  } = useMemo(() => {
    const lastVisitedAtByThreadKey = new Map(
      projectThreads.map((thread, index) => [
        scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
        resolveThreadLastVisitedAt(thread.lastVisitedAt, threadLastVisitedAts[index] ?? undefined),
      ]),
    );
    const resolveProjectThreadStatus = (thread: SidebarThreadSummary) => {
      const lastVisitedAt = lastVisitedAtByThreadKey.get(
        scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
      );
      return resolveThreadStatusPill({
        thread: {
          ...thread,
          ...(lastVisitedAt !== null && lastVisitedAt !== undefined ? { lastVisitedAt } : {}),
        },
      });
    };
    const hasOverflowingThreads = visibleProjectThreads.length > sidebarThreadPreviewCount;
    const previewThreads =
      isThreadListExpanded || !hasOverflowingThreads
        ? visibleProjectThreads
        : visibleProjectThreads.slice(0, sidebarThreadPreviewCount);
    const visibleThreadKeys = new Set(
      [...previewThreads, ...(pinnedCollapsedThread ? [pinnedCollapsedThread] : [])].map((thread) =>
        scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
      ),
    );
    const seenRenderedIds = new Set<string>();
    const renderedThreads = (
      pinnedCollapsedThread
        ? [pinnedCollapsedThread]
        : visibleProjectThreads.filter((thread) =>
            visibleThreadKeys.has(scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))),
          )
    ).filter((thread) => {
      if (seenRenderedIds.has(thread.id)) return false;
      seenRenderedIds.add(thread.id);
      return true;
    });
    const hiddenThreads = visibleProjectThreads.filter(
      (thread) =>
        !visibleThreadKeys.has(scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))),
    );
    return {
      hasOverflowingThreads,
      hiddenThreadStatus: resolveProjectStatusIndicator(
        hiddenThreads.map((thread) => resolveProjectThreadStatus(thread)),
      ),
      renderedThreads,
      showEmptyThreadState: projectExpanded && visibleProjectThreads.length === 0,
      shouldShowThreadPanel: projectExpanded || pinnedCollapsedThread !== null,
    };
  }, [
    isThreadListExpanded,
    pinnedCollapsedThread,
    projectExpanded,
    projectThreads,
    sidebarThreadPreviewCount,
    threadLastVisitedAts,
    visibleProjectThreads,
  ]);

  const handleProjectButtonClick = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (suppressProjectClickForContextMenuRef.current) {
        suppressProjectClickForContextMenuRef.current = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (dragInProgressRef.current) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (suppressProjectClickAfterDragRef.current) {
        suppressProjectClickAfterDragRef.current = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (useThreadSelectionStore.getState().hasSelection()) {
        clearSelection();
      }
      setProjectExpanded(projectPreferenceKeys, !projectExpanded);
    },
    [
      clearSelection,
      dragInProgressRef,
      projectExpanded,
      projectPreferenceKeys,
      setProjectExpanded,
      suppressProjectClickAfterDragRef,
      suppressProjectClickForContextMenuRef,
    ],
  );

  const handleProjectButtonKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (dragInProgressRef.current) {
        return;
      }
      setProjectExpanded(projectPreferenceKeys, !projectExpanded);
    },
    [dragInProgressRef, projectExpanded, projectPreferenceKeys, setProjectExpanded],
  );

  const handleProjectButtonPointerDownCapture = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      suppressProjectClickForContextMenuRef.current = false;
      if (
        isContextMenuPointerDown({
          button: event.button,
          ctrlKey: event.ctrlKey,
          isMac: isMacPlatform(navigator.platform),
        })
      ) {
        event.stopPropagation();
      }

      suppressProjectClickAfterDragRef.current = false;
    },
    [suppressProjectClickAfterDragRef, suppressProjectClickForContextMenuRef],
  );

  const openProjectRenameDialog = useCallback((member: SidebarProjectGroupMember) => {
    if (!checkTaskPermission(member.environmentId)) return;
    setProjectRenameTarget(member);
    setProjectRenameTitle(member.title);
  }, []);

  const openProjectGroupingDialog = useCallback(
    (member: SidebarProjectGroupMember) => {
      const overrideKey = deriveProjectGroupingOverrideKey(member);
      setProjectGroupingTarget(member);
      setProjectGroupingSelection(
        projectGroupingSettings.sidebarProjectGroupingOverrides?.[overrideKey] ?? "inherit",
      );
    },
    [projectGroupingSettings.sidebarProjectGroupingOverrides],
  );

  const removeProject = useCallback(
    async (member: SidebarProjectGroupMember) => {
      const memberProjectRef = scopeProjectRef(member.environmentId, member.id);

      let directDeleteSucceeded = false;
      try {
        const response = await fetch(
          resolvePrimaryEnvironmentHttpUrl("/api/project/delete-direct"),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId: member.id }),
          },
        );
        if (response.ok) {
          const data = await response.json();
          if (data.ok) {
            directDeleteSucceeded = true;
          }
        }
      } catch {
        // Fall back to RPC command
      }

      const result = await deleteProject({
        environmentId: member.environmentId,
        input: {
          projectId: member.id,
          force: true,
        },
      });

      if (result._tag === "Failure" && !directDeleteSucceeded) {
        return result;
      }
      const draftStore = useComposerDraftStore.getState();
      releaseProjectDraftUploads(
        memberProjectRef,
        sidebarThreads
          .filter(
            (thread) =>
              thread.environmentId === member.environmentId && thread.projectId === member.id,
          )
          .map((thread) => scopeThreadRef(thread.environmentId, thread.id)),
      );
      const projectDraftThread = draftStore.getDraftThreadByProjectRef(memberProjectRef);
      if (projectDraftThread) {
        draftStore.clearDraftThread(projectDraftThread.draftId);
      }
      draftStore.clearProjectDraftThreadId(memberProjectRef);
      return { _tag: "Success" as const, value: undefined };
    },
    [deleteProject, sidebarThreads],
  );

  const handleRemoveProject = useCallback(
    async (member: SidebarProjectGroupMember) => {
      if (!checkTaskPermission(member.environmentId)) return;
      const api = readLocalApi();
      if (!api) {
        return;
      }

      const memberProjectRef = scopeProjectRef(member.environmentId, member.id);
      const memberThreadCount = memberThreadCountByPhysicalKey.get(member.physicalProjectKey) ?? 0;
      if (memberThreadCount > 0) {
        const warningToastId = toastManager.add(
          stackedThreadToast({
            type: "warning",
            title: "Project is not empty",
            description: "Delete all threads in this project before removing it.",
            actionVariant: "destructive",
            actionProps: {
              children: "Delete anyway",
              onClick: () => {
                void (async () => {
                  toastManager.close(warningToastId);
                  await new Promise<void>((resolve) => {
                    window.setTimeout(resolve, 180);
                  });
                  if (!checkTaskPermission(member.environmentId)) return;

                  const latestProjectThreads = Array.from(
                    sidebarThreadByKeyRef.current.values(),
                  ).filter(
                    (thread) =>
                      thread.environmentId === memberProjectRef.environmentId &&
                      thread.projectId === memberProjectRef.projectId,
                  );
                  const confirmed = await api.dialogs.confirm(
                    latestProjectThreads.length > 0
                      ? [
                          `Remove project "${member.title}" and delete its ${latestProjectThreads.length} thread${
                            latestProjectThreads.length === 1 ? "" : "s"
                          }?`,
                          `Path: ${member.workspaceRoot}`,
                          ...(member.environmentLabel
                            ? [`Environment: ${member.environmentLabel}`]
                            : []),
                          "This permanently clears conversation history for those threads and any archived threads.",
                          "This removes only this project entry.",
                          "This action cannot be undone.",
                        ].join("\n")
                      : [
                          `Remove project "${member.title}"?`,
                          `Path: ${member.workspaceRoot}`,
                          ...(member.environmentLabel
                            ? [`Environment: ${member.environmentLabel}`]
                            : []),
                          "This permanently clears any archived conversation history.",
                          "This removes only this project entry.",
                        ].join("\n"),
                    { variant: "destructive" },
                  );
                  if (!confirmed) {
                    return;
                  }

                  const result = await removeProject(member);
                  if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
                    const error = squashAtomCommandFailure(result);
                    toastManager.add(
                      stackedThreadToast({
                        type: "error",
                        title: `Failed to remove "${member.title}"`,
                        description:
                          error instanceof Error
                            ? error.message
                            : "Unknown error removing project.",
                      }),
                    );
                  }
                })().catch((error) => {
                  const message =
                    error instanceof Error ? error.message : "Unknown error removing project.";
                  console.error("Failed to remove project", {
                    projectId: member.id,
                    environmentId: member.environmentId,
                    ...safeErrorLogAttributes(error),
                  });
                  toastManager.add(
                    stackedThreadToast({
                      type: "error",
                      title: `Failed to remove "${member.title}"`,
                      description: message,
                    }),
                  );
                });
              },
            },
          }),
        );
        return;
      }

      const message = [
        `Remove project "${member.title}"?`,
        `Path: ${member.workspaceRoot}`,
        ...(member.environmentLabel ? [`Environment: ${member.environmentLabel}`] : []),
        "This permanently clears any archived conversation history.",
        "This removes only this project entry.",
      ].join("\n");
      const confirmed = await api.dialogs.confirm(message, { variant: "destructive" });
      if (!confirmed) {
        return;
      }

      const result = await removeProject(member);
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        const message = error instanceof Error ? error.message : "Unknown error removing project.";
        console.error("Failed to remove project", {
          projectId: member.id,
          environmentId: member.environmentId,
          ...safeErrorLogAttributes(error),
        });
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: `Failed to remove "${member.title}"`,
            description: message,
          }),
        );
      }
    },
    [memberThreadCountByPhysicalKey, removeProject],
  );

  const navigateToThread = useCallback(
    (threadRef: ScopedThreadRef) => {
      if (useThreadSelectionStore.getState().selectedThreadKeys.size > 0) {
        clearSelection();
      }
      setSelectionAnchor(scopedThreadKey(threadRef));
      if (isMobile) {
        setOpenMobile(false);
      }
      return router.navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(threadRef),
      });
    },
    [clearSelection, isMobile, router, setOpenMobile, setSelectionAnchor],
  );

  const handleOpenInTerminal = useCallback(
    async (targetMember?: SidebarProjectGroupMember) => {
      const member = targetMember ?? project.memberProjects[0];
      if (!member) return;

      setProjectExpanded(projectPreferenceKeys, true);
      if (isMobile) {
        setOpenMobile(false);
      }

      const matchingThread =
        projectThreads.find(
          (t) => t.environmentId === member.environmentId && t.projectId === member.id,
        ) ?? projectThreads[0];

      let threadRef: ScopedThreadRef;
      if (matchingThread) {
        threadRef = scopeThreadRef(matchingThread.environmentId, matchingThread.id);
        await navigateToThread(threadRef);
      } else {
        const res = await handleNewThread(scopeProjectRef(member.environmentId, member.id));
        if (!res) return;
        threadRef = scopeThreadRef(member.environmentId, res.threadId);
      }

      useTerminalUiStateStore.getState().setTerminalOpen(threadRef, true);
      useRightPanelStore.getState().openTerminal(threadRef, DEFAULT_THREAD_TERMINAL_ID);
    },
    [
      handleNewThread,
      isMobile,
      navigateToThread,
      project.memberProjects,
      projectPreferenceKeys,
      projectThreads,
      setOpenMobile,
      setProjectExpanded,
    ],
  );

  const handlePushToGithub = useCallback(
    async (targetMember?: SidebarProjectGroupMember) => {
      const member = targetMember ?? project.memberProjects[0];
      if (!member) return;

      const cwd = member.workspaceRoot;

      // 1. Check if git is initialized
      const gitCheck = await executeTerminalCommand("git rev-parse --is-inside-work-tree", cwd);
      if (!gitCheck.ok || gitCheck.stdout.trim() !== "true") {
        toastManager.add({
          type: "error",
          title: "Git not initialized",
          description: "Git not initialized. Please initialize git or open in Terminal.",
        });
        return;
      }

      // 2. Check if remote origin exists
      let remoteName = "origin";
      const remoteCheck = await executeTerminalCommand("git remote get-url origin", cwd);
      if (!remoteCheck.ok || !remoteCheck.stdout.trim()) {
        const anyRemote = await executeTerminalCommand("git remote", cwd);
        const remotes = anyRemote.ok ? anyRemote.stdout.trim().split("\n").filter(Boolean) : [];
        if (remotes.length > 0) {
          remoteName = remotes[0]!;
        } else {
          toastManager.add({
            type: "error",
            title: "GitHub Remote Not Found",
            description:
              "No remote repository found. Please configure a Git remote (e.g. git remote add origin <url>) or open Terminal.",
          });
          return;
        }
      }

      const progressToastId = toastManager.add({
        type: "info",
        title: "Pushing to GitHub...",
        description: `Checking changes for "${project.displayName}"...`,
      });

      try {
        // 3. Check status & commit if dirty
        const statusCheck = await executeTerminalCommand("git status --porcelain", cwd);
        const statusOutput = statusCheck.ok ? statusCheck.stdout.trim() : "";

        if (statusOutput.length > 0) {
          const addResult = await executeTerminalCommand("git add .", cwd);
          if (!addResult.ok) {
            toastManager.close(progressToastId);
            toastManager.add({
              type: "error",
              title: "Git Add Failed",
              description: addResult.stderr || "Failed to stage changes.",
            });
            return;
          }

          const lines = statusOutput
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean);
          const changedFiles = lines
            .map((l) => l.replace(/^[MADRCU?! ]+\s+/, "").trim())
            .filter(Boolean);
          let commitMsg = "chore: update project files";
          if (changedFiles.length === 1) {
            commitMsg = `chore: update ${changedFiles[0]}`;
          } else if (changedFiles.length > 1 && changedFiles.length <= 4) {
            commitMsg = `feat: update ${changedFiles.slice(0, 3).join(", ")}${
              changedFiles.length > 3 ? "..." : ""
            }`;
          } else if (changedFiles.length > 4) {
            commitMsg = `feat: update ${changedFiles[0]} and ${changedFiles.length - 1} other files`;
          }

          let commitResult = await executeTerminalCommand(
            `git commit -m ${JSON.stringify(commitMsg)}`,
            cwd,
          );
          if (
            !commitResult.ok &&
            (commitResult.stderr.includes("Please tell me who you are") ||
              commitResult.stdout.includes("Please tell me who you are") ||
              commitResult.stderr.includes("Author identity unknown"))
          ) {
            // Auto configure fallback author identity if not set
            await executeTerminalCommand('git config user.name "AutoCode User"', cwd);
            await executeTerminalCommand('git config user.email "user@autocode.local"', cwd);
            commitResult = await executeTerminalCommand(
              `git commit -m ${JSON.stringify(commitMsg)}`,
              cwd,
            );
          }

          if (
            !commitResult.ok &&
            !commitResult.stdout.includes("nothing to commit") &&
            !commitResult.stderr.includes("nothing to commit")
          ) {
            toastManager.close(progressToastId);
            toastManager.add({
              type: "error",
              title: "Git Commit Failed",
              description:
                commitResult.stderr || commitResult.stdout || "Failed to commit changes.",
            });
            return;
          }
        }

        // 4. Push to remote
        let pushResult = await executeTerminalCommand(`git push ${remoteName}`, cwd);
        if (!pushResult.ok) {
          if (
            pushResult.stderr.includes("no upstream branch") ||
            pushResult.stderr.includes("set-upstream") ||
            pushResult.stderr.includes("The current branch")
          ) {
            pushResult = await executeTerminalCommand(`git push -u ${remoteName} HEAD`, cwd);
          } else if (
            pushResult.stderr.includes("fetch first") ||
            pushResult.stderr.includes("non-fast-forward") ||
            pushResult.stderr.includes("Updates were rejected")
          ) {
            // Try git pull --rebase then push again
            const rebaseResult = await executeTerminalCommand(
              `git pull --rebase ${remoteName} HEAD`,
              cwd,
            );
            if (rebaseResult.ok) {
              pushResult = await executeTerminalCommand(`git push ${remoteName} HEAD`, cwd);
            } else {
              // Revert rebase if failed to avoid leaving dirty rebase state
              await executeTerminalCommand("git rebase --abort", cwd);
            }
          }
        }

        toastManager.close(progressToastId);

        if (pushResult.ok) {
          toastManager.add({
            type: "success",
            title: "Pushed to GitHub",
            description: `Successfully pushed "${project.displayName}" to ${remoteName}.`,
          });
        } else {
          let desc = pushResult.stderr || pushResult.error || "Failed to push to GitHub.";
          if (desc.includes("Permission denied") || desc.includes("Could not read from remote")) {
            desc += " Check your SSH key or GitHub credentials.";
          }
          toastManager.add({
            type: "error",
            title: "Git Push Failed",
            description: desc,
          });
        }
      } catch (err) {
        toastManager.close(progressToastId);
        const errMsg = err instanceof Error ? err.message : String(err);
        toastManager.add({
          type: "error",
          title: "Push to GitHub Failed",
          description: errMsg,
        });
      }
    },
    [project.displayName, project.memberProjects],
  );

  const handleGitPull = useCallback(
    async (targetMember?: SidebarProjectGroupMember) => {
      const member = targetMember ?? project.memberProjects[0];
      if (!member) return;

      const cwd = member.workspaceRoot;

      const gitCheck = await executeTerminalCommand("git rev-parse --is-inside-work-tree", cwd);
      if (!gitCheck.ok || gitCheck.stdout.trim() !== "true") {
        toastManager.add({
          type: "error",
          title: "Git not initialized",
          description: "Git is not initialized in this project directory.",
        });
        return;
      }

      const progressToastId = toastManager.add({
        type: "info",
        title: "Git Pull...",
        description: `Pulling latest changes for "${project.displayName}"...`,
      });

      try {
        let pullResult = await executeTerminalCommand("git pull", cwd);
        if (
          !pullResult.ok &&
          (pullResult.stderr.includes("no tracking information") ||
            pullResult.stderr.includes("set-upstream") ||
            pullResult.stderr.includes("There is no tracking information"))
        ) {
          pullResult = await executeTerminalCommand("git pull origin HEAD", cwd);
        }

        toastManager.close(progressToastId);

        if (pullResult.ok) {
          toastManager.add({
            type: "success",
            title: "Git Pull Successful",
            description:
              pullResult.stdout.trim() || `Pulled latest changes for "${project.displayName}".`,
          });
        } else {
          let desc = pullResult.stderr || pullResult.error || "Failed to pull changes.";
          if (desc.includes("overwritten by merge")) {
            desc =
              "Local files me uncommitted changes hain jo overwrite ho sakti hain. Pehle 'Push to GitHub' karein ya 'Force Pull' karein.";
          }
          toastManager.add({
            type: "error",
            title: "Git Pull Failed",
            description: desc,
          });
        }
      } catch (err) {
        toastManager.close(progressToastId);
        const errMsg = err instanceof Error ? err.message : String(err);
        toastManager.add({
          type: "error",
          title: "Git Pull Failed",
          description: errMsg,
        });
      }
    },
    [project.displayName, project.memberProjects],
  );

  const handleGitFetch = useCallback(
    async (targetMember?: SidebarProjectGroupMember) => {
      const member = targetMember ?? project.memberProjects[0];
      if (!member) return;

      const cwd = member.workspaceRoot;

      const gitCheck = await executeTerminalCommand("git rev-parse --is-inside-work-tree", cwd);
      if (!gitCheck.ok || gitCheck.stdout.trim() !== "true") {
        toastManager.add({
          type: "error",
          title: "Git not initialized",
          description: "Git is not initialized in this project directory.",
        });
        return;
      }

      const progressToastId = toastManager.add({
        type: "info",
        title: "Git Fetch...",
        description: `Fetching remote branches for "${project.displayName}"...`,
      });

      try {
        const fetchResult = await executeTerminalCommand("git fetch --all --prune", cwd);
        toastManager.close(progressToastId);

        if (fetchResult.ok) {
          toastManager.add({
            type: "success",
            title: "Git Fetch Successful",
            description:
              fetchResult.stdout.trim() ||
              `Fetched all remote branches for "${project.displayName}".`,
          });
        } else {
          toastManager.add({
            type: "error",
            title: "Git Fetch Failed",
            description: fetchResult.stderr || fetchResult.error || "Failed to fetch from remote.",
          });
        }
      } catch (err) {
        toastManager.close(progressToastId);
        const errMsg = err instanceof Error ? err.message : String(err);
        toastManager.add({
          type: "error",
          title: "Git Fetch Failed",
          description: errMsg,
        });
      }
    },
    [project.displayName, project.memberProjects],
  );

  const handleForcePull = useCallback(
    async (targetMember?: SidebarProjectGroupMember) => {
      const member = targetMember ?? project.memberProjects[0];
      if (!member) return;

      const cwd = member.workspaceRoot;

      const gitCheck = await executeTerminalCommand("git rev-parse --is-inside-work-tree", cwd);
      if (!gitCheck.ok || gitCheck.stdout.trim() !== "true") {
        toastManager.add({
          type: "error",
          title: "Git not initialized",
          description: "Git is not initialized in this project directory.",
        });
        return;
      }

      const progressToastId = toastManager.add({
        type: "info",
        title: "Force Pull...",
        description: `Forcefully resetting "${project.displayName}" to remote origin...`,
      });

      try {
        const fetchResult = await executeTerminalCommand("git fetch --all", cwd);
        if (!fetchResult.ok) {
          toastManager.close(progressToastId);
          toastManager.add({
            type: "error",
            title: "Git Fetch Failed",
            description: fetchResult.stderr || "Failed to fetch from remote.",
          });
          return;
        }

        const branchResult = await executeTerminalCommand("git rev-parse --abbrev-ref HEAD", cwd);
        const currentBranch = branchResult.ok ? branchResult.stdout.trim() : "main";

        const resetResult = await executeTerminalCommand(
          `git reset --hard origin/${currentBranch}`,
          cwd,
        );
        toastManager.close(progressToastId);

        if (resetResult.ok) {
          toastManager.add({
            type: "success",
            title: "Force Pull Completed",
            description: `Reset branch "${currentBranch}" to origin/${currentBranch}.`,
          });
        } else {
          toastManager.add({
            type: "error",
            title: "Force Pull Failed",
            description:
              resetResult.stderr || resetResult.error || "Failed to reset to remote branch.",
          });
        }
      } catch (err) {
        toastManager.close(progressToastId);
        const errMsg = err instanceof Error ? err.message : String(err);
        toastManager.add({
          type: "error",
          title: "Force Pull Failed",
          description: errMsg,
        });
      }
    },
    [project.displayName, project.memberProjects],
  );

  const handleDownloadZip = useCallback(
    (targetMember?: SidebarProjectGroupMember) => {
      const member = targetMember ?? project.memberProjects[0];
      const workspaceRoot = member?.workspaceRoot ?? project.workspaceRoot;
      if (!workspaceRoot) {
        toastManager.add({
          type: "error",
          title: "Download failed",
          description: "No workspace root found for this project.",
        });
        return;
      }
      const name = member?.title ?? project.displayName;
      toastManager.add({
        type: "info",
        title: "Downloading Project ZIP...",
        description: `Preparing ${name}.zip archive for download.`,
      });
      downloadProjectZip(workspaceRoot, name);
    },
    [project.displayName, project.memberProjects, project.workspaceRoot],
  );

  const handleProjectButtonContextMenu = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      suppressProjectClickForContextMenuRef.current = true;
      void (async () => {
        const api = readLocalApi();
        if (!api) return;

        const actionHandlers = new Map<string, () => Promise<void> | void>();
        const makeLeaf = (
          action:
            | "rename"
            | "open-terminal"
            | "push-github"
            | "git-pull"
            | "git-fetch"
            | "git-force-pull"
            | "copy-path"
            | "delete",
          member: SidebarProjectGroupMember,
          options?: {
            destructive?: boolean;
            disabled?: boolean;
          },
        ): ContextMenuItem<string> => {
          const id = `${action}:${member.physicalProjectKey}`;
          actionHandlers.set(id, () => {
            switch (action) {
              case "rename":
                openProjectRenameDialog(member);
                return;
              case "open-terminal":
                void handleOpenInTerminal(member);
                return;
              case "download-zip":
                handleDownloadZip(member);
                return;
              case "push-github":
                void handlePushToGithub(member);
                return;
              case "git-pull":
                void handleGitPull(member);
                return;
              case "git-fetch":
                void handleGitFetch(member);
                return;
              case "git-force-pull":
                void handleForcePull(member);
                return;
              case "copy-path":
                copyPathToClipboard(member.workspaceRoot, { path: member.workspaceRoot });
                return;
              case "delete":
                return handleRemoveProject(member);
            }
          });

          return {
            id,
            label: formatProjectMemberActionLabel(member, project.groupedProjectCount),
            ...(options?.destructive ? { destructive: true } : {}),
            ...(options?.disabled ? { disabled: true } : {}),
          };
        };

        const buildTargetedItem = (
          action:
            | "rename"
            | "open-terminal"
            | "download-zip"
            | "push-github"
            | "git-pull"
            | "git-fetch"
            | "git-force-pull"
            | "copy-path"
            | "delete",
          label: string,
          options?: {
            destructive?: boolean;
            isDisabled?: (member: SidebarProjectGroupMember) => boolean;
            icon?: string;
          },
        ): ContextMenuItem<string> => {
          if (project.memberProjects.length === 1) {
            const singleMember = project.memberProjects[0]!;
            return {
              ...makeLeaf(action, singleMember, {
                ...(options?.destructive ? { destructive: true } : {}),
                ...(options?.isDisabled?.(singleMember) ? { disabled: true } : {}),
              }),
              label,
              ...(action === "delete"
                ? { icon: "trash" }
                : options?.icon
                  ? { icon: options.icon }
                  : {}),
            };
          }

          return {
            id: `${action}:submenu`,
            label,
            ...(action === "delete"
              ? { icon: "trash" }
              : options?.icon
                ? { icon: options.icon }
                : {}),
            children: project.memberProjects.map((member) =>
              makeLeaf(action, member, {
                ...(options?.destructive ? { destructive: true } : {}),
                ...(options?.isDisabled?.(member) ? { disabled: true } : {}),
              }),
            ),
          };
        };

        actionHandlers.set("project-settings", () => {
          if (isMobile) setOpenMobile(false);
          void router.navigate({
            to: "/projects/$projectKey",
            params: { projectKey: project.projectKey },
          });
        });

        const clicked = await api.contextMenu.show(
          [
            buildTargetedItem("rename", "Rename", {
              isDisabled: (member) =>
                !readEnvironmentScope(member.environmentId, AuthOrchestrationOperateScope),
            }),
            buildTargetedItem("open-terminal", "Open in Terminal", { icon: "terminal" }),
            buildTargetedItem("download-zip", "Download ZIP", { icon: "archive" }),
            buildTargetedItem("push-github", "Push to GitHub", { icon: "upload" }),
            buildTargetedItem("git-pull", "Git Pull", { icon: "download" }),
            buildTargetedItem("git-fetch", "Git Fetch", { icon: "refresh-cw" }),
            buildTargetedItem("git-force-pull", "Force Pull (Reset Hard)", {
              destructive: true,
              icon: "rotate-ccw",
            }),
            buildTargetedItem("copy-path", "Copy Path"),
            { id: "project-settings", label: "Project settings", icon: "settings" },
            buildTargetedItem("delete", "Remove", {
              destructive: true,
              isDisabled: (member) =>
                !readEnvironmentScope(member.environmentId, AuthOrchestrationOperateScope),
            }),
          ],
          {
            x: event.clientX,
            y: event.clientY,
          },
        );

        if (!clicked) {
          return;
        }

        await actionHandlers.get(clicked)?.();
      })();
    },
    [
      copyPathToClipboard,
      handleDownloadZip,
      handleForcePull,
      handleGitFetch,
      handleGitPull,
      handleOpenInTerminal,
      handlePushToGithub,
      handleRemoveProject,
      isMobile,
      openProjectRenameDialog,
      project.groupedProjectCount,
      project.memberProjects,
      project.projectKey,
      router,
      setOpenMobile,
      suppressProjectClickForContextMenuRef,
    ],
  );
  const handleThreadFileDrop = useCallback(
    async (threadRef: ScopedThreadRef, files: File[]) => {
      const dropId = queuePendingFileDrop({ threadRef, files });
      const targetPathname = router.buildLocation({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(threadRef),
      }).pathname;
      if (targetPathname === router.state.location.pathname) return;
      try {
        await navigateToThread(threadRef);
        if (targetPathname !== router.state.location.pathname) {
          clearPendingFileDrop(dropId);
        }
      } catch {
        clearPendingFileDrop(dropId);
      }
    },
    [clearPendingFileDrop, navigateToThread, queuePendingFileDrop, router],
  );

  const handleThreadClick = useCallback(
    (
      event: React.MouseEvent,
      threadRef: ScopedThreadRef,
      orderedProjectThreadKeys: readonly string[],
    ) => {
      if (isSidebarNestedLinkClick(event.target)) return;
      const isMac = isMacPlatform(navigator.platform);
      const isModClick = isMac ? event.metaKey : event.ctrlKey;
      const isShiftClick = event.shiftKey;
      const threadKey = scopedThreadKey(threadRef);
      const currentSelectionCount = useThreadSelectionStore.getState().selectedThreadKeys.size;

      if (isModClick) {
        event.preventDefault();
        toggleThreadSelection(threadKey);
        return;
      }

      if (isShiftClick) {
        event.preventDefault();
        rangeSelectTo(threadKey, orderedProjectThreadKeys);
        return;
      }

      // Ignore the trailing click of a plain double-click so it doesn't navigate
      // while a double-click is starting an inline rename. Placed after the
      // modifier branches so cmd/shift selection still processes every click.
      if (isTrailingDoubleClick(event.detail)) {
        return;
      }

      if (currentSelectionCount > 0) {
        clearSelection();
      }
      setSelectionAnchor(threadKey);
      if (isMobile) {
        setOpenMobile(false);
      }
      void router.navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(threadRef),
      });
    },
    [
      clearSelection,
      isMobile,
      rangeSelectTo,
      router,
      setOpenMobile,
      setSelectionAnchor,
      toggleThreadSelection,
    ],
  );

  const handleMultiSelectContextMenu = useCallback(
    async (position: { x: number; y: number }) => {
      const api = readLocalApi();
      if (!api) return;
      const threadKeys = [...useThreadSelectionStore.getState().selectedThreadKeys];
      if (threadKeys.length === 0) return;
      const count = threadKeys.length;
      const selectedThreadEntries = threadKeys.flatMap((threadKey) => {
        const threadRef = parseScopedThreadKey(threadKey);
        const thread = threadRef ? readThreadShell(threadRef) : null;
        return threadRef && thread ? [{ threadKey, threadRef, thread }] : [];
      });
      const hasRunningThread = selectedThreadEntries.some(
        ({ thread }) => !threadRuntimeCanArchive(thread.runtime),
      );
      const canOperateSelection = selectedThreadEntries.every(({ threadRef }) =>
        readEnvironmentScope(threadRef.environmentId, AuthOrchestrationOperateScope),
      );

      const clicked = await api.contextMenu.show(
        buildMultiSelectThreadContextMenuItems({ count, hasRunningThread }).map((item) =>
          item.id === "archive" || item.id === "delete"
            ? { ...item, disabled: item.disabled || !canOperateSelection }
            : item,
        ),
        position,
      );

      if (clicked === "mark-unread") {
        for (const { threadRef } of selectedThreadEntries) {
          markThreadUnread(threadRef);
        }
        clearSelection();
        return;
      }

      if (
        (clicked === "archive" || clicked === "delete") &&
        !selectedThreadEntries.every(({ threadRef }) =>
          checkTaskPermission(threadRef.environmentId),
        )
      ) {
        return;
      }

      if (clicked === "archive") {
        if (appSettingsConfirmThreadArchive) {
          const confirmed = await api.dialogs.confirm(
            `Archive ${count} thread${count === 1 ? "" : "s"}?`,
          );
          if (!confirmed) return;
        }
        if (
          !selectedThreadEntries.every(({ threadRef }) =>
            checkTaskPermission(threadRef.environmentId),
          )
        ) {
          return;
        }

        const archiveOutcome = await archiveSelectedThreadEntries({
          entries: selectedThreadEntries,
          archive: ({ threadRef }, onArchived) => archiveThread(threadRef, { onArchived }),
        });
        for (const failure of archiveOutcome.followupFailures) {
          if (isAtomCommandInterrupted(failure)) continue;
          const error = squashAtomCommandFailure(failure);
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Thread archived, but navigation failed",
              description: error instanceof Error ? error.message : "An error occurred.",
            }),
          );
        }
        if (archiveOutcome.mutationFailure) {
          removeFromSelection(archiveOutcome.archivedThreadKeys);
          if (!isAtomCommandInterrupted(archiveOutcome.mutationFailure)) {
            const error = squashAtomCommandFailure(archiveOutcome.mutationFailure);
            toastManager.add(
              stackedThreadToast({
                type: "error",
                title: "Failed to archive threads",
                description: error instanceof Error ? error.message : "An error occurred.",
              }),
            );
          }
          return;
        }
        removeFromSelection(threadKeys);
        return;
      }

      if (clicked !== "delete") return;

      if (appSettingsConfirmThreadDelete) {
        const confirmed = await api.dialogs.confirm(
          [
            `Delete ${count} thread${count === 1 ? "" : "s"}?`,
            "This permanently clears conversation history for these threads.",
          ].join("\n"),
          { variant: "destructive" },
        );
        if (!confirmed) return;
      }
      if (
        !selectedThreadEntries.every(({ threadRef }) =>
          checkTaskPermission(threadRef.environmentId),
        )
      ) {
        return;
      }

      const { deletedThreadKeys, firstFailure } = await deleteSelectedThreadEntries({
        entries: selectedThreadEntries,
        delete: ({ threadRef }, deletedThreadKeys) =>
          deleteThread(threadRef, { deletedThreadKeys }),
      });
      if (firstFailure !== null) {
        const firstError = squashAtomCommandFailure(firstFailure);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Failed to delete threads",
            description: firstError instanceof Error ? firstError.message : "An error occurred.",
          }),
        );
      }
      removeFromSelection(
        getThreadKeysToDeselectAfterDelete(threadKeys, deletedThreadKeys, (threadKey) => {
          const threadRef = parseScopedThreadKey(threadKey);
          return threadRef !== null && readThreadShell(threadRef) !== null;
        }),
      );
    },
    [
      appSettingsConfirmThreadArchive,
      appSettingsConfirmThreadDelete,
      archiveThread,
      clearSelection,
      deleteThread,
      markThreadUnread,
      removeFromSelection,
    ],
  );

  const createThreadForProjectMember = useCallback(
    (member: SidebarProjectGroupMember) => {
      terminalStore.setQuickBarOpen(false);
      if (isMobile) {
        setOpenMobile(false);
      }
      void (async () => {
        // No options: branch, worktree, and env mode come from the user's
        // configured defaults, never from the currently viewed thread.
        const result = await settlePromise(() =>
          handleNewThread(scopeProjectRef(member.environmentId, member.id)),
        );
        if (result._tag === "Failure") {
          const error = squashAtomCommandFailure(result);
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Could not create thread",
              description: error instanceof Error ? error.message : "An error occurred.",
            }),
          );
        }
      })();
    },
    [handleNewThread, isMobile, setOpenMobile],
  );

  const handleCreateThreadClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setProjectExpanded(projectPreferenceKeys, true);

      if (project.memberProjects.length === 1) {
        createThreadForProjectMember(project.memberProjects[0]!);
        return;
      }

      void (async () => {
        const api = readLocalApi();
        if (!api) {
          return;
        }
        const clickedResult = await settlePromise(() =>
          api.contextMenu.show(
            project.memberProjects.map((member) => ({
              id: member.physicalProjectKey,
              label: formatProjectMemberActionLabel(member, project.groupedProjectCount),
            })),
            {
              x: event.clientX,
              y: event.clientY,
            },
          ),
        );
        if (clickedResult._tag === "Failure") {
          const error = squashAtomCommandFailure(clickedResult);
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Could not choose environment",
              description: error instanceof Error ? error.message : "An error occurred.",
            }),
          );
          return;
        }
        const clicked = clickedResult.value;
        if (!clicked) {
          return;
        }
        const targetMember = project.memberProjects.find(
          (member) => member.physicalProjectKey === clicked,
        );
        if (!targetMember) {
          return;
        }
        createThreadForProjectMember(targetMember);
      })();
    },
    [
      createThreadForProjectMember,
      project.groupedProjectCount,
      project.memberProjects,
      projectPreferenceKeys,
      setProjectExpanded,
    ],
  );

  const handleNewChat = useCallback(() => {
    terminalStore.setQuickBarOpen(false);
    setProjectExpanded(projectPreferenceKeys, true);
    if (project.memberProjects.length === 1) {
      createThreadForProjectMember(project.memberProjects[0]!);
      return;
    }
    createThreadForProjectMember(project.memberProjects[0]!);
  }, [
    createThreadForProjectMember,
    project.memberProjects,
    projectPreferenceKeys,
    setProjectExpanded,
  ]);

  const handleClearAllChats = useCallback(async () => {
    if (projectThreads.length === 0) {
      toastManager.add({
        type: "info",
        title: "No chats to clear",
        description: `"${project.displayName}" has no chats.`,
      });
      return;
    }

    const api = readLocalApi();
    if (api) {
      const confirmed = await api.dialogs.confirm(
        [
          `Clear all chats in "${project.displayName}"?`,
          `This will permanently delete ${projectThreads.length} chat${projectThreads.length === 1 ? "" : "s"}.`,
          "The project itself will remain intact.",
        ].join("\n"),
        { variant: "destructive" },
      );
      if (!confirmed) return;
    }

    const threadKeys = projectThreads.map((thread) =>
      scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
    );
    const selectedThreadEntries = threadKeys.flatMap((threadKey) => {
      const threadRef = parseScopedThreadKey(threadKey);
      const thread = threadRef ? readThreadShell(threadRef) : null;
      return threadRef && thread ? [{ threadKey, threadRef, thread }] : [];
    });

    const { deletedThreadKeys, firstFailure } = await deleteSelectedThreadEntries({
      entries: selectedThreadEntries,
      delete: ({ threadRef }, deletedKeys) =>
        deleteThread(threadRef, { deletedThreadKeys: deletedKeys }),
    });

    if (deletedThreadKeys.size > 0) {
      removeFromSelection([...deletedThreadKeys]);
    }

    if (firstFailure !== null && !isAtomCommandInterrupted(firstFailure)) {
      const firstError = squashAtomCommandFailure(firstFailure);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Failed to clear all chats",
          description: firstError instanceof Error ? firstError.message : "An error occurred.",
        }),
      );
    } else {
      toastManager.add({
        type: "success",
        title: "Chats cleared",
        description: `Cleared ${deletedThreadKeys.size} chat${deletedThreadKeys.size === 1 ? "" : "s"} from "${project.displayName}".`,
      });
    }
  }, [deleteThread, project.displayName, projectThreads, removeFromSelection]);

  const handleDeleteProject = useCallback(async () => {
    const api = readLocalApi();
    if (!api) return;

    for (const member of project.memberProjects) {
      if (!checkTaskPermission(member.environmentId)) return;
      const memberProjectRef = scopeProjectRef(member.environmentId, member.id);
      const latestProjectThreads = Array.from(sidebarThreadByKeyRef.current.values()).filter(
        (thread) =>
          thread.environmentId === memberProjectRef.environmentId &&
          thread.projectId === memberProjectRef.projectId,
      );

      const message =
        latestProjectThreads.length > 0
          ? [
              `Delete project "${member.title}" and its ${latestProjectThreads.length} chat${
                latestProjectThreads.length === 1 ? "" : "s"
              }?`,
              `Path: ${member.workspaceRoot}`,
              ...(member.environmentLabel ? [`Environment: ${member.environmentLabel}`] : []),
              "This permanently clears conversation history for these chats.",
              "This action cannot be undone.",
            ].join("\n")
          : [
              `Delete project "${member.title}"?`,
              `Path: ${member.workspaceRoot}`,
              ...(member.environmentLabel ? [`Environment: ${member.environmentLabel}`] : []),
              "This permanently removes this project from T3 Code.",
            ].join("\n");

      const confirmed = await api.dialogs.confirm(message, { variant: "destructive" });
      if (!confirmed) return;

      const result = await removeProject(member);
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: `Failed to delete "${member.title}"`,
            description: error instanceof Error ? error.message : "Unknown error deleting project.",
          }),
        );
      } else {
        toastManager.add({
          type: "success",
          title: "Project deleted",
          description: `"${member.title}" was removed.`,
        });
      }
    }
  }, [project.memberProjects, removeProject]);

  const attemptArchiveThread = useCallback(
    async (threadRef: ScopedThreadRef) => {
      if (!checkTaskPermission(threadRef.environmentId)) return;
      const result = await archiveThread(threadRef);
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Failed to archive thread",
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
      }
    },
    [archiveThread],
  );

  const cancelRename = useCallback(() => {
    setRenamingThreadKey(null);
    renamingInputRef.current = null;
  }, []);

  const startThreadRename = useCallback((threadKey: string, title: string) => {
    const threadRef = parseScopedThreadKey(threadKey);
    if (!threadRef || !checkTaskPermission(threadRef.environmentId)) return;
    setRenamingThreadKey(threadKey);
    setRenamingTitle(title);
    renamingCommittedRef.current = false;
  }, []);

  const commitRename = useCallback(
    async (threadRef: ScopedThreadRef, newTitle: string, originalTitle: string) => {
      const threadKey = scopedThreadKey(threadRef);
      const finishRename = () => {
        setRenamingThreadKey((current) => {
          if (current !== threadKey) return current;
          renamingInputRef.current = null;
          return null;
        });
      };

      const trimmed = newTitle.trim();
      if (trimmed.length === 0) {
        toastManager.add({
          type: "warning",
          title: "Thread title cannot be empty",
        });
        finishRename();
        return;
      }
      if (trimmed === originalTitle) {
        finishRename();
        return;
      }
      const result = await updateThreadMetadata({
        environmentId: threadRef.environmentId,
        input: {
          threadId: threadRef.threadId,
          title: trimmed,
        },
      });
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Failed to rename thread",
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
      }
      finishRename();
    },
    [updateThreadMetadata],
  );

  const closeProjectRenameDialog = useCallback(() => {
    setProjectRenameTarget(null);
    setProjectRenameTitle("");
  }, []);

  const submitProjectRename = useCallback(async () => {
    if (!projectRenameTarget) {
      return;
    }

    const trimmed = projectRenameTitle.trim();
    if (trimmed.length === 0) {
      toastManager.add({
        type: "warning",
        title: "Project title cannot be empty",
      });
      return;
    }

    if (trimmed === projectRenameTarget.title) {
      closeProjectRenameDialog();
      return;
    }

    const result = await updateProject({
      environmentId: projectRenameTarget.environmentId,
      input: {
        projectId: projectRenameTarget.id,
        title: trimmed,
      },
    });
    if (result._tag === "Success") {
      closeProjectRenameDialog();
    } else if (!isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Failed to rename project",
          description: error instanceof Error ? error.message : "An error occurred.",
        }),
      );
    }
  }, [closeProjectRenameDialog, projectRenameTarget, projectRenameTitle, updateProject]);

  const closeProjectGroupingDialog = useCallback(() => {
    setProjectGroupingTarget(null);
    setProjectGroupingSelection("inherit");
  }, []);

  const saveProjectGroupingPreference = useCallback(() => {
    if (!projectGroupingTarget) {
      return;
    }

    const overrideKey = deriveProjectGroupingOverrideKey(projectGroupingTarget);
    const nextOverrides = {
      ...projectGroupingSettings.sidebarProjectGroupingOverrides,
    };
    if (projectGroupingSelection === "inherit") {
      delete nextOverrides[overrideKey];
    } else {
      nextOverrides[overrideKey] = projectGroupingSelection;
    }
    updateSettings({
      sidebarProjectGroupingOverrides: nextOverrides,
    });
    closeProjectGroupingDialog();
  }, [
    closeProjectGroupingDialog,
    projectGroupingSelection,
    projectGroupingSettings.sidebarProjectGroupingOverrides,
    projectGroupingTarget,
    updateSettings,
  ]);

  const handleThreadContextMenu = useCallback(
    async (threadRef: ScopedThreadRef, position: { x: number; y: number }) => {
      const api = readLocalApi();
      if (!api) return;
      const threadKey = scopedThreadKey(threadRef);
      const thread = sidebarThreadByKeyRef.current.get(threadKey) ?? null;
      if (!thread) return;
      const threadProject = memberProjectByScopedKey.get(
        scopedProjectKey(scopeProjectRef(thread.environmentId, thread.projectId)),
      );
      const threadWorkspacePath =
        thread.worktreePath ?? threadProject?.workspaceRoot ?? project.workspaceRoot ?? null;
      const canOperateThread = readEnvironmentScope(
        thread.environmentId,
        AuthOrchestrationOperateScope,
      );
      const clicked = await api.contextMenu.show(
        [
          ...(thread.branch
            ? [{ id: "new-thread-on-branch", label: `New thread on ${thread.branch}` }]
            : []),
          { id: "rename", label: "Rename thread", disabled: !canOperateThread },
          { id: "mark-unread", label: "Mark unread" },
          { id: "copy-path", label: "Copy Path" },
          { id: "copy-thread-id", label: "Copy Thread ID" },
          { id: "project-settings", label: "Project settings" },
          {
            id: "delete",
            label: "Delete",
            destructive: true,
            icon: "trash",
            disabled: !canOperateThread,
          },
        ],
        position,
      );

      if (clicked === "project-settings") {
        if (isMobile) setOpenMobile(false);
        void router.navigate({
          to: "/projects/$projectKey",
          params: { projectKey: project.projectKey },
        });
        return;
      }

      if (clicked === "new-thread-on-branch") {
        // Explicit branch carry-over: reuse the thread's worktree when it
        // has one, otherwise its branch on the local checkout.
        const result = await settlePromise(() =>
          handleNewThread(scopeProjectRef(thread.environmentId, thread.projectId), {
            branch: thread.branch,
            worktreePath: thread.worktreePath,
            envMode: thread.worktreePath ? "worktree" : "local",
            startFromOrigin: false,
          }),
        );
        if (result._tag === "Failure") {
          const error = squashAtomCommandFailure(result);
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Could not create thread",
              description: error instanceof Error ? error.message : "An error occurred.",
            }),
          );
        }
        return;
      }

      if (clicked === "rename") {
        startThreadRename(threadKey, thread.title);
        return;
      }

      if (clicked === "mark-unread") {
        markThreadUnread(threadRef);
        return;
      }
      if (clicked === "copy-path") {
        if (!threadWorkspacePath) {
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Path unavailable",
              description: "This thread does not have a workspace path to copy.",
            }),
          );
          return;
        }
        copyPathToClipboard(threadWorkspacePath, { path: threadWorkspacePath });
        return;
      }
      if (clicked === "copy-thread-id") {
        copyThreadIdToClipboard(thread.id, { threadId: thread.id });
        return;
      }
      if (clicked !== "delete") return;
      if (!checkTaskPermission(threadRef.environmentId)) return;
      if (appSettingsConfirmThreadDelete) {
        const confirmed = await api.dialogs.confirm(
          [
            `Delete thread "${thread.title}"?`,
            "This permanently clears conversation history for this thread.",
          ].join("\n"),
          { variant: "destructive" },
        );
        if (!confirmed) {
          return;
        }
      }
      if (!checkTaskPermission(threadRef.environmentId)) return;
      const result = await deleteThread(threadRef);
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Failed to delete thread",
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
      }
    },
    [
      appSettingsConfirmThreadDelete,
      copyPathToClipboard,
      copyThreadIdToClipboard,
      deleteThread,
      handleNewThread,
      isMobile,
      markThreadUnread,
      memberProjectByScopedKey,
      project.projectKey,
      project.workspaceRoot,
      router,
      setOpenMobile,
      startThreadRename,
    ],
  );

  return (
    <>
      <div className="group/project-header relative w-full my-0">
        <SidebarMenuButton
          render={<div role="button" tabIndex={0} />}
          ref={isManualProjectSorting ? dragHandleProps?.setActivatorNodeRef : undefined}
          className={cn(
            "flex items-center justify-between w-full h-9 px-3 pr-2 select-none rounded-none! transition-colors duration-150",
            projectExpanded &&
              shouldShowThreadPanel &&
              "border-b border-sidebar-border/30 dark:border-zinc-700/30",
            projectExpanded
              ? "bg-zinc-200/30 dark:bg-zinc-800/30 text-foreground font-semibold"
              : "bg-zinc-200/15 dark:bg-zinc-800/15 hover:bg-zinc-200/30 dark:hover:bg-zinc-800/30 text-foreground/90 font-medium",
            isManualProjectSorting && "cursor-grab active:cursor-grabbing",
          )}
          {...(isManualProjectSorting && dragHandleProps ? dragHandleProps.attributes : {})}
          {...(isManualProjectSorting && dragHandleProps ? dragHandleProps.listeners : {})}
          onPointerDownCapture={handleProjectButtonPointerDownCapture}
          onClick={handleProjectButtonClick}
          onKeyDown={handleProjectButtonKeyDown}
          onContextMenu={handleProjectButtonContextMenu}
        >
          {/* Left Side: Project title only - no icons */}
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate text-[13px] font-semibold tracking-[-0.015em] text-sidebar-foreground">
              {project.displayName}
            </span>
            {project.groupedProjectCount > 1 ? (
              <span className="shrink-0 rounded-full bg-sidebar-muted/30 px-1.5 py-0.5 text-[10px] font-medium text-sidebar-muted-foreground/90">
                {project.groupedProjectCount} projects
              </span>
            ) : null}
          </span>

          {/* Right Side: Options Menu & Collapse Arrow */}
          <div
            className="flex items-center gap-1 shrink-0 ml-auto"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {!projectExpanded && projectStatus && (
              <span
                title={projectStatus.label}
                className={cn(
                  "size-2 rounded-full shrink-0 mr-0.5",
                  projectStatus.dotClass,
                  projectStatus.pulse && "animate-status-pulse",
                )}
              />
            )}

            <Menu>
              <MenuTrigger
                render={
                  <button
                    type="button"
                    aria-label={`Options for ${project.displayName}`}
                    data-testid="project-more-options-button"
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-black/10 dark:hover:bg-white/10 active:scale-95 transition-all duration-150 cursor-pointer"
                  >
                    <MoreVerticalIcon className="size-3.5" />
                  </button>
                }
              />
              <MenuPopup align="end" side="bottom" className="min-w-44">
                <MenuItem
                  onClick={() => {
                    handleNewChat();
                  }}
                >
                  <PlusIcon className="size-4" />
                  <MenuItemLabel>New Chat</MenuItemLabel>
                  {newThreadShortcutLabel ? (
                    <span className="ml-auto text-3xs text-muted-foreground/60">
                      {newThreadShortcutLabel}
                    </span>
                  ) : null}
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    void handleOpenInTerminal();
                  }}
                >
                  <TerminalIcon className="size-4" />
                  <MenuItemLabel>Open in Terminal</MenuItemLabel>
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    handleDownloadZip();
                  }}
                >
                  <FileArchiveIcon className="size-4 text-sky-400" />
                  <MenuItemLabel>Download ZIP</MenuItemLabel>
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    void handlePushToGithub();
                  }}
                >
                  <UploadCloudIcon className="size-4" />
                  <MenuItemLabel>Push to GitHub</MenuItemLabel>
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    void handleGitPull();
                  }}
                >
                  <DownloadCloudIcon className="size-4" />
                  <MenuItemLabel>Git Pull</MenuItemLabel>
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    void handleGitFetch();
                  }}
                >
                  <RefreshCwIcon className="size-4" />
                  <MenuItemLabel>Git Fetch</MenuItemLabel>
                </MenuItem>
                <MenuItem
                  variant="destructive"
                  onClick={() => {
                    void handleForcePull();
                  }}
                >
                  <RotateCcwIcon className="size-4" />
                  <MenuItemLabel>Force Pull (Reset Hard)</MenuItemLabel>
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    void handleClearAllChats();
                  }}
                  disabled={projectThreads.length === 0}
                >
                  <EraserIcon className="size-4" />
                  <MenuItemLabel>Clear Chats</MenuItemLabel>
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  variant="destructive"
                  onClick={() => {
                    void handleDeleteProject();
                  }}
                >
                  <Trash2Icon className="size-4" />
                  <MenuItemLabel>Delete Project</MenuItemLabel>
                </MenuItem>
              </MenuPopup>
            </Menu>

            <button
              type="button"
              aria-label={
                projectExpanded
                  ? `Collapse ${project.displayName}`
                  : `Expand ${project.displayName}`
              }
              data-testid="project-collapse-button"
              onClick={(e) => {
                e.stopPropagation();
                setProjectExpanded(projectPreferenceKeys, !projectExpanded);
              }}
              className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-black/10 dark:hover:bg-white/10 active:scale-95 transition-all duration-150 cursor-pointer"
            >
              <ChevronRightIcon
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out",
                  projectExpanded ? "rotate-90 text-foreground" : "rotate-0",
                )}
              />
            </button>
          </div>
        </SidebarMenuButton>
      </div>

      <SidebarProjectThreadList
        projectKey={project.projectKey}
        projectExpanded={projectExpanded}
        hasOverflowingThreads={hasOverflowingThreads}
        hiddenThreadStatus={hiddenThreadStatus}
        orderedProjectThreadKeys={orderedProjectThreadKeys}
        renderedThreads={renderedThreads}
        showEmptyThreadState={showEmptyThreadState}
        shouldShowThreadPanel={shouldShowThreadPanel}
        isThreadListExpanded={isThreadListExpanded}
        activeRouteThreadKey={activeRouteThreadKey}
        openPullRequestsInRightPanel={openPullRequestsInRightPanel}
        threadJumpLabelByKey={threadJumpLabelByKey}
        appSettingsConfirmThreadArchive={appSettingsConfirmThreadArchive}
        renamingThreadKey={renamingThreadKey}
        renamingTitle={renamingTitle}
        setRenamingTitle={setRenamingTitle}
        startThreadRename={startThreadRename}
        renamingInputRef={renamingInputRef}
        renamingCommittedRef={renamingCommittedRef}
        confirmingArchiveThreadKey={confirmingArchiveThreadKey}
        setConfirmingArchiveThreadKey={setConfirmingArchiveThreadKey}
        confirmArchiveButtonRefs={confirmArchiveButtonRefs}
        attachThreadListAutoAnimateRef={attachThreadListAutoAnimateRef}
        handleThreadClick={handleThreadClick}
        navigateToThread={navigateToThread}
        onFileDropThreads={handleThreadFileDrop}
        handleMultiSelectContextMenu={handleMultiSelectContextMenu}
        handleThreadContextMenu={handleThreadContextMenu}
        clearSelection={clearSelection}
        commitRename={commitRename}
        cancelRename={cancelRename}
        attemptArchiveThread={attemptArchiveThread}
        openPrLink={openPrLink}
        expandThreadListForProject={expandThreadListForProject}
        collapseThreadListForProject={collapseThreadListForProject}
      />

      <Dialog
        open={projectRenameTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeProjectRenameDialog();
          }
        }}
      >
        <DialogPopup className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
            <DialogDescription>
              {projectRenameTarget
                ? `Update the title for ${projectRenameTarget.workspaceRoot}.`
                : "Update the project title."}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="grid gap-1.5">
              <span className="text-xs font-medium text-foreground">Project title</span>
              <Input
                aria-label="Project title"
                disabled={!canRenameProject}
                value={projectRenameTitle}
                onChange={(event) => setProjectRenameTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void submitProjectRename();
                  }
                }}
              />
            </div>
            {projectRenameTarget?.environmentLabel ? (
              <p className="text-xs text-muted-foreground">
                Environment: {projectRenameTarget.environmentLabel}
              </p>
            ) : null}
            {!canRenameProject ? (
              <p className="text-xs text-muted-foreground">
                This connection cannot change projects.
              </p>
            ) : null}
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" onClick={closeProjectRenameDialog}>
              Cancel
            </Button>
            <Button disabled={!canRenameProject} onClick={() => void submitProjectRename()}>
              Save
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <Dialog
        open={projectGroupingTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeProjectGroupingDialog();
          }
        }}
      >
        <DialogPopup className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Project grouping</DialogTitle>
            <DialogDescription>
              {projectGroupingTarget
                ? `Choose how ${projectGroupingTarget.workspaceRoot} should be grouped in the sidebar.`
                : "Choose how this project should be grouped in the sidebar."}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="grid gap-1.5">
              <span className="text-xs font-medium text-foreground">Grouping rule</span>
              <Select
                value={projectGroupingSelection}
                onValueChange={(value) => {
                  if (
                    value === "inherit" ||
                    value === "repository" ||
                    value === "repository_path" ||
                    value === "separate"
                  ) {
                    setProjectGroupingSelection(value);
                  }
                }}
              >
                <SelectTrigger className="w-full" aria-label="Project grouping rule">
                  <SelectValue>
                    {projectGroupingSelection === "inherit"
                      ? `Use global default (${PROJECT_GROUPING_MODE_LABELS[projectGroupingSettings.sidebarProjectGroupingMode]})`
                      : PROJECT_GROUPING_MODE_LABELS[projectGroupingSelection]}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem hideIndicator value="inherit">
                    Use global default
                  </SelectItem>
                  <SelectItem hideIndicator value="repository">
                    {PROJECT_GROUPING_MODE_LABELS.repository}
                  </SelectItem>
                  <SelectItem hideIndicator value="repository_path">
                    {PROJECT_GROUPING_MODE_LABELS.repository_path}
                  </SelectItem>
                  <SelectItem hideIndicator value="separate">
                    {PROJECT_GROUPING_MODE_LABELS.separate}
                  </SelectItem>
                </SelectPopup>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              {projectGroupingSelection === "inherit"
                ? projectGroupingModeDescription(projectGroupingSettings.sidebarProjectGroupingMode)
                : projectGroupingModeDescription(projectGroupingSelection)}
            </p>
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" onClick={closeProjectGroupingDialog}>
              Cancel
            </Button>
            <Button onClick={saveProjectGroupingPreference}>Save</Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
});

const SidebarProjectListRow = memo(function SidebarProjectListRow(props: SidebarProjectItemProps) {
  return (
    <SidebarMenuItem className="w-full rounded-none border-b border-sidebar-border/30 dark:border-zinc-700/30">
      <SidebarProjectItem {...props} />
    </SidebarMenuItem>
  );
});

function LocalSecondaryStatus() {
  return null;
}

type SortableProjectHandleProps = Pick<
  ReturnType<typeof useSortable>,
  "attributes" | "listeners" | "setActivatorNodeRef"
>;

function ProjectSortMenu({
  projectSortOrder,
  threadSortOrder,
  threadPreviewCount,
  onProjectSortOrderChange,
  onThreadSortOrderChange,
  onThreadPreviewCountChange,
}: {
  projectSortOrder: SidebarProjectSortOrder;
  threadSortOrder: SidebarThreadSortOrder;
  threadPreviewCount: SidebarThreadPreviewCount;
  onProjectSortOrderChange: (sortOrder: SidebarProjectSortOrder) => void;
  onThreadSortOrderChange: (sortOrder: SidebarThreadSortOrder) => void;
  onThreadPreviewCountChange: (count: SidebarThreadPreviewCount) => void;
}) {
  const handleThreadPreviewCountChange = useCallback(
    (nextValue: number | null) => {
      if (nextValue === null) {
        return;
      }

      const clampedValue = clampSidebarThreadPreviewCount(nextValue);
      if (clampedValue !== threadPreviewCount) {
        onThreadPreviewCountChange(clampedValue);
      }
    },
    [onThreadPreviewCountChange, threadPreviewCount],
  );

  return (
    <Menu>
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger
              render={<Button size="icon-xs" variant="ghost-muted" aria-label="Sidebar options" />}
            />
          }
        >
          <ArrowUpDownIcon className="size-3.5" />
        </TooltipTrigger>
        <TooltipPopup side="right">Sidebar options</TooltipPopup>
      </Tooltip>
      <MenuPopup align="end" side="bottom">
        <MenuGroup>
          <div className="px-2 py-1 sm:text-xs font-medium text-muted-foreground">
            Sort projects
          </div>
          <MenuRadioGroup
            value={projectSortOrder}
            onValueChange={(value) => {
              onProjectSortOrderChange(value as SidebarProjectSortOrder);
            }}
          >
            {(Object.entries(SIDEBAR_SORT_LABELS) as Array<[SidebarProjectSortOrder, string]>).map(
              ([value, label]) => (
                <MenuRadioItem key={value} value={value}>
                  {label}
                </MenuRadioItem>
              ),
            )}
          </MenuRadioGroup>
        </MenuGroup>
        <MenuGroup>
          <div className="px-2 pt-2 pb-1 sm:text-xs font-medium text-muted-foreground">
            Sort threads
          </div>
          <MenuRadioGroup
            value={threadSortOrder}
            onValueChange={(value) => {
              onThreadSortOrderChange(value as SidebarThreadSortOrder);
            }}
          >
            {(
              Object.entries(SIDEBAR_THREAD_SORT_LABELS) as Array<[SidebarThreadSortOrder, string]>
            ).map(([value, label]) => (
              <MenuRadioItem key={value} value={value}>
                {label}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
        <MenuGroup>
          <div className="px-2 pt-2 pb-1 text-muted-foreground sm:text-xs font-medium">
            Visible threads
          </div>
          <div className="px-2 py-1">
            <NumberField
              aria-label="Visible thread count"
              className="w-28"
              max={MAX_SIDEBAR_THREAD_PREVIEW_COUNT}
              min={MIN_SIDEBAR_THREAD_PREVIEW_COUNT}
              onValueChange={handleThreadPreviewCountChange}
              size="sm"
              step={1}
              value={threadPreviewCount}
            >
              <NumberFieldGroup>
                <NumberFieldDecrement
                  aria-label="Decrease visible thread count"
                  className="[&_svg]:size-3.5"
                />
                <NumberFieldInput
                  aria-label="Visible thread count"
                  inputMode="numeric"
                  onKeyDownCapture={(event) => {
                    event.stopPropagation();
                  }}
                />
                <NumberFieldIncrement
                  aria-label="Increase visible thread count"
                  className="[&_svg]:size-3.5"
                />
              </NumberFieldGroup>
            </NumberField>
          </div>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}

function SortableProjectItem({
  projectId,
  disabled = false,
  children,
}: {
  projectId: string;
  disabled?: boolean;
  children: (handleProps: SortableProjectHandleProps) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: projectId, disabled });
  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      className={`group/menu-item relative w-full rounded-none border-b border-sidebar-border/30 dark:border-zinc-700/30 ${
        isDragging ? "z-20 opacity-80" : ""
      } ${isOver && !isDragging ? "ring-1 ring-primary/40" : ""}`}
      data-sidebar="menu-item"
      data-slot="sidebar-menu-item"
    >
      {children({ attributes, listeners, setActivatorNodeRef })}
    </li>
  );
}

interface SidebarProjectsContentProps {
  showArm64IntelBuildWarning: boolean;
  arm64IntelBuildWarningDescription: string | null;
  desktopUpdateButtonAction: "download" | "install" | "none";
  desktopUpdateButtonDisabled: boolean;
  desktopUpdateActionPending: boolean;
  handleDesktopUpdateButtonClick: () => void;
  projectSortOrder: SidebarProjectSortOrder;
  threadSortOrder: SidebarThreadSortOrder;
  threadPreviewCount: SidebarThreadPreviewCount;
  updateSettings: ReturnType<typeof useUpdateClientSettings>;
  openAddProject: () => void;
  isManualProjectSorting: boolean;
  projectDnDSensors: ReturnType<typeof useSensors>;
  projectCollisionDetection: CollisionDetection;
  handleProjectDragStart: (event: DragStartEvent) => void;
  handleProjectDragEnd: (event: DragEndEvent) => void;
  handleProjectDragCancel: (event: DragCancelEvent) => void;
  handleNewThread: ReturnType<typeof useNewThreadHandler>;
  archiveThread: ReturnType<typeof useThreadActions>["archiveThread"];
  deleteThread: ReturnType<typeof useThreadActions>["deleteThread"];
  markThreadUnread: ReturnType<typeof useThreadActions>["markThreadUnread"];
  sortedProjects: readonly SidebarProjectSnapshot[];
  expandedThreadListsByProject: ReadonlySet<string>;
  activeRouteProjectKey: string | null;
  routeThreadKey: string | null;
  openPullRequestsInRightPanel: boolean;
  newThreadShortcutLabel: string | null;
  commandPaletteShortcutLabel: string | null;
  threadJumpLabelByKey: ReadonlyMap<string, string>;
  attachThreadListAutoAnimateRef: (node: HTMLElement | null) => void;
  expandThreadListForProject: (projectKey: string) => void;
  collapseThreadListForProject: (projectKey: string) => void;
  dragInProgressRef: React.RefObject<boolean>;
  suppressProjectClickAfterDragRef: React.RefObject<boolean>;
  suppressProjectClickForContextMenuRef: React.RefObject<boolean>;
  attachProjectListAutoAnimateRef: (node: HTMLElement | null) => void;
  projectsLength: number;
}

const SidebarProjectsContent = memo(function SidebarProjectsContent(
  props: SidebarProjectsContentProps,
) {
  const {
    showArm64IntelBuildWarning,
    arm64IntelBuildWarningDescription,
    desktopUpdateButtonAction,
    desktopUpdateButtonDisabled,
    desktopUpdateActionPending,
    handleDesktopUpdateButtonClick,
    projectSortOrder,
    threadSortOrder,
    threadPreviewCount,
    updateSettings,
    openAddProject,
    isManualProjectSorting,
    projectDnDSensors,
    projectCollisionDetection,
    handleProjectDragStart,
    handleProjectDragEnd,
    handleProjectDragCancel,
    handleNewThread,
    archiveThread,
    deleteThread,
    markThreadUnread,
    sortedProjects,
    expandedThreadListsByProject,
    activeRouteProjectKey,
    routeThreadKey,
    openPullRequestsInRightPanel,
    newThreadShortcutLabel,
    commandPaletteShortcutLabel,
    threadJumpLabelByKey,
    attachThreadListAutoAnimateRef,
    expandThreadListForProject,
    collapseThreadListForProject,
    dragInProgressRef,
    suppressProjectClickAfterDragRef,
    suppressProjectClickForContextMenuRef,
    attachProjectListAutoAnimateRef,
    projectsLength,
  } = props;

  const handleProjectSortOrderChange = useCallback(
    (sortOrder: SidebarProjectSortOrder) => {
      updateSettings({ sidebarProjectSortOrder: sortOrder });
    },
    [updateSettings],
  );
  const handleThreadSortOrderChange = useCallback(
    (sortOrder: SidebarThreadSortOrder) => {
      updateSettings({ sidebarThreadSortOrder: sortOrder });
    },
    [updateSettings],
  );
  const handleThreadPreviewCountChange = useCallback(
    (count: SidebarThreadPreviewCount) => {
      updateSettings({ sidebarThreadPreviewCount: count });
    },
    [updateSettings],
  );

  return (
    <SidebarContent
      fixedHeader={
        // Lifted above the stage backdrop, whose fade bleeds below the
        // header and would otherwise paint across the search row's outline.
        <SidebarGroup className="z-[1]">
          <SidebarMenu>
            <SidebarMenuItem>
              <CommandDialogTrigger
                render={<SidebarMenuButton data-testid="command-palette-trigger" />}
              >
                <SearchIcon />
                <span className="flex-1 truncate">Search</span>
                {commandPaletteShortcutLabel ? <Kbd>{commandPaletteShortcutLabel}</Kbd> : null}
              </CommandDialogTrigger>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      }
    >
      {showArm64IntelBuildWarning && arm64IntelBuildWarningDescription ? (
        <SidebarGroup>
          <Alert variant="warning">
            <TriangleAlertIcon />
            <AlertTitle>Intel build on Apple Silicon</AlertTitle>
            <AlertDescription>{arm64IntelBuildWarningDescription}</AlertDescription>
            {desktopUpdateButtonAction !== "none" ? (
              <AlertAction>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={desktopUpdateButtonDisabled || desktopUpdateActionPending}
                  onClick={handleDesktopUpdateButtonClick}
                >
                  {desktopUpdateButtonAction === "download"
                    ? "Download ARM build"
                    : "Install ARM build"}
                </Button>
              </AlertAction>
            ) : null}
          </Alert>
        </SidebarGroup>
      ) : null}
      <SidebarGroup className="p-0">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-sidebar-border/30 dark:border-zinc-700/30">
          <span className="text-xs font-semibold tracking-wide uppercase text-sidebar-muted-foreground/80">
            Projects
          </span>
          <div className="flex items-center gap-1">
            <ProjectSortMenu
              projectSortOrder={projectSortOrder}
              threadSortOrder={threadSortOrder}
              threadPreviewCount={threadPreviewCount}
              onProjectSortOrderChange={handleProjectSortOrderChange}
              onThreadSortOrderChange={handleThreadSortOrderChange}
              onThreadPreviewCountChange={handleThreadPreviewCountChange}
            />
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-xs"
                    variant="ghost-muted"
                    aria-label="Add project"
                    data-testid="sidebar-add-project-trigger"
                    onClick={openAddProject}
                  />
                }
              >
                <FolderPlusIcon className="size-3.5" />
              </TooltipTrigger>
              <TooltipPopup side="right">Add project</TooltipPopup>
            </Tooltip>
          </div>
        </div>

        {isManualProjectSorting ? (
          <DndContext
            sensors={projectDnDSensors}
            collisionDetection={projectCollisionDetection}
            modifiers={[restrictToVerticalAxis, restrictToFirstScrollableAncestor]}
            onDragStart={handleProjectDragStart}
            onDragEnd={handleProjectDragEnd}
            onDragCancel={handleProjectDragCancel}
          >
            <SidebarMenu className="gap-0 w-full">
              <SortableContext
                items={sortedProjects.map((project) => project.projectKey)}
                strategy={verticalListSortingStrategy}
              >
                {sortedProjects.map((project) => (
                  <SortableProjectItem key={project.projectKey} projectId={project.projectKey}>
                    {(dragHandleProps) => (
                      <SidebarProjectItem
                        project={project}
                        isThreadListExpanded={expandedThreadListsByProject.has(project.projectKey)}
                        activeRouteThreadKey={
                          activeRouteProjectKey === project.projectKey ? routeThreadKey : null
                        }
                        openPullRequestsInRightPanel={openPullRequestsInRightPanel}
                        newThreadShortcutLabel={newThreadShortcutLabel}
                        handleNewThread={handleNewThread}
                        archiveThread={archiveThread}
                        deleteThread={deleteThread}
                        markThreadUnread={markThreadUnread}
                        threadJumpLabelByKey={threadJumpLabelByKey}
                        attachThreadListAutoAnimateRef={attachThreadListAutoAnimateRef}
                        expandThreadListForProject={expandThreadListForProject}
                        collapseThreadListForProject={collapseThreadListForProject}
                        dragInProgressRef={dragInProgressRef}
                        suppressProjectClickAfterDragRef={suppressProjectClickAfterDragRef}
                        suppressProjectClickForContextMenuRef={
                          suppressProjectClickForContextMenuRef
                        }
                        isManualProjectSorting={isManualProjectSorting}
                        dragHandleProps={dragHandleProps}
                      />
                    )}
                  </SortableProjectItem>
                ))}
              </SortableContext>
            </SidebarMenu>
          </DndContext>
        ) : (
          <SidebarMenu ref={attachProjectListAutoAnimateRef} className="gap-0 w-full">
            {sortedProjects.map((project) => (
              <SidebarProjectListRow
                key={project.projectKey}
                project={project}
                isThreadListExpanded={expandedThreadListsByProject.has(project.projectKey)}
                activeRouteThreadKey={
                  activeRouteProjectKey === project.projectKey ? routeThreadKey : null
                }
                openPullRequestsInRightPanel={openPullRequestsInRightPanel}
                newThreadShortcutLabel={newThreadShortcutLabel}
                handleNewThread={handleNewThread}
                archiveThread={archiveThread}
                deleteThread={deleteThread}
                markThreadUnread={markThreadUnread}
                threadJumpLabelByKey={threadJumpLabelByKey}
                attachThreadListAutoAnimateRef={attachThreadListAutoAnimateRef}
                expandThreadListForProject={expandThreadListForProject}
                collapseThreadListForProject={collapseThreadListForProject}
                dragInProgressRef={dragInProgressRef}
                suppressProjectClickAfterDragRef={suppressProjectClickAfterDragRef}
                suppressProjectClickForContextMenuRef={suppressProjectClickForContextMenuRef}
                isManualProjectSorting={isManualProjectSorting}
                dragHandleProps={null}
              />
            ))}
          </SidebarMenu>
        )}

        {projectsLength === 0 && (
          <div className="px-2 pt-4 text-center text-secondary-label text-xs">No projects yet</div>
        )}
      </SidebarGroup>
    </SidebarContent>
  );
});

export default function LegacySidebar() {
  const projects = useProjects();
  const sidebarThreads = useThreadShells();
  const projectExpandedById = useUiStateStore((store) => store.projectExpandedById);
  const projectOrder = useUiStateStore((store) => store.projectOrder);
  const reorderProjects = useUiStateStore((store) => store.reorderProjects);
  const navigate = useNavigate();
  const sidebarThreadSortOrder = useClientSettings((s) => s.sidebarThreadSortOrder);
  const sidebarProjectSortOrder = useClientSettings((s) => s.sidebarProjectSortOrder);
  const projectGroupingSettings = useClientSettings(selectProjectGroupingSettings);
  const sidebarThreadPreviewCount = useClientSettings((s) => s.sidebarThreadPreviewCount);
  const updateSettings = useUpdateClientSettings();
  const handleNewThread = useNewThreadHandler();
  const { archiveThread, deleteThread, markThreadUnread } = useThreadActions();
  const { isMobile, setOpenMobile } = useSidebar();
  const routeTarget = useParams({
    strict: false,
    select: (params) => resolveThreadRouteTarget(params),
  });
  const routeDraftThread = useComposerDraftStore((store) =>
    routeTarget?.kind === "draft" ? store.getDraftSession(routeTarget.draftId) : null,
  );
  const routeThreadRef = useMemo(
    () => resolveActiveThreadRouteRef(routeTarget, routeDraftThread),
    [routeDraftThread, routeTarget],
  );
  const routeThreadKey = routeThreadRef ? scopedThreadKey(routeThreadRef) : null;
  const routeTerminalOpen = useTerminalUiStateStore((state) =>
    routeThreadRef
      ? selectThreadTerminalUiState(state.terminalUiStateByThreadKey, routeThreadRef).terminalOpen
      : false,
  );
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const openAddProjectCommandPalette = useCallback(
    () => openCommandPalette({ open: "add-project" }),
    [],
  );
  const [expandedThreadListsByProject, setExpandedThreadListsByProject] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const { showThreadJumpHints, updateThreadJumpHintsVisibility } = useThreadJumpHintVisibility();
  const dragInProgressRef = useRef(false);
  const suppressProjectClickAfterDragRef = useRef(false);
  const suppressProjectClickForContextMenuRef = useRef(false);
  const desktopUpdateState = useDesktopUpdateState();
  const [desktopUpdateActionPending, setDesktopUpdateActionPending] = useState(false);
  const clearSelection = useThreadSelectionStore((s) => s.clearSelection);
  const setSelectionAnchor = useThreadSelectionStore((s) => s.setAnchor);
  const platform = navigator.platform;
  const shortcutModifiers = useShortcutModifierState();
  const terminalFocused = useTerminalFocus();
  const { environments } = useEnvironments();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const environmentLabelById = useMemo(
    () =>
      new Map(
        environments.map((environment) => [environment.environmentId, environment.label] as const),
      ),
    [environments],
  );
  const desktopLocalEnvironmentIds = useMemo(
    () =>
      new Set(
        environments
          .filter((environment) => isDesktopLocalConnectionTarget(environment.entry.target))
          .map((environment) => environment.environmentId),
      ),
    [environments],
  );
  const wslEnvironmentIds = useMemo(
    () =>
      new Set(
        environments
          .filter((environment) => isWslConnectionTarget(environment.entry.target))
          .map((environment) => environment.environmentId),
      ),
    [environments],
  );
  const orderedProjects = useMemo(() => {
    return orderItemsByPreferredIds({
      items: projects,
      preferredIds: projectOrder,
      getId: getProjectOrderKey,
      getPreferenceIds: (project) => [
        getProjectOrderKey(project),
        legacyProjectCwdPreferenceKey(project.workspaceRoot),
      ],
    });
  }, [projectOrder, projects]);

  // Build a mapping from physical project key → logical project key for
  // cross-environment grouping.  Projects that share a repositoryIdentity
  // canonicalKey are treated as one logical project in the sidebar.
  const physicalToLogicalKey = useMemo(() => {
    return buildPhysicalToLogicalProjectKeyMap({
      projects: orderedProjects,
      settings: projectGroupingSettings,
      primaryEnvironmentId,
    });
  }, [orderedProjects, projectGroupingSettings, primaryEnvironmentId]);
  const projectPhysicalKeyByScopedRef = useMemo(
    () =>
      new Map(
        orderedProjects.map((project) => [
          scopedProjectKey(scopeProjectRef(project.environmentId, project.id)),
          derivePhysicalProjectKey(project),
        ]),
      ),
    [orderedProjects],
  );

  const sidebarProjects = useMemo<SidebarProjectSnapshot[]>(() => {
    const raw = buildSidebarProjectSnapshots({
      projects: orderedProjects,
      settings: projectGroupingSettings,
      primaryEnvironmentId,
      resolveEnvironmentLabel: (environmentId) => environmentLabelById.get(environmentId) ?? null,
      isDesktopLocalEnvironment: (environmentId) => desktopLocalEnvironmentIds.has(environmentId),
      isWslEnvironment: (environmentId) => wslEnvironmentIds.has(environmentId),
    });
    const seenNames = new Map<string, SidebarProjectSnapshot>();
    const result: SidebarProjectSnapshot[] = [];
    for (const project of raw) {
      const normalizedName = project.displayName.trim().toLowerCase();
      const existing = seenNames.get(normalizedName);
      if (existing) {
        existing.memberProjects = [
          ...existing.memberProjects,
          ...project.memberProjects.filter(
            (p) => !existing.memberProjects.some((ep) => ep.id === p.id),
          ),
        ];
        existing.memberProjectRefs = [
          ...existing.memberProjectRefs,
          ...project.memberProjectRefs.filter(
            (r) =>
              !existing.memberProjectRefs.some(
                (er) => er.environmentId === r.environmentId && er.projectId === r.projectId,
              ),
          ),
        ];
        continue;
      }
      const cloned = { ...project };
      seenNames.set(normalizedName, cloned);
      result.push(cloned);
    }
    return result;
  }, [
    environmentLabelById,
    desktopLocalEnvironmentIds,
    wslEnvironmentIds,
    orderedProjects,
    projectGroupingSettings,
    primaryEnvironmentId,
  ]);

  const sidebarProjectByKey = useMemo(
    () => new Map(sidebarProjects.map((project) => [project.projectKey, project] as const)),
    [sidebarProjects],
  );
  const sidebarThreadByKey = useMemo(
    () =>
      new Map(
        sidebarThreads.map(
          (thread) =>
            [scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)), thread] as const,
        ),
      ),
    [sidebarThreads],
  );
  // Resolve the active route's project key to a logical key so it matches the
  // sidebar's grouped project entries.
  const activeRouteProjectKey = useMemo(() => {
    if (!routeThreadKey) {
      return null;
    }
    const activeThread = sidebarThreadByKey.get(routeThreadKey);
    if (!activeThread) return null;
    const physicalKey =
      projectPhysicalKeyByScopedRef.get(
        scopedProjectKey(scopeProjectRef(activeThread.environmentId, activeThread.projectId)),
      ) ?? scopedProjectKey(scopeProjectRef(activeThread.environmentId, activeThread.projectId));
    return physicalToLogicalKey.get(physicalKey) ?? physicalKey;
  }, [routeThreadKey, sidebarThreadByKey, physicalToLogicalKey, projectPhysicalKeyByScopedRef]);

  // Group threads by logical project key so all threads from grouped projects
  // are displayed together.
  const threadsByProjectKey = useMemo(() => {
    const next = new Map<string, SidebarThreadSummary[]>();
    const canonicalKeyByProjectKey = new Map<string, string>();
    for (const project of sidebarProjects) {
      canonicalKeyByProjectKey.set(project.projectKey, project.projectKey);
      for (const member of project.memberProjects) {
        canonicalKeyByProjectKey.set(member.physicalProjectKey, project.projectKey);
        canonicalKeyByProjectKey.set(`${member.environmentId}:${member.id}`, project.projectKey);
      }
      for (const ref of project.memberProjectRefs) {
        canonicalKeyByProjectKey.set(`${ref.environmentId}:${ref.projectId}`, project.projectKey);
      }
    }

    for (const thread of sidebarThreads) {
      const scopedRef = scopedProjectKey(scopeProjectRef(thread.environmentId, thread.projectId));
      const physicalKey = projectPhysicalKeyByScopedRef.get(scopedRef) ?? scopedRef;
      const logicalKey = physicalToLogicalKey.get(physicalKey) ?? physicalKey;
      const targetKey =
        canonicalKeyByProjectKey.get(logicalKey) ??
        canonicalKeyByProjectKey.get(physicalKey) ??
        canonicalKeyByProjectKey.get(scopedRef) ??
        logicalKey;
      const existing = next.get(targetKey);
      if (existing) {
        if (!existing.some((t) => t.id === thread.id)) {
          existing.push(thread);
        }
      } else {
        next.set(targetKey, [thread]);
      }
    }
    return next;
  }, [sidebarThreads, physicalToLogicalKey, projectPhysicalKeyByScopedRef, sidebarProjects]);
  const getCurrentSidebarShortcutContext = useCallback(
    () => ({
      terminalFocus: isTerminalFocused(),
      terminalOpen: routeTerminalOpen,
      modelPickerOpen: isModelPickerOpen(),
    }),
    [routeTerminalOpen],
  );
  const newThreadShortcutLabelOptions = useMemo(
    () => ({
      platform,
      context: {
        terminalFocus: false,
        terminalOpen: false,
      },
    }),
    [platform],
  );
  const newThreadShortcutLabel =
    shortcutLabelForCommand(keybindings, "chat.newLocal", newThreadShortcutLabelOptions) ??
    shortcutLabelForCommand(keybindings, "chat.new", newThreadShortcutLabelOptions);

  const navigateToThread = useCallback(
    (threadRef: ScopedThreadRef) => {
      terminalStore.setQuickBarOpen(false);
      if (useThreadSelectionStore.getState().selectedThreadKeys.size > 0) {
        clearSelection();
      }
      setSelectionAnchor(scopedThreadKey(threadRef));
      if (isMobile) {
        setOpenMobile(false);
      }
      void navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(threadRef),
      });
    },
    [clearSelection, isMobile, navigate, setOpenMobile, setSelectionAnchor],
  );

  const projectDnDSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );
  const projectCollisionDetection = useCallback<CollisionDetection>((args) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) {
      return pointerCollisions;
    }

    return closestCorners(args);
  }, []);

  const handleProjectDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (sidebarProjectSortOrder !== "manual") {
        dragInProgressRef.current = false;
        return;
      }
      dragInProgressRef.current = false;
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const activeProject = sidebarProjects.find((project) => project.projectKey === active.id);
      const overProject = sidebarProjects.find((project) => project.projectKey === over.id);
      if (!activeProject || !overProject) return;
      const activeMemberKeys = activeProject.memberProjects.map(
        (member) => member.physicalProjectKey,
      );
      const overMemberKeys = overProject.memberProjects.map((member) => member.physicalProjectKey);
      reorderProjects(orderedProjects.map(getProjectOrderKey), activeMemberKeys, overMemberKeys);
    },
    [orderedProjects, sidebarProjectSortOrder, reorderProjects, sidebarProjects],
  );

  const handleProjectDragStart = useCallback(
    (_event: DragStartEvent) => {
      if (sidebarProjectSortOrder !== "manual") {
        return;
      }
      dragInProgressRef.current = true;
      suppressProjectClickAfterDragRef.current = true;
    },
    [sidebarProjectSortOrder],
  );

  const handleProjectDragCancel = useCallback((_event: DragCancelEvent) => {
    dragInProgressRef.current = false;
  }, []);

  const animatedProjectListsRef = useRef(new WeakSet<HTMLElement>());
  const attachProjectListAutoAnimateRef = useCallback((node: HTMLElement | null) => {
    if (!node || animatedProjectListsRef.current.has(node)) {
      return;
    }
    autoAnimate(node, SIDEBAR_LIST_ANIMATION_OPTIONS);
    animatedProjectListsRef.current.add(node);
  }, []);

  const animatedThreadListsRef = useRef(new WeakSet<HTMLElement>());
  const attachThreadListAutoAnimateRef = useCallback((node: HTMLElement | null) => {
    if (!node || animatedThreadListsRef.current.has(node)) {
      return;
    }
    autoAnimate(node, SIDEBAR_LIST_ANIMATION_OPTIONS);
    animatedThreadListsRef.current.add(node);
  }, []);

  const visibleThreads = useMemo(
    () => sidebarThreads.filter((thread) => thread.archivedAt === null),
    [sidebarThreads],
  );
  const sortedProjects = useMemo(() => {
    const sortableProjects = sidebarProjects.map((project) => ({
      ...project,
      id: project.projectKey,
    }));
    const sortableThreads = visibleThreads.map((thread) => {
      const physicalKey =
        projectPhysicalKeyByScopedRef.get(
          scopedProjectKey(scopeProjectRef(thread.environmentId, thread.projectId)),
        ) ?? scopedProjectKey(scopeProjectRef(thread.environmentId, thread.projectId));
      return {
        ...thread,
        projectId: (physicalToLogicalKey.get(physicalKey) ?? physicalKey) as ProjectId,
      };
    });
    const seenKeys = new Set<string>();
    const seenNames = new Set<string>();
    return sortProjectsForSidebar(
      sortableProjects,
      sortableThreads,
      sidebarProjectSortOrder,
    ).flatMap((project) => {
      const resolvedProject = sidebarProjectByKey.get(project.id);
      if (!resolvedProject) return [];
      if (seenKeys.has(resolvedProject.projectKey)) return [];
      const normalizedName = resolvedProject.displayName.trim().toLowerCase();
      if (seenNames.has(normalizedName)) return [];
      seenKeys.add(resolvedProject.projectKey);
      seenNames.add(normalizedName);
      return [resolvedProject];
    });
  }, [
    sidebarProjectSortOrder,
    physicalToLogicalKey,
    projectPhysicalKeyByScopedRef,
    sidebarProjectByKey,
    sidebarProjects,
    visibleThreads,
  ]);
  const isManualProjectSorting = sidebarProjectSortOrder === "manual";
  const visibleSidebarThreadKeys = useMemo(
    () =>
      sortedProjects.flatMap((project) => {
        const projectThreads = sortThreads(
          (threadsByProjectKey.get(project.projectKey) ?? []).filter(
            (thread) => thread.archivedAt === null,
          ),
          sidebarThreadSortOrder,
        );
        const projectExpanded = resolveProjectExpanded(
          projectExpandedById,
          projectExpansionPreferenceKeys(project),
        );
        const activeThreadKey = routeThreadKey ?? undefined;
        const pinnedCollapsedThread =
          !projectExpanded && activeThreadKey
            ? (projectThreads.find(
                (thread) =>
                  scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)) ===
                  activeThreadKey,
              ) ?? null)
            : null;
        const shouldShowThreadPanel = projectExpanded || pinnedCollapsedThread !== null;
        if (!shouldShowThreadPanel) {
          return [];
        }
        const isThreadListExpanded = expandedThreadListsByProject.has(project.projectKey);
        const hasOverflowingThreads = projectThreads.length > sidebarThreadPreviewCount;
        const previewThreads =
          isThreadListExpanded || !hasOverflowingThreads
            ? projectThreads
            : projectThreads.slice(0, sidebarThreadPreviewCount);
        const renderedThreads = pinnedCollapsedThread ? [pinnedCollapsedThread] : previewThreads;
        return renderedThreads.map((thread) =>
          scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
        );
      }),
    [
      sidebarThreadSortOrder,
      sidebarThreadPreviewCount,
      expandedThreadListsByProject,
      projectExpandedById,
      routeThreadKey,
      sortedProjects,
      threadsByProjectKey,
    ],
  );
  const threadJumpCommandByKey = useMemo(() => {
    const mapping = new Map<string, NonNullable<ReturnType<typeof threadJumpCommandForIndex>>>();
    for (const [visibleThreadIndex, threadKey] of visibleSidebarThreadKeys.entries()) {
      const jumpCommand = threadJumpCommandForIndex(visibleThreadIndex);
      if (!jumpCommand) {
        return mapping;
      }
      mapping.set(threadKey, jumpCommand);
    }

    return mapping;
  }, [visibleSidebarThreadKeys]);
  const threadJumpThreadKeys = useMemo(
    () => [...threadJumpCommandByKey.keys()],
    [threadJumpCommandByKey],
  );
  const sidebarShortcutContext = {
    terminalFocus: terminalFocused,
    terminalOpen: routeTerminalOpen,
    modelPickerOpen: isModelPickerOpen(),
  };
  const threadJumpLabelByKey = useMemo(
    () =>
      buildThreadJumpLabelMap({
        keybindings,
        platform,
        terminalOpen: sidebarShortcutContext.terminalOpen,
        threadJumpCommandByKey,
      }),
    [keybindings, platform, sidebarShortcutContext.terminalOpen, threadJumpCommandByKey],
  );
  const shouldShowThreadJumpHintsNow = shouldShowThreadJumpHintsForModifiers(
    shortcutModifiers,
    keybindings,
    {
      platform,
      context: sidebarShortcutContext,
    },
  );
  const visibleThreadJumpLabelByKey = showThreadJumpHints
    ? threadJumpLabelByKey
    : EMPTY_THREAD_JUMP_LABELS;
  const orderedSidebarThreadKeys = visibleSidebarThreadKeys;
  const prewarmedSidebarThreadKeys = useMemo(
    () => getSidebarThreadIdsToPrewarm(visibleSidebarThreadKeys),
    [visibleSidebarThreadKeys],
  );
  const prewarmedSidebarThreadRefs = useMemo(
    () =>
      prewarmedSidebarThreadKeys.flatMap((threadKey) => {
        const ref = parseScopedThreadKey(threadKey);
        return ref ? [ref] : [];
      }),
    [prewarmedSidebarThreadKeys],
  );

  useEffect(() => {
    updateThreadJumpHintsVisibility(shouldShowThreadJumpHintsNow);
  }, [shouldShowThreadJumpHintsNow, updateThreadJumpHintsVisibility]);

  useEffect(() => {
    const onWindowKeyDown = (event: globalThis.KeyboardEvent) => {
      const shortcutContext = getCurrentSidebarShortcutContext();

      if (event.defaultPrevented || event.repeat || isCommandPaletteOpen() || isModelPickerOpen()) {
        return;
      }

      const command = resolveShortcutCommand(event, keybindings, {
        platform,
        context: shortcutContext,
      });
      const traversalDirection = threadTraversalDirectionFromCommand(command);
      if (traversalDirection !== null) {
        const targetThreadKey = resolveAdjacentThreadId({
          threadIds: orderedSidebarThreadKeys,
          currentThreadId: routeThreadKey,
          direction: traversalDirection,
        });
        if (!targetThreadKey) {
          return;
        }
        const targetThread = sidebarThreadByKey.get(targetThreadKey);
        if (!targetThread) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        navigateToThread(scopeThreadRef(targetThread.environmentId, targetThread.id));
        return;
      }

      const jumpIndex = threadJumpIndexFromCommand(command ?? "");
      if (jumpIndex === null) {
        return;
      }

      const targetThreadKey = threadJumpThreadKeys[jumpIndex];
      if (!targetThreadKey) {
        return;
      }
      const targetThread = sidebarThreadByKey.get(targetThreadKey);
      if (!targetThread) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      navigateToThread(scopeThreadRef(targetThread.environmentId, targetThread.id));
    };

    window.addEventListener("keydown", onWindowKeyDown);

    return () => {
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  }, [
    getCurrentSidebarShortcutContext,
    keybindings,
    navigateToThread,
    orderedSidebarThreadKeys,
    platform,
    routeThreadKey,
    sidebarThreadByKey,
    threadJumpThreadKeys,
  ]);

  useEffect(() => {
    const onMouseDown = (event: globalThis.MouseEvent) => {
      if (!useThreadSelectionStore.getState().hasSelection()) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!shouldClearThreadSelectionOnMouseDown(target)) return;
      clearSelection();
    };

    window.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, [clearSelection]);

  const desktopUpdateButtonDisabled = isDesktopUpdateButtonDisabled(desktopUpdateState);
  const desktopUpdateButtonAction = desktopUpdateState
    ? resolveDesktopUpdateButtonAction(desktopUpdateState)
    : "none";
  const showArm64IntelBuildWarning =
    isElectron && shouldShowArm64IntelBuildWarning(desktopUpdateState);
  const arm64IntelBuildWarningDescription =
    desktopUpdateState && showArm64IntelBuildWarning
      ? getArm64IntelBuildWarningDescription(desktopUpdateState)
      : null;
  const commandPaletteShortcutLabel = isMobile
    ? null
    : shortcutLabelForCommand(keybindings, "commandPalette.toggle", newThreadShortcutLabelOptions);
  const handleDesktopUpdateButtonClick = useCallback(async () => {
    const bridge = window.desktopBridge;
    if (!bridge || !desktopUpdateState) return;
    if (
      desktopUpdateButtonDisabled ||
      desktopUpdateButtonAction === "none" ||
      desktopUpdateActionPending
    ) {
      return;
    }

    setDesktopUpdateActionPending(true);

    if (desktopUpdateButtonAction === "download") {
      void bridge
        .downloadUpdate()
        .then((result) => {
          if (result.completed) {
            showDesktopUpdateDownloadedToast(bridge, result.state);
          }
          if (!shouldToastDesktopUpdateActionResult(result)) return;
          const actionError = getDesktopUpdateActionError(result);
          if (!actionError) return;
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Could not download update",
              description: actionError,
            }),
          );
        })
        .catch((error) => {
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Could not start update download",
              description: error instanceof Error ? error.message : "An unexpected error occurred.",
            }),
          );
        })
        .finally(() => setDesktopUpdateActionPending(false));
      return;
    }

    if (desktopUpdateButtonAction === "install") {
      let confirmed = false;
      try {
        confirmed = await ensureLocalApi().dialogs.confirm(
          getDesktopUpdateInstallConfirmationMessage(desktopUpdateState),
        );
      } catch (error) {
        setDesktopUpdateActionPending(false);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Could not confirm update",
            description: error instanceof Error ? error.message : "Update confirmation failed.",
          }),
        );
        return;
      }
      if (!confirmed) {
        setDesktopUpdateActionPending(false);
        return;
      }
      void bridge
        .installUpdate()
        .then((result) => {
          if (!shouldToastDesktopUpdateActionResult(result)) return;
          const actionError = getDesktopUpdateActionError(result);
          if (!actionError) return;
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Could not install update",
              description: actionError,
            }),
          );
        })
        .catch((error) => {
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Could not install update",
              description: error instanceof Error ? error.message : "An unexpected error occurred.",
            }),
          );
        })
        .finally(() => setDesktopUpdateActionPending(false));
    }
  }, [
    desktopUpdateActionPending,
    desktopUpdateButtonAction,
    desktopUpdateButtonDisabled,
    desktopUpdateState,
  ]);

  const expandThreadListForProject = useCallback((projectKey: string) => {
    setExpandedThreadListsByProject((current) => {
      if (current.has(projectKey)) return current;
      const next = new Set(current);
      next.add(projectKey);
      return next;
    });
  }, []);

  const collapseThreadListForProject = useCallback((projectKey: string) => {
    setExpandedThreadListsByProject((current) => {
      if (!current.has(projectKey)) return current;
      const next = new Set(current);
      next.delete(projectKey);
      return next;
    });
  }, []);

  return (
    <>
      {prewarmedSidebarThreadRefs.map((threadRef) => (
        <SidebarThreadDetailPrewarmer key={scopedThreadKey(threadRef)} threadRef={threadRef} />
      ))}
      <SidebarChromeHeader isElectron={isElectron} />

      <SidebarProjectsContent
        showArm64IntelBuildWarning={showArm64IntelBuildWarning}
        arm64IntelBuildWarningDescription={arm64IntelBuildWarningDescription}
        desktopUpdateButtonAction={desktopUpdateButtonAction}
        desktopUpdateButtonDisabled={desktopUpdateButtonDisabled}
        desktopUpdateActionPending={desktopUpdateActionPending}
        handleDesktopUpdateButtonClick={handleDesktopUpdateButtonClick}
        projectSortOrder={sidebarProjectSortOrder}
        threadSortOrder={sidebarThreadSortOrder}
        threadPreviewCount={sidebarThreadPreviewCount}
        updateSettings={updateSettings}
        openAddProject={openAddProjectCommandPalette}
        isManualProjectSorting={isManualProjectSorting}
        projectDnDSensors={projectDnDSensors}
        projectCollisionDetection={projectCollisionDetection}
        handleProjectDragStart={handleProjectDragStart}
        handleProjectDragEnd={handleProjectDragEnd}
        handleProjectDragCancel={handleProjectDragCancel}
        handleNewThread={handleNewThread}
        archiveThread={archiveThread}
        deleteThread={deleteThread}
        markThreadUnread={markThreadUnread}
        sortedProjects={sortedProjects}
        expandedThreadListsByProject={expandedThreadListsByProject}
        activeRouteProjectKey={activeRouteProjectKey}
        routeThreadKey={routeThreadKey}
        openPullRequestsInRightPanel={routeThreadRef !== null}
        newThreadShortcutLabel={newThreadShortcutLabel}
        commandPaletteShortcutLabel={commandPaletteShortcutLabel}
        threadJumpLabelByKey={visibleThreadJumpLabelByKey}
        attachThreadListAutoAnimateRef={attachThreadListAutoAnimateRef}
        expandThreadListForProject={expandThreadListForProject}
        collapseThreadListForProject={collapseThreadListForProject}
        dragInProgressRef={dragInProgressRef}
        suppressProjectClickAfterDragRef={suppressProjectClickAfterDragRef}
        suppressProjectClickForContextMenuRef={suppressProjectClickForContextMenuRef}
        attachProjectListAutoAnimateRef={attachProjectListAutoAnimateRef}
        projectsLength={projects.length}
      />
      <SidebarChromeFooter />
    </>
  );
}
