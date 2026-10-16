import type { EnvironmentId } from "@t3tools/contracts";
import { AlertCircleIcon, CheckCircle2Icon, Loader2Icon, XIcon } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

import { useImportLocalProject } from "~/hooks/useImportLocalProject";
import { projectUploadStore, useProjectUploadProgress } from "~/state/projectUploadProgress";
import { ProjectUploadDrawer } from "./ProjectUploadDrawer";

export function GlobalProjectImportProgress() {
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const zipInputRef = useRef<HTMLInputElement | null>(null);
  const targetEnvRef = useRef<EnvironmentId | undefined>(undefined);
  const { importFiles, importZipFile } = useImportLocalProject();
  const progress = useProjectUploadProgress();
  const [showError, setShowError] = useState(true);

  // Register triggers with the global store so any component can invoke folder or zip selection
  useEffect(() => {
    const unsubFolder = projectUploadStore.registerTrigger((envId) => {
      targetEnvRef.current = envId;
      folderInputRef.current?.click();
    });
    const unsubZip = projectUploadStore.registerZipTrigger((envId) => {
      targetEnvRef.current = envId;
      zipInputRef.current?.click();
    });
    return () => {
      unsubFolder();
      unsubZip();
    };
  }, []);

  useEffect(() => {
    if (progress.error) {
      setShowError(true);
    }
  }, [progress.error]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    const envId = targetEnvRef.current;
    if (!files || files.length === 0) return;
    event.target.value = "";
    await importFiles(envId, files);
  };

  const handleZipChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const envId = targetEnvRef.current;
    if (!file) return;
    event.target.value = "";
    await importZipFile(envId, file);
  };

  return (
    <>
      {/* Permanent Root Folder Input */}
      <input
        ref={folderInputRef}
        type="file"
        // @ts-expect-error webkitdirectory is standard in browsers
        webkitdirectory=""
        directory=""
        multiple
        className="hidden"
        style={{ display: "none" }}
        onChange={(e) => void handleFileChange(e)}
      />

      {/* Permanent Root ZIP File Input */}
      <input
        ref={zipInputRef}
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed"
        className="hidden"
        style={{ display: "none" }}
        onChange={(e) => void handleZipChange(e)}
      />

      {/* Right-Side Project Upload and Extraction Drawer with Drag-and-Drop */}
      <ProjectUploadDrawer />

      {/* Top Fixed Progress Bar */}
      {progress.isImporting && (
        <div
          className="pointer-events-none fixed top-0 left-0 right-0 z-[999999] h-1 overflow-hidden bg-primary/10 backdrop-blur-sm"
          role="progressbar"
          aria-valuenow={progress.percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 transition-all duration-300 ease-out shadow-[0_0_14px_rgba(99,102,241,0.9)]"
            style={{ width: `${Math.max(4, Math.min(100, progress.percent))}%` }}
          />
        </div>
      )}

      {/* Floating Top HUD Card with Live Percentage (shown when drawer is closed/collapsed) */}
      {progress.isImporting && (!progress.isDrawerOpen || progress.isDrawerCollapsed) && (
        <div className="pointer-events-auto fixed top-2.5 left-1/2 -translate-x-1/2 z-[999999] flex max-w-[92vw] items-center gap-3 rounded-full border border-primary/30 bg-background/95 px-4 py-1.5 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-3 duration-200">
          {progress.percent >= 100 ? (
            <CheckCircle2Icon className="size-4 shrink-0 text-emerald-500" />
          ) : (
            <Loader2Icon className="size-4 shrink-0 animate-spin text-primary" />
          )}

          <div className="flex min-w-0 items-center gap-2 text-xs">
            <span className="max-w-[130px] truncate font-semibold text-foreground sm:max-w-[200px]">
              {progress.projectName || "Project"}
            </span>
            <span className="text-muted-foreground/60">•</span>
            <span className="text-muted-foreground truncate">{progress.stage}</span>
            <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-primary">
              {progress.percent}%
            </span>
          </div>
        </div>
      )}

      {/* Error Floating Banner (if drawer is closed) */}
      {!progress.isDrawerOpen && !progress.isImporting && progress.error && showError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[999999] flex max-w-lg items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-top-4">
          <AlertCircleIcon className="size-5 shrink-0" />
          <div className="min-w-0 flex-1 text-xs">
            <div className="font-semibold">Project Import Failed</div>
            <div className="mt-0.5 line-clamp-2 text-muted-foreground">{progress.error}</div>
          </div>
          <button
            type="button"
            onClick={() => setShowError(false)}
            className="shrink-0 rounded-md p-1 hover:bg-destructive/20 text-muted-foreground hover:text-foreground"
          >
            <XIcon className="size-4" />
          </button>
        </div>
      )}
    </>
  );
}
