"use client";

import type { EnvironmentId } from "@t3tools/contracts";
import { FileCode, Loader2, Maximize2, Save, Search, X } from "lucide-react";
import {
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { resolvePrimaryEnvironmentHttpUrl } from "~/environments/primary";
import {
  setProjectFileQueryData,
  useProjectFileQuery,
} from "~/components/files/projectFilesQueryState";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { toastManager } from "~/components/ui/toast";
import { cn } from "~/lib/utils";
import { projectEnvironment } from "~/state/projects";
import { useAtomCommand } from "~/state/use-atom-command";

export interface SplitCodeEditorTarget {
  readonly relativePath: string;
  readonly lineNumber?: number | null;
  readonly componentName?: string | null;
  readonly selector?: string | null;
  readonly htmlPreview?: string | null;
}

interface PreviewSplitCodeEditorProps {
  readonly target: SplitCodeEditorTarget;
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly onClose: () => void;
  readonly onOpenInFullPanel?: (relativePath: string, line?: number) => void;
  readonly onSaveSuccess?: () => void;
}

export function PreviewSplitCodeEditor({
  target,
  environmentId,
  cwd,
  onClose,
  onOpenInFullPanel,
  onSaveSuccess,
}: PreviewSplitCodeEditorProps) {
  const [currentPath, setCurrentPath] = useState(target.relativePath);
  const [pathInput, setPathInput] = useState(target.relativePath);
  const [editingPath, setEditingPath] = useState(false);
  const [editorHeight, setEditorHeight] = useState(320);
  const isResizingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(320);

  // Sync state if target changes from a new element pick
  useEffect(() => {
    setCurrentPath(target.relativePath);
    setPathInput(target.relativePath);
    if (initialLoadedRef.current !== target.relativePath) {
      initialLoadedRef.current = null;
    }
  }, [target.relativePath]);

  const fileQuery = useProjectFileQuery(
    environmentId,
    cwd,
    currentPath ? currentPath : null,
    Boolean(currentPath),
  );

  const [content, setContent] = useState<string>("");
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const initialLoadedRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lineNumbersRef = useRef<HTMLDivElement | null>(null);

  const writeFile = useAtomCommand(projectEnvironment.writeFile);

  // Sync content when server file loads or path changes
  useEffect(() => {
    if (fileQuery.data && initialLoadedRef.current !== currentPath) {
      initialLoadedRef.current = currentPath;
      setContent(fileQuery.data.contents);
      setIsDirty(false);
    }
  }, [currentPath, fileQuery.data]);

  // Determine target line number: either from target or resolved from component/selector
  const [activeLine, setActiveLine] = useState<number>(target.lineNumber ?? 1);

  // Scroll to reveal target line on initial load or target change, and focus element
  useEffect(() => {
    if (!content) return;
    let targetLine = target.lineNumber ?? 1;

    // If target line is 1 or missing, search content for component name, selector, or htmlPreview
    if (targetLine <= 1) {
      const lines = content.split("\n");
      let foundIndex = -1;

      if (target.componentName) {
        foundIndex = lines.findIndex(
          (l) =>
            l.includes(`function ${target.componentName}`) ||
            l.includes(`const ${target.componentName}`) ||
            l.includes(`class ${target.componentName}`) ||
            l.includes(`<${target.componentName}`) ||
            l.includes(target.componentName!),
        );
      }

      if (foundIndex === -1 && target.selector) {
        const idMatch = target.selector.match(/#([a-zA-Z0-9_-]+)/);
        if (idMatch && idMatch[1]) {
          foundIndex = lines.findIndex((l) => l.includes(idMatch[1]!));
        }

        if (foundIndex === -1) {
          const classMatches = target.selector.match(/\.([a-zA-Z0-9_-]+)/g);
          if (classMatches) {
            for (const cm of classMatches) {
              const className = cm.slice(1);
              const idx = lines.findIndex((l) => l.includes(className));
              if (idx !== -1) {
                foundIndex = idx;
                break;
              }
            }
          }
        }
      }

      if (foundIndex === -1 && target.htmlPreview) {
        // Try to match visible text snippet inside htmlPreview
        const textMatch = target.htmlPreview.match(/>([^<]{3,50})</);
        if (textMatch && textMatch[1]?.trim()) {
          const text = textMatch[1].trim();
          const idx = lines.findIndex((l) => l.includes(text));
          if (idx !== -1) {
            foundIndex = idx;
          }
        }
      }

      if (foundIndex !== -1) {
        targetLine = foundIndex + 1;
      }
    }

    setActiveLine(targetLine);

    if (textareaRef.current) {
      const lines = content.split("\n");
      const targetIdx = Math.max(0, Math.min(lines.length - 1, targetLine - 1));
      const lineHeight = 20; // approximate line height in px
      const targetScrollTop = Math.max(0, targetIdx * lineHeight - 60);

      textareaRef.current.scrollTop = targetScrollTop;
      if (lineNumbersRef.current) {
        lineNumbersRef.current.scrollTop = targetScrollTop;
      }

      // Highlight and focus the target line in the textarea
      let charOffset = 0;
      for (let i = 0; i < targetIdx; i++) {
        charOffset += (lines[i]?.length ?? 0) + 1;
      }
      const lineEnd = charOffset + (lines[targetIdx]?.length ?? 0);
      try {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(charOffset, lineEnd);
      } catch {
        // ignore
      }
    }
  }, [content, target.componentName, target.htmlPreview, target.lineNumber, target.selector]);

  const handleSave = useCallback(async () => {
    if (!currentPath || isSaving) return;
    setIsSaving(true);
    try {
      let saved = false;

      // Primary attempt: standard environment RPC writeFile
      try {
        const result = await writeFile({
          environmentId,
          input: { cwd, relativePath: currentPath, contents: content },
        });
        if (result._tag === "Success") {
          saved = true;
        }
      } catch {
        // Fall back to direct fs save endpoint
      }

      // Fallback: direct HTTP fs save endpoint
      if (!saved) {
        const fullPath = currentPath.startsWith("/")
          ? currentPath
          : `${cwd.replace(/\/+$/, "")}/${currentPath.replace(/^\/+/, "")}`;
        const res = await fetch(resolvePrimaryEnvironmentHttpUrl("/api/fs/save"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: fullPath, content }),
        });
        const data = await res.json().catch(() => null);
        if (data && data.ok) {
          saved = true;
        }
      }

      if (saved) {
        setIsDirty(false);
        setProjectFileQueryData(environmentId, cwd, currentPath, content);
        fileQuery.refresh();
        onSaveSuccess?.();
        toastManager.add({
          type: "success",
          title: "File Saved",
          description: `${currentPath} updated successfully.`,
        });
      } else {
        toastManager.add({
          type: "error",
          title: "Failed to Save",
          description: "Could not save file to disk.",
        });
      }
    } catch (err) {
      toastManager.add({
        type: "error",
        title: "Save Error",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSaving(false);
    }
  }, [content, currentPath, cwd, environmentId, fileQuery, isSaving, onSaveSuccess, writeFile]);

  // Ctrl+S / Cmd+S shortcut
  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        e.stopPropagation();
        void handleSave();
      } else if (e.key === "Escape") {
        if (editingPath) setEditingPath(false);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [editingPath, handleSave]);

  // Sync line numbers scrolling with textarea
  const handleScroll = useCallback(() => {
    if (!textareaRef.current || !lineNumbersRef.current) return;
    lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
  }, []);

  // Handle Tab key indentation inside textarea while preserving native Undo/Redo stack
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const textarea = e.currentTarget;
      try {
        if (typeof document !== "undefined" && document.queryCommandSupported?.("insertText")) {
          document.execCommand("insertText", false, "  ");
          setContent(textarea.value);
          setIsDirty(true);
          return;
        }
      } catch {
        // fallback to manual slice
      }
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const nextContent = content.substring(0, start) + "  " + content.substring(end);
      setContent(nextContent);
      setIsDirty(true);
      queueMicrotask(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      });
    }
  };

  // Resize split panel vertically
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    startYRef.current = e.clientY;
    startHeightRef.current = editorHeight;

    const onMouseMove = (ev: MouseEvent) => {
      if (!isResizingRef.current) return;
      const delta = startYRef.current - ev.clientY;
      const nextHeight = Math.max(
        160,
        Math.min(window.innerHeight * 0.75, startHeightRef.current + delta),
      );
      setEditorHeight(nextHeight);
    };

    const onMouseUp = () => {
      isResizingRef.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const lineCount = Math.max(1, content.split("\n").length);
  const targetLine = activeLine;

  return (
    <div
      style={{ height: `${editorHeight}px` }}
      className="relative flex flex-col border-t border-border bg-background shadow-2xl transition-[height] duration-75"
    >
      {/* Draggable resize handle */}
      <div
        onMouseDown={startResize}
        className="group absolute -top-1.5 inset-x-0 z-30 h-3 cursor-row-resize flex items-center justify-center"
      >
        <div className="h-1 w-12 rounded-full bg-border group-hover:bg-primary transition-colors" />
      </div>

      {/* Header toolbar */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border/80 bg-muted/40 px-3 py-1">
        <div className="flex items-center gap-2 overflow-hidden mr-2">
          <FileCode className="size-4 shrink-0 text-primary" />
          {editingPath ? (
            <div className="flex items-center gap-1">
              <Input
                size="sm"
                value={pathInput}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setPathInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setCurrentPath(pathInput);
                    setEditingPath(false);
                  }
                }}
                className="h-6 w-52 text-xs font-mono"
                autoFocus
              />
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  setCurrentPath(pathInput);
                  setEditingPath(false);
                }}
              >
                Go
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditingPath(true)}
              className="flex items-center gap-1.5 text-xs font-mono font-medium text-foreground hover:underline truncate"
              title="Click to change file path"
            >
              <span className="truncate">{currentPath || "No file selected"}</span>
              {isDirty ? (
                <span
                  className="size-2 rounded-full bg-amber-500 shrink-0"
                  title="Unsaved changes"
                />
              ) : null}
            </button>
          )}

          {target.componentName ? (
            <span className="hidden sm:inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-mono font-medium text-primary">
              &lt;{target.componentName}&gt;
            </span>
          ) : null}

          {activeLine ? (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
              Line {activeLine}
            </span>
          ) : null}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            type="button"
            size="xs"
            variant={isDirty ? "default" : "secondary"}
            onClick={handleSave}
            disabled={isSaving || !currentPath}
            className="flex items-center gap-1 text-xs"
          >
            {isSaving ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
            <span>Save</span>
            <kbd className="hidden sm:inline-block ml-1 opacity-70 text-[9px] font-sans">
              Ctrl+S
            </kbd>
          </Button>

          {onOpenInFullPanel && currentPath ? (
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              onClick={() => onOpenInFullPanel(currentPath, target.lineNumber ?? undefined)}
              title="Open in full editor panel"
            >
              <Maximize2 className="size-3.5" />
            </Button>
          ) : null}

          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            onClick={onClose}
            title="Close code editor"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Editor Content Body */}
      <div className="relative min-h-0 flex-1 flex overflow-hidden font-mono text-xs">
        {fileQuery.isPending && !content ? (
          <div className="flex size-full items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-primary" />
            <span>Loading file {currentPath}...</span>
          </div>
        ) : fileQuery.error && !content ? (
          <div className="flex size-full flex-col items-center justify-center gap-2 p-4 text-center">
            <p className="text-sm font-medium text-destructive">Could not load file</p>
            <p className="text-xs text-muted-foreground font-mono">{currentPath}</p>
            <Button
              size="xs"
              variant="outline"
              onClick={() => setEditingPath(true)}
              className="mt-2"
            >
              <Search className="size-3 mr-1" /> Choose another file
            </Button>
          </div>
        ) : (
          <div className="relative flex size-full overflow-hidden bg-background">
            {/* Line numbers gutter */}
            <div
              ref={lineNumbersRef}
              className="select-none overflow-hidden bg-muted/20 border-r border-border/60 py-2.5 px-2.5 text-right font-mono text-[11px] leading-5 text-muted-foreground/60 w-12 shrink-0"
            >
              {Array.from({ length: lineCount }, (_, i) => {
                const lineNum = i + 1;
                const isTarget = lineNum === targetLine;
                return (
                  <div
                    key={lineNum}
                    className={cn("h-5 leading-5", isTarget && "font-bold text-primary")}
                  >
                    {lineNum}
                  </div>
                );
              })}
            </div>

            {/* Editable textarea code buffer */}
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setIsDirty(true);
              }}
              onScroll={handleScroll}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              wrap="off"
              className="size-full resize-none border-0 bg-transparent py-2.5 px-3 font-mono text-xs leading-5 text-foreground outline-none selection:bg-primary/25 placeholder:text-muted-foreground"
              placeholder="Edit code here..."
            />
          </div>
        )}
      </div>
    </div>
  );
}
