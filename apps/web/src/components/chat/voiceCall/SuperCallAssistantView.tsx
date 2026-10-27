import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Trash2,
  FolderGit2,
  Send,
  Sparkles,
  Bot,
  X,
  RotateCcw,
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
} from "lucide-react";
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
import { loadSttSettings, subscribeSttSettings, type SttSettings } from "~/lib/speech/stt";
import { transliterateUrduToRoman } from "~/lib/speech/romanUrduTransliterate";
import { executeSuperAgentInstruction, isUrduLanguage } from "./superAgentEngine";

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
  const [isTasksSheetOpen, setIsTasksSheetOpen] = useState(false);

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
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.messages, isProcessing]);

  const handleSuperAgentDispatch = useCallback(
    async (rawUserText: string) => {
      const userText = rawUserText.trim();
      if (!userText || isProcessing) return;

      setInputText("");
      setPreviousTextForUndo(null);
      isUserEditingRef.current = false;
      setIsUserEditing(false);

      handleAddMessage("user", userText);
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
          userText,
          projects,
          activeProjectId: activeProjId,
          selectedModel: effectiveModel,
          selectedInstanceId: String(effectiveInstanceId),
          conversationHistory: (activeSession?.messages || []).map((m) => ({
            role: m.role === "user" ? ("user" as const) : ("assistant" as const),
            text: m.text,
          })),
          providerConfig: matchingCustomProvider
            ? {
                baseUrl: matchingCustomProvider.baseUrl,
                apiKey: matchingCustomProvider.apiKey,
                headers: matchingCustomProvider.headers,
                format: matchingCustomProvider.format,
              }
            : undefined,
          onStatusUpdate: (status) => {
            setAgentStatus(status);
          },
        });

        const meta = res.delegatedTask
          ? { delegatedTask: res.delegatedTask, actionType: res.actionTaken }
          : undefined;

        handleAddMessage("assistant", res.reply, meta);
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

  return (
    <div className="flex h-full w-full bg-background text-foreground overflow-hidden relative">
      {/* Right-Side Scheduled Tasks Sheet / Drawer */}
      {isTasksSheetOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setIsTasksSheetOpen(false)}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md h-full bg-background border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
          >
            {/* Sheet Header */}
            <div className="h-14 px-5 border-b border-border/60 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <ListTodo className="size-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">Super Bot Tasks & Ledger</h2>
                  <p className="text-[11px] text-muted-foreground">
                    {scheduledTasks.length} scheduled · {activities.length} history records
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTasksSheetOpen(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                title="Close Sheet"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Sheet Navigation Tabs */}
            <div className="flex border-b border-border/50 px-4 pt-1 gap-2 bg-muted/20">
              <button
                type="button"
                onClick={() => setTasksSheetTab("scheduled")}
                className={cn(
                  "pb-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer",
                  tasksSheetTab === "scheduled"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                Scheduled Shifts ({scheduledTasks.length})
              </button>
              <button
                type="button"
                onClick={() => setTasksSheetTab("history")}
                className={cn(
                  "pb-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer",
                  tasksSheetTab === "history"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                Execution Log ({activities.length})
              </button>
            </div>

            {/* Tasks / History List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {tasksSheetTab === "scheduled" ? (
                scheduledTasks.length === 0 ? (
                  <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
                    <div className="size-12 rounded-xl bg-muted/60 flex items-center justify-center mb-3">
                      <ListTodo className="size-6 text-muted-foreground/60" />
                    </div>
                    <h3 className="text-sm font-medium text-foreground mb-1">
                      No tasks scheduled yet
                    </h3>
                    <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
                      Aap Super Assistant se bol saktay hain: &quot;Raat 2:00 baje chalne lag
                      jaye&quot;. Woh khud schedule karega aur waqt par execute karega.
                    </p>
                  </div>
                ) : (
                  scheduledTasks.map((t) => (
                    <div
                      key={t.id}
                      className="p-4 rounded-xl border border-border/70 bg-card/60 hover:bg-card transition-colors space-y-2.5"
                    >
                      {/* Top Row: Title & Actions */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-semibold text-foreground truncate">
                            {t.title}
                          </h4>
                          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
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
                            title={t.enabled ? "Click to Pause" : "Click to Enable"}
                          >
                            {t.enabled ? "Active" : "Paused"}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeTask(t.id)}
                            className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                            title="Delete Task"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Instruction / Prompt */}
                      <div className="p-2.5 rounded-lg bg-muted/40 text-[11px] text-zinc-300 leading-relaxed font-mono whitespace-pre-wrap break-words">
                        {t.prompt}
                      </div>

                      {/* Timing & Next Run */}
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/40">
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" />
                          <span>
                            {t.scheduleType === "fixed_time" && t.timeOfDay
                              ? `Daily at ${t.timeOfDay}`
                              : t.intervalMinutes
                                ? `Every ${t.intervalMinutes}m`
                                : "Scheduled"}
                          </span>
                        </span>
                        {t.nextRunAt && (
                          <span>
                            Next:{" "}
                            {new Date(t.nextRunAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )
              ) : /* History / Activity Ledger Tab */
              activities.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
                  <div className="size-12 rounded-xl bg-muted/60 flex items-center justify-center mb-3">
                    <ListTodo className="size-6 text-muted-foreground/60" />
                  </div>
                  <h3 className="text-sm font-medium text-foreground mb-1">
                    No project execution history yet
                  </h3>
                  <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
                    Jab Super Bot kisi project mein task dispatch karega ya error fix karega, yahan
                    date, time aur task description ke sath full ledger record hoga.
                  </p>
                </div>
              ) : (
                activities.map((act) => (
                  <div
                    key={act.id}
                    className="p-4 rounded-xl border border-border/70 bg-card/60 hover:bg-card transition-colors space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "size-2 rounded-full shrink-0",
                              act.status === "completed"
                                ? "bg-emerald-400"
                                : act.status === "running"
                                  ? "bg-amber-400 animate-pulse"
                                  : "bg-blue-400",
                            )}
                          />
                          <h4 className="text-xs font-semibold text-foreground truncate">
                            {act.taskTitle}
                          </h4>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
                          <FolderGit2 className="size-3 text-primary shrink-0" />
                          <span className="font-medium text-primary truncate">
                            {act.projectName}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold shrink-0">
                        {act.status}
                      </span>
                    </div>

                    {/* Full Task Description */}
                    <div className="p-2.5 rounded-lg bg-muted/30 text-[11px] text-zinc-300 leading-relaxed font-mono whitespace-pre-wrap break-words">
                      {act.description}
                    </div>

                    {/* Timestamp & Result Summary */}
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/40">
                      <span>
                        {new Date(act.createdAt).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {act.resultSummary && (
                        <span className="text-emerald-400 truncate max-w-[200px]">
                          ✓ {act.resultSummary}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Main Conversation Stream */}
      <div className="flex-1 flex flex-col h-full min-w-0 relative">
        {/* Top Header */}
        <header className="h-14 border-b border-border/50 px-4 sm:px-6 flex items-center justify-between shrink-0 bg-background/80 backdrop-blur-md">
          {/* Left: Active STT & TTS Settings indicator with direct link to Settings */}
          <div className="flex items-center gap-2 min-w-0">
            <Link
              to="/settings/stt-tts"
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border/60 hover:border-primary/50 bg-muted/30 hover:bg-muted/60 text-xs text-muted-foreground hover:text-foreground transition-all cursor-pointer group shadow-2xs max-w-xs sm:max-w-md truncate"
              title="Click to customize STT & TTS Voice, Speed, Pitch & Accent Settings"
            >
              <div className="flex items-center gap-1.5 text-primary shrink-0">
                <Volume2 className="size-3.5 group-hover:scale-110 transition-transform" />
                <span className="font-semibold text-foreground">Voice & Speech:</span>
              </div>
              <span className="truncate font-mono text-[11px] text-zinc-300">
                {activeVoiceLabel} ({ttsSettings.rate.toFixed(2)}x) · STT: {sttSettings.language}
              </span>
              <Settings2 className="size-3 text-muted-foreground/70 group-hover:text-foreground shrink-0 ml-0.5" />
            </Link>
          </div>

          {/* Right: Notes & Tasks */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => openNotesSheet()}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border/70 hover:border-border hover:bg-muted/50 text-xs font-medium transition-colors cursor-pointer"
              title="Workspace Notes & Memory"
            >
              <StickyNote className="size-3.5 text-amber-400" />
              <span>Notes</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500/15 text-amber-400 font-semibold">
                {notes.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setIsTasksSheetOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/70 hover:border-border hover:bg-muted/50 text-xs font-medium transition-colors cursor-pointer"
              title="Click to view scheduled tasks"
            >
              <ListTodo className="size-3.5 text-primary" />
              <span>Tasks</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-primary/15 text-primary font-semibold">
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

        {/* Unified Bottom Area: Live Transcribed Text directly above Divider Line with Centered Model Badge */}
        <div className="w-full max-w-xl mx-auto px-4 pb-5 pt-1 shrink-0 space-y-2">
          {/* 1. Live Transcribed Text (Gray color, NO box, NO border, NO outline, looks like floating plain text) */}
          <div className="flex items-center justify-between gap-2 py-1 min-h-[34px]">
            {/* Pure text input - borderless, outline-none, transparent */}
            <div className="flex-1 min-w-0">
              <input
                ref={inputRef}
                type="text"
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
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendNow();
                  }
                }}
                placeholder=""
                className="w-full bg-transparent border-0 outline-hidden focus:outline-hidden focus:ring-0 p-0 text-sm text-zinc-400 placeholder:text-transparent tracking-wide font-normal leading-relaxed"
                aria-label="Live Transcribed Text"
              />
            </div>

            {/* Gray Action Buttons: Undo, Sparkles (Urdu -> Roman Urdu), and Send */}
            <div className="flex items-center gap-1 shrink-0">
              {/* Back / Undo Arrow: Appears ONLY after clicking Spark to restore original Urdu words */}
              {previousTextForUndo !== null && (
                <button
                  type="button"
                  onClick={handleUndoTransliteration}
                  className="p-1 rounded text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  title="Wapas original Urdu par layen (Undo)"
                >
                  <RotateCcw className="size-4" />
                </button>
              )}

              {/* Spark Icon Button: Urdu -> Roman Urdu with Loader */}
              {inputText.trim().length > 0 && (
                <button
                  type="button"
                  onClick={handleTransliterateToRoman}
                  disabled={isTransliterating}
                  className="p-1 rounded text-zinc-400 hover:text-amber-400 disabled:opacity-50 transition-colors cursor-pointer"
                  title="Urdu ko Roman Urdu mein convert karein"
                >
                  {isTransliterating ? (
                    <Loader2 className="size-4 animate-spin text-amber-400" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                </button>
              )}

              {/* Send Button in gray color */}
              <button
                type="button"
                onClick={handleSendNow}
                disabled={!inputText.trim() || isProcessing}
                className="p-1 rounded text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                title="Send Message"
              >
                <Send className="size-4" />
              </button>
            </div>
          </div>

          {/* 2. Sleek Horizontal Divider with Left-Aligned Model Badge & Centered Wave Call Button */}
          <div className="relative flex items-center justify-between my-1.5 min-h-[44px]">
            {/* The horizontal line spanning across */}
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] bg-zinc-800" />

            {/* Left: AI Model Dropdown Badge (Half above, half below line) */}
            <div className="relative z-10 flex items-center bg-background pr-2">
              <ProviderModelPicker
                activeInstanceId={effectiveInstanceId}
                model={effectiveModel}
                lockedProvider={null}
                instanceEntries={instanceEntries}
                modelOptionsByInstance={modelOptionsByInstance}
                keybindings={keybindings}
                size="xs"
                triggerClassName="h-6 rounded-full border border-zinc-800 bg-background px-2.5 text-[11px] font-medium text-zinc-400 hover:text-white hover:border-zinc-600 shadow-xs cursor-pointer select-none max-w-none"
                onInstanceModelChange={handleModelChange}
              />
            </div>

            {/* Middle / Center: Call Button with Grok Geometric Soundwaves / Circular Wave (Centered on divider) */}
            <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center">
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
                  "relative z-10 flex items-center justify-center size-7.5 rounded-full transition-all duration-300 cursor-pointer select-none",
                  "bg-zinc-950/95 border border-zinc-800/90 backdrop-blur-xl shadow-md",
                )}
              >
                {/* When Call Active: Compact Grok Geometric Soundwave
                    When Call Inactive/Ended: Existing original circular wave in grey color */}
                {isCallActive ? (
                  <GrokGeometricVoiceWaves callStatus={callStatus} analyserNode={analyserNode} />
                ) : (
                  <CircularVoiceWaves
                    callStatus="idle"
                    analyserNode={null}
                    className="size-[42px] -inset-[6px]"
                  />
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
                    "relative z-20 flex size-4 items-center justify-center rounded-full transition-all duration-200 cursor-pointer active:scale-90 bg-transparent border-0 shadow-none outline-none focus:outline-none",
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
                    <PhoneOff className="size-3.5" strokeWidth={2.2} />
                  ) : (
                    <PhoneCall className="size-3.5" strokeWidth={2.2} />
                  )}
                </button>
              </div>
            </div>

            {/* Right: Mic Mute / Unmute Button (Placed neatly on right, leaves center soundwave completely clear) */}
            <div className="relative z-10 flex items-center justify-end bg-background pl-2 min-w-[28px]">
              {isCallActive ? (
                <button
                  type="button"
                  onClick={toggleMicMute}
                  className={cn(
                    "size-7 rounded-full border flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95",
                    isMicMuted
                      ? "bg-amber-500/20 border-amber-500/50 text-amber-400"
                      : "bg-zinc-900 border-zinc-700/80 text-zinc-300 hover:text-white hover:bg-zinc-800",
                  )}
                  title={isMicMuted ? "Unmute Microphone" : "Mute Microphone"}
                >
                  {isMicMuted ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
                </button>
              ) : (
                <div className="size-7 opacity-0 pointer-events-none" />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
