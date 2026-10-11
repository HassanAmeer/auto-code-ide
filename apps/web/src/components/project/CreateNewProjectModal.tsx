import type { EnvironmentId, ProjectTemplateType } from "@t3tools/contracts";
import { PRIMARY_LOCAL_ENVIRONMENT_ID } from "@t3tools/contracts";
import {
  FolderGit2Icon,
  FolderUpIcon,
  FileArchiveIcon,
  SparklesIcon,
  XIcon,
  CheckIcon,
  Loader2Icon,
  GitBranchIcon,
} from "lucide-react";
import React, { useState, useEffect, useRef } from "react";

import { useNewProject } from "~/hooks/useNewProject";
import { useImportLocalProject } from "~/hooks/useImportLocalProject";
import { useEnvironments, usePrimaryEnvironmentId } from "~/state/environments";
import { projectUploadStore } from "~/state/projectUploadProgress";
import { useProjectCreateModal, projectCreateModalStore } from "./projectCreateModalStore";

interface TemplateOption {
  id: ProjectTemplateType;
  title: string;
  badge: string;
  description: string;
  icon: string;
}

const TEMPLATES: TemplateOption[] = [
  {
    id: "blank",
    title: "Blank Project",
    badge: "Clean",
    description: "Empty workspace with README & Git repository initialized",
    icon: "⚡",
  },
  {
    id: "react",
    title: "React + Vite",
    badge: "Frontend",
    description: "Modern React 19, Vite, JSX, and instant dev server",
    icon: "⚛️",
  },
  {
    id: "nextjs",
    title: "Next.js",
    badge: "Fullstack",
    description: "Next.js 15 with App Router (app/layout.jsx, app/page.jsx)",
    icon: "🔺",
  },
  {
    id: "node",
    title: "Node.js / Express",
    badge: "Backend",
    description: "Node.js API server with Express & watch mode",
    icon: "🟢",
  },
  {
    id: "python",
    title: "Python",
    badge: "Script / AI",
    description: "Clean Python application with main.py & requirements.txt",
    icon: "🐍",
  },
  {
    id: "php",
    title: "PHP",
    badge: "Web",
    description: "PHP web application with index.php & composer config",
    icon: "🐘",
  },
];

export function CreateNewProjectModal() {
  const { isOpen, environmentId } = useProjectCreateModal();
  const createNewProject = useNewProject();
  const { cloneGitRepo } = useImportLocalProject();
  const primaryEnvId = usePrimaryEnvironmentId();
  const { environments } = useEnvironments();

  const [projectName, setProjectName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplateType>("blank");
  const [isCloneMode, setIsCloneMode] = useState(false);
  const [gitRepoUrl, setGitRepoUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setProjectName("");
      setSelectedTemplate("blank");
      setIsCloneMode(false);
      setGitRepoUrl("");
      setIsSubmitting(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = projectName.trim();
    if (!trimmed || isSubmitting) return;

    const targetEnv = (environmentId ??
      primaryEnvId ??
      environments[0]?.environmentId ??
      PRIMARY_LOCAL_ENVIRONMENT_ID) as EnvironmentId;

    setIsSubmitting(true);
    try {
      if (isCloneMode) {
        if (!gitRepoUrl.trim()) return;
        const success = await cloneGitRepo(targetEnv, gitRepoUrl.trim(), trimmed);
        if (success) {
          projectCreateModalStore.close();
        }
      } else {
        const success = await createNewProject({
          environmentId: targetEnv,
          name: trimmed,
          template: selectedTemplate,
        });
        if (success) {
          projectCreateModalStore.close();
        }
      }
    } finally {
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
        className="relative w-full max-w-xl rounded-2xl border border-border/80 bg-background/95 p-6 shadow-2xl backdrop-blur-md animate-in zoom-in-95 duration-150 text-foreground"
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
                Start from scratch with templates, clone a repo, or upload an archive
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => projectCreateModalStore.close()}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40"
          >
            <XIcon className="size-4" />
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="flex items-center gap-1.5 p-1 mt-3 bg-muted/40 rounded-xl border border-border/40">
          <button
            type="button"
            onClick={() => setIsCloneMode(false)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium transition-all ${
              !isCloneMode
                ? "bg-background text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <SparklesIcon className="size-3.5 text-primary" />
            <span>Templates / Scratch</span>
          </button>
          <button
            type="button"
            onClick={() => setIsCloneMode(true)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium transition-all ${
              isCloneMode
                ? "bg-background text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <GitBranchIcon className="size-3.5 text-sky-400" />
            <span>Clone Git Repo</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-3">
          {/* Project Name Field */}
          <div>
            <label className="block text-xs font-medium text-foreground/90 mb-1.5">
              Project Name
            </label>
            <input
              ref={inputRef}
              type="text"
              required
              disabled={isSubmitting}
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder={isCloneMode ? "e.g. cloned-repo" : "e.g. my-awesome-app"}
              className="w-full rounded-xl border border-input bg-background px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all font-mono"
            />
          </div>

          {/* Conditional: Clone Git or Templates */}
          {isCloneMode ? (
            <div>
              <label className="block text-xs font-medium text-foreground/90 mb-1.5">
                Git Repository URL
              </label>
              <input
                type="url"
                required
                disabled={isSubmitting}
                value={gitRepoUrl}
                onChange={(e) => {
                  setGitRepoUrl(e.target.value);
                  if (!projectName) {
                    const inferred = e.target.value
                      .split("/")
                      .pop()
                      ?.replace(/\.git$/, "");
                    if (inferred) setProjectName(inferred);
                  }
                }}
                placeholder="https://github.com/username/repository.git"
                className="w-full rounded-xl border border-input bg-background px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 transition-all font-mono"
              />
              <p className="text-3xs text-muted-foreground mt-1">
                Clones directly into a new workspace with history and dependencies preserved.
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-foreground/90 mb-2">
                Select Starter Template
              </label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {TEMPLATES.map((tmpl) => {
                  const isSelected = selectedTemplate === tmpl.id;
                  return (
                    <button
                      key={tmpl.id}
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => setSelectedTemplate(tmpl.id)}
                      className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all ${
                        isSelected
                          ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/40"
                          : "border-border/60 bg-muted/20 hover:bg-muted/50 hover:border-border"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="text-xl">{tmpl.icon}</span>
                        {isSelected ? (
                          <CheckIcon className="size-3.5 text-primary" />
                        ) : (
                          <span className="text-3xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-mono">
                            {tmpl.badge}
                          </span>
                        )}
                      </div>
                      <div className="font-semibold text-xs text-foreground truncate w-full">
                        {tmpl.title}
                      </div>
                      <div className="text-3xs text-muted-foreground line-clamp-2 mt-0.5 leading-relaxed">
                        {tmpl.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick upload alternative shortcuts */}
          <div className="rounded-xl border border-border/50 bg-muted/30 p-2.5 flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground text-2xs">
              Already have project files on your machine?
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleTriggerZip}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-background hover:bg-muted text-foreground border border-border text-2xs font-medium transition-colors"
                title="Upload and auto-extract a .zip archive"
              >
                <FileArchiveIcon className="size-3 text-sky-400" />
                <span>Upload .zip</span>
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleTriggerFolder}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-background hover:bg-muted text-foreground border border-border text-2xs font-medium transition-colors"
                title="Upload local folder directly"
              >
                <FolderUpIcon className="size-3 text-amber-400" />
                <span>Upload Folder</span>
              </button>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border/60">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => projectCreateModalStore.close()}
              className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!projectName.trim() || (isCloneMode && !gitRepoUrl.trim()) || isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
            >
              {isSubmitting ? (
                <>
                  <Loader2Icon className="size-3.5 animate-spin" />
                  <span>{isCloneMode ? "Cloning Repository..." : "Creating Project..."}</span>
                </>
              ) : (
                <>
                  {isCloneMode ? (
                    <GitBranchIcon className="size-3.5 text-sky-300" />
                  ) : (
                    <FolderGit2Icon className="size-3.5" />
                  )}
                  <span>{isCloneMode ? "Clone & Open" : "Create Project"}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
