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
  Activity,
  GitCommit,
  GitBranch,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { executeTerminalCommand } from "~/components/chat/terminal/terminalClient";
import { Link } from "@tanstack/react-router";
import { type ProviderInstanceId } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { cn } from "~/lib/utils";
import { useProjects } from "~/state/entities";
import { useNotes, openNotesSheet, addNote, type NoteItem } from "~/lib/notesStore";
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
import {
  speakText,
  stopSpeaking,
  loadTtsSettings,
  subscribeTtsSettings,
  getActiveTtsPreset,
  TTS_ACCENTS,
  type TtsSettings,
} from "~/lib/speech/tts";
import {
  loadSttSettings,
  saveSttSettings,
  subscribeSttSettings,
  type SttSettings,
} from "~/lib/speech/stt";
import { transliterateUrduToRoman } from "~/lib/speech/romanUrduTransliterate";
import { executeSuperAgentInstruction, isUrduLanguage } from "./superAgentEngine";

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

  const { tasks: scheduledTasks, toggle: toggleTask, remove: removeTask } = useScheduledTasks();
  const { activities, deleteActivity } = useProjectActivities();
  const [tasksSheetTab, setTasksSheetTab] = useState<"scheduled" | "history">("scheduled");
  const [inputText, setInputText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [agentStatus, setAgentStatus] = useState<string | null>(null);

  // Command Center / Right Sidebar Drawer
  const [isCommandCenterOpen, setIsCommandCenterOpen] = useState(false);
  const [commandCenterTab, setCommandCenterTab] = useState<
    "summary" | "wishlist" | "health" | "tasks" | "voice"
  >("summary");

  // Health & Diagnostics State in Command Center
  const [healthBranch, setHealthBranch] = useState("main");
  const [healthModifiedFiles, setHealthModifiedFiles] = useState<string[]>([]);
  const [healthRecentCommits, setHealthRecentCommits] = useState<string[]>([]);
  const [isHealthLoading, setIsHealthLoading] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);

  // Screenshot / Image Attachment State
  const [attachedImage, setAttachedImage] = useState<{ dataUrl: string; name: string } | null>(
    null,
  );
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setAttachedImage({ dataUrl: reader.result, name: file.name });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // Transcript Copy & Export State
  const [isTranscriptCopied, setIsTranscriptCopied] = useState(false);

  // Wishlist State in Command Center
  const activeProjectName = useMemo(() => {
    return projects[0]?.title || (projects[0]?.id ? String(projects[0].id) : "Workspace");
  }, [projects]);
  const [drawerWishlistItems, setDrawerWishlistItems] = useState<
    import("~/lib/callAssistantStore").WishlistItem[]
  >([]);
  const [isWishlistLoading, setIsWishlistLoading] = useState(false);
  const [newWishlistTitle, setNewWishlistTitle] = useState("");
  const [newWishlistType, setNewWishlistType] = useState<"feature" | "improvement">("feature");

  // Fetch Wishlist Items
  const fetchDrawerWishlist = useCallback(async () => {
    setIsWishlistLoading(true);
    try {
      const res = await fetch(`/api/bot/wishlist?project=${encodeURIComponent(activeProjectName)}`);
      const data = (await res.json()) as {
        ok: boolean;
        items: import("~/lib/callAssistantStore").WishlistItem[];
      };
      if (data.ok && Array.isArray(data.items)) {
        setDrawerWishlistItems(data.items);
      }
    } catch (err) {
      console.warn("Failed to fetch drawer wishlist:", err);
    } finally {
      setIsWishlistLoading(false);
    }
  }, [activeProjectName]);

  useEffect(() => {
    if (isCommandCenterOpen && commandCenterTab === "wishlist") {
      void fetchDrawerWishlist();
    }
  }, [isCommandCenterOpen, commandCenterTab, fetchDrawerWishlist]);

  // Toggle Auto-Approve on Wishlist item
  const handleToggleAutoApprove = useCallback(
    async (itemId: string) => {
      try {
        const res = await fetch("/api/bot/wishlist/toggle-approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectName: activeProjectName, itemId }),
        });
        const data = (await res.json()) as {
          ok: boolean;
          item?: import("~/lib/callAssistantStore").WishlistItem;
        };
        if (data.ok && data.item) {
          setDrawerWishlistItems((prev) =>
            prev.map((it) =>
              it.id === itemId ? { ...it, autoApprove: data.item!.autoApprove } : it,
            ),
          );
        }
      } catch (err) {
        console.error("Auto approve toggle error:", err);
      }
    },
    [activeProjectName],
  );

  // Fetch Project Health & Git Info
  const fetchProjectHealth = useCallback(async () => {
    setIsHealthLoading(true);
    try {
      const activeProj = projects[0];
      const projectCwd = activeProj?.path ? String(activeProj.path) : undefined;
      const branchRes = await executeTerminalCommand(
        "git branch --show-current",
        projectCwd,
        10_000,
      );
      if (branchRes?.stdout) setHealthBranch(branchRes.stdout.trim());

      const statusRes = await executeTerminalCommand("git status --short", projectCwd, 10_000);
      if (statusRes?.stdout) {
        setHealthModifiedFiles(statusRes.stdout.split("\n").filter(Boolean));
      } else {
        setHealthModifiedFiles([]);
      }

      const logRes = await executeTerminalCommand(
        'git log -n 4 --pretty=format:"%h | %s (%cr)"',
        projectCwd,
        10_000,
      );
      if (logRes?.stdout) {
        setHealthRecentCommits(logRes.stdout.split("\n").filter(Boolean));
      }
    } catch (e) {
      console.warn("Failed to fetch project health:", e);
    } finally {
      setIsHealthLoading(false);
    }
  }, [projects]);

  useEffect(() => {
    if (isCommandCenterOpen && commandCenterTab === "health") {
      void fetchProjectHealth();
    }
  }, [isCommandCenterOpen, commandCenterTab, fetchProjectHealth]);

  // Smart AI Commit & Push
  const handleSmartCommit = useCallback(async () => {
    setIsCommitting(true);
    try {
      void handleSuperAgentDispatch(
        "Tamam modified files check karo, aik clean descriptive git commit message bana kar commit aur push kardo.",
      );
    } finally {
      setIsCommitting(false);
    }
  }, []);

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

  useEffect(() => {
    const unsubTts = subscribeTtsSettings(setTtsSettings);
    const unsubStt = subscribeSttSettings(setSttSettings);
    return () => {
      unsubTts();
      unsubStt();
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

      const currentImage = attachedImage;
      setAttachedImage(null);

      setInputText("");
      setPreviousTextForUndo(null);
      isUserEditingRef.current = false;
      setIsUserEditing(false);

      const effectiveUserPrompt = currentImage
        ? `${userText}\n[Screenshot/Image: ${currentImage.name}]`
        : userText;

      handleAddMessage(
        "user",
        userText,
        currentImage
          ? ({ image: currentImage.dataUrl, imageName: currentImage.name } as any)
          : undefined,
      );
      setIsProcessing(true);
      setAgentStatus("Analyzing request...");

      try {
        const activeProjId = projects[0]?.id ? String(projects[0].id) : undefined;
        const matchingCustomProvider = customProvidersList.find(
          (cp) =>
            cp.id === effectiveInstanceId ||
            cp.name === effectiveInstanceId ||
            String(cp.id) === String(effectiveInstanceId),
        );

        const res = await executeSuperAgentInstruction({
          userText: effectiveUserPrompt,
          projects,
          activeProjectId: activeProjId,
          selectedModel: effectiveModel,
          selectedInstanceId: String(effectiveInstanceId),
          conversationHistory: (activeSession?.messages || []).map((m) => ({
            role: m.role === "user" ? ("user" as const) : ("assistant" as const),
            text: m.text,
          })),
          providerConfig: matchingCustomProvider
            ? ({
                baseUrl: matchingCustomProvider.baseUrl,
                apiKey: matchingCustomProvider.apiKey,
                headers: matchingCustomProvider.headers as any,
                format: matchingCustomProvider.format,
              } as any)
            : undefined,
          onStatusUpdate: (status) => {
            setAgentStatus(status);
          },
        });

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
        const enrichedMeta = {
          ...meta,
          ...(codeDiff ? { diff: codeDiff } : {}),
        };

        handleAddMessage("assistant", res.reply, enrichedMeta);
        speakText(res.spokenReply, loadTtsSettings(), () => {
          if (inputRef.current !== document.activeElement) {
            isUserEditingRef.current = false;
            setIsUserEditing(false);
          }
        });
      } catch (err: any) {
        console.error("Super agent error:", err);
        const errDetail = err?.message || String(err);
        const errorMsg = isUrduLanguage(userText)
          ? `⚠️ Issue: ${errDetail}. Main dobara check karta hoon.`
          : `⚠️ Issue: ${errDetail}. Let me re-check.`;
        handleAddMessage("assistant", errorMsg);
        speakText(errorMsg, loadTtsSettings(), () => {
          if (inputRef.current !== document.activeElement) {
            isUserEditingRef.current = false;
            setIsUserEditing(false);
          }
        });
      } finally {
        setIsProcessing(false);
        setAgentStatus(null);
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

  // Live Speech transcript update
  const handleTranscriptChange = useCallback((text: string) => {
    // If user is not actively focused on the text input with cursor, ensure isUserEditing is false
    if (document.activeElement !== inputRef.current) {
      isUserEditingRef.current = false;
      setIsUserEditing(false);
    } else if (isUserEditingRef.current) {
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
    prompt: inputText,
    phase: isProcessing ? "running" : "ready",
    isUserEditing,
  });

  const isUsaSelected = sttSettings.language === "english" || callLanguage === "english";
  const isPakSelected = !isUsaSelected;

  // User clicked on the input text: pause auto-send immediately
  const handleInputFocusOrClick = useCallback(() => {
    isUserEditingRef.current = true;
    setIsUserEditing(true);
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

  // Copy Full Conversation Transcript
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

  // Download Conversation as Markdown File
  const handleDownloadMarkdown = useCallback(() => {
    if (!activeSession?.messages.length) return;
    const md =
      `# Super Call Assistant Conversation Transcript\n` +
      `**Session:** ${activeSession.title || "Untitled Session"}\n` +
      `**Date:** ${new Date().toLocaleString()}\n` +
      `**Total Messages:** ${activeSession.messages.length}\n\n---\n\n` +
      activeSession.messages
        .map(
          (m) =>
            `### ${m.role === "user" ? "👤 You (User)" : "🤖 Super Bot Assistant"} *(${new Date(m.timestamp).toLocaleTimeString()})*\n\n${m.text}\n`,
        )
        .join("\n---\n\n");

    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `voice-session-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeSession]);

  // Barge-in / Stop Speaking Helper
  const handleStopSpeaking = useCallback(() => {
    stopSpeaking();
    interruptSpeaking();
  }, [interruptSpeaking]);

  // Conversation Key Points & Summary Extractor
  const conversationSummary = useMemo(() => {
    if (!activeSession || activeSession.messages.length === 0) return null;
    const userMsgs = activeSession.messages.filter((m) => m.role === "user");
    const botMsgs = activeSession.messages.filter((m) => m.role === "assistant");
    const recentQueries = userMsgs.slice(-4).map((m) => {
      const single = m.text.replace(/\s+/g, " ").trim();
      return single.length > 55 ? single.slice(0, 52) + "..." : single;
    });

    return {
      total: activeSession.messages.length,
      userCount: userMsgs.length,
      botCount: botMsgs.length,
      recentQueries,
    };
  }, [activeSession]);

  // Smart Suggested Quick-Action Chips
  const quickSuggestions = useMemo(
    () => [
      { label: "📊 Project Status", prompt: "Tamam projects ka status report do" },
      { label: "📋 Wishlist Check", prompt: "Active project ki Wishlist check karo" },
      { label: "🔍 Scan Bugs & Errors", prompt: "Kya kisi project mein koi bug ya error hai?" },
      {
        label: "📝 Summarize Call",
        prompt: "Ab tak ki conversation ko 3 bullet points mein summarize karo",
      },
      { label: "⚡ Next Priority?", prompt: "Is waqt meri sab se bari priority kya honi chahiye?" },
    ],
    [],
  );

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

            {/* Navigation Tabs (5 Comprehensive Tabs) */}
            <div className="grid grid-cols-5 border-b border-border/50 px-1 pt-1 bg-muted/30 text-center">
              <button
                type="button"
                onClick={() => setCommandCenterTab("summary")}
                className={cn(
                  "pb-2 pt-1 text-[10.5px] font-semibold border-b-2 transition-colors cursor-pointer flex flex-col items-center justify-center gap-1",
                  commandCenterTab === "summary"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <FileText className="size-3" />
                <span>Summary</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCommandCenterTab("wishlist");
                  void fetchDrawerWishlist();
                }}
                className={cn(
                  "pb-2 pt-1 text-[10.5px] font-semibold border-b-2 transition-colors cursor-pointer flex flex-col items-center justify-center gap-1",
                  commandCenterTab === "wishlist"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <ShoppingBag className="size-3" />
                <span>Wishlist</span>
                {drawerWishlistItems.length > 0 && (
                  <span className="text-[8px] px-1 rounded-full bg-amber-500/20 text-amber-400 font-mono">
                    {drawerWishlistItems.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setCommandCenterTab("health");
                  void fetchProjectHealth();
                }}
                className={cn(
                  "pb-2 pt-1 text-[10.5px] font-semibold border-b-2 transition-colors cursor-pointer flex flex-col items-center justify-center gap-1",
                  commandCenterTab === "health"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Activity className="size-3" />
                <span>Health</span>
                {healthModifiedFiles.length > 0 && (
                  <span className="text-[8px] px-1 rounded-full bg-amber-500/20 text-amber-400 font-mono">
                    {healthModifiedFiles.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setCommandCenterTab("tasks")}
                className={cn(
                  "pb-2 pt-1 text-[10.5px] font-semibold border-b-2 transition-colors cursor-pointer flex flex-col items-center justify-center gap-1",
                  commandCenterTab === "tasks"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <ListTodo className="size-3" />
                <span>Tasks</span>
                {scheduledTasks.length > 0 && (
                  <span className="text-[8px] px-1 rounded-full bg-primary/20 text-primary font-mono">
                    {scheduledTasks.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setCommandCenterTab("voice")}
                className={cn(
                  "pb-2 pt-1 text-[10.5px] font-semibold border-b-2 transition-colors cursor-pointer flex flex-col items-center justify-center gap-1",
                  commandCenterTab === "voice"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <SlidersHorizontal className="size-3" />
                <span>Voice</span>
              </button>
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* TAB 1: SUMMARY & EXPORT */}
              {commandCenterTab === "summary" && (
                <div className="space-y-4">
                  {/* Session Metrics Card */}
                  <div className="p-3.5 rounded-xl border border-border/70 bg-card/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">
                        Session Overview
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {activeSession?.messages.length ?? 0} total messages
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <div className="p-2 rounded-lg bg-muted/40 text-center">
                        <span className="block text-xs font-bold text-foreground">
                          {conversationSummary?.userCount ?? 0}
                        </span>
                        <span className="text-[9px] text-muted-foreground uppercase">
                          User Turns
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/40 text-center">
                        <span className="block text-xs font-bold text-primary">
                          {conversationSummary?.botCount ?? 0}
                        </span>
                        <span className="text-[9px] text-muted-foreground uppercase">
                          Bot Turns
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/40 text-center">
                        <span className="block text-xs font-bold text-emerald-400">
                          {callStatus === "idle" ? "Standby" : callStatus}
                        </span>
                        <span className="text-[9px] text-muted-foreground uppercase">
                          Call State
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Key Topics / Queries */}
                  <div className="p-3.5 rounded-xl border border-border/70 bg-card/60 space-y-2">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Sparkles className="size-3 text-amber-400" />
                      Key Discussion Points
                    </span>
                    {conversationSummary && conversationSummary.recentQueries.length > 0 ? (
                      <ul className="space-y-1.5 pt-1">
                        {conversationSummary.recentQueries.map((q, idx) => (
                          <li
                            key={idx}
                            className="text-xs text-muted-foreground flex items-start gap-2 bg-muted/20 p-2 rounded-lg border border-border/40"
                          >
                            <span className="text-primary font-mono text-[10px] mt-0.5">
                              #{idx + 1}
                            </span>
                            <span className="leading-snug text-foreground/90">{q}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground italic py-2">
                        Abhi conversation shuru karein, key points yahan auto-extract honge.
                      </p>
                    )}
                  </div>

                  {/* Export & Actions */}
                  <div className="p-3.5 rounded-xl border border-border/70 bg-card/60 space-y-2.5">
                    <span className="text-xs font-semibold text-foreground">Export & Sharing</span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={handleCopyTranscript}
                        disabled={!activeSession?.messages.length}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-muted/40 hover:bg-muted text-xs font-medium transition-colors disabled:opacity-40 cursor-pointer"
                      >
                        {isTranscriptCopied ? (
                          <>
                            <Check className="size-3.5 text-emerald-400" />
                            <span className="text-emerald-400">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="size-3.5 text-muted-foreground" />
                            <span>Copy Transcript</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={handleDownloadMarkdown}
                        disabled={!activeSession?.messages.length}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-muted/40 hover:bg-muted text-xs font-medium transition-colors disabled:opacity-40 cursor-pointer"
                      >
                        <Download className="size-3.5 text-muted-foreground" />
                        <span>Export Markdown</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (
                          confirm("Kya aap waqai is session ki history clear karna chahte hain?")
                        ) {
                          handleClearHistory();
                        }
                      }}
                      disabled={!activeSession?.messages.length}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-destructive/30 hover:border-destructive/60 hover:bg-destructive/10 text-destructive text-xs font-medium transition-colors disabled:opacity-40 cursor-pointer"
                    >
                      <Trash2 className="size-3.5" />
                      <span>Clear Session History</span>
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: WISHLIST & AUTO-APPROVE */}
              {commandCenterTab === "wishlist" && (
                <div className="space-y-4">
                  {/* Header & Refresh */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-semibold text-foreground">
                        {activeProjectName} Wishlist
                      </h3>
                      <p className="text-[10px] text-muted-foreground">
                        Review pending improvements & toggle Auto-Approve
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void fetchDrawerWishlist()}
                      disabled={isWishlistLoading}
                      className="p-1.5 rounded-lg border border-border/70 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      title="Refresh Wishlist"
                    >
                      <RefreshCw className={cn("size-3.5", isWishlistLoading && "animate-spin")} />
                    </button>
                  </div>

                  {/* Add New Wishlist Quick Form */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!newWishlistTitle.trim()) return;
                      void handleSuperAgentDispatch(
                        `Wishlist mein naya item add karo: "${newWishlistTitle}" as ${newWishlistType}`,
                      );
                      setNewWishlistTitle("");
                      setTimeout(() => void fetchDrawerWishlist(), 1500);
                    }}
                    className="p-3 rounded-xl border border-border/70 bg-card/60 space-y-2"
                  >
                    <span className="text-[11px] font-medium text-foreground flex items-center gap-1">
                      <Plus className="size-3 text-primary" />
                      Add Quick Wishlist Item
                    </span>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newWishlistTitle}
                        onChange={(e) => setNewWishlistTitle(e.target.value)}
                        placeholder="Feature ya improvement ka naam..."
                        className="flex-1 bg-background border border-border/80 rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                      />
                      <select
                        value={newWishlistType}
                        onChange={(e) => setNewWishlistType(e.target.value as any)}
                        className="bg-background border border-border/80 rounded-lg px-2 py-1.5 text-[11px] text-foreground focus:outline-none"
                      >
                        <option value="feature">✨ Feature</option>
                        <option value="improvement">⚡ Improve</option>
                      </select>
                      <button
                        type="submit"
                        disabled={!newWishlistTitle.trim() || isProcessing}
                        className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold text-xs hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer"
                      >
                        Add
                      </button>
                    </div>
                  </form>

                  {/* Wishlist Items List */}
                  {isWishlistLoading && drawerWishlistItems.length === 0 ? (
                    <div className="py-8 flex flex-col items-center justify-center text-muted-foreground">
                      <Loader2 className="size-5 animate-spin mb-2" />
                      <span className="text-xs">Loading wishlist...</span>
                    </div>
                  ) : drawerWishlistItems.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground space-y-2">
                      <ShoppingBag className="size-8 mx-auto opacity-40" />
                      <p className="text-xs font-medium text-foreground">Wishlist khali hai</p>
                      <p className="text-[11px] max-w-xs mx-auto">
                        Aap assistant se bol sakte hain: &quot;Wishlist mein feature add karo&quot;
                        ya upar se direct add karein.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {drawerWishlistItems.map((item) => (
                        <div
                          key={item.id}
                          className="p-3 rounded-xl border border-border/70 bg-card/60 flex items-start gap-3 hover:bg-card transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-xs text-foreground truncate">
                                {item.title}
                              </span>
                              <span
                                className={cn(
                                  "text-[9px] px-1.5 py-0.2 rounded-full font-mono uppercase",
                                  item.type === "improvement"
                                    ? "bg-blue-500/15 text-blue-400"
                                    : "bg-emerald-500/15 text-emerald-400",
                                )}
                              >
                                {item.type === "improvement" ? "⚡ Improve" : "✨ Feature"}
                              </span>
                              <span className="text-[9px] text-muted-foreground">
                                • {item.status}
                              </span>
                            </div>
                            {item.description && (
                              <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">
                                {item.description}
                              </p>
                            )}
                          </div>

                          {/* Auto-Approve Toggle Switch */}
                          <div className="flex flex-col items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => void handleToggleAutoApprove(item.id)}
                              title={item.autoApprove ? "Auto Approve: ON" : "Auto Approve: OFF"}
                              className={cn(
                                "relative w-9 h-5 rounded-full transition-colors duration-200 focus:outline-none cursor-pointer",
                                item.autoApprove
                                  ? "bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.4)]"
                                  : "bg-zinc-700/60",
                              )}
                            >
                              <span
                                className={cn(
                                  "absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform duration-200",
                                  item.autoApprove ? "translate-x-4" : "translate-x-0",
                                )}
                              />
                            </button>
                            <span
                              className={cn(
                                "text-[8px] font-bold uppercase tracking-wider",
                                item.autoApprove ? "text-emerald-400" : "text-zinc-500",
                              )}
                            >
                              {item.autoApprove ? "AUTO" : "MANUAL"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB: HEALTH & DIAGNOSTICS */}
              {commandCenterTab === "health" && (
                <div className="space-y-4">
                  {/* Header & Refresh */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-semibold text-foreground">
                        Workspace Health & Git
                      </h3>
                      <p className="text-[10px] text-muted-foreground">
                        Git status, active branch & automated commit engine
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void fetchProjectHealth()}
                      disabled={isHealthLoading}
                      className="p-1.5 rounded-lg border border-border/70 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      title="Refresh Project Health"
                    >
                      <RefreshCw className={cn("size-3.5", isHealthLoading && "animate-spin")} />
                    </button>
                  </div>

                  {/* Branch & Modified Status Card */}
                  <div className="p-3.5 rounded-xl border border-border/70 bg-card/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <GitBranch className="size-3.5 text-primary" />
                        <span className="text-xs font-mono font-semibold text-foreground">
                          {healthBranch}
                        </span>
                      </div>
                      <span
                        className={cn(
                          "text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold",
                          healthModifiedFiles.length > 0
                            ? "bg-amber-500/20 text-amber-400"
                            : "bg-emerald-500/20 text-emerald-400",
                        )}
                      >
                        {healthModifiedFiles.length > 0
                          ? `${healthModifiedFiles.length} modified`
                          : "Clean Working Tree"}
                      </span>
                    </div>

                    {/* Modified Files List */}
                    {healthModifiedFiles.length > 0 ? (
                      <div className="p-2.5 rounded-lg bg-zinc-950/70 border border-border/50 max-h-36 overflow-y-auto space-y-1">
                        {healthModifiedFiles.map((line, idx) => (
                          <div
                            key={idx}
                            className="text-[10.5px] font-mono text-zinc-300 truncate flex items-center gap-1.5"
                          >
                            <span className="text-amber-400 font-bold shrink-0 text-[10px]">
                              {line.slice(0, 2)}
                            </span>
                            <span className="truncate">{line.slice(2).trim()}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2 text-emerald-400 text-xs">
                        <ShieldCheck className="size-4 shrink-0" />
                        <span>Working tree bilkul clean hai, koi uncommitted change nahi.</span>
                      </div>
                    )}

                    {/* Smart AI Commit Button */}
                    {healthModifiedFiles.length > 0 && (
                      <button
                        type="button"
                        onClick={() => void handleSmartCommit()}
                        disabled={isCommitting || isProcessing}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 text-xs font-semibold transition-opacity cursor-pointer shadow-xs"
                      >
                        <GitCommit className="size-3.5" />
                        <span>
                          {isCommitting ? "Generating Commit..." : "Smart AI Commit & Push"}
                        </span>
                      </button>
                    )}
                  </div>

                  {/* Recent Commits Card */}
                  <div className="p-3.5 rounded-xl border border-border/70 bg-card/60 space-y-2">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Clock className="size-3.5 text-muted-foreground" />
                      Recent Git Commits
                    </span>
                    {healthRecentCommits.length > 0 ? (
                      <div className="space-y-1.5 pt-1">
                        {healthRecentCommits.map((c, idx) => (
                          <div
                            key={idx}
                            className="p-2 rounded-lg bg-muted/30 border border-border/40 text-[11px] font-mono text-zinc-300 leading-snug break-words"
                          >
                            {c}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic py-1">
                        No recent commit logs available.
                      </p>
                    )}
                  </div>

                  {/* Auto-Heal & Diagnose Trigger Button */}
                  <div className="p-3.5 rounded-xl border border-border/70 bg-card/60 space-y-2">
                    <span className="text-xs font-semibold text-foreground">Diagnostics Radar</span>
                    <button
                      type="button"
                      onClick={() =>
                        void handleSuperAgentDispatch(
                          "Workspace ke tamam errors scan karo aur self-healing diagnostics report do.",
                        )
                      }
                      disabled={isProcessing}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/40 hover:bg-muted text-xs font-medium text-foreground transition-colors cursor-pointer"
                    >
                      <Activity className="size-3.5 text-primary" />
                      <span>Run Self-Healing Error Audit</span>
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 4: TASKS & LEDGER */}
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
                        localStorage.setItem("t3code:tts-settings:v1", JSON.stringify(updated));
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
            </div>
          </aside>
        </div>
      )}

      {/* Main Conversation Stream */}
      <div className="flex-1 flex flex-col h-full min-w-0 relative">
        {/* Top Header */}
        <header className="h-14 border-b border-border/50 px-3 sm:px-6 flex items-center justify-between shrink-0 bg-background/80 backdrop-blur-md gap-2">
          {/* Left: Active STT & TTS Settings indicator with direct link to Settings */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Link
              to="/settings/stt-tts"
              className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1.5 rounded-lg border border-border/60 hover:border-primary/50 bg-muted/30 hover:bg-muted/60 text-xs text-muted-foreground hover:text-foreground transition-all cursor-pointer group shadow-2xs max-w-[170px] xs:max-w-[210px] sm:max-w-md truncate"
              title="Click to customize STT & TTS Voice, Speed, Pitch & Accent Settings"
            >
              <div className="flex items-center gap-1 text-primary shrink-0">
                <Volume2 className="size-3.5 group-hover:scale-110 transition-transform" />
                <span className="font-semibold text-foreground hidden sm:inline">
                  Voice & Speech:
                </span>
                <span className="font-semibold text-foreground sm:hidden">Voice:</span>
              </div>
              <span className="truncate font-mono text-[10px] sm:text-[11px] text-zinc-300">
                {activeVoiceLabel} ({ttsSettings.rate.toFixed(1)}x)
              </span>
              <Settings2 className="size-3 text-muted-foreground/70 group-hover:text-foreground shrink-0 ml-0.5 hidden xs:inline" />
            </Link>
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
              title="Workspace Notes & Memory"
            >
              <StickyNote className="size-3.5 text-amber-400" />
              <span className="hidden xs:inline">Notes</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500/15 text-amber-400 font-semibold">
                {notes.length}
              </span>
            </button>

            {/* Command Center Right-Side Sheet Button */}
            <button
              type="button"
              onClick={() => setIsCommandCenterOpen(true)}
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg border border-primary/40 bg-primary/10 hover:bg-primary/20 text-xs font-semibold text-primary transition-all cursor-pointer shadow-xs active:scale-95"
              title="Open Command Center (Summary, Wishlist, Tasks & Persona)"
            >
              <Sparkles className="size-3.5" />
              <span className="hidden xs:inline">Command Center</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-primary text-primary-foreground font-mono font-bold">
                {scheduledTasks.length + drawerWishlistItems.length}
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
              <p className="text-xs max-w-sm text-muted-foreground mb-6">
                Assalam-o-Alaikum! Main aapka Super Admin Voice Agent hoon. Aap Roman Urdu ya
                English mein baat kar saktay hain.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleSuperAgentDispatch("Tamam projects ka status kya hai?")}
                  className="px-3 py-1.5 rounded-full border border-border/80 bg-muted/30 hover:bg-muted hover:border-border text-xs transition-colors cursor-pointer"
                >
                  📊 Projects Status
                </button>
                <button
                  type="button"
                  onClick={() => void handleSuperAgentDispatch("Mere notes parh kar sunao")}
                  className="px-3 py-1.5 rounded-full border border-border/80 bg-muted/30 hover:bg-muted hover:border-border text-xs transition-colors cursor-pointer"
                >
                  📝 Read Notes
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void handleSuperAgentDispatch("Kya kisi project mein koi error hai?")
                  }
                  className="px-3 py-1.5 rounded-full border border-border/80 bg-muted/30 hover:bg-muted hover:border-border text-xs transition-colors cursor-pointer"
                >
                  🔍 Scan Errors
                </button>
              </div>
            </div>
          )}

          {activeSession?.messages.map((msg) => {
            const isUser = msg.role === "user";
            return (
              <div
                key={msg.id}
                className={cn(
                  "flex items-start gap-3 text-sm",
                  isUser ? "flex-row-reverse" : "flex-row",
                )}
              >
                <div
                  className={cn(
                    "size-7 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold shadow-xs",
                    isUser
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted border border-border text-foreground",
                  )}
                >
                  {isUser ? "You" : <Bot className="size-3.5" />}
                </div>

                <div
                  className={cn(
                    "rounded-2xl px-4 py-2.5 max-w-[85%] sm:max-w-[75%] shadow-xs",
                    isUser
                      ? "bg-primary text-primary-foreground rounded-tr-xs"
                      : "bg-muted/70 border border-border/60 text-foreground rounded-tl-xs",
                  )}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>

                  {/* Delegated Task Execution Card */}
                  {msg.meta?.delegatedTask && (
                    <div className="mt-2.5 rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs space-y-2">
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
                    </div>
                  )}

                  {/* Wishlist / Feature Backlog Card with Auto-Approve Toggles */}
                  {msg.meta?.wishlistItems && msg.meta.wishlistItems.length > 0 && (
                    <WishlistCard
                      items={msg.meta.wishlistItems}
                      projectName={msg.meta.wishlistProject ?? "Workspace"}
                    />
                  )}

                  <span className="block text-[9px] opacity-60 mt-1 text-right">
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            );
          })}

          {isProcessing && (
            <div className="flex items-start gap-3 text-sm">
              <div className="size-7 rounded-full bg-muted border border-border text-foreground flex items-center justify-center shrink-0">
                <Bot className="size-3.5" />
              </div>
              <div className="rounded-2xl px-4 py-2.5 bg-muted/70 border border-border/60 text-muted-foreground rounded-tl-xs flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-primary animate-ping" />
                <span className="text-xs">
                  {agentStatus || "Super Assistant is thinking... / سوچ رہا ہوں"}
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Unified Bottom Area: Input Field on Top, with Attached Floating Waves Divider directly below */}
        <div className="w-full max-w-2xl sm:max-w-3xl mx-auto px-2 sm:px-4 pb-[max(env(safe-area-inset-bottom),0.95rem)] pt-1 shrink-0 bg-background/95 backdrop-blur-xs">
          {/* Barge-in / Stop Speaking Button (Displays when assistant is speaking) */}
          {callStatus === "speaking" && (
            <div className="flex justify-center mb-2 animate-in fade-in zoom-in-95 duration-200">
              <button
                type="button"
                onClick={handleStopSpeaking}
                className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-rose-500/25 border border-rose-500/60 text-rose-300 hover:bg-rose-500/35 hover:text-white text-xs font-semibold shadow-lg shadow-rose-950/40 backdrop-blur-md cursor-pointer transition-all active:scale-95 animate-pulse"
                title="Interrupt AI speaking immediately (AI کی بات فورا روکیں)"
              >
                <Square className="size-3 fill-rose-400 text-rose-400" />
                <span>Stop Speaking / روکیں</span>
              </button>
            </div>
          )}

          {/* Quick-Reply Suggested Action Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden py-1 mb-1.5 px-0.5">
            <span className="text-[10px] uppercase font-bold text-muted-foreground/70 shrink-0 select-none pl-1">
              Suggestions:
            </span>
            {quickSuggestions.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => void handleSuperAgentDispatch(item.prompt)}
                disabled={isProcessing}
                className="shrink-0 px-2.5 py-1 rounded-full border border-border/70 bg-muted/40 hover:bg-muted text-[11px] font-medium text-muted-foreground hover:text-foreground transition-all cursor-pointer disabled:opacity-40 shadow-2xs active:scale-95"
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* 1. Attached Input Field on Top (Subtle rounded card, completely isolated and clean on mobile) */}
          <div className="flex items-end justify-between gap-2 px-3 py-1.5 sm:px-3 sm:py-1 rounded-2xl bg-muted/25 border border-border/40 focus-within:border-zinc-700 focus-within:bg-muted/35 transition-all mb-1 sm:mb-0.5">
            <div className="flex-1 min-w-0">
              <textarea
                ref={inputRef}
                rows={1}
                value={inputText}
                onClick={handleInputFocusOrClick}
                onFocus={handleInputFocusOrClick}
                onBlur={() => {
                  if (!inputText.trim()) {
                    isUserEditingRef.current = false;
                    setIsUserEditing(false);
                  }
                }}
                onChange={(e) => {
                  isUserEditingRef.current = true;
                  setIsUserEditing(true);
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
                placeholder="Type a message or speak..."
                className="w-full bg-transparent border-0 outline-hidden focus:outline-hidden focus:ring-0 p-0 text-sm text-zinc-200 placeholder:text-zinc-500 resize-none max-h-[56px] min-h-[26px] leading-snug overflow-y-auto tracking-normal font-normal"
                aria-label="Message Input"
              />
            </div>

            {/* Gray Action Buttons: Sparkles/ArrowLeft (in-place toggle), and Send */}
            <div className="flex items-center gap-1 shrink-0 pb-0.5">
              {inputText.trim().length > 0 &&
                (previousTextForUndo !== null ? (
                  <button
                    type="button"
                    onClick={handleUndoTransliteration}
                    className="p-1 rounded text-zinc-400 hover:text-white transition-colors cursor-pointer"
                    title="Wapas original Urdu par layen (Undo)"
                  >
                    <ArrowLeft className="size-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleTransliterateToRoman}
                    disabled={isTransliterating}
                    className="p-1 rounded text-zinc-400 hover:text-amber-400 disabled:opacity-50 transition-colors cursor-pointer"
                    title="Urdu ko Roman Urdu mein convert karein"
                  >
                    {isTransliterating ? (
                      <Loader2 className="size-3.5 animate-spin text-amber-400" />
                    ) : (
                      <Sparkles className="size-3.5" />
                    )}
                  </button>
                ))}

              <button
                type="button"
                onClick={handleSendNow}
                disabled={!inputText.trim() || isProcessing}
                className="p-1 rounded text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                title="Send Message"
              >
                <Send className="size-3.5" />
              </button>
            </div>
          </div>

          {/* 2. Sleek Horizontal Divider Directly Below with End-to-End Controls & Floating Waves (10-15% scaled down on mobile) */}
          <div className="relative flex items-center justify-between w-full min-h-[34px] sm:min-h-[46px]">
            {/* Left End: AI Model Dropdown (At the very left end; NO line sticks out past it) */}
            <div className="relative z-10 shrink-0 pr-1 max-w-[100px] xs:max-w-[125px] sm:max-w-none">
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
            </div>

            {/* Left Line Segment (starts at model picker right edge, stops at center wave) */}
            <div className="flex-1 h-[1px] bg-zinc-800/80 self-center" />

            {/* Middle / Center: Call Button with Grok Geometric Soundwaves / Circular Wave (Floating in center) */}
            <div className="relative z-10 flex items-center justify-center shrink-0 mx-1 sm:mx-2">
              <div
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (isCallActive) {
                    if (callStatus === "speaking" || callStatus === "thinking") {
                      interruptSpeaking();
                    }
                    endCall();
                  } else {
                    toggleCall();
                  }
                }}
                className={cn(
                  "relative z-10 flex items-center justify-center size-7 sm:size-9 rounded-full transition-all duration-300 cursor-pointer select-none",
                  "bg-transparent border-0 shadow-none",
                )}
              >
                {/* When Call Active: Grok Geometric Soundwave
                    When Call Inactive/Ended: Original circular wave in grey color */}
                {isCallActive ? (
                  <GrokGeometricVoiceWaves callStatus={callStatus} analyserNode={analyserNode} />
                ) : (
                  <CircularVoiceWaves callStatus="idle" analyserNode={null} />
                )}

                {/* Centered Phone Icon: Soft red (halka red) when active call, subtle grey when idle/ended */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (isCallActive) {
                      if (callStatus === "speaking" || callStatus === "thinking") {
                        interruptSpeaking();
                      }
                      endCall();
                    } else {
                      toggleCall();
                    }
                  }}
                  className={cn(
                    "relative z-20 flex size-4.5 sm:size-6 items-center justify-center rounded-full transition-all duration-200 cursor-pointer active:scale-90 bg-transparent border-0 shadow-none outline-none focus:outline-none",
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
                  {isCallActive ? (
                    <PhoneOff className="size-3 sm:size-4" strokeWidth={2.4} />
                  ) : (
                    <PhoneCall className="size-3 sm:size-4" strokeWidth={2.2} />
                  )}
                </button>
              </div>
            </div>

            {/* Right Line Segment (starts at center wave, stops at mic button left edge) */}
            <div className="flex-1 h-[1px] bg-zinc-800/80 self-center" />

            {/* Right End: When Call Active -> Mic Mute/Unmute; When Idle -> Pakistan & USA Language Flags */}
            <div className="relative z-10 shrink-0 pl-1 flex items-center">
              {isCallActive ? (
                <button
                  type="button"
                  onClick={toggleMicMute}
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
