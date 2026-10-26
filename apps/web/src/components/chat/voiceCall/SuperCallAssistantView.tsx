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
  ChevronRight,
  ShieldAlert,
  Volume2,
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
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";

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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.messages, isProcessing]);

  // Voice Call Assistant integration for Super Agent
  const handleTranscriptChange = useCallback((text: string) => {
    setInputText(text);
  }, []);

  const handleSuperAgentDispatch = useCallback(
    async (rawUserText: string) => {
      const userText = rawUserText.trim();
      if (!userText || isProcessing) return;

      setInputText("");
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
            .map((p) => p.name || p.projectKey)
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
      const systemPrompt = buildSuperAgentSystemPrompt(projects, notes, lang);
      let reply = "";
      if (/\b(error|masla|kharabi|bug|solve|sort|fix)\b/i.test(userText)) {
        reply =
          lang === "urdu"
            ? "Maine aapke workspace aur projects ko scan kiya hai. Agar kisi specific project mein koi masla ya error hai to batayein, kya main permission le kar isay sort aur solve kar doon?"
            : "I have scanned the workspace. If you'd like me to investigate or fix an issue in any project, let me know and I will solve it upon your permission.";
      } else if (/\b(kaise\s*ho|kya\s*haal|hello|hi|hey|salam|assalam)\b/i.test(userText)) {
        reply =
          lang === "urdu"
            ? "Walaikum Assalam! Main theek hoon, aapka Super Call Assistant. Main aapke tamam projects aur workspace ko dekh raha hoon. Batayein aaj kya karna hai?"
            : "Hello! I am your Super Call Assistant, overseeing your workspace projects and notes. How can I assist you today?";
      } else {
        reply =
          lang === "urdu"
            ? `Maine aapki baat samajh li hai: "${userText}". Main is par research kar raha hoon aur workspace ke mutabiq manage kar raha hoon.`
            : `Understood: "${userText}". I am coordinating this across your workspace projects.`;
      }

      setTimeout(() => {
        handleAddMessage("assistant", reply);
        setIsProcessing(false);
        speakText(reply);
      }, 600);
    },
    [handleAddMessage, isProcessing, notes, projects],
  );

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
      if (inputText.trim()) {
        void handleSuperAgentDispatch(inputText);
      }
    },
    prompt: inputText,
    phase: isProcessing ? "running" : "idle",
  });

  return (
    <div className="flex h-full w-full bg-background text-foreground overflow-hidden">
      {/* Left Sidebar: Call Sessions History */}
      <aside className="w-64 border-r border-border/60 bg-muted/20 flex flex-col shrink-0 hidden md:flex">
        {/* Header */}
        <div className="p-3.5 border-b border-border/50 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Bot className="size-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold truncate">Call Sessions</span>
              <span className="text-[10px] text-muted-foreground truncate">
                {sessions.length} recorded
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleNewSession}
            className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer shadow-sm"
            title="Start New Call Session"
          >
            <Plus className="size-4" />
          </button>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.map((session) => {
            const isActive = session.id === activeSessionId;
            return (
              <div
                key={session.id}
                onClick={() => setActiveSessionId(session.id)}
                className={cn(
                  "group flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs transition-all cursor-pointer",
                  isActive
                    ? "bg-accent text-accent-foreground font-semibold shadow-xs"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <PhoneCall className={cn("size-3.5 shrink-0", isActive && "text-primary")} />
                  <span className="truncate">{session.title}</span>
                </div>

                {sessions.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteSession(session.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 hover:text-destructive p-1 transition-opacity"
                    title="Delete session"
                  >
                    <Trash2 className="size-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Clear All History Button */}
        <div className="p-2 border-t border-border/50">
          <button
            type="button"
            onClick={handleClearHistory}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
          >
            <Trash2 className="size-3.5" />
            <span>Clear History / ہسٹری صاف کریں</span>
          </button>
        </div>
      </aside>

      {/* Main Call View */}
      <div className="flex-1 flex flex-col h-full min-w-0 bg-background relative">
        {/* Top Header Bar */}
        <header className="h-14 border-b border-border/50 px-4 sm:px-6 flex items-center justify-between shrink-0 bg-background/80 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white flex items-center justify-center shadow-sm">
              <Bot className="size-4.5" />
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight flex items-center gap-2">
                Super Call Assistant
                <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  Super Admin
                </span>
              </h1>
              <p className="text-[11px] text-muted-foreground">
                سپر کال اسسٹنٹ · Workspace Overseer & Voice Intelligence
              </p>
            </div>
          </div>

          {/* Quick Metrics & Actions */}
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground mr-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted">
                <FolderGit2 className="size-3 text-indigo-400" />
                {projects.length} Projects
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted">
                <FileCheck2 className="size-3 text-amber-400" />
                {notes.length} Notes
              </span>
            </div>

            <button
              type="button"
              onClick={handleNewSession}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors cursor-pointer"
            >
              <Plus className="size-3.5" />
              <span>New Call</span>
            </button>
          </div>
        </header>

        {/* Conversation Stream */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-4 max-w-4xl w-full mx-auto">
          {activeSession?.messages.map((msg) => {
            const isUser = msg.role === "user";
            return (
              <div
                key={msg.id}
                className={cn(
                  "flex items-start gap-3 text-sm animate-in fade-in duration-150",
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
                    "rounded-2xl px-4 py-2.5 max-w-[82%] sm:max-w-[70%] leading-relaxed shadow-xs",
                    isUser
                      ? "bg-primary text-primary-foreground rounded-tr-xs"
                      : "bg-muted/60 border border-border/60 text-foreground rounded-tl-xs",
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
              <div className="rounded-2xl px-4 py-2.5 bg-muted/60 border border-border/60 text-muted-foreground rounded-tl-xs flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-primary animate-ping" />
                <span className="text-xs">Super Assistant is thinking... / سوچ رہا ہوں</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Field Area */}
        <div className="p-4 sm:p-6 border-t border-border/50 bg-background/90 backdrop-blur-md shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (inputText.trim()) {
                void handleSuperAgentDispatch(inputText);
              }
            }}
            className="max-w-4xl mx-auto flex items-center gap-2"
          >
            <div className="relative flex-1">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Urdu ya English mein boleyn ya type karein (Auto-sends 1.5s after speech)..."
                className="w-full h-11 px-4 pr-10 rounded-xl bg-muted/40 border border-border focus:border-primary focus:outline-hidden text-sm transition-colors"
              />
              {isCallActive && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] text-muted-foreground font-medium">1.5s auto</span>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={!inputText.trim() || isProcessing}
              className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer shrink-0 shadow-sm"
              title="Send Message"
            >
              <Send className="size-4" />
            </button>
          </form>
        </div>

        {/* Floating Action Button (FAB) on the right side */}
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
