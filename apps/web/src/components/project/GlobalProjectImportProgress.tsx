import type { EnvironmentId } from "@t3tools/contracts";
import { AlertCircleIcon, CheckCircle2Icon, FolderUpIcon, Loader2Icon, XIcon } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

import { useImportLocalProject } from "~/hooks/useImportLocalProject";
import { projectUploadStore, useProjectUploadProgress } from "~/state/projectUploadProgress";

export function GlobalProjectImportProgress() {
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const targetEnvRef = useRef<EnvironmentId | undefined>(undefined);
  const { importFiles } = useImportLocalProject();
  const progress = useProjectUploadProgress();
  const [showError, setShowError] = useState(true);

  // Register trigger with the global store so any component can invoke folder selection
  useEffect(() => {
    return projectUploadStore.registerTrigger((envId) => {
      targetEnvRef.current = envId;
      folderInputRef.current?.click();
    });
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
    // Clear input value so same folder can be re-selected if desired
    event.target.value = "";
    await importFiles(envId, files);
  };

  return (
    <>
      {/* Permanent Root File Input */}
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

      {/* Top Fixed Progress Bar */}
      {progress.isImporting && (
        <div
          className="pointer-events-none fixed top-0 left-0 right-0 z-[999999] h-1.5 overflow-hidden bg-muted/40"
          role="progressbar"
          aria-valuenow={progress.percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500 transition-all duration-300 ease-out shadow-[0_0_12px_rgba(99,102,241,0.8)]"
            style={{ width: `${Math.max(4, Math.min(100, progress.percent))}%` }}
          />
        </div>
      )}

      {/* Floating Top HUD Card */}
      {progress.isImporting && (
        <div className="pointer-events-auto fixed top-3 left-1/2 -translate-x-1/2 z-[999999] flex max-w-[90vw] items-center gap-3 rounded-full border border-border/80 bg-background/95 px-4 py-2 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-4 duration-200">
          {progress.percent >= 100 ? (
            <CheckCircle2Icon className="size-4 shrink-0 text-emerald-500" />
          ) : (
            <Loader2Icon className="size-4 shrink-0 animate-spin text-primary" />
          )}

          <div className="flex min-w-0 items-center gap-2 text-xs">
            <span className="max-w-[140px] truncate font-semibold text-foreground sm:max-w-[200px]">
              {progress.projectName}
            </span>
            <span className="text-muted-foreground/60">•</span>
            <span className="text-muted-foreground truncate">{progress.stage}</span>
            <span className="shrink-0 font-mono font-medium text-primary">{progress.percent}%</span>
          </div>
        </div>
      )}

      {/* Error Floating Banner */}
      {!progress.isImporting && progress.error && showError && (
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
