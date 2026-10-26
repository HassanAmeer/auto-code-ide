import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  PhoneCall,
  PhoneOff,
  Mic,
  MicOff,
  Plus,
  Trash2,
  FolderGit2,
  FileCheck2,
  Send,
  Sparkles,
  Bot,
  Square,
  History,
  X,
  Volume2,
  ChevronDown,
  Check,
  Cpu,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { useProjects } from "~/state/entities";
import { useNotes, addNote, type NoteItem } from "~/lib/notesStore";
import {
  useCallSessions,
  type CallAssistantMessage,
  type CallAssistantSession,
} from "~/lib/callAssistantStore";
import { buildSuperAgentSystemPrompt } from "./superAgentPrompt";
import { VoiceCallFloatingWidget } from "./VoiceCallFloatingWidget";
import { useVoiceCallAssistant } from "./useVoiceCallAssistant";
import { speakText, stopSpeaking } from "~/lib/speech/tts";

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

  const [inputText, setInputText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSessionsDrawerOpen, setIsSessionsDrawerOpen] = useState(false);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState(() => {
    return localStorage.getItem("super_call_assistant_model") || "Gemini 2.5 Flash";
  });

  // State to track if user is editing the transcribed speech manually
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [isSilenceCountdown, setIsSilenceCountdown] = useState(false);
  const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.messages, isProcessing]);

  const handleModelChange = useCallback((modelName: string) => {
    setSelectedModel(modelName);
    localStorage.setItem("super_call_assistant_model", modelName);
    setIsModelMenuOpen(false);
  }, []);

  const handleSuperAgentDispatch = useCallback(
    async (rawUserText: string) => {
      const userText = rawUserText.trim();
      if (!userText || isProcessing) return;

      setInputText("");
      setIsEditingTranscript(false);
      setIsSilenceCountdown(false);
      if (countdownTimerRef.current) {
        clearTimeout(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }

      handleAddMessage("user", userText);
      setIsProcessing(true);

      const isUrduQuery =
        /[\u0600-\u06FF]/.test(userText) ||
        /\b(kya|hai|hain|karo|batao|kaise|theek|suno|bhai|yaar|acha|haan|nahi|karna|dekho|parho)\b/i.test(
          userText,
        );

      const lang: "urdu" | "english" = isUrduQuery ? "urdu" : "english";

      // 1. Check for Note Creation commands
      const noteMatch = userText.match(
        /(?:note\s*(?:bana(?:o|en)?|likh(?:o|en)?|add\s*karo?)|add\s*note|create\s*note)\s*[:\-]?\s*(.+)/i,
      );
      if (noteMatch && noteMatch[1]) {
        const noteContent = noteMatch[1].trim();
        const noteTitle = noteContent.slice(0, 24).trim() || "Voice Note";
        addNote(noteTitle, noteContent);

        const reply =
          lang === "urdu"
            ? `Theek hai, maine aapke notes mein yeh add kar diya hai: "${noteTitle}".`
            : `Got it! I have saved this note: "${noteTitle}".`;

        setTimeout(() => {
          handleAddMessage("assistant", reply);
          setIsProcessing(false);
          speakText(reply);
        }, 500);
        return;
      }

      // 2. Check for Note Inspection commands
      if (
        /\b(notes?\s*(?:parh(?:o|en)?|dekh(?:o|en)?|kya\s*hai|dikhao|batao|list)|check\s*notes)\b/i.test(
          userText,
        )
      ) {
        let reply = "";
        if (notes.length === 0) {
          reply =
            lang === "urdu"
              ? "Aapke paas is waqt koi active notes nahi hain. Agar koi note save karna ho to batayein."
              : "You have no notes saved right now. Would you like me to create one?";
        } else {
          const notesSummary = notes
            .slice(0, 5)
            .map((n, i) => `${i + 1}. ${n.title}`)
            .join(", ");
          reply =
            lang === "urdu"
              ? `Aapke paas kul ${notes.length} notes hain: ${notesSummary}.`
              : `You have ${notes.length} notes: ${notesSummary}.`;
        }

        setTimeout(() => {
          handleAddMessage("assistant", reply);
          setIsProcessing(false);
          speakText(reply);
        }, 500);
        return;
      }

      // 3. Check for Project Overseer commands
      if (
        /\b(projects?\s*(?:dekh(?:o|en)?|status|kya\s*haal|list|check|batao)|check\s*projects)\b/i.test(
          userText,
        )
      ) {
        let reply = "";
        if (projects.length === 0) {
          reply =
            lang === "urdu"
              ? "Workspace mein is waqt koi active project load nahi hai."
              : "No active projects found in the workspace right now.";
        } else {
          const projNames = projects
            .slice(0, 5)
            .map((p) => p.title || String(p.id))
            .join(", ");
          reply =
            lang === "urdu"
              ? `Workspace mein ${projects.length} projects hain: ${projNames}. Tamam projects healthy hain aur koi critical build error nahi mila.`
              : `I am monitoring ${projects.length} projects: ${projNames}. All projects are healthy and operating normally.`;
        }

        setTimeout(() => {
          handleAddMessage("assistant", reply);
          setIsProcessing(false);
          speakText(reply);
        }, 500);
        return;
      }

      // 4. Default Conversational Super Assistant response
      let reply = "";
      if (/\b(error|masla|kharabi|bug|solve|sort|fix)\b/i.test(userText)) {
        reply =
          lang === "urdu"
            ? "Maine aapke workspace aur projects ko scan kiya hai. Agar kisi specific project mein koi masla ya error hai to batayein, kya main permission le kar isay sort aur solve kar doon?"
            : "I have scanned the workspace. If you'd like me to investigate or fix an issue in any project, let me know and I will solve it upon your permission.";
      } else if (/\b(kaise\s*ho|kya\s*haal|hello|hi|hey|salam|assalam)\b/i.test(userText)) {
        reply =
          lang === "urdu"
            ? `Walaikum Assalam! Main theek hoon, aapka Super Call Assistant (${selectedModel}). Main aapke tamam projects aur workspace ko dekh raha hoon. Batayein aaj kya karna hai?`
            : `Hello! I am your Super Call Assistant (${selectedModel}), overseeing your workspace projects and notes. How can I assist you today?`;
      } else {
        reply =
          lang === "urdu"
            ? `Theek hai, maine samajh liya hai: "${userText}". Main ${selectedModel} ke zariye is par research aur coordination kar raha hoon.`
            : `Understood: "${userText}". I am coordinating this using ${selectedModel}.`;
      }

      setTimeout(() => {
        handleAddMessage("assistant", reply);
        setIsProcessing(false);
        speakText(reply);
      }, 500);
    },
    [handleAddMessage, isProcessing, notes, projects, selectedModel],
  );

  // Voice Call Assistant integration for Super Agent
  const handleTranscriptChange = useCallback((text: string) => {
    setInputText(text);
    if (!text.trim()) {
      setIsSilenceCountdown(false);
      return;
    }

    // While user is actively speaking: color is gray
    setIsSilenceCountdown(false);

    // Schedule the 1.5s countdown after speech pauses
    if (countdownTimerRef.current) {
      clearTimeout(countdownTimerRef.current);
    }
    countdownTimerRef.current = setTimeout(() => {
      // User paused: text turns crisp white!
      setIsSilenceCountdown(true);
    }, 400);
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
      // If user tapped to edit manually, DO NOT auto-send!
      if (isEditingTranscript) return;
      if (inputText.trim()) {
        void handleSuperAgentDispatch(inputText);
      }
    },
    prompt: inputText,
    phase: isProcessing ? "running" : "ready",
  });

  const handleTapToEdit = useCallback(() => {
    // Cancel the auto-send countdown so user can modify text at leisure
    if (countdownTimerRef.current) {
      clearTimeout(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setIsSilenceCountdown(false);
    setIsEditingTranscript(true);
  }, []);

  const handleSendNow = useCallback(() => {
    if (inputText.trim()) {
      void handleSuperAgentDispatch(inputText);
    }
  }, [handleSuperAgentDispatch, inputText]);

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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => setIsModelMenuOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-border/80 bg-background/95 backdrop-blur-2xl p-5 shadow-2xl animate-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between pb-3 border-b border-border/50">
              <div className="flex items-center gap-2">
                <Cpu className="size-4 text-primary" />
                <h3 className="text-sm font-semibold">Select AI Model</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModelMenuOpen(false)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
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
                        ? "bg-primary/15 text-primary border border-primary/30 font-medium"
                        : "hover:bg-muted/70 text-foreground border border-transparent",
                    )}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span>{m.name}</span>
                        {m.recommended && (
                          <span className="px-1.5 py-0.5 rounded-md text-[9px] bg-primary/20 text-primary font-medium">
                            Fast
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground">{m.provider}</span>
                    </div>
                    {isSelected && <Check className="size-3.5 text-primary" />}
                  </button>
                );
              })}
            </div>
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
                <Sparkles className="size-8 animate-pulse" />
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
                <span className="text-xs">Super Assistant is thinking... / سوچ رہا ہوں</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Live Speech Transcription Area Above the Bottom Line */}
        {inputText.trim().length > 0 && (
          <div className="max-w-3xl w-full mx-auto px-4 sm:px-6 pb-2 shrink-0 animate-in fade-in slide-in-from-bottom-2 duration-150">
            <div className="flex items-center justify-between gap-3">
              {isEditingTranscript ? (
                <input
                  type="text"
                  autoFocus
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSendNow();
                    }
                  }}
                  className="flex-1 bg-transparent text-sm text-foreground focus:outline-hidden border-b border-border pb-1"
                  placeholder="Modify spoken text..."
                />
              ) : (
                <div
                  onClick={handleTapToEdit}
                  className="flex-1 cursor-pointer group"
                  title="Click to edit before auto-send"
                >
                  <p
                    className={cn(
                      "text-sm tracking-wide transition-colors duration-200 select-text",
                      isSilenceCountdown
                        ? "text-foreground font-medium animate-pulse"
                        : "text-muted-foreground",
                    )}
                  >
                    {inputText}
                  </p>
                  <span className="text-[10px] text-muted-foreground/70 group-hover:text-amber-500 transition-colors">
                    {isSilenceCountdown
                      ? "Sending in 1.5s · Click text to pause and edit"
                      : "Transcribing..."}
                  </span>
                </div>
              )}

              {/* Gray borderless send button */}
              <button
                type="button"
                onClick={handleSendNow}
                className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-1.5 rounded-md hover:bg-muted/50 shrink-0"
                title="Send Message"
              >
                <Send className="size-4" />
              </button>
            </div>
          </div>
        )}

        {/* Bottom Horizontal Grey Line with Centered Model Selection Badge */}
        <div className="relative w-full max-w-3xl mx-auto flex items-center justify-center py-4 px-4 shrink-0">
          {/* Subtle Horizontal Divider Line */}
          <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-[1px] bg-border/60" />

          {/* Centered Model Dropdown Badge (Half above line, half below line) */}
          <div className="relative z-10 px-3 bg-background">
            <button
              type="button"
              onClick={() => setIsModelMenuOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-border/80 bg-muted/40 hover:bg-muted text-foreground/80 hover:text-foreground text-xs font-medium transition-all shadow-xs cursor-pointer select-none"
              title="Click to select AI Model"
            >
              <Sparkles className="size-3 text-amber-500" />
              <span>{selectedModel}</span>
              <ChevronDown className="size-3 text-muted-foreground" />
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
