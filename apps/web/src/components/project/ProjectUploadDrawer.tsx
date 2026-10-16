import type { EnvironmentId } from "@t3tools/contracts";
import {
  AlertCircleIcon,
  ArchiveIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FolderIcon,
  FolderUpIcon,
  Loader2Icon,
  Minimize2Icon,
  SparklesIcon,
  UploadCloudIcon,
  XIcon,
} from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";

import { useImportLocalProject } from "~/hooks/useImportLocalProject";
import { projectUploadStore, useProjectUploadProgress } from "~/state/projectUploadProgress";
import { scanDroppedItems } from "~/lib/dragDropProjectScanner";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function ProjectUploadDrawer() {
  const progress = useProjectUploadProgress();
  const { importFiles, importZipFile } = useImportLocalProject();
  const [isWindowDragActive, setIsWindowDragActive] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);

  // Global window drag & drop event handling
  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      // Don't intercept if dragging internal elements (e.g. reordering tabs)
      if (!e.dataTransfer?.types?.includes("Files")) return;
      e.preventDefault();
      setDragCounter((prev) => prev + 1);
      setIsWindowDragActive(true);
    };

    const handleDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes("Files")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    };

    const handleDragLeave = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes("Files")) return;
      e.preventDefault();
      setDragCounter((prev) => {
        const next = Math.max(0, prev - 1);
        if (next === 0) {
          setIsWindowDragActive(false);
        }
        return next;
      });
    };

    const handleDrop = async (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes("Files")) return;
      e.preventDefault();
      e.stopPropagation();
      setDragCounter(0);
      setIsWindowDragActive(false);

      try {
        const result = await scanDroppedItems(e.dataTransfer);
        if (result.isZip && result.zipFile) {
          const rawName = result.folderName || "my-project";
          const sanitized = rawName.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80);
          projectUploadStore.openDrawerWithItem({
            itemType: "zip",
            itemName: result.zipFile.name,
            itemSizeBytes: result.totalSizeBytes,
            fileCount: 1,
            customProjectName: sanitized,
            pendingZipFile: result.zipFile,
          });
        } else if (result.isFolder && result.files.length > 0) {
          const rawName = result.folderName || "my-project";
          const sanitized = rawName.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80);
          projectUploadStore.openDrawerWithItem({
            itemType: "folder",
            itemName: result.folderName,
            itemSizeBytes: result.totalSizeBytes,
            fileCount: result.files.length,
            customProjectName: sanitized,
            pendingFolderFiles: result.files,
          });
        } else if (result.files.length > 0) {
          // Multiple loose files
          const firstFile = result.files[0];
          const rawName = firstFile?.name.split(".")[0] || "imported-project";
          const sanitized = rawName.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80);
          projectUploadStore.openDrawerWithItem({
            itemType: "files",
            itemName: `${result.files.length} Files`,
            itemSizeBytes: result.totalSizeBytes,
            fileCount: result.files.length,
            customProjectName: sanitized,
            pendingFolderFiles: result.files,
          });
        }
      } catch (err) {
        console.error("Failed to parse dropped files:", err);
      }
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, []);

  const handleStartImport = useCallback(async () => {
    const targetName =
      progress.customProjectName.trim() ||
      progress.itemName.replace(/\.zip$/i, "").trim() ||
      "imported-project";

    if (progress.itemType === "zip" && progress.pendingZipFile) {
      await importZipFile(progress.targetEnvId, progress.pendingZipFile, targetName);
    } else if (progress.pendingFolderFiles && progress.pendingFolderFiles.length > 0) {
      await importFiles(progress.targetEnvId, progress.pendingFolderFiles, targetName);
    }
  }, [
    progress.customProjectName,
    progress.itemName,
    progress.itemType,
    progress.pendingZipFile,
    progress.pendingFolderFiles,
    progress.targetEnvId,
    importZipFile,
    importFiles,
  ]);

  const handleClose = () => {
    projectUploadStore.closeDrawer();
  };

  const handleCollapse = () => {
    projectUploadStore.collapseDrawer();
  };

  const handleExpand = () => {
    projectUploadStore.expandDrawer();
  };

  const isZip = progress.itemType === "zip";
  const isCompleted = !progress.isImporting && progress.percent >= 100 && !progress.error;

  return (
    <>
      {/* 1. Global Full-Screen Drag Overlay with Glassmorphism */}
      {isWindowDragActive && (
        <div
          id="global-drag-drop-overlay"
          className="pointer-events-none fixed inset-0 z-[999999] flex items-center justify-center bg-background/80 backdrop-blur-xl animate-in fade-in duration-200"
        >
          <div className="relative mx-6 flex max-w-lg flex-col items-center gap-4 rounded-3xl border-2 border-dashed border-primary/70 bg-card/90 p-8 text-center shadow-2xl ring-4 ring-primary/20 backdrop-blur-2xl">
            <div className="flex size-20 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary/20 via-primary/10 to-indigo-500/20 text-primary shadow-inner animate-bounce">
              <FolderUpIcon className="size-10" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Drop to Import Project
              </h2>
              <p className="mt-1.5 text-xs text-muted-foreground sm:text-sm">
                Release your <span className="font-semibold text-primary">Folder</span> or{" "}
                <span className="font-semibold text-primary">.ZIP</span> archive anywhere to
                automatically extract and set up your AutoCode workspace.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1 text-xs font-medium text-primary">
              <SparklesIcon className="size-3.5" />
              <span>Full directory tree & archive support</span>
            </div>
          </div>
        </div>
      )}

      {/* 2. Collapsed Floating Bar / Tab on Right Edge ("Patti jaise bar with arrow") */}
      {progress.isDrawerOpen && progress.isDrawerCollapsed && (
        <div
          id="project-drawer-minimized-bar"
          className="pointer-events-auto fixed right-0 top-1/2 -translate-y-1/2 z-[99999] flex items-center shadow-2xl transition-all duration-300 animate-in slide-in-from-right-10"
        >
          <button
            type="button"
            onClick={handleExpand}
            title="Expand AutoCode Importer Sidebar"
            className="group flex items-center gap-2.5 rounded-l-2xl border-y border-l border-primary/40 bg-background/95 px-3 py-2.5 shadow-2xl backdrop-blur-xl transition hover:border-primary hover:bg-card hover:pr-4"
          >
            {/* Arrow sticking out */}
            <div className="flex size-7 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md transition-transform group-hover:-translate-x-0.5">
              <ChevronLeftIcon className="size-4 stroke-[2.5]" />
            </div>

            <div className="flex flex-col items-start pr-1 text-left">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                {progress.isImporting ? (
                  <Loader2Icon className="size-3.5 animate-spin text-primary" />
                ) : isCompleted ? (
                  <CheckCircle2Icon className="size-3.5 text-emerald-500" />
                ) : (
                  <ArchiveIcon className="size-3.5 text-primary" />
                )}
                <span>AutoCode Importer</span>
              </div>
              <span className="text-[11px] text-muted-foreground">
                {progress.isImporting
                  ? `${progress.percent}% • ${progress.projectName || "Uploading"}`
                  : isCompleted
                    ? "Ready!"
                    : "Click to open"}
              </span>
            </div>
          </button>
        </div>
      )}

      {/* 3. Right-Side Drawer / Sheet */}
      {progress.isDrawerOpen && !progress.isDrawerCollapsed && (
        <aside
          id="project-upload-sidebar"
          aria-label="Project Upload and Extraction Sidebar"
          className="pointer-events-auto fixed top-0 right-0 z-[99999] flex h-full w-[90%] max-w-[90vw] sm:w-[420px] sm:max-w-[420px] flex-col border-l border-border/80 bg-background/95 shadow-2xl backdrop-blur-2xl transition-all duration-300 animate-in slide-in-from-right duration-200"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                {isZip ? <ArchiveIcon className="size-5" /> : <FolderUpIcon className="size-5" />}
              </div>
              <div>
                <h3 className="text-sm font-semibold tracking-tight text-foreground">
                  {isZip ? "Extract ZIP Project" : "Import Folder"}
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  {progress.isImporting ? "Processing workspace files..." : "Configure & launch"}
                </p>
              </div>
            </div>

            {/* Top controls: Minimize & Close */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                id="btn-collapse-upload-drawer"
                onClick={handleCollapse}
                title="Hide / Minimize to Side Bar"
                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition"
              >
                <ChevronRightIcon className="size-4" />
              </button>
              <button
                type="button"
                id="btn-close-upload-drawer-top"
                onClick={handleClose}
                title="Close Drawer"
                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition"
              >
                <XIcon className="size-4" />
              </button>
            </div>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
            {/* Dropped File/Folder Preview Card */}
            <div className="rounded-2xl border border-border/70 bg-card/60 p-4 shadow-sm backdrop-blur-md">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  {isZip ? <ArchiveIcon className="size-5" /> : <FolderIcon className="size-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {isZip ? "Archive File" : "Source Directory"}
                  </div>
                  <div className="truncate text-sm font-semibold text-foreground">
                    {progress.itemName || "Unnamed Project"}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatBytes(progress.itemSizeBytes)}</span>
                    {progress.fileCount > 1 && (
                      <>
                        <span>•</span>
                        <span>{progress.fileCount} files</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Project Folder Name Input (User customizable) */}
            <div className="space-y-2">
              <label
                htmlFor="input-custom-project-name"
                className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Project Folder Name
              </label>
              <div className="relative">
                <input
                  id="input-custom-project-name"
                  type="text"
                  disabled={progress.isImporting}
                  value={progress.customProjectName}
                  onChange={(e) => projectUploadStore.setCustomProjectName(e.target.value)}
                  placeholder="e.g. my-awesome-app"
                  className="w-full rounded-xl border border-border/80 bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 shadow-inner outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {isZip
                  ? "Contents will be unzipped into this folder name on the server."
                  : "A new project will be created with this name."}
              </p>
            </div>

            {/* Progress Display */}
            {progress.isImporting && (
              <div className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="flex items-center gap-2 text-foreground">
                    <Loader2Icon className="size-3.5 animate-spin text-primary" />
                    <span>{progress.stage || "Uploading & extracting..."}</span>
                  </span>
                  <span className="font-mono font-bold text-primary">{progress.percent}%</span>
                </div>

                {/* Animated Progress Bar */}
                <div className="h-2 w-full overflow-hidden rounded-full bg-primary/20">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 transition-all duration-300 ease-out shadow-[0_0_12px_rgba(99,102,241,0.8)]"
                    style={{ width: `${Math.max(5, Math.min(100, progress.percent))}%` }}
                  />
                </div>
              </div>
            )}

            {/* Completed Success Banner */}
            {isCompleted && (
              <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-400 shadow-sm animate-in fade-in">
                <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-emerald-500" />
                <div className="text-xs">
                  <div className="font-semibold text-foreground">
                    {isZip ? "ZIP Successfully Extracted!" : "Folder Successfully Imported!"}
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    Project is ready in AutoCode. A new workspace thread has been prepared.
                  </div>
                </div>
              </div>
            )}

            {/* Error Banner */}
            {progress.error && !progress.isImporting && (
              <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-destructive shadow-sm animate-in fade-in">
                <AlertCircleIcon className="mt-0.5 size-5 shrink-0" />
                <div className="min-w-0 flex-1 text-xs">
                  <div className="font-semibold">Operation Failed</div>
                  <div className="mt-1 line-clamp-3 text-muted-foreground">{progress.error}</div>
                </div>
              </div>
            )}

            {/* Main Action Button */}
            {!progress.isImporting && !isCompleted && (
              <button
                type="button"
                id="btn-execute-extract-or-import"
                onClick={handleStartImport}
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 hover:shadow-xl active:scale-[0.98]"
              >
                {isZip ? (
                  <>
                    <ArchiveIcon className="size-4 transition-transform group-hover:scale-110" />
                    <span>Unzip & Create Project</span>
                  </>
                ) : (
                  <>
                    <FolderUpIcon className="size-4 transition-transform group-hover:scale-110" />
                    <span>Import & Create Project</span>
                  </>
                )}
                <ArrowRightIcon className="size-4 ml-1 transition-transform group-hover:translate-x-1" />
              </button>
            )}
          </div>

          {/* Drawer Footer with Bottom-Right Close Button (User Requirement: "bottom right side par na close ka icon button bhi ho") */}
          <div className="relative border-t border-border/60 p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">
                AutoCode Workspace Drag & Drop
              </span>

              {/* Bottom Right Close Icon Button */}
              <button
                type="button"
                id="btn-close-upload-drawer-bottom"
                onClick={handleClose}
                title="Close Sidebar"
                className="flex size-9 items-center justify-center rounded-xl border border-border/80 bg-muted/60 text-muted-foreground hover:bg-destructive/15 hover:text-destructive hover:border-destructive/30 transition shadow-sm active:scale-95"
              >
                <XIcon className="size-4" />
              </button>
            </div>
          </div>
        </aside>
      )}
    </>
  );
}
