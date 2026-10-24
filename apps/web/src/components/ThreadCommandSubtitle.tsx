import type { ProviderDriverKind } from "@t3tools/contracts";
import { FolderGit2Icon, FolderIcon, GitBranchIcon } from "lucide-react";
import { ProjectFavicon, type ProjectFaviconProject } from "./ProjectFavicon";
import { ProviderInstanceIcon } from "./chat/ProviderInstanceIcon";
import { cn } from "~/lib/utils";

import { MiddleTruncate } from "./ui/middle-truncate";

/**
 * Flip this while reviewing command-palette thread subtitles.
 * - favicon-workspace-harness: favicon + Folder/FolderGit2 + branch + harness (default)
 * - favicon-workspace: same without harness
 * - favicon-branch-harness: GitBranch for local, FolderGit2 for worktrees, + harness
 */
export type ThreadCommandSubtitleVariant =
  | "favicon-workspace-harness"
  | "favicon-workspace"
  | "favicon-branch-harness";

const THREAD_COMMAND_SUBTITLE_VARIANT: ThreadCommandSubtitleVariant = "favicon-workspace-harness";

export const COMMAND_PALETTE_META_ICON_CLASS = "size-3 shrink-0 text-muted-foreground/70";

export function CommandPaletteMetaDot() {
  return <span className="shrink-0 text-zinc-600">·</span>;
}

function WorkspaceIcon(props: { variant: ThreadCommandSubtitleVariant; isWorktree: boolean }) {
  if (props.isWorktree) {
    return <FolderGit2Icon className={COMMAND_PALETTE_META_ICON_CLASS} aria-hidden />;
  }
  return <GitBranchIcon className="size-3 shrink-0 text-sky-400" aria-hidden />;
}

export function ThreadCommandSubtitle(props: {
  project: ProjectFaviconProject | null;
  projectTitle: string | null;
  environmentLabel?: string | null;
  branch: string | null;
  worktreePath: string | null;
  isCurrent: boolean;
  driverKind?: ProviderDriverKind | null;
  providerDisplayName?: string | null;
  acpRegistryAgentId?: string | undefined;
  acpRegistryIconUrl?: string | undefined;
  variant?: ThreadCommandSubtitleVariant;
  className?: string;
}) {
  const variant = props.variant ?? THREAD_COMMAND_SUBTITLE_VARIANT;
  const isWorktree = props.worktreePath != null && props.worktreePath.trim().length > 0;
  const showHarness =
    variant !== "favicon-workspace" && props.driverKind != null && props.providerDisplayName;

  const projectLabel = props.projectTitle?.trim() || null;
  const branchLabel = props.branch?.trim() || null;

  if (!projectLabel && !branchLabel && !props.isCurrent && !showHarness) {
    return null;
  }

  return (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-1.5 text-xs text-zinc-400",
        props.className,
      )}
    >
      {projectLabel ? (
        <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-zinc-300">
          {props.project ? (
            <ProjectFavicon project={props.project} className="size-3.5 shrink-0 rounded-xs" />
          ) : null}
          <span className="min-w-0 truncate">{projectLabel}</span>
          {props.environmentLabel ? (
            <>
              <CommandPaletteMetaDot />
              <span className="shrink-0 text-zinc-400 font-normal">{props.environmentLabel}</span>
            </>
          ) : null}
        </span>
      ) : null}

      {branchLabel ? (
        <>
          {projectLabel ? <CommandPaletteMetaDot /> : null}
          <span className="inline-flex min-w-0 items-center gap-1 text-zinc-300 font-mono">
            <WorkspaceIcon variant={variant} isWorktree={isWorktree} />
            <MiddleTruncate value={branchLabel} />
          </span>
        </>
      ) : null}

      {showHarness && props.driverKind ? (
        <>
          {projectLabel || branchLabel ? <CommandPaletteMetaDot /> : null}
          <span className="inline-flex items-center gap-1 rounded-[4px] bg-zinc-800/80 px-1.5 py-0.5 text-4xs font-medium text-zinc-300 border border-zinc-700/50 shrink-0">
            <ProviderInstanceIcon
              driverKind={props.driverKind}
              displayName={props.providerDisplayName ?? props.driverKind}
              acpRegistryAgentId={props.acpRegistryAgentId}
              acpRegistryIconUrl={props.acpRegistryIconUrl}
              iconClassName="size-3 shrink-0 opacity-80"
            />
            <span className="truncate max-w-24">{props.providerDisplayName}</span>
          </span>
        </>
      ) : null}

      {props.isCurrent ? (
        <>
          {projectLabel || branchLabel || showHarness ? <CommandPaletteMetaDot /> : null}
          <span className="inline-flex items-center gap-1 rounded-[4px] bg-emerald-500/15 px-1.5 py-0.5 text-4xs font-medium text-emerald-400 border border-emerald-500/25 shrink-0">
            <span className="size-1 rounded-full bg-emerald-400 animate-pulse" />
            Current
          </span>
        </>
      ) : null}
    </span>
  );
}
