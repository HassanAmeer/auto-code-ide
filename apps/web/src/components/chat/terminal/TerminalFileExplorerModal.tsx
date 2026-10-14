import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Folder,
  File,
  FileCode,
  FileArchive,
  FileText,
  FileImage,
  ChevronRight,
  ArrowUp,
  RotateCw,
  X,
  Download,
  Eye,
  Terminal,
  Check,
  Copy,
  Search,
  ExternalLink,
} from "lucide-react";
import { resolvePrimaryEnvironmentHttpUrl } from "../../../environments/primary";
import { terminalStore } from "./terminalStore";

export interface FileItem {
  name: string;
  size: number;
  mtime: number;
}

export interface BrowseResponse {
  ok: boolean;
  currentPath: string;
  parentPath?: string;
  homePath?: string;
  directories: string[];
  files?: FileItem[];
  error?: string;
}

export interface TerminalFileExplorerModalProps {
  initialPath: string;
  isOpen: boolean;
  onClose: () => void;
  onSelectPath?: (path: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (["zip", "tar", "gz", "tgz", "rar", "7z"].includes(ext || "")) {
    return <FileArchive className="size-4 text-amber-400 shrink-0" />;
  }
  if (
    ["ts", "tsx", "js", "jsx", "json", "py", "sh", "html", "css", "rs", "go"].includes(ext || "")
  ) {
    return <FileCode className="size-4 text-sky-400 shrink-0" />;
  }
  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext || "")) {
    return <FileImage className="size-4 text-purple-400 shrink-0" />;
  }
  if (["txt", "md", "log", "env", "conf", "yaml", "yml"].includes(ext || "")) {
    return <FileText className="size-4 text-emerald-400 shrink-0" />;
  }
  return <File className="size-4 text-zinc-400 shrink-0" />;
}

export function TerminalFileExplorerModal({
  initialPath,
  isOpen,
  onClose,
  onSelectPath,
}: TerminalFileExplorerModalProps) {
  const [currentPath, setCurrentPath] = useState(initialPath || "/");
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [directories, setDirectories] = useState<string[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Peek modal state
  const [peekFile, setPeekFile] = useState<{
    path: string;
    filename: string;
    content: string;
    size: number;
    truncated: boolean;
  } | null>(null);
  const [isPeeking, setIsPeeking] = useState(false);
  const [copiedPeek, setCopiedPeek] = useState(false);

  const loadDirectory = useCallback(async (dirPath: string) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(resolvePrimaryEnvironmentHttpUrl("/api/fs/browse"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: dirPath }),
      });
      const data = (await res.json()) as BrowseResponse;
      if (data.ok) {
        setCurrentPath(data.currentPath);
        setParentPath(data.parentPath ?? null);
        setDirectories(data.directories || []);
        setFiles(data.files || []);
      } else {
        setErrorMsg(data.error || "Failed to load directory");
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void loadDirectory(initialPath || "/");
    }
  }, [isOpen, initialPath, loadDirectory]);

  const handleNavigate = (subDir: string) => {
    const nextPath = currentPath.endsWith("/")
      ? `${currentPath}${subDir}`
      : `${currentPath}/${subDir}`;
    void loadDirectory(nextPath);
  };

  const handleNavigateUp = () => {
    if (parentPath && parentPath !== currentPath) {
      void loadDirectory(parentPath);
    }
  };

  const handleSetAsCwd = () => {
    terminalStore.setActiveCwd(currentPath);
    if (onSelectPath) {
      onSelectPath(currentPath);
    }
    onClose();
  };

  const handlePeekFile = async (fileName: string) => {
    const fullPath = currentPath.endsWith("/")
      ? `${currentPath}${fileName}`
      : `${currentPath}/${fileName}`;
    setIsPeeking(true);
    try {
      const res = await fetch(resolvePrimaryEnvironmentHttpUrl("/api/fs/peek"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: fullPath }),
      });
      const data = await res.json();
      if (data.ok) {
        setPeekFile({
          path: fullPath,
          filename: fileName,
          content: data.content,
          size: data.size,
          truncated: data.truncated,
        });
      }
    } finally {
      setIsPeeking(false);
    }
  };

  const handleDownloadFile = (fileName: string) => {
    const fullPath = currentPath.endsWith("/")
      ? `${currentPath}${fileName}`
      : `${currentPath}/${fileName}`;
    const downloadUrl = resolvePrimaryEnvironmentHttpUrl(
      `/api/fs/download?path=${encodeURIComponent(fullPath)}`,
    );
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleRunCatInTerminal = (fileName: string) => {
    const fullPath = currentPath.endsWith("/")
      ? `${currentPath}${fileName}`
      : `${currentPath}/${fileName}`;
    void terminalStore.runCommand(`cat "${fullPath}"`, currentPath, "bash");
    onClose();
  };

  // Filter items by search
  const filteredDirs = useMemo(() => {
    if (!searchQuery.trim()) return directories;
    return directories.filter((d) => d.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [directories, searchQuery]);

  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return files;
    return files.filter((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [files, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-4xl max-h-[85vh] flex flex-col rounded-2xl bg-[#0c1017] border border-zinc-800 shadow-2xl text-zinc-100 overflow-hidden font-sans">
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 bg-[#161b22] px-4 py-3 select-none">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 mr-2">
              <span className="size-3 rounded-full bg-[#ff5f56]" />
              <span className="size-3 rounded-full bg-[#ffbd2e]" />
              <span className="size-3 rounded-full bg-[#27c93f]" />
            </div>
            <Folder className="size-4 text-amber-400" />
            <span className="font-semibold text-sm text-zinc-100">Server File Explorer</span>
            <span className="text-zinc-500 text-xs">· File Peek & Download</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSetAsCwd}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow transition-all hover:scale-105 active:scale-95"
              title="Set this folder as terminal working directory"
            >
              <Terminal className="size-3.5" />
              <span>Set as Terminal CWD</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Path & Controls Navigation Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-[#0e141e] border-b border-zinc-800 text-xs">
          {/* Path Breadcrumbs */}
          <div className="flex items-center gap-1 flex-1 overflow-x-auto py-1 scrollbar-none font-mono text-xs">
            <button
              type="button"
              onClick={handleNavigateUp}
              disabled={!parentPath || parentPath === currentPath}
              className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-zinc-300 transition-colors mr-1"
              title="Go to parent directory (..)"
            >
              <ArrowUp className="size-3.5" />
            </button>

            <span className="text-zinc-500 font-mono">/</span>
            {currentPath
              .split("/")
              .filter(Boolean)
              .map((segment, idx, arr) => {
                const segPath = "/" + arr.slice(0, idx + 1).join("/");
                const isLast = idx === arr.length - 1;
                return (
                  <span key={segPath} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void loadDirectory(segPath)}
                      className={`hover:underline font-mono ${
                        isLast ? "font-bold text-amber-400" : "text-zinc-400"
                      }`}
                    >
                      {segment}
                    </button>
                    {!isLast && <ChevronRight className="size-3 text-zinc-600" />}
                  </span>
                );
              })}
          </div>

          {/* Quick Actions & Search */}
          <div className="flex items-center gap-2">
            <div className="relative flex items-center">
              <Search className="size-3 text-zinc-500 absolute left-2" />
              <input
                type="text"
                placeholder="Filter files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-7 pr-2 py-1 rounded bg-zinc-800/80 border border-zinc-700 text-zinc-200 text-xs w-36 sm:w-48 focus:outline-none focus:border-amber-500/50"
              />
            </div>

            <button
              type="button"
              onClick={() => void loadDirectory(currentPath)}
              disabled={isLoading}
              className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
              title="Refresh directory"
            >
              <RotateCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Directory & Files Grid / List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[60vh] scrollbar-thin scrollbar-thumb-zinc-800">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs">
              {errorMsg}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-zinc-500 text-xs gap-2">
              <RotateCw className="size-4 animate-spin text-amber-400" />
              <span>Scanning directory entries...</span>
            </div>
          ) : (
            <>
              {/* Folders Section */}
              {filteredDirs.length > 0 && (
                <div>
                  <div className="text-3xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Folder className="size-3 text-amber-400" />
                    <span>Folders ({filteredDirs.length})</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {filteredDirs.map((dir) => (
                      <button
                        key={dir}
                        type="button"
                        onClick={() => handleNavigate(dir)}
                        className="flex items-center gap-2 p-2 rounded-xl bg-zinc-900/60 hover:bg-amber-500/10 border border-zinc-800 hover:border-amber-500/40 text-left transition-all group"
                      >
                        <Folder className="size-4 text-amber-400 shrink-0 group-hover:scale-110 transition-transform" />
                        <span className="font-mono text-xs text-zinc-200 truncate group-hover:text-amber-300 flex-1">
                          {dir}
                        </span>
                        <ChevronRight className="size-3 text-zinc-600 group-hover:text-amber-400 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Files Section */}
              {filteredFiles.length > 0 && (
                <div>
                  <div className="text-3xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <File className="size-3 text-sky-400" />
                    <span>Files ({filteredFiles.length})</span>
                  </div>
                  <div className="divide-y divide-zinc-800/60 rounded-xl border border-zinc-800 bg-[#070a0f] overflow-hidden">
                    {filteredFiles.map((file) => (
                      <div
                        key={file.name}
                        className="flex items-center justify-between px-3 py-2 text-xs hover:bg-zinc-800/40 transition-colors group"
                      >
                        <div className="flex items-center gap-2.5 truncate flex-1 pr-2">
                          {getFileIcon(file.name)}
                          <span className="font-mono text-zinc-200 truncate">{file.name}</span>
                          <span className="text-3xs font-mono text-zinc-500 shrink-0">
                            {formatBytes(file.size)}
                          </span>
                        </div>

                        {/* File Actions */}
                        <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100">
                          {/* Peek File Content */}
                          <button
                            type="button"
                            onClick={() => void handlePeekFile(file.name)}
                            disabled={isPeeking}
                            className="p-1 rounded bg-zinc-800 hover:bg-sky-500/20 hover:text-sky-300 text-zinc-400 transition-colors"
                            title="Quick peek file content"
                          >
                            <Eye className="size-3.5" />
                          </button>

                          {/* Download File */}
                          <button
                            type="button"
                            onClick={() => handleDownloadFile(file.name)}
                            className="p-1 rounded bg-zinc-800 hover:bg-emerald-500/20 hover:text-emerald-300 text-zinc-400 transition-colors"
                            title="Download file to computer"
                          >
                            <Download className="size-3.5" />
                          </button>

                          {/* Run cat in Terminal */}
                          <button
                            type="button"
                            onClick={() => handleRunCatInTerminal(file.name)}
                            className="p-1 rounded bg-zinc-800 hover:bg-purple-500/20 hover:text-purple-300 text-zinc-400 transition-colors"
                            title="Print output in AI Terminal ($ cat file)"
                          >
                            <Terminal className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {filteredDirs.length === 0 && filteredFiles.length === 0 && (
                <div className="text-center py-12 text-zinc-500 text-xs font-mono">
                  (Empty directory or no items matching search filter)
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Summary */}
        <div className="flex items-center justify-between border-t border-zinc-800 bg-[#161b22] px-4 py-2 text-2xs text-zinc-400 font-mono">
          <span>
            {directories.length} folders, {files.length} files
          </span>
          <span className="truncate max-w-sm" title={currentPath}>
            {currentPath}
          </span>
        </div>
      </div>

      {/* File Peek Content Modal */}
      {peekFile && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in zoom-in-95">
          <div className="relative w-full max-w-3xl max-h-[80vh] flex flex-col rounded-2xl bg-[#090d14] border border-zinc-700 shadow-2xl text-zinc-100 overflow-hidden font-mono">
            {/* Peek Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 bg-[#111722] px-4 py-2.5 text-xs">
              <div className="flex items-center gap-2 truncate">
                {getFileIcon(peekFile.filename)}
                <span className="font-bold text-zinc-100 truncate">{peekFile.filename}</span>
                <span className="text-3xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
                  {formatBytes(peekFile.size)}
                </span>
                {peekFile.truncated && (
                  <span className="text-3xs text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded">
                    First 64KB Shown
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(peekFile.content);
                    setCopiedPeek(true);
                    setTimeout(() => setCopiedPeek(false), 1500);
                  }}
                  className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
                  title="Copy file text"
                >
                  {copiedPeek ? (
                    <Check className="size-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadFile(peekFile.filename)}
                  className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400 transition-colors"
                  title="Download file"
                >
                  <Download className="size-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => setPeekFile(null)}
                  className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-rose-400 transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* Peek Body */}
            <pre className="p-4 flex-1 overflow-auto text-xs leading-relaxed text-zinc-300 bg-[#05080e] scrollbar-thin scrollbar-thumb-zinc-800 whitespace-pre-wrap select-text">
              {peekFile.content || "(Empty file)"}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
