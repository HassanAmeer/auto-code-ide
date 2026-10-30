import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Trash2,
  FolderGit2,
  Send,
  Sparkles,
  Bot,
  X,
  ArrowLeft,
  Loader2,
  ListTodo,
  Clock,
  StickyNote,
  PhoneCall,
  PhoneOff,
  Mic,
  MicOff,
  AudioLines,
  Volume2,
  Settings2,
  Copy,
  Check,
  Download,
  ShoppingBag,
  SlidersHorizontal,
  Square,
  Play,
  Plus,
  RefreshCw,
  FileText,
  UserCheck,
  CheckCircle2,
  Zap,
  Image as ImageIcon,
  Paperclip,
  Activity,
  GitCommit,
  GitBranch,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  List,
  ArrowRight,
  RotateCcw,
  Brain,
  Bookmark,
  BookOpen,
  ExternalLink,
  Globe,
  Terminal,
  Eye,
  EyeOff,
  Save,
  Key,
  ChevronRight,
  Search,
  History,
  Calendar,
  Wrench,
} from "lucide-react";
import ChatMarkdown from "~/components/ChatMarkdown";
import { ReadAloudButton } from "~/components/chat/ReadAloudButton";
import {
  PageReviewCard,
  LivingDocumentCanvas,
  type SpacePage,
  loadSpacePages,
} from "~/components/chat/spaces";
import type { ToolCallRecord } from "./superAgentEngine";
import {
  loadSessionLedger,
  subscribeSessionLedger,
  addDecisionPoint,
  clearSessionLedger,
  formatLedgerAsBulletSummary,
  type SessionLedgerData,
} from "~/lib/speech/multiTurnSessionLedger";
import { useGroqSettings, GROQ_MODEL_OPTIONS, fetchGroqLiveModels } from "~/lib/groqVoiceSettings";
import { executeTerminalCommand } from "~/components/chat/terminal/terminalClient";
import { Link } from "@tanstack/react-router";
import { type ProviderInstanceId } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { cn } from "~/lib/utils";
import { useProjects } from "~/state/entities";
import { useNotes, openNotesSheet, addNote, type NoteItem } from "~/lib/notesStore";
import { useChatMemories, type MemoryRecord } from "~/lib/memoryStore";
import { ChatMemorySection } from "~/components/memory/MemorySheet";
import { useScheduledTasks } from "~/lib/scheduledTasksStore";
import { useProjectActivities } from "~/lib/projectActivityLedger";
import {
  useCallSessions,
  type CallAssistantMessage,
  type CallAssistantSession,
} from "~/lib/callAssistantStore";
import {
  primaryServerProvidersAtom,
  primaryServerKeybindingsAtom,
  primaryServerSettingsAtom,
} from "~/state/server";
import { useClientSettings } from "~/hooks/useSettings";
import {
  getCustomProviders,
  subscribeCustomProviders,
  customProviderToServerProvider,
  type CustomProvider,
} from "~/lib/customProviders";
import {
  deriveProviderInstanceEntries,
  sortProviderInstanceEntries,
  applyProviderInstanceSettings,
} from "~/providerInstances";
import { getAppModelOptionsForInstance } from "~/modelSelection";
import { ProviderModelPicker } from "../ProviderModelPicker";
import type { ModelEsque } from "../providerIconUtils";
import { CircularVoiceWaves } from "./VoiceCallButton";
import { GrokGeometricVoiceWaves } from "./GrokGeometricVoiceWaves";
import { buildSuperAgentSystemPrompt } from "./superAgentPrompt";
import { useVoiceCallAssistant } from "./useVoiceCallAssistant";
import { useLiveKitCall } from "./useLiveKitCall";
import {
  speakText,
  stopSpeaking,
  loadTtsSettings,
  saveTtsSettings,
  subscribeTtsSettings,
  getActiveTtsPreset,
  TTS_ACCENTS,
  VOICE_DELIVERY_STYLES,
  type TtsDeliveryStyleId,
  type TtsSettings,
} from "~/lib/speech/tts";
import {
  loadSttSettings,
  saveSttSettings,
  subscribeSttSettings,
  createSttSession,
  type SttController,
  type SttSettings,
} from "~/lib/speech/stt";
import {
  loadNoiseShieldSettings,
  saveNoiseShieldSettings,
  subscribeNoiseShieldSettings,
  type AcousticNoiseShieldSettings,
} from "~/lib/speech/acousticNoiseShield";
import { transliterateUrduToRoman } from "~/lib/speech/romanUrduTransliterate";
import { executeSuperAgentInstruction, isUrduLanguage } from "./superAgentEngine";
import { addVoiceCallLog } from "~/lib/speech/voiceCallLogger";

function PakistanFlagIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect width="32" height="24" rx="2.5" fill="#01411C" />
      <path d="M0 2.5a2.5 2.5 0 0 1 2.5-2.5h5.5v24H2.5a2.5 2.5 0 0 1-2.5-2.5V2.5z" fill="#FFFFFF" />
      <path
        d="M 18.47 6.70 A 5.4 5.4 0 1 0 24.42 14.23 A 4.8 4.8 0 0 1 18.47 6.70 Z"
        fill="#FFFFFF"
      />
      <polygon
        points="22.2,7.2 22.8,8.8 24.5,8.8 23.2,9.8 23.7,11.4 22.3,10.4 20.9,11.4 21.4,9.8 20.1,8.8 21.8,8.8"
        fill="#FFFFFF"
      />
    </svg>
  );
}

function UsaFlagIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect width="32" height="24" rx="3" fill="#B22234" />
      <rect y="1.85" width="32" height="1.85" fill="#FFFFFF" />
      <rect y="5.54" width="32" height="1.85" fill="#FFFFFF" />
      <rect y="9.23" width="32" height="1.85" fill="#FFFFFF" />
      <rect y="12.92" width="32" height="1.85" fill="#FFFFFF" />
      <rect y="16.62" width="32" height="1.85" fill="#FFFFFF" />
      <rect y="20.31" width="32" height="1.85" fill="#FFFFFF" />
      <rect width="13.5" height="12.92" rx="1.5" fill="#3C3B6E" />
      <circle cx="3" cy="2.5" r="0.75" fill="#FFFFFF" />
      <circle cx="6.7" cy="2.5" r="0.75" fill="#FFFFFF" />
      <circle cx="10.5" cy="2.5" r="0.75" fill="#FFFFFF" />
      <circle cx="4.8" cy="4.5" r="0.75" fill="#FFFFFF" />
      <circle cx="8.6" cy="4.5" r="0.75" fill="#FFFFFF" />
      <circle cx="3" cy="6.5" r="0.75" fill="#FFFFFF" />
      <circle cx="6.7" cy="6.5" r="0.75" fill="#FFFFFF" />
      <circle cx="10.5" cy="6.5" r="0.75" fill="#FFFFFF" />
      <circle cx="4.8" cy="8.5" r="0.75" fill="#FFFFFF" />
      <circle cx="8.6" cy="8.5" r="0.75" fill="#FFFFFF" />
      <circle cx="3" cy="10.5" r="0.75" fill="#FFFFFF" />
      <circle cx="6.7" cy="10.5" r="0.75" fill="#FFFFFF" />
      <circle cx="10.5" cy="10.5" r="0.75" fill="#FFFFFF" />
    </svg>
  );
}

// ── Wishlist Card with Auto-Approve Toggle ─────────────────────────────────
function WishlistCard({
  items,
  projectName,
}: {
  items: import("~/lib/callAssistantStore").WishlistItem[];
  projectName: string;
}) {
  const [localItems, setLocalItems] = useState(items);

  const handleToggle = async (itemId: string) => {
    try {
      const res = await fetch("/api/bot/wishlist/toggle-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName, itemId }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        item?: import("~/lib/callAssistantStore").WishlistItem;
      };
      if (data.ok && data.item) {
        setLocalItems((prev) =>
          prev.map((it) =>
            it.id === itemId ? { ...it, autoApprove: data.item!.autoApprove } : it,
          ),
        );
      }
    } catch {
      // silent fail
    }
  };

  const pending = localItems.filter((i) => i.status === "pending" || i.status === "in_progress");
  const completed = localItems.filter((i) => i.status === "completed");

  if (localItems.length === 0) return null;

  return (
    <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden text-xs">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-500/20 bg-amber-500/10">
        <span className="text-amber-400">📋</span>
        <span className="font-semibold text-amber-300 text-[11px] uppercase tracking-wider">
          Wishlist — {projectName}
        </span>
        <span className="ml-auto text-[10px] text-amber-400/70">
          {pending.length} pending · {completed.length} done
        </span>
      </div>

      {/* Pending Items */}
      {pending.length > 0 && (
        <div className="divide-y divide-border/30">
          {pending.map((item) => (
            <div key={item.id} className="flex items-start gap-3 px-3 py-2.5">
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-medium text-foreground truncate">{item.title}</span>
                  <span
                    className={cn(
                      "text-[9px] px-1.5 py-0.5 rounded-full font-mono uppercase tracking-wider shrink-0",
                      item.type === "improvement"
                        ? "bg-blue-500/20 text-blue-400"
                        : "bg-emerald-500/20 text-emerald-400",
                    )}
                  >
                    {item.type === "improvement" ? "⚡ Improve" : "✨ Feature"}
                  </span>
                  <span
                    className={cn(
                      "text-[9px] px-1.5 py-0.5 rounded-full font-mono shrink-0",
                      item.priority === "high"
                        ? "bg-red-500/20 text-red-400"
                        : item.priority === "medium"
                          ? "bg-yellow-500/20 text-yellow-400"
                          : "bg-zinc-500/20 text-zinc-400",
                    )}
                  >
                    {item.priority.toUpperCase()}
                  </span>
                </div>
                {item.description && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2 leading-snug">
                    {item.description}
                  </p>
                )}
              </div>

              {/* Auto-Approve Toggle */}
              <div className="flex flex-col items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleToggle(item.id)}
                  title={item.autoApprove ? "Auto Approve: ON" : "Auto Approve: OFF"}
                  className={cn(
                    "relative w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-emerald-500/50",
                    item.autoApprove
                      ? "bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.4)]"
                      : "bg-zinc-600/60",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform duration-200",
                      item.autoApprove ? "translate-x-5" : "translate-x-0",
                    )}
                  />
                </button>
                <span
                  className={cn(
                    "text-[8px] font-semibold uppercase tracking-wider",
                    item.autoApprove ? "text-emerald-400" : "text-zinc-500",
                  )}
                >
                  {item.autoApprove ? "ON" : "OFF"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <div className="px-3 py-1.5 bg-border/10 border-t border-border/20">
          <p className="text-[10px] text-muted-foreground">
            ✅ {completed.length} feature{completed.length > 1 ? "s" : ""} completed
          </p>
        </div>
      )}
    </div>
  );
}
// ── End WishlistCard ────────────────────────────────────────────────────────

// ── Interactive Code Diff Viewer Card ───────────────────────────────────────
function CodeDiffCard({ diffText }: { diffText: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const lines = useMemo(() => diffText.split("\n"), [diffText]);

  const handleCopy = () => {
    void navigator.clipboard.writeText(diffText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="mt-2.5 rounded-xl border border-border/80 bg-zinc-950/80 overflow-hidden text-xs font-mono shadow-xs">
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-900/90 border-b border-border/60">
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="flex items-center gap-1.5 text-zinc-300 hover:text-white font-semibold text-[11px] cursor-pointer"
        >
          {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          <span>Code Changes / Diff ({lines.length} lines)</span>
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer transition-colors"
        >
          {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
          <span>{copied ? "Copied" : "Copy Diff"}</span>
        </button>
      </div>

      {isExpanded && (
        <div className="p-2.5 max-h-60 overflow-y-auto space-y-0.5 text-[11px] leading-relaxed">
          {lines.map((line, idx) => {
            const isAdd = line.startsWith("+") && !line.startsWith("+++");
            const isDel = line.startsWith("-") && !line.startsWith("---");
            const isHunk = line.startsWith("@@");

            return (
              <div
                key={idx}
                className={cn(
                  "px-1 py-0.2 rounded-xs whitespace-pre-wrap break-all",
                  isAdd && "bg-emerald-950/50 text-emerald-300 font-medium",
                  isDel && "bg-rose-950/50 text-rose-300 line-through opacity-80",
                  isHunk && "text-blue-400 font-bold opacity-75 bg-blue-950/30",
                  !isAdd && !isDel && !isHunk && "text-zinc-400",
                )}
              >
                {line}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
function getToolCallIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("search") || lower.includes("inspect") || lower.includes("file")) {
    return <Search className="size-3.5 text-sky-400 shrink-0" />;
  }
  if (
    lower.includes("media") ||
    lower.includes("youtube") ||
    lower.includes("link") ||
    lower.includes("web")
  ) {
    return <Globe className="size-3.5 text-emerald-400 shrink-0" />;
  }
  if (lower.includes("note")) {
    return <FileText className="size-3.5 text-amber-400 shrink-0" />;
  }
  if (lower.includes("memory")) {
    return <Brain className="size-3.5 text-purple-400 shrink-0" />;
  }
  if (lower.includes("ledger") || lower.includes("history")) {
    return <History className="size-3.5 text-cyan-400 shrink-0" />;
  }
  if (lower.includes("schedule") || lower.includes("task") || lower.includes("shift")) {
    return <Calendar className="size-3.5 text-indigo-400 shrink-0" />;
  }
  if (lower.includes("git")) {
    return <GitBranch className="size-3.5 text-teal-400 shrink-0" />;
  }
  if (lower.includes("radar") || lower.includes("health") || lower.includes("scan")) {
    return <Activity className="size-3.5 text-rose-400 shrink-0" />;
  }
  if (lower.includes("worker") || lower.includes("agent") || lower.includes("dispatch")) {
    return <Terminal className="size-3.5 text-purple-400 shrink-0" />;
  }
  return <Wrench className="size-3.5 text-zinc-400 shrink-0" />;
}

function LiveWorkingTimer({ startTime }: { startTime: number }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const update = () => {
      setSeconds(Math.max(0, Math.floor((Date.now() - startTime) / 1000)));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  return <span className="tabular-nums font-mono text-[11px] text-zinc-500">{seconds}s</span>;
}

function ThinkingDisclosure({ thought, durationMs }: { thought: string; durationMs?: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="w-full max-w-xl my-1.5">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="group/thinking flex items-center gap-1.5 py-1 px-2 rounded-md text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
      >
        <Brain className="size-3.5 text-purple-400 shrink-0" />
        <span className="font-medium text-zinc-300">
          Thought {durationMs ? `for ${Math.max(1, Math.round(durationMs / 1000))}s` : ""}
        </span>
        <ChevronRight
          className={cn(
            "size-3 text-zinc-500 transition-transform duration-200 group-hover/thinking:text-zinc-300",
            expanded && "rotate-90",
          )}
        />
      </button>

      {expanded && (
        <div className="ms-5 mt-1 p-3 rounded-lg bg-zinc-950/70 border border-zinc-800/80 text-[11px] text-zinc-300 font-mono whitespace-pre-wrap leading-relaxed select-text max-h-60 overflow-y-auto shadow-inner">
          {thought}
        </div>
      )}
    </div>
  );
}

function ToolCallingGroupDisclosure({ tools }: { tools: ToolCallRecord[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!tools || tools.length === 0) return null;

  const isSingle = tools.length === 1;
  const singleTool = tools[0]!;

  return (
    <div className="w-full max-w-xl my-1.5">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="group/tool flex items-center gap-2 py-1 px-2 rounded-md text-xs text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/40 transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
      >
        {isSingle ? (
          getToolCallIcon(singleTool.name)
        ) : (
          <Terminal className="size-3.5 text-purple-400 shrink-0" />
        )}

        <span className="font-mono text-zinc-200 font-medium">
          {isSingle ? singleTool.name : `Used ${tools.length} tools`}
        </span>

        {isSingle && singleTool.summary && (
          <span className="text-[11px] text-zinc-400 truncate max-w-[260px] sm:max-w-xs font-sans">
            — {singleTool.summary}
          </span>
        )}

        <span className="ms-auto flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] text-emerald-400 font-sans flex items-center gap-1">
            <CheckCircle2 className="size-3 text-emerald-400" />
            <span className="hidden sm:inline">Executed</span>
          </span>
          <ChevronRight
            className={cn(
              "size-3 text-zinc-500 transition-transform duration-200 group-hover/tool:text-zinc-300",
              expanded && "rotate-90",
            )}
          />
        </span>
      </button>

      {expanded && (
        <div className="ms-5 mt-1.5 space-y-2.5 p-3 rounded-lg bg-zinc-950/70 border border-zinc-800/80 max-h-72 overflow-y-auto shadow-inner">
          {tools.map((tool, idx) => (
            <div
              key={idx}
              className="space-y-1 pb-2 border-b border-zinc-800/60 last:border-0 last:pb-0"
            >
              <div className="flex items-center gap-2 text-xs">
                {getToolCallIcon(tool.name)}
                <span className="font-mono font-semibold text-purple-300">{tool.name}</span>
                <span className="ms-auto text-[10px] text-emerald-400 flex items-center gap-1 font-sans">
                  <CheckCircle2 className="size-2.5 text-emerald-400" />
                  <span>Completed</span>
                </span>
              </div>
              {tool.summary && (
                <p className="text-[11px] text-zinc-400 leading-relaxed font-sans ps-5">
                  {tool.summary}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LiveProcessingActivityRow({
  agentStatus,
  selectedModel,
  dispatchStartTime,
}: {
  agentStatus: string | null;
  selectedModel: string;
  dispatchStartTime: number;
}) {
  const isTool = agentStatus?.startsWith("Tool Calling:");
  const toolName = isTool ? agentStatus?.replace(/^Tool Calling:\s*/, "") : null;

  return (
    <div className="flex items-center gap-2 py-1.5 px-2.5 rounded-md bg-zinc-900/50 border border-zinc-800/60 text-xs w-fit max-w-full my-2 animate-in fade-in duration-150">
      {isTool ? (
        <span className="flex size-4 items-center justify-center">
          <Terminal className="size-3.5 text-purple-400 animate-pulse" />
        </span>
      ) : (
        <span className="flex size-4 items-center justify-center">
          <Brain className="size-3.5 text-purple-400 animate-pulse" />
        </span>
      )}

      <span className="live-tool-shine font-medium text-foreground truncate max-w-[280px] sm:max-w-md">
        {isTool ? (
          <>
            <span className="text-zinc-500 font-mono">Calling tool: </span>
            <span className="text-purple-300 font-mono">{toolName}</span>
          </>
        ) : (
          agentStatus || `Thinking with ${selectedModel}...`
        )}
      </span>

      <LiveWorkingTimer startTime={dispatchStartTime} />
    </div>
  );
}

// ── End CodeDiffCard ────────────────────────────────────────────────────────

export function SuperCallAssistantView() {
  const projects = useProjects();
  const { notes } = useNotes();
  const {
    sessions,
    activeSession,
    activeSessionId,
    setActiveSessionId,
    handleNewSession,
    handleDeleteSession,
    handleClearHistory,
    handleAddMessage,
  } = useCallSessions();
  const { memories: chatMemories } = useChatMemories(activeSessionId);

  const { tasks: scheduledTasks, toggle: toggleTask, remove: removeTask } = useScheduledTasks();
  const { activities, deleteActivity } = useProjectActivities();
  const [tasksSheetTab, setTasksSheetTab] = useState<"scheduled" | "history">("scheduled");
  const [inputText, setInputText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeDispatchStartTime, setActiveDispatchStartTime] = useState<number>(0);
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const handleInterruptRef = useRef<() => void>(() => {});

  useEffect(() => {
    return () => {
      if (activeAbortControllerRef.current) {
        activeAbortControllerRef.current.abort();
        activeAbortControllerRef.current = null;
      }
      stopSpeaking();
    };
  }, []);

  const handleCopyMessage = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMessageId(id);
    setTimeout(() => setCopiedMessageId(null), 2000);
  }, []);

  // OpenDots Inspired: Spaces & Living Document Canvas State
  const [activeCanvasPage, setActiveCanvasPage] = useState<SpacePage | null>(null);
  const [isCanvasOpen, setIsCanvasOpen] = useState(false);

  // Command Center / Right Sidebar Drawer
  const [isCommandCenterOpen, setIsCommandCenterOpen] = useState(false);
  const [commandCenterTab, setCommandCenterTab] = useState<
    "memory" | "ledger" | "tasks" | "voice" | "settings"
  >("memory");
  const [isInputFocused, setIsInputFocused] = useState(false);

  // Multi-Turn Session Ledger State (Lambay Mashwaray ke liye Memory)
  const [sessionLedger, setSessionLedger] = useState<SessionLedgerData>(() =>
    loadSessionLedger(activeSessionId || "default"),
  );
  const [newDecisionInput, setNewDecisionInput] = useState("");
  const [isCopiedSummary, setIsCopiedSummary] = useState(false);

  useEffect(() => {
    setSessionLedger(loadSessionLedger(activeSessionId || "default"));
    return subscribeSessionLedger(activeSessionId || "default", setSessionLedger);
  }, [activeSessionId]);

  // Groq AI Integration State
  const [groqSettings, updateGroqSettings] = useGroqSettings();
  const [groqApiKeyInput, setGroqApiKeyInput] = useState(groqSettings.apiKey);
  const [isGroqKeyVisible, setIsGroqKeyVisible] = useState(false);
  const [isGroqKeySaved, setIsGroqKeySaved] = useState(false);
  const [isFetchingGroqModels, setIsFetchingGroqModels] = useState(false);
  const [groqModelsFetchStatus, setGroqModelsFetchStatus] = useState<string | null>(null);

  useEffect(() => {
    setGroqApiKeyInput(groqSettings.apiKey);
  }, [groqSettings.apiKey]);

  const handleFetchLiveGroqModels = useCallback(
    async (keyToUse?: string) => {
      const key = (keyToUse || groqApiKeyInput || groqSettings.apiKey || "").trim();
      if (!key) {
        setGroqModelsFetchStatus("Enter Groq API Key first");
        setTimeout(() => setGroqModelsFetchStatus(null), 3000);
        return;
      }
      setIsFetchingGroqModels(true);
      setGroqModelsFetchStatus(null);
      try {
        const res = await fetchGroqLiveModels(key);
        if (res.ok && res.models && res.models.length > 0) {
          setGroqModelsFetchStatus(`✓ ${res.models.length} Live Models Loaded`);
          if (!res.models.some((m) => m.id === groqSettings.model)) {
            updateGroqSettings({ model: res.models[0].id });
          }
        } else {
          setGroqModelsFetchStatus(`⚠️ ${res.error || "Failed to load models"}`);
        }
      } catch (e: any) {
        setGroqModelsFetchStatus(`⚠️ ${e?.message || "Failed"}`);
      } finally {
        setIsFetchingGroqModels(false);
        setTimeout(() => setGroqModelsFetchStatus(null), 4000);
      }
    },
    [groqApiKeyInput, groqSettings.apiKey, groqSettings.model, updateGroqSettings],
  );

  const handleSaveGroqApiKey = useCallback(() => {
    const clean = groqApiKeyInput.trim();
    updateGroqSettings({ apiKey: clean });
    setIsGroqKeySaved(true);
    setTimeout(() => setIsGroqKeySaved(false), 2000);
    if (clean) {
      void handleFetchLiveGroqModels(clean);
    }
  }, [groqApiKeyInput, updateGroqSettings, handleFetchLiveGroqModels]);

  // Universal Attachment State (Images, Code files, Logs, PDFs, etc.)
  const [attachedFile, setAttachedFile] = useState<{
    dataUrl: string;
    name: string;
    size?: string;
    isImage: boolean;
  } | null>(null);
  const fileAttachmentInputRef = useRef<HTMLInputElement>(null);

  const handleAttachmentFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImage = file.type.startsWith("image/");
    const sizeStr =
      file.size > 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.round(file.size / 1024)} KB`;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setAttachedFile({
          dataUrl: reader.result,
          name: file.name,
          size: sizeStr,
          isImage,
        });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const activeProjectName = useMemo(() => {
    return projects[0]?.title || (projects[0]?.id ? String(projects[0].id) : "Workspace");
  }, [projects]);

  // Voice Persona Settings
  const [persona, setPersona] = useState<"bilingual" | "professional" | "friendly">(() => {
    if (typeof window === "undefined") return "bilingual";
    return (localStorage.getItem("super_bot_persona") as any) || "bilingual";
  });

  const handlePersonaChange = useCallback(
    (newPersona: "bilingual" | "professional" | "friendly") => {
      setPersona(newPersona);
      localStorage.setItem("super_bot_persona", newPersona);
    },
    [],
  );

  // Synchronized STT & TTS Settings from /settings/stt-tts
  const [ttsSettings, setTtsSettings] = useState<TtsSettings>(loadTtsSettings);
  const [sttSettings, setSttSettings] = useState<SttSettings>(loadSttSettings);
  const [noiseShieldSettings, setNoiseShieldSettings] =
    useState<AcousticNoiseShieldSettings>(loadNoiseShieldSettings);

  useEffect(() => {
    const unsubTts = subscribeTtsSettings(setTtsSettings);
    const unsubStt = subscribeSttSettings(setSttSettings);
    const unsubNoise = subscribeNoiseShieldSettings(setNoiseShieldSettings);
    return () => {
      unsubTts();
      unsubStt();
      unsubNoise();
    };
  }, []);

  const activeVoiceLabel = useMemo(() => {
    return getActiveTtsPreset(ttsSettings).name;
  }, [ttsSettings]);

  // Providers, models & settings
  const rawServerProviders = useAtomValue(primaryServerProvidersAtom);
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const [customProvidersList, setCustomProvidersList] = useState<CustomProvider[]>(() =>
    getCustomProviders(),
  );

  useEffect(() => {
    return subscribeCustomProviders((list) => {
      setCustomProvidersList(list);
    });
  }, []);

  const providers = useMemo(() => {
    const nonCustomRaw = rawServerProviders.filter(
      (p) => p.driver !== "custom" && p.instanceId !== "custom",
    );
    if (!Array.isArray(customProvidersList) || customProvidersList.length === 0)
      return nonCustomRaw;
    const customStatuses = customProvidersList
      .filter((cp): cp is CustomProvider => Boolean(cp && typeof cp === "object"))
      .map(customProviderToServerProvider)
      .filter(Boolean);
    return [...nonCustomRaw, ...customStatuses];
  }, [rawServerProviders, customProvidersList]);

  const clientSettings = useClientSettings();
  const primaryServerSettings = useAtomValue(primaryServerSettingsAtom);
  const settings = useMemo(
    () => ({
      ...primaryServerSettings,
      ...clientSettings,
      providerInstances: primaryServerSettings?.providerInstances ?? {},
    }),
    [primaryServerSettings, clientSettings],
  );

  const instanceEntries = useMemo(
    () =>
      sortProviderInstanceEntries(
        applyProviderInstanceSettings(deriveProviderInstanceEntries(providers), settings),
      ),
    [providers, settings],
  );

  const [activeInstanceId, setActiveInstanceId] = useState<ProviderInstanceId>(() => {
    return (
      (localStorage.getItem("super_call_assistant_instance_id") as ProviderInstanceId) ||
      ("" as ProviderInstanceId)
    );
  });

  const [selectedModel, setSelectedModel] = useState(() => {
    return localStorage.getItem("super_call_assistant_model") || "";
  });

  const firstInstance = instanceEntries[0];
  const effectiveInstanceId =
    (instanceEntries.some((e) => e.instanceId === activeInstanceId)
      ? activeInstanceId
      : firstInstance?.instanceId) ?? ("" as ProviderInstanceId);

  const effectiveModel = selectedModel || firstInstance?.models?.[0]?.slug || "gemini-2.5-flash";

  const modelOptionsByInstance = useMemo<
    ReadonlyMap<ProviderInstanceId, ReadonlyArray<ModelEsque>>
  >(() => {
    const out = new Map<ProviderInstanceId, ReadonlyArray<ModelEsque>>();
    for (const entry of instanceEntries) {
      out.set(
        entry.instanceId,
        getAppModelOptionsForInstance(
          settings,
          entry,
          entry.instanceId === effectiveInstanceId ? effectiveModel : null,
        ),
      );
    }
    return out;
  }, [instanceEntries, effectiveInstanceId, effectiveModel, settings]);

  const handleModelChange = useCallback((instanceId: ProviderInstanceId, model: string) => {
    setActiveInstanceId(instanceId);
    setSelectedModel(model);
    localStorage.setItem("super_call_assistant_instance_id", String(instanceId));
    localStorage.setItem("super_call_assistant_model", model);
  }, []);

  // Track if user clicked/focused the input field to pause auto-sending
  const [isUserEditing, setIsUserEditing] = useState(false);
  const isUserEditingRef = useRef(false);

  // Transliteration & Undo state
  const [isTransliterating, setIsTransliterating] = useState(false);
  const [previousTextForUndo, setPreviousTextForUndo] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const livekitRef = useRef<ReturnType<typeof useLiveKitCall> | null>(null);

  const adjustTextareaHeight = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    // Maximum 2 lines height (~48-50px)
    el.style.height = `${Math.min(el.scrollHeight, 50)}px`;
  }, []);

  // Auto scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.messages, isProcessing]);

  useEffect(() => {
    adjustTextareaHeight(inputRef.current);
  }, [inputText, adjustTextareaHeight]);

  const handleSuperAgentDispatch = useCallback(
    async (rawUserText: string) => {
      const userText = rawUserText.trim();
      if (!userText || isProcessing) return;

      const currentFile = attachedFile;
      setAttachedFile(null);

      setInputText("");
      setPreviousTextForUndo(null);
      isUserEditingRef.current = false;
      setIsUserEditing(false);

      const effectiveUserPrompt = currentFile
        ? `${userText}\n[Attached ${currentFile.isImage ? "Image/Screenshot" : "File"}: ${currentFile.name}${currentFile.size ? ` (${currentFile.size})` : ""}]`
        : userText;

      handleAddMessage(
        "user",
        userText,
        currentFile
          ? ({
              file: currentFile.dataUrl,
              fileName: currentFile.name,
              fileSize: currentFile.size,
              isImage: currentFile.isImage,
            } as any)
          : undefined,
      );
      if (activeAbortControllerRef.current) {
        activeAbortControllerRef.current.abort();
        activeAbortControllerRef.current = null;
      }
      const controller = new AbortController();
      activeAbortControllerRef.current = controller;

      const dispatchStartTime = Date.now();
      setIsProcessing(true);
      setActiveDispatchStartTime(dispatchStartTime);
      setAgentStatus("Analyzing request...");

      void livekitRef.current?.sendDataMessage({
        type: "user_turn",
        text: userText,
        timestamp: Date.now(),
      });

      addVoiceCallLog({
        category: "LIVEKIT",
        title: "LiveKit Data Sent (user_turn)",
        detail: userText,
        payload: { type: "user_turn", text: userText },
      });

      const isGroqActive = Boolean(groqSettings.enabled && groqSettings.apiKey?.trim());
      const effectiveSelectedModel = isGroqActive
        ? groqSettings.model || "llama-3.3-70b-versatile"
        : effectiveModel;

      try {
        const activeProjId = projects[0]?.id ? String(projects[0].id) : undefined;
        const matchingCustomProvider = customProvidersList.find(
          (cp) =>
            cp.id === effectiveInstanceId ||
            cp.name === effectiveInstanceId ||
            String(cp.id) === String(effectiveInstanceId),
        );

        const effectiveProviderConfig = isGroqActive
          ? ({
              baseUrl: "https://api.groq.com/openai/v1",
              apiKey: groqSettings.apiKey.trim(),
              format: "openai",
            } as any)
          : matchingCustomProvider
            ? ({
                baseUrl: matchingCustomProvider.baseUrl,
                apiKey: matchingCustomProvider.apiKey,
                headers: matchingCustomProvider.headers as any,
                format: matchingCustomProvider.format,
              } as any)
            : undefined;

        const res = await executeSuperAgentInstruction({
          userText: effectiveUserPrompt,
          projects,
          activeProjectId: activeProjId,
          selectedModel: effectiveSelectedModel,
          selectedInstanceId: isGroqActive ? "groq" : String(effectiveInstanceId),
          chatId: activeSessionId,
          conversationHistory: (activeSession?.messages || []).map((m) => ({
            role: m.role === "user" ? ("user" as const) : ("assistant" as const),
            text: m.text,
          })),
          providerConfig: effectiveProviderConfig,
          signal: controller.signal,
          onStatusUpdate: (status) => {
            if (!controller.signal.aborted) {
              setAgentStatus(status);
            }
          },
          onFillerSpoken: (fillerText) => {
            if (!controller.signal.aborted) {
              setAgentStatus(fillerText);
            }
          },
        });

        if (controller.signal.aborted) {
          console.log("[SuperAgent] Discarding response: request was aborted.");
          return;
        }

        const meta: any = res.delegatedTask
          ? {
              delegatedTask: {
                projectName: res.delegatedTask.projectName,
                taskTitle: res.delegatedTask.taskTitle,
                status: res.delegatedTask.status,
                progress: res.delegatedTask.progress,
              },
              actionType: res.actionTaken,
            }
          : res.actionTaken === "wishlist_listed" || res.actionTaken === "wishlist_item_added"
            ? await (async () => {
                try {
                  const projectName =
                    activeProjId ||
                    activeSession?.messages.find((m) => m.role === "user")?.text ||
                    "Workspace";
                  const r = await fetch(
                    `/api/bot/wishlist?project=${encodeURIComponent(projectName)}`,
                  );
                  const data = (await r.json()) as {
                    ok: boolean;
                    items: import("~/lib/callAssistantStore").WishlistItem[];
                    projectName: string;
                  };
                  return {
                    actionType: res.actionTaken,
                    wishlistItems: data.ok ? data.items : [],
                    wishlistProject: data.projectName,
                  };
                } catch {
                  return { actionType: res.actionTaken };
                }
              })()
            : res.actionTaken
              ? { actionType: res.actionTaken }
              : undefined;

        // Auto-detect code diffs in assistant reply
        const diffMatch = res.reply.match(/```(?:diff)?\n([\s\S]*?(?:---|\+\+\+|@@)[\s\S]*?)```/);
        const codeDiff = diffMatch ? diffMatch[1] : undefined;

        // OpenDots Inspired: Auto-detect or parse PageReview draft & Living Document
        let pageReviewData: SpacePage | undefined = undefined;
        let cleanReply = res.reply;
        const pageReviewMatch = res.reply.match(/\[PAGE_REVIEW\]([\s\S]*?)\[\/PAGE_REVIEW\]/);
        if (pageReviewMatch) {
          try {
            const parsed = JSON.parse(pageReviewMatch[1]);
            pageReviewData = {
              id: parsed.id || `page_${Date.now().toString(36)}`,
              title: parsed.title || "Project Specification Draft",
              spaceName: parsed.spaceName || "Main",
              category: parsed.category || "spec",
              status: "review_pending",
              summaryItems: Array.isArray(parsed.summaryItems)
                ? parsed.summaryItems
                : ["Draft specification prepared"],
              content: parsed.content || "",
              projectName: activeProjId || "Workspace",
              replyChips: Array.isArray(parsed.replyChips)
                ? parsed.replyChips
                : ["✓ Approve & Save to Space", "✎ View Canvas", "Add Payment Gateway"],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            cleanReply = res.reply.replace(/\[PAGE_REVIEW\][\s\S]*?\[\/PAGE_REVIEW\]/, "").trim();
          } catch (e) {
            console.warn("[PageReview] Failed to parse JSON block:", e);
          }
        }

        const enrichedMeta = {
          ...meta,
          ...(pageReviewData ? { pageReview: pageReviewData } : {}),
          ...(res.thought ? { thought: res.thought } : {}),
          ...(res.durationMs ? { durationMs: res.durationMs } : {}),
          ...(res.referencedMemory ? { referencedMemory: res.referencedMemory } : {}),
          ...(res.toolsCalled && res.toolsCalled.length > 0
            ? { toolsCalled: res.toolsCalled }
            : {}),
          ...(codeDiff ? { diff: codeDiff } : {}),
        };

        if (controller.signal.aborted) {
          return;
        }

        handleAddMessage("assistant", cleanReply, enrichedMeta);
        const durationMs = Date.now() - dispatchStartTime;
        addVoiceCallLog({
          category: "BOT",
          title: `Bot Reply Delivered (${durationMs}ms)`,
          detail: res.reply,
          model: effectiveSelectedModel,
          statusCode: 200,
          durationMs,
          response: {
            reply: res.reply,
            spokenReply: res.spokenReply,
            actionTaken: res.actionTaken,
            toolsCalled: res.toolsCalled,
          },
          level: "success",
        });

        if (!controller.signal.aborted && isCallActiveRef.current) {
          speakText(res.spokenReply, loadTtsSettings(), () => {
            if (inputRef.current !== document.activeElement) {
              isUserEditingRef.current = false;
              setIsUserEditing(false);
            }
          });
        }
      } catch (err: any) {
        if (
          controller.signal.aborted ||
          err?.name === "AbortError" ||
          String(err?.message).toLowerCase().includes("aborted")
        ) {
          console.log("[SuperAgent] Dispatch was cancelled by user.");
          return;
        }

        console.error("Super agent error:", err);
        const errDetail = err?.message || String(err);
        const durationMs = Date.now() - dispatchStartTime;
        addVoiceCallLog({
          category: "BOT",
          title: "Bot Dispatch Failed",
          detail: errDetail,
          model: effectiveSelectedModel,
          statusCode: err?.status || 500,
          durationMs,
          level: "error",
        });

        if (!controller.signal.aborted) {
          const errorMsg = isUrduLanguage(userText)
            ? `⚠️ Issue: ${errDetail}. Main dobara check karta hoon.`
            : `⚠️ Issue: ${errDetail}. Let me re-check.`;
          handleAddMessage("assistant", errorMsg);
          if (isCallActiveRef.current) {
            speakText(errorMsg, loadTtsSettings(), () => {
              if (inputRef.current !== document.activeElement) {
                isUserEditingRef.current = false;
                setIsUserEditing(false);
              }
            });
          }
        }
      } finally {
        if (activeAbortControllerRef.current === controller) {
          activeAbortControllerRef.current = null;
          setIsProcessing(false);
          setActiveDispatchStartTime(0);
          setAgentStatus(null);
        }
      }
    },
    [
      handleAddMessage,
      isProcessing,
      projects,
      effectiveModel,
      effectiveInstanceId,
      customProvidersList,
      activeSession?.messages,
    ],
  );

  const isCallActiveRef = useRef(false);

  // Live Speech transcript update: spoken words appear directly inside the input field
  const handleTranscriptChange = useCallback((text: string) => {
    // If the user has explicitly focused and is editing with keyboard cursor, do not stomp on cursor
    if (document.activeElement === inputRef.current && isUserEditingRef.current) {
      return;
    }
    setInputText(text);
  }, []);

  const {
    isCallActive,
    callStatus,
    analyserNode,
    toggleCall,
    endCall,
    interruptSpeaking,
    callLanguage,
    setCallLanguage,
    liveTranscript,
    assistantSpokenText,
    isMicMuted,
    toggleMicMute,
  } = useVoiceCallAssistant({
    onTranscriptChange: handleTranscriptChange,
    onAutoSend: (textToSend?: string) => {
      // If user clicked or focused to edit manually with active keyboard cursor, DO NOT auto-send
      if (document.activeElement === inputRef.current && isUserEditingRef.current) return;
      const target = (typeof textToSend === "string" ? textToSend : inputText).trim();
      if (target) {
        void handleSuperAgentDispatch(target);
      }
    },
    onInterrupt: () => handleInterruptRef.current(),
    canInterrupt: true,
    prompt: inputText,
    phase: isProcessing ? "running" : "ready",
    isUserEditing,
  });

  // Called when voice assistant or user interrupts generation / speech
  const handleAbortProcessing = useCallback(() => {
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }
    setIsProcessing(false);
    setActiveDispatchStartTime(0);
    setAgentStatus(null);
    stopSpeaking();
    addVoiceCallLog({
      category: "SYSTEM",
      title: "Process Cancelled / Stopped",
      detail: "Active generation or request was aborted by user",
      level: "warn",
    });
  }, []);

  const handleCancelProcessing = useCallback(() => {
    handleAbortProcessing();
    interruptSpeaking();
  }, [handleAbortProcessing, interruptSpeaking]);

  useEffect(() => {
    handleInterruptRef.current = handleAbortProcessing;
  }, [handleAbortProcessing]);

  useEffect(() => {
    isCallActiveRef.current = isCallActive;
  }, [isCallActive]);

  const livekit = useLiveKitCall({
    onDataReceived: (data) => {
      addVoiceCallLog({
        category: "LIVEKIT",
        title: `LiveKit Received (${data && typeof data === "object" ? data.type || "event" : "data"})`,
        detail: typeof data === "object" ? JSON.stringify(data) : String(data),
        payload: data,
        level: "info",
      });
      if (data && typeof data === "object") {
        if (data.type === "filler" && data.text) {
          setAgentStatus(data.text);
        } else if (data.type === "tool_status" && data.tool) {
          setAgentStatus(`Tool Calling: ${data.tool}...`);
        }
      }
    },
    onError: (err) => {
      console.warn("[LiveKit Call Notice]:", err);
      addVoiceCallLog({
        category: "LIVEKIT",
        title: "LiveKit Connection Notice",
        detail: String(err),
        level: "warn",
      });
    },
  });

  useEffect(() => {
    livekitRef.current = livekit;
  }, [livekit]);

  const handleToggleCallSession = useCallback(() => {
    const isCurrentlyActive = isCallActive || isCallActiveRef.current;
    if (isCurrentlyActive) {
      endCall();
      if (activeAbortControllerRef.current) {
        activeAbortControllerRef.current.abort();
        activeAbortControllerRef.current = null;
      }
      setIsProcessing(false);
      setActiveDispatchStartTime(0);
      setAgentStatus(null);
      stopSpeaking();
      addVoiceCallLog({
        category: "SYSTEM",
        title: "Voice Call Ended",
        detail: "User disconnected the call",
        level: "info",
      });
    } else {
      addVoiceCallLog({
        category: "SYSTEM",
        title: "Voice Call Started",
        detail: "User initiated call session (Direct Streaming Full-Duplex Architecture)",
        level: "info",
      });
      toggleCall();
    }
  }, [isCallActive, endCall, toggleCall]);

  const handleToggleMicMute = useCallback(() => {
    toggleMicMute();
  }, [toggleMicMute]);

  const isUsaSelected = sttSettings.language === "english" || callLanguage === "english";
  const isPakSelected = !isUsaSelected;

  // User clicked on the input text: pause auto-send immediately and mark focused
  const handleInputFocusOrClick = useCallback(() => {
    isUserEditingRef.current = true;
    setIsUserEditing(true);
    setIsInputFocused(true);
  }, []);

  // Transliterate Urdu script to Roman Urdu
  const handleTransliterateToRoman = useCallback(() => {
    if (!inputText.trim()) return;
    setPreviousTextForUndo(inputText);
    setIsTransliterating(true);
    isUserEditingRef.current = true;
    setIsUserEditing(true);

    setTimeout(() => {
      const roman = transliterateUrduToRoman(inputText);
      setInputText(roman);
      setIsTransliterating(false);
    }, 250);
  }, [inputText]);

  // Undo transliteration
  const handleUndoTransliteration = useCallback(() => {
    if (previousTextForUndo !== null) {
      setInputText(previousTextForUndo);
      setPreviousTextForUndo(null);
    }
  }, [previousTextForUndo]);

  const handleSendNow = useCallback(() => {
    if (inputText.trim()) {
      void handleSuperAgentDispatch(inputText);
    }
  }, [handleSuperAgentDispatch, inputText]);

  // Barge-in / Stop Speaking Helper
  const handleStopSpeaking = useCallback(() => {
    handleCancelProcessing();
  }, [handleCancelProcessing]);

  // Unified Dictation / Voice-to-Text STT Session
  const [isDictating, setIsDictating] = useState(false);
  const dictationSessionRef = useRef<SttController | null>(null);

  useEffect(() => {
    return () => {
      dictationSessionRef.current?.stop();
    };
  }, []);

  const handleToggleDictation = useCallback(() => {
    if (isDictating) {
      dictationSessionRef.current?.stop();
      setIsDictating(false);
    } else {
      isUserEditingRef.current = true;
      setIsUserEditing(true);
      const session = createSttSession({
        mode: sttSettings.language,
        onResult: (text, _isFinal, cumulative) => {
          const freshText = (cumulative || text || "").trim();
          if (freshText) {
            setInputText(freshText);
          }
        },
        onStateChange: (active) => {
          setIsDictating(active);
        },
        onError: (err) => {
          console.warn("[SuperBot Dictation] STT error:", err);
          setIsDictating(false);
        },
      });
      dictationSessionRef.current = session;
      session.start();
      setIsDictating(true);
    }
  }, [isDictating, sttSettings.language]);

  const [isTranscriptCopied, setIsTranscriptCopied] = useState(false);

  const handleCopyTranscript = useCallback(() => {
    if (!activeSession?.messages.length) return;
    const text = activeSession.messages
      .map(
        (m) =>
          `[${new Date(m.timestamp).toLocaleTimeString()}] ${m.role === "user" ? "User" : "Super Bot"}:\n${m.text}`,
      )
      .join("\n\n");
    void navigator.clipboard.writeText(text).then(() => {
      setIsTranscriptCopied(true);
      setTimeout(() => setIsTranscriptCopied(false), 2000);
    });
  }, [activeSession?.messages]);

  return (
    <div className="flex h-full w-full bg-background text-foreground overflow-hidden relative">
      {/* Right-Side Command Center / Smart Drawer */}
      {isCommandCenterOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setIsCommandCenterOpen(false)}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md sm:max-w-lg h-full bg-background border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
          >
            {/* Sheet Top Header */}
            <div className="h-14 px-4 sm:px-5 border-b border-border/60 flex items-center justify-between shrink-0 bg-muted/20">
              <div className="flex items-center gap-2">
                <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Sparkles className="size-4 text-primary" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">Assistant Command Center</h2>
                  <p className="text-[10px] text-muted-foreground">
                    Insights, Wishlist, Automated Tasks & Voice Persona
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCommandCenterOpen(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                title="Close Command Center"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Navigation Tabs (5 Tabs: Memory, Tasks, Voice, Settings, Logs) - Single Compact Line */}
            <div className="grid grid-cols-5 border-b border-border/50 px-1 bg-muted/20 text-center">
              <button
                type="button"
                onClick={() => setCommandCenterTab("memory")}
                className={cn(
                  "py-1.5 px-0.5 text-[11px] font-medium border-b-2 transition-colors cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap",
                  commandCenterTab === "memory"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Brain className="size-3.5 shrink-0" />
                <span className="hidden sm:inline">Memory</span>
                {chatMemories.length > 0 && (
                  <span className="text-[8px] px-1 py-0.5 rounded-full bg-purple-500/20 text-purple-400 font-mono leading-none">
                    {chatMemories.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setCommandCenterTab("ledger")}
                className={cn(
                  "py-1.5 px-0.5 text-[11px] font-medium border-b-2 transition-colors cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap",
                  commandCenterTab === "ledger"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <BookOpen className="size-3.5 shrink-0" />
                <span className="hidden sm:inline">Ledger</span>
                {sessionLedger.decisions.length > 0 && (
                  <span className="text-[8px] px-1 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono leading-none">
                    {sessionLedger.decisions.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setCommandCenterTab("tasks")}
                className={cn(
                  "py-1.5 px-0.5 text-[11px] font-medium border-b-2 transition-colors cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap",
                  commandCenterTab === "tasks"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <ListTodo className="size-3.5 shrink-0" />
                <span className="hidden sm:inline">Tasks</span>
                {scheduledTasks.length > 0 && (
                  <span className="text-[8px] px-1 py-0.5 rounded-full bg-primary/20 text-primary font-mono leading-none">
                    {scheduledTasks.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setCommandCenterTab("voice")}
                className={cn(
                  "py-1.5 px-0.5 text-[11px] font-medium border-b-2 transition-colors cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap",
                  commandCenterTab === "voice"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <SlidersHorizontal className="size-3.5 shrink-0" />
                <span className="hidden sm:inline">Voice</span>
              </button>

              <button
                type="button"
                onClick={() => setCommandCenterTab("settings")}
                className={cn(
                  "py-1.5 px-0.5 text-[11px] font-medium border-b-2 transition-colors cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap",
                  commandCenterTab === "settings"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Settings2 className="size-3.5 shrink-0" />
                <span className="hidden sm:inline">Settings</span>
                {groqSettings.enabled && (
                  <span className="size-1.5 rounded-full bg-orange-400 animate-pulse" />
                )}
              </button>
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* TAB: WORKSPACE CHAT MEMORY */}
              {commandCenterTab === "memory" && (
                <div className="space-y-4">
                  {/* Active Chat Memory Vault (Title, Description, CRUD & Choose from Notes) */}
                  <ChatMemorySection />
                </div>
              )}

              {/* TAB: MULTI-TURN SESSION LEDGER (Lambay Mashwaray ke liye Memory) 🧠 */}
              {commandCenterTab === "ledger" && (
                <div className="space-y-4">
                  <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent p-3 rounded-lg border border-emerald-500/20">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <BookOpen className="size-4 text-emerald-400" />
                          <h3 className="text-xs font-semibold text-foreground">
                            Multi-Turn Session Ledger 🧠
                          </h3>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono">
                            {sessionLedger.decisions.length} Decisions
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          Har 5-8 baaton ke baad background mein automatic "Decision Summary"
                          maintain hoti hai. Lambay mashwaray ke baad agar aap 1 ghante baad bhi
                          poochen:{" "}
                          <span className="text-foreground italic font-medium">
                            "Acha humne shuru mein kya decide kiya tha?"
                          </span>{" "}
                          — to bot foran bullet summary dega.
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {sessionLedger.decisions.length > 0 && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                const summary = formatLedgerAsBulletSummary(sessionLedger);
                                void navigator.clipboard.writeText(summary);
                                setIsCopiedSummary(true);
                                setTimeout(() => setIsCopiedSummary(false), 2000);
                              }}
                              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                              title="Copy bullet points summary"
                            >
                              {isCopiedSummary ? (
                                <Check className="size-3 text-emerald-400" />
                              ) : (
                                <Copy className="size-3" />
                              )}
                              <span>{isCopiedSummary ? "Copied" : "Copy"}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    "Are you sure you want to clear this session's decision ledger?",
                                  )
                                ) {
                                  clearSessionLedger(activeSessionId || "default");
                                }
                              }}
                              className="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                              title="Clear session ledger"
                            >
                              <RotateCcw className="size-3" />
                              <span>Reset</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Manual Quick Add Decision */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const text = newDecisionInput.trim();
                      if (!text) return;
                      addDecisionPoint(activeSessionId || "default", text);
                      setNewDecisionInput("");
                    }}
                    className="flex gap-2"
                  >
                    <input
                      type="text"
                      value={newDecisionInput}
                      onChange={(e) => setNewDecisionInput(e.target.value)}
                      placeholder="Naya faisla ya decision point darj karein..."
                      className="flex-1 bg-background border border-border/80 rounded-md px-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <button
                      type="submit"
                      disabled={!newDecisionInput.trim()}
                      className="px-2.5 py-1 text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-md flex items-center gap-1 font-medium transition-colors cursor-pointer"
                    >
                      <Plus className="size-3.5" />
                      Add
                    </button>
                  </form>

                  {/* Decision Points List */}
                  <div className="space-y-2">
                    {sessionLedger.decisions.length === 0 ? (
                      <div className="text-center py-8 px-4 border border-dashed border-border/60 rounded-lg text-muted-foreground space-y-2">
                        <BookOpen className="size-8 mx-auto opacity-30 text-emerald-400" />
                        <p className="text-xs font-medium">
                          Abhi tak koi decision point record nahi hua.
                        </p>
                        <p className="text-[10px] max-w-xs mx-auto">
                          Call ya chat ke doran har 5-8 turns baad automatic bullet points yahan add
                          hotay jayeinge ya aap upar manual bhi likh sakte hain.
                        </p>
                      </div>
                    ) : (
                      sessionLedger.decisions.map((decision, idx) => (
                        <div
                          key={decision.id || idx}
                          className="p-2.5 rounded-lg border border-border/60 bg-card/60 hover:border-emerald-500/40 transition-colors flex items-start gap-2.5"
                        >
                          <span className="shrink-0 text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                            Point {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-foreground font-medium leading-relaxed">
                              {decision.text}
                            </p>
                            <p className="text-[9px] text-muted-foreground mt-0.5">
                              Turn #{decision.turnIndex} •{" "}
                              {new Date(decision.timestamp).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* TAB: TASKS & LEDGER */}
              {commandCenterTab === "tasks" && (
                <div className="space-y-4">
                  {/* Sub-tab switcher */}
                  <div className="flex border-b border-border/50 pb-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTasksSheetTab("scheduled")}
                      className={cn(
                        "text-xs font-semibold px-2 py-1 rounded-md transition-colors cursor-pointer",
                        tasksSheetTab === "scheduled"
                          ? "bg-primary/20 text-primary"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Scheduled Shifts ({scheduledTasks.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setTasksSheetTab("history")}
                      className={cn(
                        "text-xs font-semibold px-2 py-1 rounded-md transition-colors cursor-pointer",
                        tasksSheetTab === "history"
                          ? "bg-primary/20 text-primary"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Execution Log ({activities.length})
                    </button>
                  </div>

                  {tasksSheetTab === "scheduled" ? (
                    scheduledTasks.length === 0 ? (
                      <div className="py-12 flex flex-col items-center justify-center text-center text-muted-foreground">
                        <ListTodo className="size-8 mb-2 opacity-50" />
                        <h4 className="text-xs font-semibold text-foreground">
                          No Tasks Scheduled
                        </h4>
                        <p className="text-[11px] text-muted-foreground max-w-xs mt-1">
                          Aap Super Assistant se bol saktay hain: &quot;Raat 2:00 baje status check
                          karo&quot;.
                        </p>
                      </div>
                    ) : (
                      scheduledTasks.map((t) => (
                        <div
                          key={t.id}
                          className="p-3 rounded-xl border border-border/70 bg-card/60 space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <h4 className="text-xs font-semibold text-foreground truncate">
                                {t.title}
                              </h4>
                              <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground">
                                <FolderGit2 className="size-3 text-primary shrink-0" />
                                <span className="font-medium text-primary truncate">
                                  {t.projectName || "General Workspace"}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => toggleTask(t.id)}
                                className={cn(
                                  "px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer",
                                  t.enabled
                                    ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                                    : "bg-muted text-muted-foreground hover:bg-muted/80",
                                )}
                              >
                                {t.enabled ? "Active" : "Paused"}
                              </button>
                              <button
                                type="button"
                                onClick={() => removeTask(t.id)}
                                className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                          </div>
                          <div className="p-2 rounded-lg bg-muted/40 text-[10px] font-mono text-zinc-300 break-words">
                            {t.prompt}
                          </div>
                        </div>
                      ))
                    )
                  ) : activities.length === 0 ? (
                    <div className="py-12 flex flex-col items-center justify-center text-center text-muted-foreground">
                      <ListTodo className="size-8 mb-2 opacity-50" />
                      <h4 className="text-xs font-semibold text-foreground">
                        No Execution History
                      </h4>
                      <p className="text-[11px] text-muted-foreground max-w-xs mt-1">
                        Jab Super Bot background tasks run karega to record yahan maintain hoga.
                      </p>
                    </div>
                  ) : (
                    activities.map((act) => (
                      <div
                        key={act.id}
                        className="p-3 rounded-xl border border-border/70 bg-card/60 space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-foreground truncate">
                            {act.taskTitle}
                          </span>
                          <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                            {act.status}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">{act.description}</p>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* TAB 4: PERSONA & VOICE SETTINGS */}
              {commandCenterTab === "voice" && (
                <div className="space-y-4">
                  {/* Persona Selector Card */}
                  <div className="p-3.5 rounded-xl border border-border/70 bg-card/60 space-y-3">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <UserCheck className="size-3.5 text-primary" />
                      AI Personality Tone
                    </span>

                    <div className="grid grid-cols-1 gap-2">
                      <button
                        type="button"
                        onClick={() => handlePersonaChange("bilingual")}
                        className={cn(
                          "p-2.5 rounded-lg border text-left transition-all cursor-pointer",
                          persona === "bilingual"
                            ? "border-emerald-500/60 bg-emerald-500/10 text-foreground"
                            : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40",
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-foreground">
                            🇵🇰 Bilingual Assistant (Recommended)
                          </span>
                          {persona === "bilingual" && (
                            <CheckCircle2 className="size-3.5 text-emerald-400" />
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Roman Urdu aur English naturally mix karke friendly aur helpful tone.
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => handlePersonaChange("professional")}
                        className={cn(
                          "p-2.5 rounded-lg border text-left transition-all cursor-pointer",
                          persona === "professional"
                            ? "border-blue-500/60 bg-blue-500/10 text-foreground"
                            : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40",
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-foreground">
                            💼 Corporate & Professional
                          </span>
                          {persona === "professional" && (
                            <CheckCircle2 className="size-3.5 text-blue-400" />
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Strictly business-oriented, concise, bullet-points aur formal.
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => handlePersonaChange("friendly")}
                        className={cn(
                          "p-2.5 rounded-lg border text-left transition-all cursor-pointer",
                          persona === "friendly"
                            ? "border-amber-500/60 bg-amber-500/10 text-foreground"
                            : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40",
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-foreground">
                            🤝 Casual & Empathetic Buddy
                          </span>
                          {persona === "friendly" && (
                            <CheckCircle2 className="size-3.5 text-amber-400" />
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Warm, conversational, motivating aur light-hearted conversation.
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* Vocal Delivery Style Presets (Inspired by Digi-Labs) */}
                  <div className="p-3.5 rounded-xl border border-border/70 bg-card/60 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Volume2 className="size-3.5 text-primary" />
                        <span className="text-xs font-semibold text-foreground">
                          Vocal Delivery Style (Digi-Labs)
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-primary uppercase font-bold">
                        {ttsSettings.deliveryStyle || "natural"}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Rate, Pitch aur Volume ko co-tune karta hai taake awaz natural lagay bina
                      chipmunk effect ke.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {Object.values(VOICE_DELIVERY_STYLES).map((style) => {
                        const isSelected = (ttsSettings.deliveryStyle || "natural") === style.id;
                        return (
                          <button
                            key={style.id}
                            type="button"
                            onClick={() => {
                              const updated: TtsSettings = {
                                ...ttsSettings,
                                deliveryStyle: style.id,
                              };
                              setTtsSettings(updated);
                              saveTtsSettings(updated);
                            }}
                            className={cn(
                              "p-2 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between gap-1",
                              isSelected
                                ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/40 shadow-xs"
                                : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40",
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-foreground">
                                {style.id === "natural" && "🌿 Natural"}
                                {style.id === "business" && "💼 Business"}
                                {style.id === "promo" && "⚡ Energetic"}
                                {style.id === "explainer" && "🎙️ Explainer"}
                                {style.id === "calm" && "🕊️ Calm"}
                              </span>
                              {isSelected && (
                                <CheckCircle2 className="size-3 text-primary shrink-0" />
                              )}
                            </div>
                            <span className="text-[9px] font-mono text-muted-foreground">
                              {style.rate} | {style.pitch} | {style.volume}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Acoustic Noise Shield (Fan & Room Echo Cancellation) */}
                  <div className="p-3.5 rounded-xl border border-border/70 bg-card/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">🛡️</span>
                        <span className="text-xs font-semibold text-foreground">
                          Acoustic Noise Shield (Fan & Echo Gate)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = {
                            ...noiseShieldSettings,
                            enabled: !noiseShieldSettings.enabled,
                          };
                          setNoiseShieldSettings(updated);
                          saveNoiseShieldSettings(updated);
                        }}
                        className={cn(
                          "px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold transition-all cursor-pointer",
                          noiseShieldSettings.enabled
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : "bg-muted/40 text-muted-foreground border border-border/40",
                        )}
                      >
                        {noiseShieldSettings.enabled ? "Active (Shield ON)" : "Bypassed"}
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Ceiling fan, AC hum, aur room echo ko afftdn & agate algorithms se block karta
                      hai taake STT 100% accurate sunay.
                    </p>
                  </div>

                  {/* Speech Rate & Speed Control */}
                  <div className="p-3.5 rounded-xl border border-border/70 bg-card/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">
                        Speaking Rate / Speed
                      </span>
                      <span className="text-xs font-mono text-primary font-bold">
                        {ttsSettings.rate.toFixed(1)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.7"
                      max="1.5"
                      step="0.1"
                      value={ttsSettings.rate}
                      onChange={(e) => {
                        const newRate = parseFloat(e.target.value);
                        const updated = { ...ttsSettings, rate: newRate };
                        setTtsSettings(updated);
                        saveTtsSettings(updated);
                      }}
                      className="w-full accent-primary cursor-pointer"
                    />
                    <div className="flex justify-between text-[9px] text-muted-foreground font-mono">
                      <span>0.7x (Slow)</span>
                      <span>1.0x (Normal)</span>
                      <span>1.5x (Fast)</span>
                    </div>

                    {/* Test Voice Button */}
                    <div className="pt-2 border-t border-border/40 flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground truncate max-w-[150px]">
                        Voice: {activeVoiceLabel}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          speakText(
                            persona === "professional"
                              ? "Hello! I am ready to handle your workspace instructions."
                              : "Assalam-o-Alaikum! Main aapki madad ke liye tayyar hoon.",
                            ttsSettings,
                          );
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/15 text-primary hover:bg-primary/25 text-xs font-medium transition-colors cursor-pointer"
                      >
                        <Play className="size-3" />
                        <span>Test Voice</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 5: GROQ AI & CALL ASSISTANT SETTINGS */}
              {commandCenterTab === "settings" && (
                <div className="space-y-4">
                  {/* Groq AI Acceleration Header Card */}
                  <div className="p-4 rounded-xl border border-border/80 bg-gradient-to-br from-card/90 to-orange-950/10 space-y-3.5 shadow-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="size-8 rounded-lg bg-orange-500/15 border border-orange-500/30 text-orange-400 flex items-center justify-center shadow-xs">
                          <Zap className="size-4.5 fill-orange-400 text-orange-400" />
                        </div>
                        <div>
                          <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                            Groq AI Acceleration
                            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-orange-500/20 text-orange-400 font-mono font-medium">
                              Ultra-Fast
                            </span>
                          </h3>
                          <p className="text-[10px] text-muted-foreground">
                            Ultra low-latency LPU inference for Voice Call Assistant
                          </p>
                        </div>
                      </div>

                      {/* Enable Groq Toggle Switch */}
                      <label className="relative inline-flex items-center cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={groqSettings.enabled}
                          onChange={(e) => {
                            const enabled = e.target.checked;
                            updateGroqSettings({ enabled });
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500"></div>
                      </label>
                    </div>

                    {/* Status Pill Indicator */}
                    <div
                      className={cn(
                        "px-3 py-2 rounded-lg text-[11px] flex items-center justify-between font-medium border transition-colors",
                        groqSettings.enabled
                          ? groqSettings.apiKey?.trim()
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                            : "bg-amber-500/10 border-amber-500/30 text-amber-400"
                          : "bg-muted/40 border-border/50 text-muted-foreground",
                      )}
                    >
                      <span className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "size-2 rounded-full",
                            groqSettings.enabled
                              ? groqSettings.apiKey?.trim()
                                ? "bg-emerald-400 animate-pulse"
                                : "bg-amber-400"
                              : "bg-zinc-600",
                          )}
                        />
                        {groqSettings.enabled
                          ? groqSettings.apiKey?.trim()
                            ? "Groq Active (Bottom selector will show 'Groq')"
                            : "Action Required: Enter Groq API Key"
                          : "Groq Inactive (Using standard AI model selector)"}
                      </span>
                      {groqSettings.enabled && (
                        <span className="text-[9.5px] font-mono opacity-80 truncate max-w-[120px]">
                          {groqSettings.model || "llama-3.3-70b-versatile"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Groq API Key Input Card with Eye & Save buttons */}
                  <div className="p-3.5 rounded-xl border border-border/70 bg-card/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Key className="size-3.5 text-orange-400" />
                        Groq API Key
                      </label>
                      <a
                        href="https://console.groq.com/keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-orange-400 hover:text-orange-300 flex items-center gap-1 transition-colors"
                      >
                        <span>Get Free Key</span>
                        <ExternalLink className="size-2.5" />
                      </a>
                    </div>

                    <div className="relative flex items-center">
                      <input
                        type={isGroqKeyVisible ? "text" : "password"}
                        value={groqApiKeyInput}
                        onChange={(e) => setGroqApiKeyInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleSaveGroqApiKey();
                          }
                        }}
                        placeholder="gsk_..."
                        className="w-full h-9 rounded-lg border border-border/80 bg-background/80 px-3 pr-20 text-xs font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-orange-500/60"
                      />

                      {/* Action Buttons: Eye (Show/Hide) and Save */}
                      <div className="absolute right-1.5 flex items-center gap-1">
                        {/* Eye Icon Button */}
                        <button
                          type="button"
                          onClick={() => setIsGroqKeyVisible(!isGroqKeyVisible)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
                          title={isGroqKeyVisible ? "Hide API Key" : "Show API Key"}
                        >
                          {isGroqKeyVisible ? (
                            <EyeOff className="size-3.5" />
                          ) : (
                            <Eye className="size-3.5" />
                          )}
                        </button>

                        {/* Save Icon Button */}
                        <button
                          type="button"
                          onClick={handleSaveGroqApiKey}
                          className={cn(
                            "flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer shadow-xs",
                            isGroqKeySaved
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                              : "bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 border border-orange-500/40",
                          )}
                          title="Save Groq API Key"
                        >
                          {isGroqKeySaved ? (
                            <>
                              <Check className="size-3" />
                              <span className="text-[10px]">Saved</span>
                            </>
                          ) : (
                            <>
                              <Save className="size-3" />
                              <span className="text-[10px]">Save</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Jab Groq active hoga to call assistant Groq LPU se fast answer generate karega
                      aur niche model dropdown ki jagah sirf <strong>Groq</strong> button nazar
                      aayega.
                    </p>
                  </div>

                  {/* Groq Model Picker */}
                  <div className="p-3.5 rounded-xl border border-border/70 bg-card/60 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Bot className="size-3.5 text-primary" />
                        Groq Model Selection
                      </label>
                      <div className="flex items-center gap-2">
                        {groqModelsFetchStatus && (
                          <span className="text-[10px] text-muted-foreground animate-fade-in font-medium">
                            {groqModelsFetchStatus}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleFetchLiveGroqModels()}
                          disabled={isFetchingGroqModels}
                          className="flex items-center gap-1 text-[10px] text-orange-400 hover:text-orange-300 transition-colors p-1 rounded-md hover:bg-orange-500/10 cursor-pointer disabled:opacity-50"
                          title="Call Groq Models API & Refresh List"
                        >
                          <RefreshCw
                            className={cn(
                              "size-3",
                              isFetchingGroqModels && "animate-spin text-orange-400",
                            )}
                          />
                          <span>{isFetchingGroqModels ? "Loading..." : "Fetch Models"}</span>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                      {(groqSettings.availableModels && groqSettings.availableModels.length > 0
                        ? groqSettings.availableModels
                        : GROQ_MODEL_OPTIONS
                      ).map((opt) => {
                        const isSelected =
                          (groqSettings.model || "llama-3.3-70b-versatile") === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => updateGroqSettings({ model: opt.id })}
                            className={cn(
                              "w-full p-2.5 rounded-lg border text-left transition-all cursor-pointer flex items-center justify-between",
                              isSelected
                                ? "border-orange-500/60 bg-orange-500/10 text-foreground ring-1 ring-orange-500/30"
                                : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40",
                            )}
                          >
                            <div className="min-w-0 pr-2">
                              <div className="text-xs font-semibold text-foreground flex items-center gap-1.5 truncate">
                                <span className="truncate">{opt.name}</span>
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                                {opt.description}
                              </p>
                            </div>
                            {isSelected && (
                              <CheckCircle2 className="size-4 text-orange-400 shrink-0 ml-1" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* OpenDots Living Document Canvas (Split-Screen / Drawer Mode) */}
      {isCanvasOpen && activeCanvasPage && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setIsCanvasOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl sm:max-w-2xl lg:max-w-3xl h-full animate-in slide-in-from-right duration-200"
          >
            <LivingDocumentCanvas
              page={activeCanvasPage}
              onClose={() => setIsCanvasOpen(false)}
              onPageUpdate={(updated) => {
                setActiveCanvasPage(updated);
              }}
            />
          </div>
        </div>
      )}

      {/* Main Conversation Stream */}
      <div className="flex-1 flex flex-col h-full min-w-0 relative">
        {/* Top Header */}
        <header className="h-14 border-b border-border/50 px-3 sm:px-6 flex items-center justify-between shrink-0 bg-background/80 backdrop-blur-md gap-2">
          {/* Left: Direct Voice Stream Full-Duplex Status Pill */}
          <div className="flex-1 flex items-center gap-2 overflow-hidden">
            {isCallActive ? (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-medium shadow-xs">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="font-semibold">Direct Voice Stream</span>
                <span className="hidden sm:inline text-emerald-500/80 font-mono text-[10px]">
                  Full-Duplex
                </span>
              </div>
            ) : null}
          </div>

          {/* Right: Copy Transcript, Notes & Command Center Sheet Button */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Quick Copy Transcript Button */}
            <button
              type="button"
              onClick={handleCopyTranscript}
              disabled={!activeSession?.messages.length}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-border/60 hover:border-border hover:bg-muted/50 text-xs font-medium transition-colors disabled:opacity-30 cursor-pointer"
              title="Copy entire conversation to clipboard"
            >
              {isTranscriptCopied ? (
                <Check className="size-3.5 text-emerald-400" />
              ) : (
                <Copy className="size-3.5 text-muted-foreground" />
              )}
              <span className="hidden md:inline text-[11px]">Copy</span>
            </button>

            {/* Notes Button */}
            <button
              type="button"
              onClick={() => openNotesSheet()}
              className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg border border-border/70 hover:border-border hover:bg-muted/50 text-xs font-medium transition-colors cursor-pointer"
              title="Workspace Notes & Reminders"
            >
              <StickyNote className="size-3.5 text-amber-400" />
              <span className="hidden xs:inline">Notes</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500/15 text-amber-400 font-semibold font-mono">
                {notes.length}
              </span>
            </button>

            {/* OpenDots Spaces & Living Document Canvas Button */}
            <button
              type="button"
              onClick={() => {
                const pages = loadSpacePages(activeProjId || "Workspace");
                if (pages.length > 0) {
                  setActiveCanvasPage(pages[0]);
                } else {
                  setActiveCanvasPage({
                    id: `page_${Date.now().toString(36)}`,
                    title: "Workspace Overview & Specs",
                    spaceName: "Main",
                    category: "spec",
                    status: "approved",
                    summaryItems: [
                      "Living Document Canvas ready",
                      "Notion-like collaborative specs space",
                    ],
                    content:
                      "# Workspace Overview & System Specs\n\nWelcome to your Living Document Space! You can draft specs, track architecture, and collaborate with your Super Bot here.\n\n### Project Milestones\n- [x] Initial workspace inspection & auto-healing\n- [ ] Database schema review\n- [ ] LiveKit audio call bridge integration\n- [ ] Multi-channel deploy setup",
                    projectName: activeProjId || "Workspace",
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                  });
                }
                setIsCanvasOpen(true);
              }}
              className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 text-xs font-semibold text-cyan-300 transition-all cursor-pointer shadow-xs active:scale-95"
              title="Open Notion-like Spaces & Living Document Canvas"
            >
              <FileText className="size-3.5 text-cyan-400" />
              <span className="hidden xs:inline">Spaces Canvas</span>
            </button>

            {/* Command Center Right-Side Sheet Button */}
            <button
              type="button"
              onClick={() => setIsCommandCenterOpen(true)}
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg border border-primary/40 bg-primary/10 hover:bg-primary/20 text-xs font-semibold text-primary transition-all cursor-pointer shadow-xs active:scale-95"
              title="Open Command Center (Memory, Tasks & Persona)"
            >
              <Sparkles className="size-3.5" />
              <span className="hidden xs:inline">Command Center</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-primary text-primary-foreground font-mono font-bold">
                {scheduledTasks.length}
              </span>
            </button>
          </div>
        </header>

        {/* Message Bubble History */}
        <div className="flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden p-4 sm:p-6 space-y-4 max-w-3xl w-full mx-auto">
          {(!activeSession || activeSession.messages.length === 0) && (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
              <div className="size-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4 shadow-inner">
                <Sparkles className="size-8 animate-pulse text-amber-400" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1">
                Super Call Assistant Active
              </h3>
              <p className="text-xs max-w-sm text-muted-foreground">
                Assalam-o-Alaikum! Main aapka Super Admin Voice Agent hoon. Aap Roman Urdu ya
                English mein baat kar saktay hain.
              </p>
            </div>
          )}

          {activeSession?.messages.map((msg) => {
            const isUser = msg.role === "user";

            if (isUser) {
              return (
                <div key={msg.id} className="flex flex-col items-end w-full py-2 group">
                  {/* User message: Right aligned, NO box, NO background, NO border, NO avatar */}
                  <div className="text-right max-w-[88%] sm:max-w-[78%]">
                    <p className="text-sm sm:text-base font-normal text-zinc-100 whitespace-pre-wrap leading-relaxed select-text">
                      {msg.text}
                    </p>

                    {/* Attached File or Screenshot */}
                    {(msg.meta?.file || msg.meta?.image) && (
                      <div className="mt-2 inline-block rounded-xl overflow-hidden border border-zinc-800 max-w-xs shadow-xs text-left">
                        {msg.meta?.isImage || (!msg.meta?.file && msg.meta?.image) ? (
                          <img
                            src={msg.meta.file || msg.meta.image}
                            alt={msg.meta?.fileName || msg.meta?.imageName || "Attached file"}
                            className="w-full h-auto object-cover max-h-48 rounded-lg cursor-pointer hover:opacity-95 transition-opacity"
                            onClick={() => window.open(msg.meta!.file || msg.meta!.image, "_blank")}
                          />
                        ) : (
                          <div
                            onClick={() => window.open(msg.meta!.file, "_blank")}
                            className="flex items-center gap-2.5 p-2 bg-zinc-900/80 hover:bg-zinc-800 rounded-lg cursor-pointer transition-colors"
                          >
                            <div className="p-2 rounded-md bg-zinc-800 text-zinc-400 shrink-0">
                              <FileText className="size-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="text-xs font-semibold text-zinc-200 truncate block">
                                {msg.meta.fileName}
                              </span>
                              {msg.meta.fileSize && (
                                <span className="text-[10px] text-zinc-500 font-mono">
                                  {msg.meta.fileSize}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* User Metadata & Copy */}
                    <div className="flex items-center justify-end gap-2.5 mt-1.5 text-[11px] text-zinc-500 font-mono">
                      <span>
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(msg.text, msg.id)}
                        className="opacity-60 hover:opacity-100 transition-opacity p-0.5 rounded hover:text-zinc-300 cursor-pointer"
                        title="Copy message"
                      >
                        {copiedMessageId === msg.id ? (
                          <Check className="size-3 text-emerald-400" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            // Assistant response: Left aligned, NO box, NO background, NO border, NO avatar
            return (
              <div key={msg.id} className="flex flex-col items-start w-full py-2.5 group">
                <div className="text-left w-full max-w-[95%]">
                  {/* Thinking Disclosure (Collapsible, exact project chat design) */}
                  {msg.meta?.thought && (
                    <ThinkingDisclosure
                      thought={msg.meta.thought}
                      durationMs={msg.meta.durationMs}
                    />
                  )}

                  {/* Tool Calling Badges / Group Disclosure (Collapsible, exact project chat design) */}
                  {msg.meta?.toolsCalled && msg.meta.toolsCalled.length > 0 && (
                    <ToolCallingGroupDisclosure tools={msg.meta.toolsCalled} />
                  )}

                  <div className="text-sm sm:text-base font-normal text-zinc-200 leading-relaxed select-text my-1">
                    <ChatMarkdown
                      text={msg.text}
                      className="text-sm sm:text-base text-zinc-200"
                      lineBreaks
                    />
                  </div>

                  {/* Delegated Task Execution Card */}
                  {msg.meta?.delegatedTask && (
                    <div className="mt-2.5 rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs space-y-2 max-w-xl">
                      <div className="flex items-center justify-between font-medium">
                        <span className="flex items-center gap-1.5 text-foreground">
                          <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                          <span>Delegated:</span>
                          <span className="font-semibold text-primary">
                            {msg.meta.delegatedTask.projectName}
                          </span>
                        </span>
                        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/20 text-primary font-mono font-semibold">
                          {msg.meta.delegatedTask.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        {msg.meta.delegatedTask.taskTitle}
                      </p>
                      <div className="w-full bg-border/60 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-primary h-full rounded-full transition-all duration-500"
                          style={{ width: `${msg.meta.delegatedTask.progress}%` }}
                        />
                      </div>

                      {/* Verified Preview Link Delivery by Super Bot */}
                      {msg.meta.delegatedTask.previewUrl && (
                        <div className="pt-2 mt-2 border-t border-border/40 flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5 text-emerald-400 font-mono text-[11px] truncate">
                            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="font-semibold">Live Preview:</span>
                            <span className="truncate opacity-80">
                              {msg.meta.delegatedTask.previewUrl}
                            </span>
                          </div>
                          <a
                            href={msg.meta.delegatedTask.previewUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-500 text-emerald-950 font-semibold text-xs hover:bg-emerald-400 transition-all shadow-sm active:scale-95"
                          >
                            <span>Open Live Preview</span>
                            <ExternalLink className="size-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Wishlist / Feature Backlog Card with Auto-Approve Toggles */}
                  {msg.meta?.wishlistItems && msg.meta.wishlistItems.length > 0 && (
                    <div className="mt-2.5 max-w-xl">
                      <WishlistCard
                        items={msg.meta.wishlistItems}
                        projectName={msg.meta.wishlistProject ?? "Workspace"}
                      />
                    </div>
                  )}

                  {/* OpenDots: Interactive PageReviewCard */}
                  {msg.meta?.pageReview && (
                    <div className="mt-2.5 max-w-xl">
                      <PageReviewCard
                        page={msg.meta.pageReview}
                        onOpenCanvas={(p) => {
                          setActiveCanvasPage(p);
                          setIsCanvasOpen(true);
                        }}
                        onChipClick={(chip) => {
                          void handleSuperAgentDispatch(chip);
                        }}
                        onStatusChange={(updated) => {
                          msg.meta = { ...msg.meta, pageReview: updated };
                        }}
                      />
                    </div>
                  )}

                  {/* Referenced Memory Card for this Chat */}
                  {msg.meta?.referencedMemory && (
                    <div className="mt-2.5 rounded-lg border border-purple-500/30 bg-purple-500/10 p-2.5 text-xs space-y-1.5 max-w-xl">
                      <div className="flex items-center justify-between font-medium">
                        <span className="flex items-center gap-1.5 text-foreground min-w-0 flex-1">
                          <Brain className="size-3.5 text-purple-400 shrink-0" />
                          <span className="font-semibold text-purple-300 shrink-0">
                            Chat Memory:
                          </span>
                          <span className="font-semibold text-foreground truncate">
                            {msg.meta.referencedMemory.title}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setIsCommandCenterOpen(true);
                            setCommandCenterTab("memory");
                          }}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 font-medium text-[11px] border border-purple-500/30 transition-all cursor-pointer active:scale-95 shrink-0 ml-2"
                          title="Open Memory section in Command Center"
                        >
                          <span>Khol kar dekhein</span>
                          <ExternalLink className="size-3" />
                        </button>
                      </div>
                      {msg.meta.referencedMemory.description && (
                        <p className="text-[11px] text-muted-foreground whitespace-pre-wrap line-clamp-3 bg-zinc-950/60 p-2 rounded border border-border/40 font-mono select-all">
                          {msg.meta.referencedMemory.description}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Interactive Code Diff Viewer */}
                  {msg.meta?.diff && (
                    <div className="mt-2.5 max-w-xl">
                      <CodeDiffCard diffText={msg.meta.diff} />
                    </div>
                  )}

                  {/* Assistant Actions Toolbar & Timestamp */}
                  <div className="flex items-center gap-2.5 mt-2 text-[11px] text-zinc-500 font-sans">
                    <span className="font-mono">
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleCopyMessage(msg.text, msg.id)}
                      className="opacity-60 hover:opacity-100 transition-opacity p-0.5 rounded hover:text-zinc-300 cursor-pointer"
                      title={copiedMessageId === msg.id ? "Copied" : "Copy response"}
                    >
                      {copiedMessageId === msg.id ? (
                        <Check className="size-3 text-emerald-400" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </button>

                    <ReadAloudButton
                      text={msg.text}
                      colorScheme="purple"
                      size="icon-xs"
                      className="opacity-70 hover:opacity-100 p-0.5 rounded cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            );
          })}

          {/* Live Processing & Tool Calling Indicator (Collapsible matching project chats) */}
          {isProcessing && (
            <LiveProcessingActivityRow
              agentStatus={agentStatus}
              selectedModel={groqSettings.enabled ? groqSettings.model || "Groq" : effectiveModel}
              dispatchStartTime={activeDispatchStartTime || Date.now()}
            />
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Unified Bottom Area: Input Field on Top, with Attached Floating Waves Divider directly below */}
        <div className="w-full max-w-2xl sm:max-w-3xl mx-auto px-2 sm:px-4 pb-[max(env(safe-area-inset-bottom),0.95rem)] pt-1 shrink-0 bg-background/95 backdrop-blur-xs">
          {/* Attached File or Screenshot Preview Badge */}
          {attachedFile && (
            <div className="flex items-center gap-2 mb-1.5 px-3 py-1 rounded-xl bg-zinc-900/80 border border-zinc-700/60 w-fit max-w-full animate-in fade-in duration-150">
              {attachedFile.isImage ? (
                <img
                  src={attachedFile.dataUrl}
                  alt="Preview"
                  className="size-7 object-cover rounded-md border border-zinc-750"
                />
              ) : (
                <div className="size-7 rounded-md bg-zinc-800 text-zinc-400 flex items-center justify-center shrink-0">
                  <FileText className="size-3.5" />
                </div>
              )}
              <div className="min-w-0">
                <span className="text-[11px] text-zinc-200 font-medium truncate block max-w-[140px] xs:max-w-[200px]">
                  {attachedFile.name}
                </span>
                {attachedFile.size && (
                  <span className="text-[9px] text-zinc-400 font-mono block">
                    {attachedFile.size}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setAttachedFile(null)}
                className="p-1 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 cursor-pointer shrink-0"
                title="Remove attachment"
              >
                <X className="size-3" />
              </button>
            </div>
          )}

          {/* Hidden File Input for Any Attachment (Images, Documents, Code files) */}
          <input
            ref={fileAttachmentInputRef}
            type="file"
            className="hidden"
            onChange={handleAttachmentFileChange}
          />

          {/* 1. Attached Input Field on Top (Clean, transparent, no background, no outline/border) */}
          <div className="flex items-end justify-between gap-2 px-2 py-1 bg-transparent border-0 outline-none focus-within:outline-none focus-within:ring-0 shadow-none mb-0.5">
            <div className="flex-1 min-w-0">
              <textarea
                ref={inputRef}
                rows={1}
                value={inputText}
                onClick={handleInputFocusOrClick}
                onFocus={handleInputFocusOrClick}
                onBlur={() => {
                  setIsInputFocused(false);
                  setTimeout(() => {
                    if (document.activeElement !== inputRef.current) {
                      isUserEditingRef.current = false;
                      setIsUserEditing(false);
                    }
                  }, 800);
                }}
                onChange={(e) => {
                  isUserEditingRef.current = true;
                  setIsUserEditing(true);
                  setIsInputFocused(true);
                  setInputText(e.target.value);
                  adjustTextareaHeight(e.target);
                }}
                onKeyDown={(e) => {
                  // Ctrl+Shift or Shift+Enter or Ctrl+Enter: Create a new line (max 2 lines)
                  if (e.key === "Enter" && (e.shiftKey || e.ctrlKey)) {
                    if (e.ctrlKey && !e.shiftKey) {
                      e.preventDefault();
                      const target = e.currentTarget;
                      const start = target.selectionStart;
                      const end = target.selectionEnd;
                      const val = target.value;
                      const nextVal = val.substring(0, start) + "\n" + val.substring(end);
                      setInputText(nextVal);
                      setTimeout(() => {
                        target.selectionStart = target.selectionEnd = start + 1;
                        adjustTextareaHeight(target);
                      }, 0);
                    }
                    return;
                  }
                  // Plain Enter: Send message immediately
                  if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey) {
                    e.preventDefault();
                    handleSendNow();
                  }
                }}
                placeholder={
                  attachedFile
                    ? `Add instructions for ${attachedFile.name}...`
                    : "Type a message or speak..."
                }
                className="w-full bg-transparent border-0 outline-none focus:outline-none focus:ring-0 p-0 text-sm text-zinc-200 placeholder:text-zinc-500 resize-none max-h-[56px] min-h-[26px] leading-snug overflow-y-auto tracking-normal font-normal shadow-none"
                aria-label="Message Input"
              />
            </div>

            {/* Gray Action Buttons: Paperclip Attachment, Sparkles/ArrowLeft (on focus/tap), Stop, and Send */}
            <div className="flex items-center gap-1 shrink-0 pb-0.5">
              {/* Universal Attachment Button (Paperclip) */}
              <button
                type="button"
                onClick={() => fileAttachmentInputRef.current?.click()}
                className={cn(
                  "p-1 rounded transition-colors cursor-pointer",
                  attachedFile ? "text-zinc-200" : "text-zinc-400 hover:text-zinc-200",
                )}
                title="Attach File, Code or Screenshot (فائل یا اسکرین شاٹ لگائیں)"
              >
                <Paperclip className="size-3.5 text-zinc-400" />
              </button>

              {/* Sparkles / Undo Transliteration (Only visible when focused, tapped or user is editing text) */}
              {(isInputFocused || isUserEditing || inputText.trim().length > 0) &&
                (previousTextForUndo !== null ? (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleUndoTransliteration}
                    className="p-1 rounded text-zinc-400 hover:text-white transition-colors cursor-pointer"
                    title="Wapas original Urdu par layen (Undo)"
                  >
                    <ArrowLeft className="size-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleTransliterateToRoman}
                    disabled={isTransliterating || !inputText.trim()}
                    className="p-1 rounded text-zinc-400 hover:text-amber-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    title="Urdu ko Roman Urdu mein convert karein"
                  >
                    {isTransliterating ? (
                      <Loader2 className="size-3.5 animate-spin text-amber-400" />
                    ) : (
                      <Sparkles className="size-3.5" />
                    )}
                  </button>
                ))}

              {/* Stop Speaking / Stop AI Button (Right next to Send button) */}
              {(callStatus === "speaking" || isProcessing) && (
                <button
                  type="button"
                  onClick={handleStopSpeaking}
                  className="p-1 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-500/15 transition-colors cursor-pointer animate-pulse"
                  title="Stop AI Response / Speaking (روکیں)"
                >
                  <Square className="size-3.5 fill-rose-400 text-rose-400" />
                </button>
              )}

              {/* Dynamic Mic Dictation / Send Button (Exact project chat design) */}
              {isDictating ? (
                <button
                  type="button"
                  onClick={handleToggleDictation}
                  className="p-1 rounded text-red-400 bg-red-500/15 hover:bg-red-500/25 transition-all cursor-pointer animate-pulse"
                  title="Stop dictation (Click to finish)"
                >
                  <MicOff className="size-3.5 animate-bounce" />
                </button>
              ) : inputText.trim().length > 0 || attachedFile ? (
                <button
                  type="button"
                  onClick={handleSendNow}
                  disabled={isProcessing}
                  className="p-1 rounded text-zinc-200 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  title="Send Message"
                >
                  <Send className="size-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleToggleDictation}
                  className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                  title={`Dictate message (${sttSettings.language.replace("-", " ")})`}
                >
                  <Mic className="size-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* 2. Sleek Horizontal Divider Directly Below with End-to-End Controls & Floating Waves (10-15% scaled down on mobile) */}
          <div className="relative flex items-center justify-between w-full min-h-[34px] sm:min-h-[46px]">
            {/* Left End: AI Model Dropdown / Groq Indicator (At the very left end) */}
            <div className="relative z-10 shrink-0 pr-1 max-w-[100px] xs:max-w-[125px] sm:max-w-none">
              {groqSettings.enabled ? (
                <button
                  type="button"
                  onClick={() => {
                    setCommandCenterTab("settings");
                    setIsCommandCenterOpen(true);
                  }}
                  className="h-5.5 sm:h-6 inline-flex items-center gap-1.5 rounded-full border border-orange-500/40 bg-orange-500/10 hover:bg-orange-500/20 px-2 text-[9.5px] sm:text-[11px] font-semibold text-orange-400 shadow-xs cursor-pointer select-none transition-all active:scale-95"
                  title={`Groq is active (${groqSettings.model || "llama-3.3-70b-versatile"}). Click to open Settings.`}
                >
                  <Zap className="size-2.5 sm:size-3 text-orange-400 fill-orange-400" />
                  <span>Groq</span>
                </button>
              ) : (
                <ProviderModelPicker
                  activeInstanceId={effectiveInstanceId}
                  model={effectiveModel}
                  lockedProvider={null}
                  instanceEntries={instanceEntries}
                  modelOptionsByInstance={modelOptionsByInstance}
                  keybindings={keybindings}
                  size="xs"
                  triggerClassName="h-5.5 sm:h-6 rounded-full border border-zinc-800 bg-background px-1.5 sm:px-2 text-[9.5px] sm:text-[11px] font-medium text-zinc-400 hover:text-white hover:border-zinc-600 shadow-xs cursor-pointer select-none truncate"
                  onInstanceModelChange={handleModelChange}
                />
              )}
            </div>

            {/* Left Line Segment (starts at model picker right edge, stops at center wave) */}
            <div className="flex-1 h-[1px] bg-zinc-800/80 self-center" />

            {/* Middle / Center: Call Button with Grok Geometric Soundwaves / Circular Wave (Floating in center) */}
            <div className="relative z-10 flex items-center justify-center shrink-0 mx-1 sm:mx-2">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleToggleCallSession();
                }}
                className={cn(
                  "relative z-10 flex items-center justify-center size-9 sm:size-11 rounded-full transition-all duration-200 cursor-pointer select-none",
                  "bg-transparent border-0 shadow-none outline-none focus:outline-none",
                  isCallActive
                    ? "text-rose-400/90 hover:text-rose-300"
                    : "text-zinc-300 hover:text-white",
                )}
                title={
                  isCallActive
                    ? "End Voice Call (کال بند کریں)"
                    : "Start Voice Call (کال شروع کریں)"
                }
              >
                {/* When Call Active: Grok Geometric Soundwave
                    When Call Inactive/Ended: Original circular wave in grey color */}
                {isCallActive ? (
                  <GrokGeometricVoiceWaves callStatus={callStatus} analyserNode={analyserNode} />
                ) : (
                  <CircularVoiceWaves callStatus="idle" analyserNode={null} />
                )}

                {/* Centered Phone Icon: Soft red when active call, subtle grey when idle/ended */}
                <span className="relative z-20 flex size-7 sm:size-8 items-center justify-center pointer-events-none">
                  {isCallActive ? (
                    <PhoneOff className="size-3.5 sm:size-4.5" strokeWidth={2.4} />
                  ) : (
                    <PhoneCall className="size-3.5 sm:size-4.5" strokeWidth={2.2} />
                  )}
                </span>
              </button>
            </div>

            {/* Right Line Segment (starts at center wave, stops at mic button left edge) */}
            <div className="flex-1 h-[1px] bg-zinc-800/80 self-center" />

            {/* Right End: When Call Active -> Mic Mute/Unmute; When Idle -> Pakistan & USA Language Flags */}
            <div className="relative z-10 shrink-0 pl-1 flex items-center">
              {isCallActive ? (
                <button
                  type="button"
                  onClick={handleToggleMicMute}
                  className={cn(
                    "size-6 sm:size-7 rounded-full border flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95",
                    isMicMuted
                      ? "bg-amber-500/20 border-amber-500/50 text-amber-400"
                      : "bg-zinc-900 border-zinc-700/80 text-zinc-300 hover:text-white hover:bg-zinc-800",
                  )}
                  title={isMicMuted ? "Unmute Microphone" : "Mute Microphone"}
                >
                  {isMicMuted ? (
                    <MicOff className="size-2.5 sm:size-3.5" />
                  ) : (
                    <Mic className="size-2.5 sm:size-3.5" />
                  )}
                </button>
              ) : (
                <div className="flex items-center gap-1 select-none bg-zinc-900/60 border border-zinc-800/80 rounded-full px-1.5 py-0.5 shadow-2xs">
                  {/* Pakistan Flag (Urdu Transcription) */}
                  <button
                    type="button"
                    onClick={() => {
                      setCallLanguage("urdu");
                      saveSttSettings({ ...sttSettings, language: "natural-urdu" });
                    }}
                    className={cn(
                      "p-0.5 rounded transition-all cursor-pointer flex items-center justify-center active:scale-90",
                      isPakSelected
                        ? "opacity-100 filter-none ring-1.5 ring-emerald-500/70 shadow-xs scale-105"
                        : "opacity-35 grayscale hover:opacity-75 hover:grayscale-50",
                    )}
                    title="Urdu Transcription (اردو / Pakistan)"
                  >
                    <PakistanFlagIcon className="w-4 h-3 rounded-xs" />
                  </button>

                  {/* USA Flag (English Transcription) */}
                  <button
                    type="button"
                    onClick={() => {
                      setCallLanguage("english");
                      saveSttSettings({ ...sttSettings, language: "english" });
                    }}
                    className={cn(
                      "p-0.5 rounded transition-all cursor-pointer flex items-center justify-center active:scale-90",
                      isUsaSelected
                        ? "opacity-100 filter-none ring-1.5 ring-blue-500/70 shadow-xs scale-105"
                        : "opacity-35 grayscale hover:opacity-75 hover:grayscale-50",
                    )}
                    title="English Transcription (English / USA)"
                  >
                    <UsaFlagIcon className="w-4 h-3 rounded-xs" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
