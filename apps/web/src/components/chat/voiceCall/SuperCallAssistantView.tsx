import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Plus,
  Trash2,
  FolderGit2,
  FileCheck2,
  Send,
  Sparkles,
  Bot,
  History,
  X,
  ChevronDown,
  Check,
  Cpu,
  RotateCcw,
  Loader2,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { useProjects } from "~/state/entities";
import { useNotes, addNote, type NoteItem } from "~/lib/notesStore";
import { useScheduledTasks } from "~/lib/scheduledTasksStore";
import {
  useCallSessions,
  type CallAssistantMessage,
  type CallAssistantSession,
} from "~/lib/callAssistantStore";
import { buildSuperAgentSystemPrompt } from "./superAgentPrompt";
import { VoiceCallFloatingWidget } from "./VoiceCallFloatingWidget";
import { useVoiceCallAssistant } from "./useVoiceCallAssistant";
import { speakText, stopSpeaking } from "~/lib/speech/tts";
import { transliterateUrduToRoman } from "~/lib/speech/romanUrduTransliterate";
import { executeSuperAgentInstruction, isUrduLanguage } from "./superAgentEngine";

const AVAILABLE_MODELS = [
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "Google", recommended: true },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "Google" },
  { id: "deepseek-v3", name: "DeepSeek V3", provider: "DeepSeek" },
  { id: "deepseek-r1", name: "DeepSeek R1", provider: "DeepSeek" },
  { id: "glm-4.5-flash", name: "GLM 4.5 Flash", provider: "Zhipu AI" },
  { id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet", provider: "Anthropic" },
  { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "OpenAI" },
];

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

  const { tasks: scheduledTasks } = useScheduledTasks();
  const [inputText, setInputText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  const [isSessionsDrawerOpen, setIsSessionsDrawerOpen] = useState(false);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [customModelInput, setCustomModelInput] = useState("");
  const [selectedModel, setSelectedModel] = useState(() => {
    return localStorage.getItem("super_call_assistant_model") || "Gemini 2.5 Flash";
  });

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

  const handleModelChange = useCallback((modelName: string) => {
    setSelectedModel(modelName);
    localStorage.setItem("super_call_assistant_model", modelName);
    setIsModelMenuOpen(false);
  }, []);

  const handleCustomModelSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (customModelInput.trim()) {
        handleModelChange(customModelInput.trim());
        setCustomModelInput("");
      }
    },
    [customModelInput, handleModelChange],
  );

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
        const res = await executeSuperAgentInstruction({
          userText,
          projects,
          activeProjectId: activeProjId,
          selectedModel,
          onStatusUpdate: (status) => {
            setAgentStatus(status);
          },
        });

        handleAddMessage("assistant", res.reply);
        speakText(res.spokenReply);
      } catch (err) {
        console.error("Super agent error:", err);
        const errorMsg = isUrduLanguage(userText)
          ? "Sorry, request process karte waqt network ya server error aya. Main dobara check karta hoon."
          : "Sorry, a momentary network or server error occurred. Let me re-check.";
        handleAddMessage("assistant", errorMsg);
        speakText(errorMsg);
      } finally {
        setIsProcessing(false);
        setAgentStatus(null);
      }
    },
    [handleAddMessage, isProcessing, projects, selectedModel],
  );

  // Live Speech transcript update
  const handleTranscriptChange = useCallback((text: string) => {
    // If user is actively typing / modifying, do not overwrite with ongoing speech
    if (isUserEditingRef.current) return;
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
    onAutoSend: () => {
      // If user clicked or focused to edit manually, DO NOT auto-send!
      if (isUserEditingRef.current) return;
      if (inputText.trim()) {
        void handleSuperAgentDispatch(inputText);
      }
    },
    prompt: inputText,
    phase: isProcessing ? "running" : "ready",
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

  // Determine text color for live transcript:
  // - Gray when actively speaking
  // - Crisp white when paused & preparing to auto-send
  // - White when user is editing
  const transcriptTextColorClass = useMemo(() => {
    if (isUserEditing) return "text-white font-normal";
    if (callStatus === "user-speaking") return "text-zinc-400";
    if (inputText.trim().length > 0) return "text-white font-medium";
    return "text-zinc-500";
  }, [callStatus, inputText, isUserEditing]);

  return (
    <div className="flex h-full w-full bg-background text-foreground overflow-hidden relative">
      {/* Sessions Slide-over Drawer / Panel */}
      {isSessionsDrawerOpen && (
        <aside className="absolute inset-y-0 left-0 z-30 w-72 border-r border-border/80 bg-background/95 backdrop-blur-xl shadow-2xl flex flex-col animate-in slide-in-from-left duration-200">
          <div className="p-3.5 border-b border-border/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="size-4 text-primary" />
              <h2 className="text-sm font-semibold tracking-tight">Call Sessions</h2>
            </div>
            <button
              type="button"
              onClick={() => setIsSessionsDrawerOpen(false)}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="p-3 border-b border-border/40 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                handleNewSession();
                setIsSessionsDrawerOpen(false);
              }}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium transition-colors cursor-pointer shadow-xs"
            >
              <Plus className="size-3.5" />
              <span>New Call</span>
            </button>
            {sessions.length > 0 && (
              <button
                type="button"
                onClick={handleClearHistory}
                className="p-1.5 rounded-lg border border-border/60 text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors cursor-pointer"
                title="Clear All Calls History"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {sessions.map((s) => {
              const isActive = s.id === activeSessionId;
              return (
                <div
                  key={s.id}
                  onClick={() => {
                    setActiveSessionId(s.id);
                    setIsSessionsDrawerOpen(false);
                  }}
                  className={cn(
                    "group flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary font-medium border border-primary/20"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <p className="truncate">{s.title}</p>
                    <span className="text-[10px] opacity-60">
                      {new Date(s.createdAt).toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteSession(s.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-destructive transition-opacity cursor-pointer"
                    title="Delete call"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </aside>
      )}

      {/* Model Selection Modal */}
      {isModelMenuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => setIsModelMenuOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950/95 backdrop-blur-2xl p-5 shadow-2xl animate-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Cpu className="size-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-white">Select AI Model</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModelMenuOpen(false)}
                className="p-1 rounded-md text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="py-3 space-y-1.5 max-h-72 overflow-y-auto">
              {AVAILABLE_MODELS.map((m) => {
                const isSelected = selectedModel.toLowerCase().includes(m.name.toLowerCase());
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleModelChange(m.name)}
                    className={cn(
                      "w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs transition-all text-left cursor-pointer",
                      isSelected
                        ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium"
                        : "hover:bg-zinc-800/60 text-zinc-300 border border-transparent",
                    )}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span>{m.name}</span>
                        {m.recommended && (
                          <span className="px-1.5 py-0.5 rounded-md text-[9px] bg-amber-500/20 text-amber-400 font-medium">
                            Fast
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-500">{m.provider}</span>
                    </div>
                    {isSelected && <Check className="size-3.5 text-amber-400" />}
                  </button>
                );
              })}
            </div>

            {/* Custom Model Input */}
            <form
              onSubmit={handleCustomModelSubmit}
              className="pt-3 border-t border-zinc-800 flex gap-2"
            >
              <input
                type="text"
                value={customModelInput}
                onChange={(e) => setCustomModelInput(e.target.value)}
                placeholder="Or type custom model..."
                className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-white placeholder:text-zinc-500 focus:outline-hidden focus:border-amber-400"
              />
              <button
                type="submit"
                disabled={!customModelInput.trim()}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-white disabled:opacity-50 transition-colors cursor-pointer"
              >
                Set
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Main Conversation Stream */}
      <div className="flex-1 flex flex-col h-full min-w-0 relative">
        {/* Top Header */}
        <header className="h-14 border-b border-border/50 px-4 sm:px-6 flex items-center justify-between shrink-0 bg-background/80 backdrop-blur-md">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setIsSessionsDrawerOpen((prev) => !prev)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border/60 hover:border-border hover:bg-muted/50 text-xs font-medium transition-colors cursor-pointer"
              title="Toggle Call Sessions Drawer"
            >
              <History className="size-3.5 text-muted-foreground" />
              <span>Sessions ({sessions.length})</span>
            </button>

            <div className="flex items-center gap-2 min-w-0">
              <div className="size-7 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <Bot className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h1 className="text-sm font-semibold truncate leading-tight">
                    Super Call Assistant
                  </h1>
                  <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-primary/15 text-primary font-medium">
                    Super Admin
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground truncate hidden sm:block">
                  Workspace Overseer & Voice Intelligence
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-3 text-xs text-muted-foreground mr-2 hidden md:flex">
              <span className="flex items-center gap-1">
                <FolderGit2 className="size-3.5 text-primary" />
                <span>{projects.length} Projects</span>
              </span>
              <span className="flex items-center gap-1">
                <FileCheck2 className="size-3.5 text-amber-500" />
                <span>{notes.length} Notes</span>
              </span>
            </div>

            <button
              type="button"
              onClick={handleNewSession}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium transition-colors cursor-pointer shadow-xs"
            >
              <Plus className="size-3.5" />
              <span className="hidden sm:inline">New Call</span>
            </button>
          </div>
        </header>

        {/* Message Bubble History */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-3xl w-full mx-auto">
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

        {/* Seamless Borderless Input / Live Speech Transcription Line (NO box border, NO outline) */}
        <div className="w-full max-w-2xl mx-auto px-4 pb-1 pt-2 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendNow();
            }}
            className="flex items-center justify-between gap-3"
          >
            {/* The Borderless Text Input */}
            <div className="flex-1 relative flex items-center">
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onClick={handleInputFocusOrClick}
                onFocus={handleInputFocusOrClick}
                onChange={(e) => {
                  isUserEditingRef.current = true;
                  setIsUserEditing(true);
                  setInputText(e.target.value);
                }}
                placeholder={
                  isCallActive
                    ? "Boleyn ya likhein (Auto-sends in 1.5s)..."
                    : "Type a message or start call..."
                }
                className={cn(
                  "w-full bg-transparent border-0 outline-hidden focus:outline-hidden focus:ring-0 shadow-none text-sm transition-colors tracking-wide",
                  transcriptTextColorClass,
                )}
              />
            </div>

            {/* Action Buttons: Undo, Sparkles (Urdu -> Roman Urdu), and Send */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Back / Undo Arrow (Appears after transliterating) */}
              {previousTextForUndo !== null && (
                <button
                  type="button"
                  onClick={handleUndoTransliteration}
                  className="p-1 rounded text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  title="Undo / Wapas original Urdu script par layen"
                >
                  <RotateCcw className="size-4" />
                </button>
              )}

              {/* Sparkles Button: Converts Urdu Script to Roman Urdu */}
              {inputText.trim().length > 0 && (
                <button
                  type="button"
                  onClick={handleTransliterateToRoman}
                  disabled={isTransliterating}
                  className="p-1 rounded text-zinc-400 hover:text-amber-400 transition-colors cursor-pointer"
                  title="Roman Urdu mein convert karein (Easy to edit)"
                >
                  {isTransliterating ? (
                    <Loader2 className="size-4 animate-spin text-amber-400" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                </button>
              )}

              {/* Gray Borderless Send Button */}
              <button
                type="submit"
                disabled={!inputText.trim() || isProcessing}
                className="p-1 rounded text-zinc-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                title="Send Message"
              >
                <Send className="size-4" />
              </button>
            </div>
          </form>
        </div>

        {/* Bottom Horizontal Line with Centered Model Selection Badge */}
        <div className="relative w-full max-w-2xl mx-auto flex items-center justify-center pb-5 pt-1.5 px-4 shrink-0">
          {/* Shorter, sleek horizontal grey divider line */}
          <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-[1px] bg-zinc-700/60" />

          {/* Centered Model Dropdown Badge (Half above line, half below line) */}
          <div className="relative z-10 px-3 bg-background">
            <button
              type="button"
              onClick={() => setIsModelMenuOpen(true)}
              className="flex items-center gap-1.5 px-3 py-0.5 rounded-full border border-zinc-700/80 bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs font-medium transition-all shadow-xs cursor-pointer select-none"
              title="Click to select AI Model & Provider"
            >
              <Sparkles className="size-3 text-amber-400" />
              <span>{selectedModel}</span>
              <ChevronDown className="size-3 text-zinc-400" />
            </button>
          </div>
        </div>

        {/* Floating Action Button (FAB) on the bottom right */}
        <VoiceCallFloatingWidget
          isCallActive={isCallActive}
          callStatus={callStatus}
          analyserNode={analyserNode}
          onToggleCall={toggleCall}
          onInterrupt={interruptSpeaking}
          callLanguage={callLanguage}
          onSwitchLanguage={setCallLanguage}
          liveTranscript={liveTranscript}
          assistantSpokenText={assistantSpokenText}
          isMicMuted={isMicMuted}
          onToggleMicMute={toggleMicMute}
        />
      </div>
    </div>
  );
}
