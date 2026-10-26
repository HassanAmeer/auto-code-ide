"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Pencil,
  Square,
  Circle,
  ArrowRight,
  Type,
  Undo2,
  Trash2,
  Paperclip,
  X,
  Check,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

export type DrawToolType = "pencil" | "rect" | "circle" | "arrow" | "text";

export interface DrawItem {
  id: string;
  type: DrawToolType;
  color: string;
  width: number;
  points?: Array<{ x: number; y: number }>;
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  x?: number;
  y?: number;
  text?: string;
  fontSize?: number;
}

interface PreviewDrawOverlayProps {
  readonly active: boolean;
  readonly onClose: () => void;
  readonly onAttach: (dataUrl: string) => void;
  readonly getUnderlyingCanvas: () => HTMLCanvasElement | null;
  readonly className?: string;
}

const PRESET_COLORS = [
  { name: "Red", value: "#ef4444" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Green", value: "#10b981" },
  { name: "Yellow", value: "#eab308" },
  { name: "Purple", value: "#a855f7" },
  { name: "White", value: "#ffffff" },
  { name: "Black", value: "#000000" },
];

const STROKE_WIDTHS = [
  { label: "Thin", value: 2, dotSize: "size-1.5" },
  { label: "Medium", value: 4, dotSize: "size-2.5" },
  { label: "Thick", value: 8, dotSize: "size-3.5" },
  { label: "Heavy", value: 14, dotSize: "size-4.5" },
];

function renderDrawItem(ctx: CanvasRenderingContext2D, item: DrawItem) {
  ctx.save();
  ctx.strokeStyle = item.color;
  ctx.fillStyle = item.color;
  ctx.lineWidth = item.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (item.type === "pencil" && item.points && item.points.length > 0) {
    if (item.points.length === 1) {
      ctx.beginPath();
      ctx.arc(item.points[0].x, item.points[0].y, Math.max(1, item.width / 2), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(item.points[0].x, item.points[0].y);
      for (let i = 1; i < item.points.length; i++) {
        ctx.lineTo(item.points[i].x, item.points[i].y);
      }
      ctx.stroke();
    }
  } else if (item.type === "rect" && item.start && item.end) {
    const x = Math.min(item.start.x, item.end.x);
    const y = Math.min(item.start.y, item.end.y);
    const w = Math.abs(item.end.x - item.start.x);
    const h = Math.abs(item.end.y - item.start.y);
    // Subtle background tint for box
    ctx.fillStyle = item.color.startsWith("#") ? `${item.color}15` : "rgba(239, 68, 68, 0.1)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  } else if (item.type === "circle" && item.start && item.end) {
    const rx = Math.abs(item.end.x - item.start.x) / 2;
    const ry = Math.abs(item.end.y - item.start.y) / 2;
    const cx = (item.start.x + item.end.x) / 2;
    const cy = (item.start.y + item.end.y) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
    ctx.fillStyle = item.color.startsWith("#") ? `${item.color}15` : "rgba(239, 68, 68, 0.1)";
    ctx.fill();
    ctx.stroke();
  } else if (item.type === "arrow" && item.start && item.end) {
    const fromX = item.start.x;
    const fromY = item.start.y;
    const toX = item.end.x;
    const toY = item.end.y;
    const headLen = Math.max(12, item.width * 3.2);
    const angle = Math.atan2(toY - fromY, toX - fromX);

    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(
      toX - headLen * Math.cos(angle - Math.PI / 6),
      toY - headLen * Math.sin(angle - Math.PI / 6),
    );
    ctx.lineTo(
      toX - headLen * Math.cos(angle + Math.PI / 6),
      toY - headLen * Math.sin(angle + Math.PI / 6),
    );
    ctx.closePath();
    ctx.fill();
  } else if (
    item.type === "text" &&
    item.text &&
    typeof item.x === "number" &&
    typeof item.y === "number"
  ) {
    const fontSize = item.fontSize || 16;
    ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
    const metrics = ctx.measureText(item.text);
    const pad = 4;
    // Semi-transparent dark pill background so text is always 100% readable
    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.fillRect(
      item.x - pad,
      item.y - fontSize - pad / 2,
      metrics.width + pad * 2,
      fontSize + pad * 2,
    );
    // Stroke a subtle white/colored border around the text box
    ctx.lineWidth = 1;
    ctx.strokeStyle = item.color;
    ctx.strokeRect(
      item.x - pad,
      item.y - fontSize - pad / 2,
      metrics.width + pad * 2,
      fontSize + pad * 2,
    );
    // Draw text
    ctx.fillStyle = item.color;
    ctx.fillText(item.text, item.x, item.y);
  }

  ctx.restore();
}

export function PreviewDrawOverlay({
  active,
  onClose,
  onAttach,
  getUnderlyingCanvas,
  className,
}: PreviewDrawOverlayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [currentTool, setCurrentTool] = useState<DrawToolType>("pencil");
  const [currentColor, setCurrentColor] = useState<string>("#ef4444");
  const [currentWidth, setCurrentWidth] = useState<number>(4);

  const [strokes, setStrokes] = useState<DrawItem[]>([]);
  const [undoStack, setUndoStack] = useState<DrawItem[]>([]);

  const isDrawingRef = useRef(false);
  const activeStrokeRef = useRef<DrawItem | null>(null);

  // Floating inline text input state
  const [textPrompt, setTextPrompt] = useState<{ x: number; y: number } | null>(null);
  const [textValue, setTextValue] = useState("");
  const textInputRef = useRef<HTMLInputElement | null>(null);

  // Resize canvas to match container client size
  const syncCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    redrawAll();
  }, []);

  const redrawAll = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = container.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    for (const item of strokes) {
      renderDrawItem(ctx, item);
    }
    if (activeStrokeRef.current) {
      renderDrawItem(ctx, activeStrokeRef.current);
    }

    ctx.restore();
  }, [strokes]);

  useEffect(() => {
    if (!active) return;
    syncCanvasSize();
    const ro = new ResizeObserver(() => syncCanvasSize());
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [active, syncCanvasSize]);

  useEffect(() => {
    redrawAll();
  }, [redrawAll]);

  // Handle pointer down (drawing start)
  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (currentTool === "text") {
      setTextPrompt({ x, y });
      setTextValue("");
      setTimeout(() => textInputRef.current?.focus(), 50);
      return;
    }

    isDrawingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const newStroke: DrawItem = {
      id: crypto.randomUUID(),
      type: currentTool,
      color: currentColor,
      width: currentWidth,
      start: { x, y },
      end: { x, y },
      points: [{ x, y }],
    };

    activeStrokeRef.current = newStroke;
    redrawAll();
  };

  // Handle pointer move (drawing progress)
  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !activeStrokeRef.current) return;
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const stroke = activeStrokeRef.current;
    if (stroke.type === "pencil") {
      stroke.points?.push({ x, y });
    } else {
      stroke.end = { x, y };
    }

    redrawAll();
  };

  // Handle pointer up (drawing end)
  const handlePointerUp = () => {
    if (!isDrawingRef.current || !activeStrokeRef.current) return;
    isDrawingRef.current = false;
    const completed = activeStrokeRef.current;
    activeStrokeRef.current = null;

    setStrokes((prev) => [...prev, completed]);
    setUndoStack([]);
  };

  const handleUndo = useCallback(() => {
    setStrokes((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setUndoStack((u) => [...u, last]);
      return prev.slice(0, prev.length - 1);
    });
  }, []);

  const handleClear = useCallback(() => {
    if (strokes.length === 0) return;
    setUndoStack((u) => [...u, ...strokes]);
    setStrokes([]);
  }, [strokes]);

  const commitText = () => {
    if (!textPrompt || !textValue.trim()) {
      setTextPrompt(null);
      return;
    }
    const fontSize = Math.max(14, currentWidth * 2.8);
    const item: DrawItem = {
      id: crypto.randomUUID(),
      type: "text",
      color: currentColor,
      width: currentWidth,
      x: textPrompt.x,
      y: textPrompt.y + fontSize,
      text: textValue.trim(),
      fontSize,
    };
    setStrokes((prev) => [...prev, item]);
    setTextPrompt(null);
    setTextValue("");
  };

  const cancelText = () => {
    setTextPrompt(null);
    setTextValue("");
  };

  // Export composite image
  const handleAttachClick = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = Math.round(rect.width * dpr);
    exportCanvas.height = Math.round(rect.height * dpr);
    const ctx = exportCanvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    // 1. Draw underlying live browser frame if available
    const underlying = getUnderlyingCanvas();
    if (underlying && underlying.width > 0 && underlying.height > 0) {
      const underRect = underlying.getBoundingClientRect();
      const fit = Math.min(rect.width / underlying.width, rect.height / underlying.height);
      const w = underlying.width * fit;
      const h = underlying.height * fit;
      const offsetX = (rect.width - w) / 2;
      const offsetY = (rect.height - h) / 2;

      // Fill neutral dark background behind letterbox margins
      ctx.fillStyle = "#0c0c0e";
      ctx.fillRect(0, 0, rect.width, rect.height);

      ctx.drawImage(underlying, offsetX, offsetY, w, h);
    } else {
      ctx.fillStyle = "#0c0c0e";
      ctx.fillRect(0, 0, rect.width, rect.height);
    }

    // 2. Draw all user drawings, shapes, arrows, and texts on top
    for (const item of strokes) {
      renderDrawItem(ctx, item);
    }

    const dataUrl = exportCanvas.toDataURL("image/png");
    onAttach(dataUrl);
  }, [getUnderlyingCanvas, onAttach, strokes]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        handleUndo();
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (textPrompt) {
          cancelText();
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, handleUndo, onClose, textPrompt]);

  if (!active) return null;

  return (
    <div
      ref={containerRef}
      className={cn("absolute inset-0 z-40 select-none overflow-hidden", className)}
    >
      {/* Floating Cupertino / Apple HIG Glassmorphism Toolbar */}
      <div className="absolute top-3 inset-x-0 mx-auto w-fit max-w-[96%] z-50 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 rounded-2xl border border-border/80 bg-background/95 p-1.5 sm:px-3 sm:py-2 shadow-2xl backdrop-blur-md ring-1 ring-primary/20 animate-in fade-in slide-in-from-top-2 duration-150">
        {/* Tool selector buttons */}
        <div className="flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={() => setCurrentTool("pencil")}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-md text-xs transition-colors cursor-pointer",
                    currentTool === "pencil"
                      ? "bg-primary text-primary-foreground shadow"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  title="Pencil / Freehand Draw"
                />
              }
            >
              <Pencil className="size-3.5" />
            </TooltipTrigger>
            <TooltipPopup>Pencil / Freehand</TooltipPopup>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={() => setCurrentTool("rect")}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-md text-xs transition-colors cursor-pointer",
                    currentTool === "rect"
                      ? "bg-primary text-primary-foreground shadow"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  title="Rectangle / Box"
                />
              }
            >
              <Square className="size-3.5" />
            </TooltipTrigger>
            <TooltipPopup>Rectangle / Box</TooltipPopup>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={() => setCurrentTool("circle")}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-md text-xs transition-colors cursor-pointer",
                    currentTool === "circle"
                      ? "bg-primary text-primary-foreground shadow"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  title="Circle / Ellipse"
                />
              }
            >
              <Circle className="size-3.5" />
            </TooltipTrigger>
            <TooltipPopup>Circle / Ellipse</TooltipPopup>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={() => setCurrentTool("arrow")}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-md text-xs transition-colors cursor-pointer",
                    currentTool === "arrow"
                      ? "bg-primary text-primary-foreground shadow"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  title="Directional Arrow"
                />
              }
            >
              <ArrowRight className="size-3.5" />
            </TooltipTrigger>
            <TooltipPopup>Arrow Pointer</TooltipPopup>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={() => setCurrentTool("text")}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-md text-xs transition-colors cursor-pointer",
                    currentTool === "text"
                      ? "bg-primary text-primary-foreground shadow"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  title="Text Annotation"
                />
              }
            >
              <Type className="size-3.5" />
            </TooltipTrigger>
            <TooltipPopup>Text Note (Click on canvas)</TooltipPopup>
          </Tooltip>
        </div>

        <div className="h-4 w-px bg-border/60" />

        {/* Color Palette */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          {PRESET_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCurrentColor(c.value)}
              className={cn(
                "size-5 sm:size-5.5 rounded-full border border-black/20 transition-transform cursor-pointer hover:scale-110",
                currentColor === c.value &&
                  "ring-2 ring-primary ring-offset-2 ring-offset-background scale-110",
              )}
              style={{ backgroundColor: c.value }}
              title={c.name}
            />
          ))}
        </div>

        <div className="h-4 w-px bg-border/60" />

        {/* Stroke Thickness Selector (Patla / Mota) */}
        <div className="flex items-center gap-1">
          {STROKE_WIDTHS.map((sw) => (
            <button
              key={sw.value}
              type="button"
              onClick={() => setCurrentWidth(sw.value)}
              className={cn(
                "flex size-6 sm:size-7 items-center justify-center rounded-md transition-colors cursor-pointer hover:bg-muted",
                currentWidth === sw.value
                  ? "bg-muted ring-1 ring-primary/60 text-primary"
                  : "text-muted-foreground",
              )}
              title={`${sw.label} (${sw.value}px)`}
            >
              <span className={cn("rounded-full bg-current", sw.dotSize)} />
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-border/60" />

        {/* Undo and Clear */}
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={handleUndo}
                  disabled={strokes.length === 0}
                  className="size-7 text-muted-foreground hover:text-foreground"
                />
              }
            >
              <Undo2 className="size-3.5" />
            </TooltipTrigger>
            <TooltipPopup>Undo (Ctrl+Z)</TooltipPopup>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={handleClear}
                  disabled={strokes.length === 0}
                  className="size-7 text-muted-foreground hover:text-destructive"
                />
              }
            >
              <Trash2 className="size-3.5" />
            </TooltipTrigger>
            <TooltipPopup>Clear All</TooltipPopup>
          </Tooltip>
        </div>

        <div className="h-4 w-px bg-border/60" />

        {/* Primary Action: Attach to Chat */}
        <Button
          type="button"
          onClick={handleAttachClick}
          className="h-7 sm:h-8 gap-1.5 rounded-lg bg-primary px-2.5 sm:px-3 text-xs font-semibold text-primary-foreground shadow-md hover:bg-primary/90 transition-all cursor-pointer"
          title="Add annotated drawing to chat input"
        >
          <Paperclip className="size-3.5" />
          <span className="hidden sm:inline">Add to Chat</span>
          <span className="sm:hidden">Add</span>
        </Button>

        {/* Close Button */}
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onClose}
          className="size-7 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Cancel Drawing (Esc)"
        >
          <X className="size-3.5" />
        </Button>
      </div>

      {/* Drawing Canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={cn(
          "absolute inset-0 size-full touch-none",
          currentTool === "text" ? "cursor-text" : "cursor-crosshair",
        )}
      />

      {/* Floating Inline Text Note Box */}
      {textPrompt ? (
        <div
          style={{ left: `${textPrompt.x}px`, top: `${textPrompt.y}px` }}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute z-50 flex items-center gap-1 rounded-lg border border-primary/60 bg-background/95 p-1 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
        >
          <input
            ref={textInputRef}
            type="text"
            placeholder="Type text note..."
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitText();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelText();
              }
            }}
            style={{ color: currentColor }}
            className="w-44 sm:w-56 bg-transparent px-2 py-1 text-xs sm:text-sm font-semibold outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={commitText}
            className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
            title="Add text"
          >
            <Check className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={cancelText}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            title="Cancel"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
