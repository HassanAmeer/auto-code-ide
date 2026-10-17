import type { EnvironmentId } from "@t3tools/contracts";
import { PRIMARY_LOCAL_ENVIRONMENT_ID } from "@t3tools/contracts";
import { FolderUpIcon, FileArchiveIcon, SparklesIcon, XIcon, Loader2Icon } from "lucide-react";
import React, { useState, useEffect, useRef } from "react";

import { useNewProject } from "~/hooks/useNewProject";
import { useEnvironments, usePrimaryEnvironmentId } from "~/state/environments";
import { projectUploadStore } from "~/state/projectUploadProgress";
import { useProjectCreateModal, projectCreateModalStore } from "./projectCreateModalStore";

export function CreateNewProjectModal() {
  const { isOpen, environmentId } = useProjectCreateModal();
  const createNewProject = useNewProject();
  const primaryEnvId = usePrimaryEnvironmentId();
  const { environments } = useEnvironments();

  const [projectName, setProjectName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setProjectName("");
      setIsSubmitting(false);
      isSubmittingRef.current = false;
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const trimmed = projectName.trim();
    if (!trimmed || isSubmittingRef.current || isSubmitting) return;

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    const targetEnv = (environmentId ??
      primaryEnvId ??
      environments[0]?.environmentId ??
      PRIMARY_LOCAL_ENVIRONMENT_ID) as EnvironmentId;

    // Auto-hide popup immediately so user can see progress bar and read toasts freely
    projectCreateModalStore.close();

    try {
      await createNewProject({
        environmentId: targetEnv,
        name: trimmed,
        template: "blank",
      });
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleTriggerZip = () => {
    projectCreateModalStore.close();
    const targetEnv = (environmentId ??
      primaryEnvId ??
      environments[0]?.environmentId ??
      PRIMARY_LOCAL_ENVIRONMENT_ID) as EnvironmentId;
    projectUploadStore.triggerZipUpload(targetEnv);
  };

  const handleTriggerFolder = () => {
    projectCreateModalStore.close();
    const targetEnv = (environmentId ??
      primaryEnvId ??
      environments[0]?.environmentId ??
      PRIMARY_LOCAL_ENVIRONMENT_ID) as EnvironmentId;
    projectUploadStore.triggerUpload(targetEnv);
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-lg rounded-2xl border border-border/80 bg-background/95 p-6 shadow-2xl backdrop-blur-md animate-in zoom-in-95 duration-150 text-foreground"
        role="dialog"
        aria-modal="true"
        onKeyDown={(e) => {
          if (e.key === "Escape" && !isSubmitting) projectCreateModalStore.close();
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
              <SparklesIcon className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight">Create New Project</h2>
              <p className="text-xs text-muted-foreground">
                Start from scratch (Blank, React, Vite, Next.js, Python, PHP or more...)
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => projectCreateModalStore.close()}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40 cursor-pointer"
          >
            <XIcon className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          {/* Project Name Field */}
          <div>
            <label className="block text-xs font-medium text-foreground/90 mb-1.5">
              Project Name
            </label>
            <input
              ref={inputRef}
              type="text"
              required
              autoFocus
              disabled={isSubmitting}
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g. my-app"
              className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all font-mono"
            />
            <p className="text-3xs text-muted-foreground mt-1.5">
              Creates a clean, blank workspace ready for any stack or framework.
            </p>
          </div>

          {/* Quick upload alternative shortcuts */}
          <div className="rounded-xl border border-border/50 bg-muted/20 p-2.5 flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground text-2xs">
              Already have project files on your machine?
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleTriggerZip}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-background hover:bg-muted text-foreground border border-border text-2xs font-medium transition-colors cursor-pointer"
                title="Upload and auto-extract a .zip archive"
              >
                <FileArchiveIcon className="size-3 text-sky-400" />
                <span>Upload .zip</span>
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleTriggerFolder}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-background hover:bg-muted text-foreground border border-border text-2xs font-medium transition-colors cursor-pointer"
                title="Upload local folder directly"
              >
                <FolderUpIcon className="size-3 text-amber-400" />
                <span>Upload Folder</span>
              </button>
            </div>
          </div>

          {/* Projects Saving Location note */}
          <div className="flex items-center justify-between text-3xs text-muted-foreground px-2.5 py-1.5 rounded-lg bg-muted/20 border border-border/40">
            <span>Location:</span>
            <span
              className="font-mono text-primary/90 font-medium truncate max-w-[280px]"
              title="Default storage directory: autocode-storage"
            >
              ~/autocode-storage/{projectName.trim() || "<name>"}
            </span>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border/60">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => projectCreateModalStore.close()}
              className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!projectName.trim() || isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2Icon className="size-3.5 animate-spin" />
                  <span>Creating Project...</span>
                </>
              ) : (
                <>
                  <SparklesIcon className="size-3.5" />
                  <span>Create Project</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
