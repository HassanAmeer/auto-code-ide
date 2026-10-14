import { memo, useState, useRef } from "react";
import {
  FileArchive,
  Upload,
  Download,
  X,
  Check,
  Loader2,
  Folder,
  Plus,
  AlertCircle,
  FileCode,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { downloadProjectZip, extractZipToProject } from "~/lib/projectZipUtils";
import { useImportLocalProject } from "~/hooks/useImportLocalProject";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";

export interface ProjectZipModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeProject?: EnvironmentProject | null;
  mode?: "extract" | "download";
}

export const ProjectZipModal = memo(function ProjectZipModal({
  isOpen,
  onClose,
  activeProject,
  mode: initialMode = "extract",
}: ProjectZipModalProps) {
  const [mode, setMode] = useState<"extract" | "download">(initialMode);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [extractDestination, setExtractDestination] = useState<"current" | "new">("current");
  const [newProjectName, setNewProjectName] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { importZipFile } = useImportLocalProject();

  if (!isOpen) return null;

  const currentProjectName = activeProject?.title || "Active Project";
  const currentProjectCwd = activeProject?.workspaceRoot || "";

  const handleFileSelect = (file: File) => {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setErrorMessage("Please select a valid .zip file.");
      return;
    }
    setErrorMessage(null);
    setSelectedFile(file);
    const inferred = file.name.replace(/\.zip$/i, "").replace(/[^a-zA-Z0-9_-]/g, "-");
    setNewProjectName(inferred);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]!);
    }
  };

  const handleExtractSubmit = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    setErrorMessage(null);
    setStatusMessage("Extracting ZIP archive on server...");

    try {
      if (extractDestination === "current" && currentProjectCwd) {
        // Extract directly into active project root
        const result = await extractZipToProject(selectedFile, currentProjectCwd);
        if (!result.ok) {
          throw new Error(result.error || "Failed to extract ZIP into current project.");
        }
        setStatusMessage(`Successfully extracted into ${currentProjectName}!`);
        setTimeout(() => {
          setIsProcessing(false);
          onClose();
        }, 1500);
      } else {
        // Import as a new project
        const name = newProjectName.trim() || selectedFile.name.replace(/\.zip$/i, "");
        await importZipFile(selectedFile, name);
        setStatusMessage(`Successfully imported new project: ${name}!`);
        setTimeout(() => {
          setIsProcessing(false);
          onClose();
        }, 1500);
      }
    } catch (err: any) {
      setIsProcessing(false);
      setErrorMessage(err?.message || "An error occurred while extracting the ZIP file.");
    }
  };

  const handleDownloadSubmit = () => {
    if (!currentProjectCwd) return;
    setIsProcessing(true);
    setStatusMessage("Packaging project into clean ZIP (excluding node_modules & .git)...");
    downloadProjectZip(currentProjectCwd, currentProjectName);
    setTimeout(() => {
      setIsProcessing(false);
      setStatusMessage("Download started!");
      setTimeout(onClose, 1000);
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in-50 duration-150">
      <div className="w-full max-w-lg rounded-2xl border border-border/80 bg-card p-6 shadow-2xl text-foreground text-xs space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-500/15 text-sky-400 border border-sky-500/30">
              <FileArchive className="size-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-foreground">Project ZIP Archive Tools</h3>
              <p className="text-3xs text-muted-foreground mt-0.5">
                Download project without dependencies or upload and auto-extract ZIP archives.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Mode Switch Tabs */}
        <div className="flex items-center p-1 rounded-xl bg-muted/40 border border-border/60">
          <button
            type="button"
            onClick={() => setMode("extract")}
            className={cn(
              "flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer",
              mode === "extract"
                ? "bg-background text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Upload className="size-3.5 text-sky-400" />
            <span>Upload & Extract ZIP</span>
          </button>

          <button
            type="button"
            onClick={() => setMode("download")}
            className={cn(
              "flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer",
              mode === "download"
                ? "bg-background text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Download className="size-3.5 text-emerald-400" />
            <span>Download Project ZIP</span>
          </button>
        </div>

        {/* Error message */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-3xs flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Success message */}
        {statusMessage && !errorMessage && (
          <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-3xs flex items-center gap-2">
            {isProcessing ? (
              <Loader2 className="size-4 animate-spin shrink-0" />
            ) : (
              <Check className="size-4 shrink-0" />
            )}
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Content based on Mode */}
        {mode === "extract" ? (
          <div className="space-y-4">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileSelect(e.target.files[0]);
                }
              }}
            />

            {/* Drag & Drop Area */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer space-y-2",
                isDragOver
                  ? "border-sky-500 bg-sky-500/10 ring-2 ring-sky-500/20"
                  : selectedFile
                    ? "border-emerald-500/60 bg-emerald-500/5"
                    : "border-border/80 hover:border-sky-500/60 hover:bg-muted/30",
              )}
            >
              {selectedFile ? (
                <div className="space-y-1">
                  <div className="size-10 rounded-2xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
                    <FileCode className="size-5" />
                  </div>
                  <div className="font-semibold text-xs text-foreground truncate max-w-xs mx-auto">
                    {selectedFile.name}
                  </div>
                  <div className="text-3xs text-muted-foreground font-mono">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB &bull; Ready to extract
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Upload className="size-8 mx-auto text-muted-foreground/60" />
                  <p className="font-medium text-xs">
                    Drop a <span className="text-sky-400 font-mono font-semibold">.zip</span> file
                    here, or click to browse
                  </p>
                  <p className="text-3xs text-muted-foreground">
                    Accepts project ZIP archives from GitHub, local backups, or web templates.
                  </p>
                </div>
              )}
            </div>

            {/* Destination Selection */}
            {selectedFile && (
              <div className="space-y-2 bg-muted/20 border border-border/50 rounded-xl p-3">
                <label className="block font-medium text-3xs text-muted-foreground uppercase tracking-wider">
                  Extraction Destination:
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setExtractDestination("current")}
                    disabled={!currentProjectCwd}
                    className={cn(
                      "flex items-start gap-2 p-2.5 rounded-xl border text-left transition-all cursor-pointer",
                      extractDestination === "current"
                        ? "bg-sky-500/15 border-sky-500/50 text-sky-200 ring-1 ring-sky-500/30"
                        : "bg-background/60 border-border/60 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Folder className="size-4 shrink-0 text-sky-400 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-2xs truncate">Into Current Project</div>
                      <div className="text-4xs text-muted-foreground truncate">
                        {currentProjectName}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExtractDestination("new")}
                    className={cn(
                      "flex items-start gap-2 p-2.5 rounded-xl border text-left transition-all cursor-pointer",
                      extractDestination === "new"
                        ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-200 ring-1 ring-emerald-500/30"
                        : "bg-background/60 border-border/60 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Plus className="size-4 shrink-0 text-emerald-400 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-2xs truncate">As New Project</div>
                      <div className="text-4xs text-muted-foreground truncate">
                        Create fresh workspace
                      </div>
                    </div>
                  </button>
                </div>

                {extractDestination === "new" && (
                  <div className="pt-2">
                    <label className="block text-3xs font-medium text-foreground mb-1">
                      New Project Name
                    </label>
                    <input
                      type="text"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      placeholder="e.g. my-extracted-app"
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
              <button
                type="button"
                onClick={onClose}
                disabled={isProcessing}
                className="px-3.5 py-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExtractSubmit}
                disabled={!selectedFile || isProcessing}
                className={cn(
                  "px-4 py-1.5 rounded-xl font-medium flex items-center gap-1.5 transition-all cursor-pointer shadow-xs",
                  selectedFile && !isProcessing
                    ? "bg-sky-500 hover:bg-sky-600 text-white"
                    : "bg-muted text-muted-foreground/50 cursor-not-allowed",
                )}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>Extracting...</span>
                  </>
                ) : (
                  <>
                    <FileArchive className="size-3.5" />
                    <span>Extract ZIP Now</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Download Explanation Card */}
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                <Check className="size-4" />
                <span>Clean GitHub-Style Export</span>
              </div>
              <p className="text-3xs text-muted-foreground leading-relaxed">
                Just like GitHub’s &quot;Download ZIP&quot;, this packages your project without
                bulky dependencies or caches:
              </p>
              <ul className="text-4xs text-muted-foreground font-mono space-y-0.5 list-disc pl-4">
                <li>
                  <strong className="text-emerald-300">Included:</strong> All source code, configs,
                  package.json, documentation.
                </li>
                <li>
                  <strong className="text-rose-400">Excluded:</strong> node_modules, .git, .next,
                  dist, build, .cache, .turbo, .venv.
                </li>
              </ul>
            </div>

            {/* Target Project Info */}
            <div className="p-3 rounded-xl bg-muted/30 border border-border/50 flex items-center justify-between">
              <div>
                <span className="text-3xs text-muted-foreground block">Target Project:</span>
                <span className="font-semibold text-xs text-foreground">{currentProjectName}</span>
              </div>
              <span className="font-mono text-3xs text-muted-foreground truncate max-w-[200px] bg-background px-2 py-1 rounded-md border border-border/40">
                {currentProjectCwd || "None selected"}
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
              <button
                type="button"
                onClick={onClose}
                disabled={isProcessing}
                className="px-3.5 py-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDownloadSubmit}
                disabled={!currentProjectCwd || isProcessing}
                className={cn(
                  "px-4 py-1.5 rounded-xl font-medium flex items-center gap-1.5 transition-all cursor-pointer shadow-xs",
                  currentProjectCwd && !isProcessing
                    ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                    : "bg-muted text-muted-foreground/50 cursor-not-allowed",
                )}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>Packaging ZIP...</span>
                  </>
                ) : (
                  <>
                    <Download className="size-3.5" />
                    <span>Download Project ZIP</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
