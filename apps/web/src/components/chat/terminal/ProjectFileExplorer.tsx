import { memo, useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Folder,
  FolderOpen,
  File,
  FileCode,
  FileText,
  FileArchive,
  FileImage,
  ChevronRight,
  ChevronDown,
  X,
  Plus,
  Trash2,
  Save,
  Download,
  Copy,
  Check,
  RotateCw,
  Search,
  Eye,
  Edit3,
  Layers,
  ArrowLeft,
} from "lucide-react";
import { resolvePrimaryEnvironmentHttpUrl } from "../../../environments/primary";
import { useTerminalStore, terminalStore } from "./terminalStore";
import { useProjects } from "../../../state/entities";
import { toastManager } from "../../ui/toast";
import { cn } from "../../../lib/utils";

interface FileEntry {
  name: string;
  size: number;
  mtime: number;
}

interface DirNode {
  path: string;
  name: string;
  isExpanded: boolean;
  isLoading: boolean;
  directories: string[];
  files: FileEntry[];
}

async function parseResponseJson(res: Response): Promise<{ ok: boolean; [key: string]: any }> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: text || `HTTP ${res.status}: ${res.statusText}` };
  }
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (["zip", "tar", "gz", "tgz", "rar", "7z"].includes(ext || "")) {
    return <FileArchive className="size-3.5 text-amber-400 shrink-0" />;
  }
  if (
    ["ts", "tsx", "js", "jsx", "json", "py", "sh", "html", "css", "rs", "go"].includes(ext || "")
  ) {
    return <FileCode className="size-3.5 text-sky-400 shrink-0" />;
  }
  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext || "")) {
    return <FileImage className="size-3.5 text-purple-400 shrink-0" />;
  }
  if (["txt", "md", "log", "env", "conf", "yaml", "yml"].includes(ext || "")) {
    return <FileText className="size-3.5 text-emerald-400 shrink-0" />;
  }
  return <File className="size-3.5 text-zinc-400 shrink-0" />;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export const ProjectFileExplorer = memo(function ProjectFileExplorer() {
  const store = useTerminalStore();
  const isOpen = store.isFileExplorerOpen;
  const projects = useProjects();

  // Root directory selection
  const initialRoot =
    store.activeCwd && store.activeCwd !== "/"
      ? store.activeCwd
      : projects[0]?.workspaceRoot || "/";
  const [rootPath, setRootPath] = useState<string>(initialRoot);

  // Tree state: path -> DirNode
  const [nodes, setNodes] = useState<Map<string, DirNode>>(new Map());
  const [searchQuery, setSearchQuery] = useState("");

  // Active selected file for viewer/editor
  const [selectedFile, setSelectedFile] = useState<{
    path: string;
    name: string;
    content: string;
    originalContent: string;
    size: number;
    isSaving: boolean;
    isSaved: boolean;
  } | null>(null);

  // New file/folder inline modal
  const [createModal, setCreateModal] = useState<{
    parentPath: string;
    type: "file" | "directory";
  } | null>(null);
  const [createName, setCreateName] = useState("");

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{
    path: string;
    name: string;
    isDir: boolean;
  } | null>(null);

  const [copied, setCopied] = useState(false);

  // Update root when activeCwd changes or opened
  useEffect(() => {
    if (isOpen) {
      const activeProj = projects.find((p) => p.id === store.selectedProjectId);
      const targetRoot =
        activeProj?.workspaceRoot || (store.activeCwd !== "/" ? store.activeCwd : initialRoot);
      if (targetRoot && targetRoot !== rootPath) {
        setRootPath(targetRoot);
      }
    }
  }, [isOpen, store.selectedProjectId, store.activeCwd, projects]);

  // Load a directory
  const loadDirectory = useCallback(async (dirPath: string) => {
    setNodes((prev) => {
      const next = new Map(prev);
      const existing = next.get(dirPath);
      next.set(dirPath, {
        path: dirPath,
        name: dirPath.split("/").filter(Boolean).pop() || dirPath,
        isExpanded: existing?.isExpanded ?? true,
        isLoading: true,
        directories: existing?.directories ?? [],
        files: existing?.files ?? [],
      });
      return next;
    });

    try {
      const res = await fetch(resolvePrimaryEnvironmentHttpUrl("/api/fs/browse"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: dirPath }),
      });
      const data = await parseResponseJson(res);
      if (data.ok) {
        setNodes((prev) => {
          const next = new Map(prev);
          next.set(dirPath, {
            path: dirPath,
            name: dirPath.split("/").filter(Boolean).pop() || dirPath,
            isExpanded: true,
            isLoading: false,
            directories: data.directories || [],
            files: data.files || [],
          });
          return next;
        });
      }
    } catch (err) {
      console.error("Failed to load directory:", err);
      setNodes((prev) => {
        const next = new Map(prev);
        const cur = next.get(dirPath);
        if (cur) next.set(dirPath, { ...cur, isLoading: false });
        return next;
      });
    }
  }, []);

  // When rootPath changes, reload root
  useEffect(() => {
    if (isOpen && rootPath) {
      void loadDirectory(rootPath);
    }
  }, [isOpen, rootPath, loadDirectory]);

  // Toggle folder expansion
  const toggleFolder = (dirPath: string) => {
    const node = nodes.get(dirPath);
    if (!node) {
      void loadDirectory(dirPath);
      return;
    }
    if (!node.isExpanded) {
      void loadDirectory(dirPath);
    } else {
      setNodes((prev) => {
        const next = new Map(prev);
        next.set(dirPath, { ...node, isExpanded: false });
        return next;
      });
    }
  };

  // Open file for viewing / text editing
  const openFile = async (filePath: string, fileName: string) => {
    try {
      const res = await fetch(resolvePrimaryEnvironmentHttpUrl("/api/fs/peek"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: filePath }),
      });
      const data = await parseResponseJson(res);
      if (data.ok) {
        setSelectedFile({
          path: filePath,
          name: fileName,
          content: data.content ?? "",
          originalContent: data.content ?? "",
          size: data.size ?? 0,
          isSaving: false,
          isSaved: false,
        });
      } else {
        toastManager.add({
          type: "error",
          title: "Could not open file",
          description: data.error || "File read failed",
        });
      }
    } catch (err) {
      toastManager.add({
        type: "error",
        title: "Could not open file",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // Save edited file content
  const handleSaveFile = async () => {
    if (!selectedFile || selectedFile.isSaving) return;
    setSelectedFile((prev) => (prev ? { ...prev, isSaving: true } : null));

    try {
      const res = await fetch(resolvePrimaryEnvironmentHttpUrl("/api/fs/save"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: selectedFile.path,
          content: selectedFile.content,
        }),
      });
      const data = await parseResponseJson(res);
      if (data.ok) {
        setSelectedFile((prev) =>
          prev
            ? {
                ...prev,
                originalContent: prev.content,
                isSaving: false,
                isSaved: true,
              }
            : null,
        );
        toastManager.add({
          type: "success",
          title: "File saved successfully",
          description: selectedFile.name,
        });
        setTimeout(() => {
          setSelectedFile((prev) => (prev ? { ...prev, isSaved: false } : null));
        }, 2000);
      } else {
        setSelectedFile((prev) => (prev ? { ...prev, isSaving: false } : null));
        toastManager.add({
          type: "error",
          title: "Save failed",
          description: data.error || "Could not write to file",
        });
      }
    } catch (err) {
      setSelectedFile((prev) => (prev ? { ...prev, isSaving: false } : null));
      toastManager.add({
        type: "error",
        title: "Save error",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // Create new file or folder
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createModal || !createName.trim()) return;

    try {
      const res = await fetch(resolvePrimaryEnvironmentHttpUrl("/api/fs/create"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentPath: createModal.parentPath,
          name: createName.trim(),
          type: createModal.type,
        }),
      });
      const data = await parseResponseJson(res);
      if (data.ok) {
        toastManager.add({
          type: "success",
          title: `${createModal.type === "directory" ? "Folder" : "File"} created`,
          description: createName.trim(),
        });
        void loadDirectory(createModal.parentPath);
        setCreateModal(null);
        setCreateName("");
      } else {
        toastManager.add({
          type: "error",
          title: "Creation failed",
          description: data.error || "Unable to create item",
        });
      }
    } catch (err) {
      toastManager.add({
        type: "error",
        title: "Creation error",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // Delete file or folder
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;

    try {
      const res = await fetch(resolvePrimaryEnvironmentHttpUrl("/api/fs/delete"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: deleteTarget.path }),
      });
      const data = await parseResponseJson(res);
      if (data.ok) {
        toastManager.add({
          type: "success",
          title: "Deleted successfully",
          description: deleteTarget.name,
        });

        // Close if active in editor
        if (selectedFile?.path === deleteTarget.path) {
          setSelectedFile(null);
        }

        // Reload parent directory
        const parent = deleteTarget.path.split("/").slice(0, -1).join("/") || "/";
        void loadDirectory(parent);
        setDeleteTarget(null);
      } else {
        toastManager.add({
          type: "error",
          title: "Delete failed",
          description: data.error || "Unable to delete item",
        });
      }
    } catch (err) {
      toastManager.add({
        type: "error",
        title: "Delete error",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleDownload = (filePath: string, fileName: string) => {
    const downloadUrl = resolvePrimaryEnvironmentHttpUrl(
      `/api/fs/download?path=${encodeURIComponent(filePath)}`,
    );
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCopyCode = () => {
    if (!selectedFile) return;
    void navigator.clipboard.writeText(selectedFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Recursive tree renderer
  const renderTree = (dirPath: string, depth = 0) => {
    const node = nodes.get(dirPath);
    if (!node) return null;

    return (
      <div key={dirPath} className="space-y-0.5">
        {/* Directories */}
        {node.directories.map((dirName) => {
          const subPath = dirPath.endsWith("/") ? `${dirPath}${dirName}` : `${dirPath}/${dirName}`;
          const subNode = nodes.get(subPath);
          const isExpanded = subNode?.isExpanded ?? false;

          if (
            searchQuery.trim() &&
            !dirName.toLowerCase().includes(searchQuery.toLowerCase()) &&
            !subNode?.files.some((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
          ) {
            return null;
          }

          return (
            <div key={subPath}>
              <div
                style={{ paddingLeft: `${depth * 12 + 6}px` }}
                className={cn(
                  "flex items-center justify-between py-1 px-1.5 rounded-[5px] hover:bg-zinc-800/60 text-zinc-300 transition-colors group cursor-pointer text-xs select-none",
                )}
                onClick={() => toggleFolder(subPath)}
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  {isExpanded ? (
                    <ChevronDown className="size-3 text-zinc-400 shrink-0" />
                  ) : (
                    <ChevronRight className="size-3 text-zinc-400 shrink-0" />
                  )}
                  {isExpanded ? (
                    <FolderOpen className="size-3.5 text-amber-400 shrink-0" />
                  ) : (
                    <Folder className="size-3.5 text-amber-400 shrink-0" />
                  )}
                  <span className="truncate font-medium">{dirName}</span>
                </div>

                {/* Folder action buttons */}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCreateModal({ parentPath: subPath, type: "file" });
                    }}
                    title="Add file inside this folder"
                    className="p-1 rounded-[3px] text-zinc-400 hover:text-emerald-400 hover:bg-zinc-700/60"
                  >
                    <Plus className="size-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget({ path: subPath, name: dirName, isDir: true });
                    }}
                    title="Delete folder"
                    className="p-1 rounded-[3px] text-zinc-400 hover:text-rose-400 hover:bg-zinc-700/60"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </div>

              {/* Recursive child nodes */}
              {isExpanded && renderTree(subPath, depth + 1)}
            </div>
          );
        })}

        {/* Files */}
        {node.files.map((file) => {
          const filePath = dirPath.endsWith("/")
            ? `${dirPath}${file.name}`
            : `${dirPath}/${file.name}`;
          const isSelected = selectedFile?.path === filePath;

          if (searchQuery.trim() && !file.name.toLowerCase().includes(searchQuery.toLowerCase())) {
            return null;
          }

          return (
            <div
              key={filePath}
              style={{ paddingLeft: `${depth * 12 + 20}px` }}
              onClick={() => void openFile(filePath, file.name)}
              className={cn(
                "flex items-center justify-between py-1 px-1.5 rounded-[5px] transition-colors group cursor-pointer text-xs select-none",
                isSelected
                  ? "bg-sky-500/20 text-sky-200 font-semibold border border-sky-500/30"
                  : "text-zinc-300 hover:bg-zinc-800/60 hover:text-zinc-100 border border-transparent",
              )}
            >
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                {getFileIcon(file.name)}
                <span className="truncate">{file.name}</span>
                <span className="text-4xs text-zinc-500 font-mono hidden group-hover:inline">
                  {formatBytes(file.size)}
                </span>
              </div>

              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownload(filePath, file.name);
                  }}
                  title="Download file"
                  className="p-1 rounded-[3px] text-zinc-400 hover:text-sky-300 hover:bg-zinc-700/60"
                >
                  <Download className="size-3" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget({ path: filePath, name: file.name, isDir: false });
                  }}
                  title="Delete file"
                  className="p-1 rounded-[3px] text-zinc-400 hover:text-rose-400 hover:bg-zinc-700/60"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (!isOpen) return null;

  const isDirty = selectedFile && selectedFile.content !== selectedFile.originalContent;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-5 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-6xl h-[88vh] flex flex-col rounded-[8px] bg-[#0c1017] border border-zinc-800 shadow-2xl text-zinc-100 overflow-hidden font-sans">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 bg-[#161b22] px-4 py-2.5 select-none shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 mr-1">
              <span className="size-3 rounded-full bg-[#ff5f56]" />
              <span className="size-3 rounded-full bg-[#ffbd2e]" />
              <span className="size-3 rounded-full bg-[#27c93f]" />
            </div>

            <div className="flex items-center gap-2">
              <Layers className="size-4 text-emerald-400" />
              <span className="font-semibold text-sm text-zinc-100">Project File Manager</span>
            </div>

            {/* Active Project Selector */}
            <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-700/70 rounded-[5px] px-2 py-0.5 text-xs text-zinc-300">
              <span className="text-zinc-500 text-3xs font-medium">Root:</span>
              <select
                value={rootPath}
                onChange={(e) => {
                  setRootPath(e.target.value);
                  terminalStore.setActiveCwd(e.target.value);
                }}
                className="bg-transparent text-xs text-zinc-200 focus:outline-none font-mono max-w-[200px] sm:max-w-[320px] truncate"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.workspaceRoot}>
                    {p.title} ({p.workspaceRoot})
                  </option>
                ))}
                {rootPath && !projects.some((p) => p.workspaceRoot === rootPath) && (
                  <option value={rootPath}>{rootPath}</option>
                )}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadDirectory(rootPath)}
              title="Refresh Tree"
              className="p-1.5 rounded-[5px] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            >
              <RotateCw className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => terminalStore.setFileExplorerOpen(false)}
              className="p-1.5 rounded-[5px] text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Main Content Area: Split Pane (Left: VS Code File Tree, Right: Code Editor/Viewer) */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar: Collapsible File Tree */}
          <div className="w-72 sm:w-80 border-r border-zinc-800 bg-[#0e141e] flex flex-col shrink-0 overflow-hidden">
            {/* Search & Actions Bar */}
            <div className="p-2 border-b border-zinc-800/80 space-y-2 shrink-0">
              <div className="relative flex items-center">
                <Search className="size-3.5 text-zinc-500 absolute left-2.5" />
                <input
                  type="text"
                  placeholder="Filter files & folders..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1 rounded-[5px] bg-zinc-900 border border-zinc-700/60 text-zinc-200 text-xs placeholder:text-zinc-500 focus:outline-none focus:border-sky-500/60"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 text-zinc-500 hover:text-zinc-300"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>

              {/* Action buttons on root */}
              <div className="flex items-center justify-between text-3xs text-zinc-400 px-1">
                <span>FILES & FOLDERS</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCreateModal({ parentPath: rootPath, type: "file" })}
                    title="Add file in project root"
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                  >
                    <Plus className="size-2.5" />
                    <span>File</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateModal({ parentPath: rootPath, type: "directory" })}
                    title="Add folder in project root"
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                  >
                    <Plus className="size-2.5" />
                    <span>Folder</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Tree View Container */}
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5 font-mono text-xs select-none">
              {renderTree(rootPath)}
            </div>
          </div>

          {/* Right Pane: Code Editor / Viewer */}
          <div className="flex-1 bg-[#090d14] flex flex-col overflow-hidden">
            {selectedFile ? (
              <>
                {/* Editor Top Bar */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-[#121824] shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    {getFileIcon(selectedFile.name)}
                    <span className="font-semibold text-xs text-zinc-200 truncate font-mono">
                      {selectedFile.name}
                    </span>
                    <span className="text-3xs text-zinc-500 font-mono">
                      ({formatBytes(selectedFile.size)})
                    </span>
                    {isDirty && (
                      <span
                        className="size-2 rounded-full bg-amber-400 animate-pulse"
                        title="Unsaved changes"
                      />
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      title="Copy code"
                      className="p-1.5 rounded-[5px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                    >
                      {copied ? (
                        <Check className="size-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownload(selectedFile.path, selectedFile.name)}
                      title="Download file"
                      className="p-1.5 rounded-[5px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                    >
                      <Download className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveFile}
                      disabled={selectedFile.isSaving || !isDirty}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1 rounded-[5px] font-medium text-xs transition-all shadow-xs cursor-pointer",
                        isDirty
                          ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                          : "bg-zinc-800 text-zinc-400 opacity-60 cursor-not-allowed",
                      )}
                    >
                      <Save className="size-3.5" />
                      <span>
                        {selectedFile.isSaving
                          ? "Saving..."
                          : selectedFile.isSaved
                            ? "Saved!"
                            : "Save"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedFile(null)}
                      title="Close file"
                      className="p-1.5 rounded-[5px] text-zinc-400 hover:text-white hover:bg-zinc-800"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                </div>

                {/* Textarea Editor with Line Numbers */}
                <div className="flex-1 flex overflow-hidden">
                  <textarea
                    value={selectedFile.content}
                    onChange={(e) =>
                      setSelectedFile((prev) =>
                        prev ? { ...prev, content: e.target.value } : null,
                      )
                    }
                    placeholder="Empty file..."
                    spellCheck={false}
                    className="w-full h-full p-4 bg-transparent text-zinc-100 font-mono text-xs leading-relaxed focus:outline-none resize-none selection:bg-sky-500/30"
                  />
                </div>
              </>
            ) : (
              /* Empty State */
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-zinc-500">
                <FolderOpen className="size-12 text-zinc-700 mb-3" />
                <h3 className="font-semibold text-sm text-zinc-300">
                  Select a file to view or edit
                </h3>
                <p className="text-xs text-zinc-500 max-w-sm mt-1">
                  Browse the project files from the tree on the left. Click on any file to inspect
                  code or make direct text modifications.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Modal: Create File / Folder */}
        {createModal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
            <form
              onSubmit={handleCreateSubmit}
              className="w-full max-w-sm p-4 rounded-[8px] bg-zinc-900 border border-zinc-700 shadow-2xl space-y-3"
            >
              <div className="flex items-center justify-between font-semibold text-sm text-zinc-200">
                <span>Create New {createModal.type === "directory" ? "Folder" : "File"}</span>
                <button
                  type="button"
                  onClick={() => setCreateModal(null)}
                  className="text-zinc-500 hover:text-zinc-300"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="text-2xs text-zinc-400 font-mono truncate">
                In: {createModal.parentPath}
              </div>

              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder={createModal.type === "directory" ? "folder-name" : "filename.ts"}
                className="w-full px-3 py-1.5 rounded-[5px] bg-zinc-800 border border-zinc-600 text-zinc-100 text-xs font-mono focus:outline-none focus:border-sky-500"
                autoFocus
              />

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setCreateModal(null)}
                  className="px-3 py-1 rounded-[5px] text-zinc-400 hover:text-zinc-200 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!createName.trim()}
                  className="px-3.5 py-1 rounded-[5px] bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs disabled:opacity-40"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Modal: Delete Confirmation */}
        {deleteTarget && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
            <div className="w-full max-w-sm p-4 rounded-[8px] bg-zinc-900 border border-rose-500/50 shadow-2xl space-y-3">
              <div className="font-semibold text-sm text-rose-300">
                Delete {deleteTarget.isDir ? "Folder" : "File"}?
              </div>
              <p className="text-xs text-zinc-300">
                Are you sure you want to delete{" "}
                <span className="font-mono font-bold text-white">{deleteTarget.name}</span>? This
                action cannot be undone.
              </p>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="px-3 py-1 rounded-[5px] text-zinc-400 hover:text-zinc-200 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  className="px-3.5 py-1 rounded-[5px] bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
