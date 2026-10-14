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
  ArrowUp,
  Upload,
  FolderPlus,
  Sparkles,
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

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp"]);
const BINARY_EXTENSIONS = new Set([
  "zip",
  "tar",
  "gz",
  "tgz",
  "bz2",
  "xz",
  "rar",
  "7z",
  "sqlite",
  "sqlite3",
  "db",
  "bin",
  "exe",
  "iso",
  "wasm",
  "pdf",
  "woff",
  "woff2",
  "ttf",
  "eot",
  "mp3",
  "mp4",
  "wav",
  "webm",
  "ogg",
]);

function isImageFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return IMAGE_EXTENSIONS.has(ext);
}

function isBinaryFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return BINARY_EXTENSIONS.has(ext);
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

interface SelectedFileState {
  path: string;
  name: string;
  content: string;
  originalContent: string;
  size: number;
  isSaving: boolean;
  isSaved: boolean;
  isTruncated: boolean;
  isBinary: boolean;
  isImage: boolean;
}

export const ProjectFileExplorer = memo(function ProjectFileExplorer() {
  const store = useTerminalStore();
  const isOpen = store.isFileExplorerOpen;
  const projects = useProjects();

  // Root directory selection
  const initialRoot = store.selectedProjectId
    ? store.activeCwd && store.activeCwd !== "/"
      ? store.activeCwd
      : projects.find((p) => p.id === store.selectedProjectId)?.workspaceRoot || "/"
    : "/";
  const [rootPath, setRootPath] = useState<string>(initialRoot);
  const [inputPath, setInputPath] = useState<string>(initialRoot);

  // Tree state: path -> DirNode
  const [nodes, setNodes] = useState<Map<string, DirNode>>(new Map());
  const [searchQuery, setSearchQuery] = useState("");

  // Sync inputPath when rootPath changes
  useEffect(() => {
    setInputPath(rootPath);
  }, [rootPath]);

  // Active selected file for viewer/editor
  const [selectedFile, setSelectedFile] = useState<SelectedFileState | null>(null);

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
  const [isUploading, setIsUploading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

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

  // Navigate to path (Windows Explorer style)
  const handleNavigatePath = useCallback(
    (target?: string) => {
      const raw = target !== undefined ? target : inputPath;
      const dest = raw.trim();
      if (!dest) return;
      setRootPath(dest);
      setInputPath(dest);
      terminalStore.setActiveCwd(dest);
      void loadDirectory(dest);
    },
    [inputPath, loadDirectory],
  );

  // Navigate Up one directory level
  const handleNavigateUp = useCallback(() => {
    if (rootPath === "/" || !rootPath) return;
    const parts = rootPath.split("/").filter(Boolean);
    parts.pop();
    const parent = "/" + parts.join("/");
    const dest = parent === "" ? "/" : parent;
    handleNavigatePath(dest);
  }, [rootPath, handleNavigatePath]);

  // Update root when activeCwd changes or opened
  useEffect(() => {
    if (isOpen) {
      const activeProj = projects.find((p) => p.id === store.selectedProjectId);
      const targetRoot = store.selectedProjectId
        ? activeProj?.workspaceRoot || store.activeCwd || "/"
        : "/";
      if (targetRoot && targetRoot !== rootPath) {
        setRootPath(targetRoot);
        setInputPath(targetRoot);
      }
    }
  }, [isOpen, store.selectedProjectId, store.activeCwd, projects]);

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

  // Open file for viewing / text editing / previewing
  const openFile = async (filePath: string, fileName: string) => {
    const isImg = isImageFile(fileName);
    const isBin = isBinaryFile(fileName);

    if (isImg) {
      setSelectedFile({
        path: filePath,
        name: fileName,
        content: "",
        originalContent: "",
        size: 0,
        isSaving: false,
        isSaved: false,
        isTruncated: false,
        isBinary: false,
        isImage: true,
      });
      return;
    }

    if (isBin) {
      setSelectedFile({
        path: filePath,
        name: fileName,
        content: "",
        originalContent: "",
        size: 0,
        isSaving: false,
        isSaved: false,
        isTruncated: false,
        isBinary: true,
        isImage: false,
      });
      return;
    }

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
          isTruncated: Boolean(data.truncated),
          isBinary: false,
          isImage: false,
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

    if (selectedFile.isTruncated) {
      toastManager.add({
        type: "error",
        title: "Save Blocked (Read-Only)",
        description:
          "File exceeds 256KB and was opened in read-only mode to prevent data corruption.",
      });
      return;
    }

    if (selectedFile.isBinary) {
      toastManager.add({
        type: "error",
        title: "Cannot save binary file",
        description: "Binary files cannot be edited in the browser.",
      });
      return;
    }

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

  const handleEditorScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value = textarea.value;
      const newValue = value.substring(0, start) + "  " + value.substring(end);
      setSelectedFile((prev) => (prev ? { ...prev, content: newValue } : null));
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    } else if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      void handleSaveFile();
    }
  };

  const handleAskAiAboutFile = () => {
    if (!selectedFile) return;
    const prompt = `Please review and explain this file:\nPath: \`${selectedFile.path}\`\nName: \`${selectedFile.name}\`\n\nCould you analyze this code, explain its logic, and suggest improvements or fixes?`;
    window.dispatchEvent(new CustomEvent("t3:insert-speech-text", { detail: { text: prompt } }));
    terminalStore.setFileExplorerOpen(false);
    toastManager.add({
      type: "info",
      title: "Sent to AI Chat",
      description: `Added "${selectedFile.name}" review prompt to composer.`,
    });
  };

  // 1. Extract existing ZIP archive on server disk into a project folder named after the zip
  const handleExtractExistingZip = async (zipFilePath: string, zipFileName: string) => {
    setIsExtracting(true);
    const folderName = zipFileName.replace(/\.zip$/i, "");
    toastManager.add({
      type: "info",
      title: "Extracting ZIP",
      description: `Unzipping ${zipFileName} into folder "${folderName}/"...`,
    });
    try {
      const res = await fetch(resolvePrimaryEnvironmentHttpUrl("/api/project/extract-zip"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zipPath: zipFilePath,
          extractToSubfolder: true,
        }),
      });
      const data = await parseResponseJson(res);
      if (data.ok) {
        toastManager.add({
          type: "success",
          title: "ZIP Extracted Successfully",
          description: `Folder created: ${data.folderName || folderName}`,
        });
        void loadDirectory(rootPath);
      } else {
        toastManager.add({
          type: "error",
          title: "Unzip failed",
          description: data.error || "Could not extract ZIP archive",
        });
      }
    } catch (err) {
      toastManager.add({
        type: "error",
        title: "Unzip error",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsExtracting(false);
    }
  };

  // 2. Stream large/any ZIP file upload and extract directly into a named project folder
  const handleUploadZipAndExtract = async (file: File, targetDir: string) => {
    setIsUploading(true);
    const folderName = file.name.replace(/\.zip$/i, "");
    toastManager.add({
      type: "info",
      title: "Uploading & Unzipping",
      description: `Uploading ${file.name} and extracting into "${folderName}/"...`,
    });
    try {
      const res = await fetch(
        resolvePrimaryEnvironmentHttpUrl(
          `/api/project/extract-zip?targetCwd=${encodeURIComponent(targetDir)}&zipName=${encodeURIComponent(file.name)}`,
        ),
        {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: file,
        },
      );
      const data = await parseResponseJson(res);
      if (data.ok) {
        toastManager.add({
          type: "success",
          title: "ZIP Uploaded & Extracted",
          description: `Project folder ready: ${folderName}`,
        });
        void loadDirectory(targetDir);
      } else {
        toastManager.add({
          type: "error",
          title: "Extraction failed",
          description: data.error || "Could not unzip archive",
        });
      }
    } catch (err) {
      toastManager.add({
        type: "error",
        title: "Upload error",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsUploading(false);
    }
  };

  // 3. Upload relative files (for dropped folders or folder picker)
  const handleUploadRelativeFiles = async (
    items: { file: File; relativePath: string }[],
    targetDir: string,
  ) => {
    if (items.length === 0) return;
    setIsUploading(true);
    let successCount = 0;
    toastManager.add({
      type: "info",
      title: "Uploading Folder",
      description: `Uploading ${items.length} file(s) with folder structure...`,
    });

    for (const item of items) {
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const res = reader.result as string;
            const commaIdx = res.indexOf(",");
            resolve(commaIdx >= 0 ? res.slice(commaIdx + 1) : res);
          };
          reader.onerror = reject;
          reader.readAsDataURL(item.file);
        });

        const res = await fetch(resolvePrimaryEnvironmentHttpUrl("/api/fs/upload"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetDir,
            fileName: item.relativePath,
            base64,
          }),
        });
        const data = await parseResponseJson(res);
        if (data.ok) successCount++;
      } catch (err) {
        console.error("Upload error for file:", item.relativePath, err);
      }
    }

    setIsUploading(false);
    if (successCount > 0) {
      toastManager.add({
        type: "success",
        title: "Folder Uploaded",
        description: `Successfully uploaded ${successCount} file(s).`,
      });
      void loadDirectory(targetDir);
    }
  };

  // Recursive entry reader for dropped folders
  const readEntryFiles = async (
    entry: any,
    currentPath = "",
  ): Promise<{ file: File; relativePath: string }[]> => {
    if (entry.isFile) {
      return new Promise((resolve) => {
        entry.file((file: File) => {
          resolve([
            { file, relativePath: currentPath ? `${currentPath}/${file.name}` : file.name },
          ]);
        });
      });
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const newPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
      const entries: any[] = await new Promise((resolve) => {
        const result: any[] = [];
        const readBatch = () => {
          dirReader.readEntries((batch: any[]) => {
            if (batch.length === 0) {
              resolve(result);
            } else {
              result.push(...batch);
              readBatch();
            }
          });
        };
        readBatch();
      });

      const nested = await Promise.all(entries.map((child) => readEntryFiles(child, newPath)));
      return nested.flat();
    }
    return [];
  };

  // Drag and drop event handler for files, folders, and zip archives
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      const entryPromises: Promise<{ file: File; relativePath: string }[]>[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (typeof item.webkitGetAsEntry === "function") {
          const entry = item.webkitGetAsEntry();
          if (entry) {
            entryPromises.push(readEntryFiles(entry));
          }
        }
      }

      if (entryPromises.length > 0) {
        const allResults = (await Promise.all(entryPromises)).flat();
        if (allResults.length > 0) {
          // If a single zip file is dropped, automatically upload and unzip to project folder
          if (allResults.length === 1 && allResults[0].file.name.toLowerCase().endsWith(".zip")) {
            await handleUploadZipAndExtract(allResults[0].file, rootPath);
            return;
          }
          await handleUploadRelativeFiles(allResults, rootPath);
          return;
        }
      }
    }

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      if (files.length === 1 && files[0].name.toLowerCase().endsWith(".zip")) {
        await handleUploadZipAndExtract(files[0], rootPath);
        return;
      }
      await handleUploadFiles(files, rootPath);
    }
  };

  const handleUploadFiles = async (files: FileList | File[], targetDir: string) => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);

    // If a single zip file is uploaded, stream and extract it directly
    if (fileArray.length === 1 && fileArray[0].name.toLowerCase().endsWith(".zip")) {
      await handleUploadZipAndExtract(fileArray[0], targetDir);
      return;
    }

    setIsUploading(true);
    let successCount = 0;
    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const res = reader.result as string;
            const commaIdx = res.indexOf(",");
            resolve(commaIdx >= 0 ? res.slice(commaIdx + 1) : res);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const res = await fetch(resolvePrimaryEnvironmentHttpUrl("/api/fs/upload"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetDir,
            fileName: file.name,
            base64,
          }),
        });
        const data = await parseResponseJson(res);
        if (data.ok) successCount++;
      } catch (err) {
        console.error("Upload error:", err);
      }
    }
    setIsUploading(false);
    if (successCount > 0) {
      toastManager.add({
        type: "success",
        title: "Files uploaded",
        description: `Successfully uploaded ${successCount} file(s).`,
      });
      void loadDirectory(targetDir);
    } else {
      toastManager.add({
        type: "error",
        title: "Upload failed",
        description: "Could not upload file(s). Check server connection.",
      });
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      void handleUploadFiles(e.target.files, rootPath);
      e.target.value = "";
    }
  };

  const handleFolderInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const fileList = Array.from(e.target.files);
      const relativeItems = fileList.map((f) => ({
        file: f,
        relativePath: (f as any).webkitRelativePath || f.name,
      }));
      await handleUploadRelativeFiles(relativeItems, rootPath);
      e.target.value = "";
    }
  };

  const editorLines = useMemo(() => {
    if (!selectedFile || selectedFile.isBinary || selectedFile.isImage) return [];
    return (selectedFile.content || "").split("\n");
  }, [selectedFile?.content, selectedFile?.isBinary, selectedFile?.isImage]);

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
                      handleNavigatePath(subPath);
                    }}
                    title="Open this folder as root"
                    className="p-1 rounded-[3px] text-zinc-400 hover:text-sky-300 hover:bg-zinc-700/60"
                  >
                    <FolderOpen className="size-3" />
                  </button>
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
                {file.name.toLowerCase().endsWith(".zip") && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleExtractExistingZip(filePath, file.name);
                    }}
                    title={`Unzip into ${file.name.replace(/\.zip$/i, "")}/ folder`}
                    className="p-1 rounded-[3px] text-amber-400 hover:text-amber-300 hover:bg-zinc-700/60"
                  >
                    <FileArchive className="size-3" />
                  </button>
                )}
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
        {/* Top Header & Windows-style Address/Path Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between border-b border-zinc-800/80 bg-[#161b22] px-3 py-2 select-none gap-2 shrink-0">
          {/* Left section: Mac dots, Title & Navigation Controls */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5 mr-1">
              <span className="size-3 rounded-full bg-[#ff5f56]" />
              <span className="size-3 rounded-full bg-[#ffbd2e]" />
              <span className="size-3 rounded-full bg-[#27c93f]" />
            </div>

            <div className="flex items-center gap-1.5 text-zinc-200">
              <Layers className="size-4 text-emerald-400" />
              <span className="font-semibold text-xs hidden md:inline">File Manager</span>
            </div>

            {/* Back / Up to parent folder button */}
            <button
              type="button"
              onClick={handleNavigateUp}
              disabled={rootPath === "/"}
              title="Up to parent folder"
              className={cn(
                "p-1.5 rounded-[5px] border transition-colors cursor-pointer",
                rootPath === "/"
                  ? "border-zinc-800 text-zinc-600 cursor-not-allowed"
                  : "border-zinc-700/80 text-zinc-300 hover:text-white hover:bg-zinc-800 bg-zinc-900",
              )}
            >
              <ArrowUp className="size-3.5" />
            </button>

            {/* Refresh button */}
            <button
              type="button"
              onClick={() => void loadDirectory(rootPath)}
              title="Refresh Tree"
              className="p-1.5 rounded-[5px] border border-zinc-700/80 text-zinc-300 hover:text-white hover:bg-zinc-800 bg-zinc-900 transition-colors cursor-pointer"
            >
              <RotateCw className="size-3.5" />
            </button>
          </div>

          {/* Center / Main: Windows Explorer Style Path Address Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleNavigatePath();
            }}
            className="flex-1 flex items-center gap-1 min-w-0"
          >
            <div className="flex-1 relative flex items-center bg-zinc-900 border border-zinc-700/80 rounded-[5px] focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500/20 px-2 py-1 transition-all">
              <Folder className="size-3.5 text-amber-400 mr-1.5 shrink-0" />
              <input
                type="text"
                value={inputPath}
                onChange={(e) => setInputPath(e.target.value)}
                placeholder="/path/to/folder (e.g. /, /root, /tmp)..."
                className="w-full bg-transparent text-xs text-zinc-100 placeholder:text-zinc-500 font-mono focus:outline-none"
              />
              <button
                type="submit"
                title="Go to path (Enter)"
                className="px-2 py-0.5 rounded-[4px] bg-sky-600 hover:bg-sky-500 text-white font-medium text-3xs shrink-0 cursor-pointer ml-1 transition-all"
              >
                Go
              </button>
            </div>
          </form>

          {/* Right section: Search bar & Close Button */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Search field */}
            <div className="relative flex items-center w-36 sm:w-44">
              <Search className="size-3 text-zinc-500 absolute left-2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-6 pr-6 py-1 text-xs rounded-[5px] bg-zinc-900 border border-zinc-700/80 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-sky-500/80 transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-1.5 text-zinc-500 hover:text-zinc-300 cursor-pointer p-0.5"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>

            {/* Close Modal Button */}
            <button
              type="button"
              onClick={() => terminalStore.setFileExplorerOpen(false)}
              className="p-1.5 rounded-[5px] text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
              title="Close File Manager"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Main Content Area: Split Pane (Left: VS Code File Tree, Right: Code Editor/Viewer) */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar: Collapsible File Tree (Hidden on mobile when file is open) */}
          <div
            className={cn(
              "w-full sm:w-80 border-r border-zinc-800 bg-[#0e141e] flex flex-col shrink-0 overflow-hidden",
              selectedFile ? "hidden sm:flex" : "flex",
            )}
          >
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
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileInputChange}
                    multiple
                    className="hidden"
                  />
                  <input
                    type="file"
                    ref={folderInputRef}
                    onChange={handleFolderInputChange}
                    // @ts-expect-error webkitdirectory is supported across Chromium, Firefox, and Safari
                    webkitdirectory=""
                    directory=""
                    multiple
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title="Upload files or ZIP archive (auto-extracts to project folder)"
                    disabled={isUploading}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] bg-sky-900/40 hover:bg-sky-800/60 text-sky-300 border border-sky-700/50 transition-colors cursor-pointer"
                  >
                    <Upload className="size-2.5" />
                    <span>{isUploading ? "Uploading..." : "File / ZIP"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => folderInputRef.current?.click()}
                    title="Upload entire folder structure"
                    disabled={isUploading}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] bg-sky-900/40 hover:bg-sky-800/60 text-sky-300 border border-sky-700/50 transition-colors cursor-pointer"
                  >
                    <FolderPlus className="size-2.5" />
                    <span>Upload Folder</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateModal({ parentPath: rootPath, type: "file" })}
                    title="Add file in project root"
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors cursor-pointer"
                  >
                    <Plus className="size-2.5" />
                    <span>File</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateModal({ parentPath: rootPath, type: "directory" })}
                    title="Add folder in project root"
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors cursor-pointer"
                  >
                    <Plus className="size-2.5" />
                    <span>Folder</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Tree View Container with Drag & Drop Upload */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              className={cn(
                "flex-1 overflow-y-auto p-2 space-y-0.5 font-mono text-xs select-none transition-colors",
                isDragOver && "bg-sky-500/10 border-2 border-dashed border-sky-400/60 rounded-md",
              )}
            >
              {isDragOver ? (
                <div className="py-8 text-center text-sky-300 font-sans text-xs flex flex-col items-center gap-2">
                  <Upload className="size-8 text-sky-400 animate-bounce" />
                  <span className="font-semibold">Drop files, folders, or .zip here</span>
                  <span className="text-3xs text-sky-400/80">
                    .zip files automatically extract into project folders
                  </span>
                </div>
              ) : (
                renderTree(rootPath)
              )}
            </div>
          </div>

          {/* Right Pane: Code Editor / Viewer (Hidden on mobile when no file selected) */}
          <div
            className={cn(
              "flex-1 bg-[#090d14] flex flex-col overflow-hidden",
              selectedFile ? "flex" : "hidden sm:flex",
            )}
          >
            {selectedFile ? (
              <>
                {/* Editor Top Bar */}
                <div className="flex items-center justify-between px-3 sm:px-4 py-2 border-b border-zinc-800 bg-[#121824] shrink-0 gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {/* Mobile Back to Files button */}
                    <button
                      type="button"
                      onClick={() => setSelectedFile(null)}
                      title="Back to files list"
                      className="sm:hidden flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 hover:text-white text-3xs font-medium cursor-pointer shrink-0"
                    >
                      <ArrowLeft className="size-3" />
                      <span>Files</span>
                    </button>

                    {getFileIcon(selectedFile.name)}
                    <span className="font-semibold text-xs text-zinc-200 truncate font-mono">
                      {selectedFile.name}
                    </span>
                    <span className="text-3xs text-zinc-500 font-mono hidden sm:inline">
                      ({formatBytes(selectedFile.size)})
                    </span>

                    {/* Truncated File Guard Badge */}
                    {selectedFile.isTruncated && (
                      <span
                        className="px-1.5 py-0.5 rounded text-4xs font-mono font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0"
                        title="File exceeds 256KB. Read-only to prevent data loss."
                      >
                        Read-Only (&gt;256KB)
                      </span>
                    )}

                    {isDirty && !selectedFile.isTruncated && !selectedFile.isBinary && (
                      <span
                        className="size-2 rounded-full bg-amber-400 animate-pulse shrink-0"
                        title="Unsaved changes"
                      />
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleAskAiAboutFile}
                      title="Send file context to AI Chat"
                      className="flex items-center gap-1 px-2 py-1 rounded-[5px] bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 border border-purple-500/30 text-3xs font-semibold transition-colors cursor-pointer mr-1"
                    >
                      <Sparkles className="size-3 text-purple-400" />
                      <span>Ask AI</span>
                    </button>

                    {!selectedFile.isBinary && !selectedFile.isImage && (
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
                    )}
                    <button
                      type="button"
                      onClick={() => handleDownload(selectedFile.path, selectedFile.name)}
                      title="Download file"
                      className="p-1.5 rounded-[5px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                    >
                      <Download className="size-3.5" />
                    </button>
                    {!selectedFile.isBinary && !selectedFile.isImage && (
                      <button
                        type="button"
                        onClick={handleSaveFile}
                        disabled={
                          selectedFile.isSaving ||
                          !isDirty ||
                          selectedFile.isTruncated ||
                          selectedFile.isBinary
                        }
                        title={
                          selectedFile.isTruncated
                            ? "Save disabled: File is in Read-Only mode to protect content"
                            : "Save changes (Ctrl+S)"
                        }
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-[5px] font-medium text-xs transition-all shadow-xs cursor-pointer",
                          isDirty && !selectedFile.isTruncated
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
                    )}
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

                {/* Editor / Viewer Body */}
                {selectedFile.isImage ? (
                  // Image Previewer
                  <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-auto bg-black/40">
                    <div className="relative max-w-full max-h-[60vh] flex items-center justify-center p-2 rounded-lg bg-zinc-900/60 border border-zinc-800">
                      <img
                        src={resolvePrimaryEnvironmentHttpUrl(
                          `/api/fs/download?path=${encodeURIComponent(selectedFile.path)}`,
                        )}
                        alt={selectedFile.name}
                        className="max-h-[50vh] max-w-full rounded object-contain select-none"
                      />
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-3xs text-zinc-400 font-mono">{selectedFile.name}</span>
                      <button
                        type="button"
                        onClick={() => handleDownload(selectedFile.path, selectedFile.name)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium cursor-pointer"
                      >
                        <Download className="size-3" />
                        <span>Download Image</span>
                      </button>
                    </div>
                  </div>
                ) : selectedFile.isBinary ? (
                  // Binary File Info Card
                  <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-black/30">
                    <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 flex flex-col items-center max-w-sm shadow-xl">
                      <FileArchive className="size-12 text-amber-400 mb-2" />
                      <h4 className="font-semibold text-sm text-zinc-200">{selectedFile.name}</h4>
                      <span className="text-3xs text-zinc-500 font-mono mt-0.5">
                        Binary File ({formatBytes(selectedFile.size)})
                      </span>
                      <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                        Binary files cannot be opened in the web text editor to prevent data
                        corruption.
                      </p>
                      {selectedFile.name.toLowerCase().endsWith(".zip") ? (
                        <div className="mt-4 flex flex-col sm:flex-row items-center gap-2 w-full justify-center">
                          <button
                            type="button"
                            onClick={() =>
                              void handleExtractExistingZip(selectedFile.path, selectedFile.name)
                            }
                            disabled={isExtracting}
                            className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 rounded-[5px] bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold cursor-pointer shadow-md transition-all"
                          >
                            <FileArchive className="size-3.5" />
                            <span>
                              {isExtracting
                                ? "Extracting..."
                                : `Unzip to "${selectedFile.name.replace(/\.zip$/i, "")}/"`}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownload(selectedFile.path, selectedFile.name)}
                            className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-[5px] bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium cursor-pointer"
                          >
                            <Download className="size-3.5" />
                            <span>Download .zip</span>
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleDownload(selectedFile.path, selectedFile.name)}
                          className="mt-4 flex items-center gap-1.5 px-3.5 py-1.5 rounded-[5px] bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium cursor-pointer shadow-xs"
                        >
                          <Download className="size-3.5" />
                          <span>Download File</span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  // Enhanced Code Editor with Line Numbers & Status Bar
                  <div className="flex-1 flex flex-col overflow-hidden bg-[#090d14]">
                    <div className="flex-1 flex overflow-hidden relative">
                      {/* Synchronized Line Numbers Gutter */}
                      <div
                        ref={lineNumbersRef}
                        className="w-12 sm:w-14 shrink-0 bg-[#0c1017] border-r border-zinc-800/80 py-3 px-2 text-right font-mono text-xs leading-relaxed text-zinc-600 select-none overflow-hidden"
                        aria-hidden="true"
                      >
                        {editorLines.map((_, idx) => (
                          <div key={idx}>{idx + 1}</div>
                        ))}
                      </div>

                      {/* Code Textarea */}
                      <textarea
                        ref={textareaRef}
                        value={selectedFile.content}
                        readOnly={selectedFile.isTruncated}
                        onScroll={handleEditorScroll}
                        onKeyDown={handleEditorKeyDown}
                        onChange={(e) =>
                          setSelectedFile((prev) =>
                            prev ? { ...prev, content: e.target.value } : null,
                          )
                        }
                        placeholder="Empty file..."
                        spellCheck={false}
                        className={cn(
                          "flex-1 h-full py-3 px-4 bg-transparent text-zinc-100 font-mono text-xs leading-relaxed focus:outline-none resize-none selection:bg-sky-500/30 overflow-auto whitespace-pre",
                          selectedFile.isTruncated && "opacity-90 cursor-default select-text",
                        )}
                      />
                    </div>

                    {/* Editor Footer Status Bar */}
                    <div className="flex items-center justify-between px-3 py-1 bg-[#0c1017] border-t border-zinc-800 text-3xs font-mono text-zinc-500 select-none shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-semibold">
                          {selectedFile.name.split(".").pop()?.toUpperCase() || "TXT"}
                        </span>
                        <span>{editorLines.length} lines</span>
                        <span>•</span>
                        <span>{selectedFile.content.length} chars</span>
                      </div>
                      <div className="flex items-center gap-2 text-zinc-400">
                        <span className="hidden sm:inline">UTF-8</span>
                        <span>•</span>
                        <span className="hidden sm:inline">Tab: 2 spaces</span>
                        <span>•</span>
                        <span>Ctrl+S to save</span>
                      </div>
                    </div>
                  </div>
                )}
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
