import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Smartphone,
  QrCode,
  Trash2,
  Settings,
  Plus,
  RefreshCw,
  Send,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Bot,
  ExternalLink,
  ChevronRight,
  Radio,
  Image as ImageIcon,
  Mic,
  Copy,
  Check,
  User,
  Users,
  Star,
  Search,
  Filter,
  MessageSquare,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "../ui/button";
import { WhatsAppIcon } from "./WhatsAppHeaderButton";

interface WhatsAppSession {
  id: string;
  name?: string;
  pushName?: string;
  status:
    | "CONNECTED"
    | "STARTING"
    | "SCAN_QR"
    | "AUTHENTICATED"
    | "STOPPED"
    | "FAILED"
    | "UNKNOWN"
    | "ready";
  engine?: string;
  phone?: string | null;
  me?: {
    id?: string;
    name?: string;
    phone?: string;
  };
}

export interface WhatsAppChat {
  id: string;
  name: string;
  isGroup: boolean;
  kind?: string;
  unreadCount?: number;
  phone?: string;
  timestamp?: number;
  lastMessage?: string;
  lastMessageType?: string;
}

export interface WhatsAppPriorityTarget {
  jid: string;
  name: string;
  isGroup: boolean;
  phone?: string;
  selectedAt?: string;
}

interface WhatsAppSettingsData {
  botEnabled: boolean;
  autoReply: boolean;
  mediaEnabled: boolean;
  voiceNotesEnabled: boolean;
  gatewayUrl: string;
  apiKey: string;
  activeSessionId: string | null;
  humanDelayMs: number;
  priorityTargets?: WhatsAppPriorityTarget[] | undefined;
  activePriorityJid?: string | null | undefined;
}

interface WhatsAppSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WhatsAppSheet({ isOpen, onClose }: WhatsAppSheetProps) {
  const [activeTab, setActiveTab] = useState<"sessions" | "chats" | "settings" | "test">(
    "sessions",
  );
  const [sessions, setSessions] = useState<WhatsAppSession[]>([]);
  const [chats, setChats] = useState<WhatsAppChat[]>([]);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [chatFilter, setChatFilter] = useState<"all" | "users" | "groups" | "priority">("all");
  const [chatSearch, setChatSearch] = useState("");
  const [showPriorityHint, setShowPriorityHint] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("wa_hide_priority_hint") !== "true";
    }
    return true;
  });
  const [isSessionExpanded, setIsSessionExpanded] = useState(false);
  const [settings, setSettings] = useState<WhatsAppSettingsData>({
    botEnabled: true,
    autoReply: true,
    mediaEnabled: true,
    voiceNotesEnabled: true,
    gatewayUrl: "https://w.tokendeal.cloud",
    apiKey: "owa_k1_bd105b7013973116841acdc2fa381a87499a47f09c67fad26fb7cf5a3da2f973",
    activeSessionId: null,
    humanDelayMs: 2500,
    priorityTargets: [],
    activePriorityJid: null,
  });

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // New Session Modal State
  const [showNewModal, setShowNewModal] = useState(false);
  const [newSessionName, setNewSessionName] = useState("");
  const [newEngine, setNewEngine] = useState<"whatsapp-web.js" | "baileys">("whatsapp-web.js");

  // QR Modal State
  const [activeQrSession, setActiveQrSession] = useState<string | null>(null);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  // Test Message State
  const [testRecipient, setTestRecipient] = useState("");
  const [testMessage, setTestMessage] = useState(
    "Assalam-o-Alaikum! Yeh AutoJobs AI Bot ka test message hai.",
  );
  const [testMediaType, setTestMediaType] = useState<"text" | "image" | "voice">("text");
  const [testMediaUrl, setTestMediaUrl] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    messageId?: string;
    error?: string;
  } | null>(null);

  const [copiedKey, setCopiedKey] = useState(false);

  // Load Chats for a session
  const loadChats = useCallback(
    async (sid?: string) => {
      const targetSid = sid || settings.activeSessionId;
      if (!targetSid) {
        setChats([]);
        return;
      }
      setChatsLoading(true);
      try {
        const res = await fetch(`/api/whatsapp/chats?sessionId=${encodeURIComponent(targetSid)}`);
        if (res.ok) {
          const data = await res.json();
          setChats(data.chats || []);
        }
      } catch {
        // ignore
      } finally {
        setChatsLoading(false);
      }
    },
    [settings.activeSessionId],
  );

  // Fetch Sessions and Settings
  const fetchData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [sessRes, setRes] = await Promise.all([
        fetch("/api/whatsapp/sessions"),
        fetch("/api/whatsapp/settings"),
      ]);

      if (sessRes.ok) {
        const data = await sessRes.json();
        setSessions(data.sessions || []);
      }
      if (setRes.ok) {
        const data = await setRes.json();
        if (data.settings) {
          setSettings(data.settings);
          if (data.settings.activeSessionId) {
            loadChats(data.settings.activeSessionId);
          }
        }
      }
    } catch (err: any) {
      setErrorMsg("Failed to connect to WhatsApp API: " + (err?.message || String(err)));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadChats]);

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
    if (settings.activeSessionId) {
      loadChats(settings.activeSessionId);
    }
  };

  // Toggle or Enable a specific session (Only one session enabled at a time!)
  const handleToggleSession = async (sessionId: string) => {
    const nextActive = settings.activeSessionId === sessionId ? null : sessionId;
    const nextSettings = { ...settings, activeSessionId: nextActive };
    setSettings(nextSettings);

    try {
      await fetch("/api/whatsapp/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeSessionId: nextActive }),
      });
      setSuccessMsg(nextActive ? `Session '${sessionId}' enabled for Bot` : "Session disabled");
      setTimeout(() => setSuccessMsg(null), 3000);
      if (nextActive) {
        loadChats(nextActive);
      } else {
        setChats([]);
      }
    } catch {
      setErrorMsg("Failed to update active session");
    }
  };

  // Toggle priority target connection for bot focus
  const handleTogglePriority = async (chat: WhatsAppChat) => {
    try {
      const res = await fetch("/api/whatsapp/priority-target", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jid: chat.id,
          name: chat.name,
          isGroup: chat.isGroup,
          phone: chat.phone,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.priorityTargets) {
          setSettings((prev) => ({
            ...prev,
            priorityTargets: data.priorityTargets,
            activePriorityJid: data.isSelected ? chat.id : (prev.activePriorityJid ?? null),
          }));
          setSuccessMsg(
            data.isSelected
              ? `⭐ Focus set to '${chat.name}' (1st Priority)`
              : `'${chat.name}' removed from priority`,
          );
          setTimeout(() => setSuccessMsg(null), 3000);
        }
      }
    } catch {
      setErrorMsg("Failed to update priority target");
    }
  };

  // Create New Session
  const handleCreateSession = async () => {
    if (!newSessionName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/whatsapp/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newSessionName.trim(), engine: newEngine }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to create session");
      }
      setShowNewModal(false);
      const createdId = data.session?.id || newSessionName.trim();
      setNewSessionName("");
      await fetchData();
      // Immediately open QR scan for this session
      handleShowQr(createdId);
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to create session");
    } finally {
      setLoading(false);
    }
  };

  // Delete Session
  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm(`Are you sure you want to delete session '${sessionId}'?`)) return;
    try {
      const res = await fetch("/api/whatsapp/sessions/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      if (res.ok) {
        fetchData();
      }
    } catch {
      setErrorMsg("Failed to delete session");
    }
  };

  // Fetch and show QR Code
  const handleShowQr = async (sessionId: string) => {
    setActiveQrSession(sessionId);
    setQrLoading(true);
    setQrCodeData(null);
    try {
      const res = await fetch(`/api/whatsapp/sessions/qr?sessionId=${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        setQrCodeData(data.qr || null);
      }
    } catch {
      setErrorMsg("Could not fetch QR code");
    } finally {
      setQrLoading(false);
    }
  };

  // Save Settings
  const handleSaveSettings = async (updates: Partial<WhatsAppSettingsData>) => {
    const updated = { ...settings, ...updates };
    setSettings(updated);
    try {
      await fetch("/api/whatsapp/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      setSuccessMsg("Settings updated successfully");
      setTimeout(() => setSuccessMsg(null), 2500);
    } catch {
      setErrorMsg("Failed to save settings");
    }
  };

  // Send Test Message
  const handleSendTest = async () => {
    if (!testRecipient.trim()) {
      setErrorMsg("Please enter recipient phone number");
      return;
    }
    setTestSending(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: testRecipient.trim(),
          text: testMessage,
          mediaType: testMediaType,
          mediaUrl: testMediaUrl.trim() || undefined,
        }),
      });
      const data = await res.json();
      setTestResult(data);
      if (data.ok) {
        setSuccessMsg("Test message sent successfully!");
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setErrorMsg(data.error || "Failed to send test message");
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to send");
    } finally {
      setTestSending(false);
    }
  };

  const activeSessionObj = sessions.find(
    (s) => s.id === settings.activeSessionId || s.name === settings.activeSessionId,
  );
  const activeSessionDisplayName = activeSessionObj
    ? activeSessionObj.name || activeSessionObj.pushName || activeSessionObj.id
    : settings.activeSessionId;
  const activeSessionPhone = activeSessionObj?.phone
    ? `+${activeSessionObj.phone}`
    : activeSessionObj?.me?.phone
      ? `+${activeSessionObj.me.phone}`
      : null;

  const filteredChats = chats.filter((chat) => {
    if (chatSearch.trim()) {
      const q = chatSearch.toLowerCase();
      const matchesName = chat.name?.toLowerCase().includes(q);
      const matchesId = chat.id?.toLowerCase().includes(q);
      const matchesPhone = chat.phone?.includes(q);
      if (!matchesName && !matchesId && !matchesPhone) return false;
    }
    if (chatFilter === "users") {
      return !chat.isGroup;
    }
    if (chatFilter === "groups") {
      return chat.isGroup;
    }
    if (chatFilter === "priority") {
      return (settings.priorityTargets || []).some((t) => t.jid === chat.id);
    }
    return true;
  });

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex justify-end">
      {/* Blurred Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Cupertino iOS Slide-over Sheet (90% width on mobile) */}
      <div className="relative z-10 flex h-full w-[90vw] sm:w-[440px] max-w-[90vw] sm:max-w-md flex-col bg-[#0d0f12]/95 border-l border-white/10 shadow-2xl backdrop-blur-2xl text-zinc-100 font-sans animate-in slide-in-from-right duration-250">
        {/* iOS Navigation Header - Ultra-compact (py-1, ~2-4px padding) */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-1 bg-zinc-950/80 shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <h2 className="text-[13px] font-semibold tracking-tight text-white truncate">
              WhatsApp Manager
            </h2>
          </div>

          <div className="flex items-center gap-1">
            {/* WhatsApp Bare Icon on Right Side (50% smaller, no background, no outline, no border) */}
            <div
              className="relative inline-flex items-center justify-center mr-0.5"
              title={
                activeSessionObj?.status === "CONNECTED" ||
                activeSessionObj?.status === "AUTHENTICATED" ||
                activeSessionObj?.status === "ready"
                  ? "WhatsApp Connected"
                  : "WhatsApp Offline / Disconnected"
              }
            >
              <WhatsAppIcon
                className={`size-3.5 transition-colors ${
                  activeSessionObj?.status === "CONNECTED" ||
                  activeSessionObj?.status === "AUTHENTICATED" ||
                  activeSessionObj?.status === "ready"
                    ? "text-[#25D366] drop-shadow-[0_0_6px_rgba(37,211,102,0.8)]"
                    : "text-zinc-500"
                }`}
              />
              {activeSessionObj?.status === "CONNECTED" ||
              activeSessionObj?.status === "AUTHENTICATED" ||
              activeSessionObj?.status === "ready" ? (
                <span className="absolute -top-0.5 -right-0.5 flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#25D366] opacity-80" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-[#25D366]" />
                </span>
              ) : (
                <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-zinc-600" />
              )}
            </div>

            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex size-6 items-center justify-center rounded-md text-zinc-400 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
              title="Refresh status"
            >
              <RefreshCw
                className={`size-3 ${refreshing ? "animate-spin text-emerald-400" : ""}`}
              />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex size-6 items-center justify-center rounded-md text-zinc-400 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
              title="Close"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Active Session Identity (Collapsible, attached to header mt-0.5, minimal py-0.5) */}
        {activeSessionObj ? (
          <div className="mx-2 mt-0.5 shrink-0 rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-2 py-0.5 shadow-xs transition-all">
            <div
              onClick={() => setIsSessionExpanded((prev) => !prev)}
              className="flex items-center justify-between gap-1.5 cursor-pointer select-none"
              title="Click to collapse / expand details"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="size-1.5 rounded-full bg-emerald-400 shrink-0" />
                <span className="text-[11px] font-semibold text-white truncate">
                  {activeSessionDisplayName}
                </span>
                <span className="text-[10px] font-mono text-emerald-400 truncate">
                  ({activeSessionPhone || activeSessionObj.id})
                </span>
                {activeSessionObj.pushName &&
                  activeSessionObj.pushName !== activeSessionDisplayName && (
                    <span className="hidden sm:inline text-[9.5px] text-zinc-400 truncate">
                      • {activeSessionObj.pushName}
                    </span>
                  )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {settings.priorityTargets && settings.priorityTargets.length > 0 && (
                  <span className="text-[9px] font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.2 rounded-full">
                    ⭐ {settings.priorityTargets.length}
                  </span>
                )}
                {isSessionExpanded ? (
                  <ChevronUp className="size-3 text-zinc-400" />
                ) : (
                  <ChevronDown className="size-3 text-zinc-400" />
                )}
              </div>
            </div>

            {/* Collapsible expanded section */}
            {isSessionExpanded && (
              <div className="mt-1 pt-1 border-t border-white/[0.06] flex items-center justify-between text-[10px] text-zinc-400 animate-in fade-in duration-150">
                <div className="truncate">
                  <span>
                    ID:{" "}
                    <code className="text-zinc-300 font-mono text-[9px]">
                      {activeSessionObj.id}
                    </code>
                  </span>
                  {activeSessionObj.engine && (
                    <span className="ml-2 text-zinc-400">({activeSessionObj.engine})</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleSession(activeSessionObj.id);
                  }}
                  className="text-[9.5px] text-rose-400 hover:text-rose-300 underline cursor-pointer shrink-0 ml-2"
                >
                  Disable
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="mx-2 mt-0.5 shrink-0 rounded-lg border border-amber-500/20 bg-amber-950/15 px-2 py-0.5 flex items-center justify-between text-[11px] text-amber-300">
            <span className="truncate text-[10px]">No active WhatsApp session</span>
            <button
              type="button"
              onClick={() => setActiveTab("sessions")}
              className="text-[10px] underline font-semibold text-white ml-2 shrink-0 cursor-pointer"
            >
              Select
            </button>
          </div>
        )}

        {/* Cupertino Segmented Control Tab Switcher - Ultra-compact */}
        <div className="px-2 py-0.5 border-b border-white/[0.06] bg-zinc-950/20 shrink-0">
          <div className="grid grid-cols-4 rounded-lg bg-zinc-900/90 p-0.5 border border-white/[0.06] text-[11px] font-medium">
            <button
              type="button"
              onClick={() => setActiveTab("sessions")}
              className={`py-0.8 rounded-md transition-all text-center cursor-pointer ${
                activeTab === "sessions"
                  ? "bg-zinc-800 text-white shadow-xs font-semibold border border-white/[0.12]"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Sessions ({sessions.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("chats");
                if (chats.length === 0) loadChats();
              }}
              className={`py-0.8 rounded-md transition-all text-center cursor-pointer relative ${
                activeTab === "chats"
                  ? "bg-zinc-800 text-white shadow-xs font-semibold border border-white/[0.12]"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Chats {chats.length > 0 ? `(${chats.length})` : ""}
              {settings.priorityTargets && settings.priorityTargets.length > 0 && (
                <span className="ml-0.5 inline-flex size-1.5 rounded-full bg-amber-400" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("settings")}
              className={`py-0.8 rounded-md transition-all text-center cursor-pointer ${
                activeTab === "settings"
                  ? "bg-zinc-800 text-white shadow-xs font-semibold border border-white/[0.12]"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Settings
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("test")}
              className={`py-0.8 rounded-md transition-all text-center cursor-pointer ${
                activeTab === "test"
                  ? "bg-zinc-800 text-white shadow-xs font-semibold border border-white/[0.12]"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Tester
            </button>
          </div>
        </div>

        {/* Notification alerts */}
        {errorMsg && (
          <div className="mx-2 mt-1 flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-950/40 px-2 py-1 text-[11px] text-rose-300 shrink-0">
            <AlertCircle className="size-3.5 shrink-0 text-rose-400" />
            <span className="flex-1 truncate">{errorMsg}</span>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="cursor-pointer text-rose-400"
            >
              <X className="size-3" />
            </button>
          </div>
        )}
        {successMsg && (
          <div className="mx-2 mt-1 flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-950/40 px-2 py-1 text-[11px] text-emerald-300 shrink-0">
            <CheckCircle2 className="size-3.5 shrink-0 text-emerald-400" />
            <span className="flex-1 truncate">{successMsg}</span>
          </div>
        )}

        {/* Main Content Area - Pinned controls with independent list scrolling */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {activeTab === "sessions" && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {/* Pinned Header with Add Session button */}
              <div className="flex items-center justify-between px-2.5 py-1.5 shrink-0 border-b border-white/[0.04] bg-zinc-950/30">
                <span className="text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
                  Connected Accounts ({sessions.length})
                </span>
                <button
                  type="button"
                  onClick={() => setShowNewModal(true)}
                  className="flex items-center gap-1 rounded-md bg-emerald-600/90 hover:bg-emerald-500 px-2 py-0.5 text-[11px] font-semibold text-white shadow-xs transition-all cursor-pointer"
                >
                  <Plus className="size-3" />
                  <span>New Session</span>
                </button>
              </div>

              {/* Scrollable Sessions List */}
              <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-1.5">
                {sessions.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/10 p-4 text-center space-y-1.5 bg-zinc-900/30">
                    <Smartphone className="mx-auto size-6 text-zinc-500" />
                    <p className="text-xs font-medium text-zinc-300">
                      No WhatsApp sessions connected
                    </p>
                    <p className="text-[10.5px] text-zinc-500">
                      Click &quot;New Session&quot; to connect WhatsApp via QR code.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setShowNewModal(true)}
                      className="mt-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs h-7 px-3"
                    >
                      <Plus className="size-3 mr-1" />
                      Create First Session
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {sessions.map((sess) => {
                      const isEnabled = settings.activeSessionId === sess.id;
                      const isConnected =
                        sess.status === "CONNECTED" || sess.status === "AUTHENTICATED";
                      const isScanQr = sess.status === "SCAN_QR" || sess.status === "STARTING";

                      return (
                        <div
                          key={sess.id}
                          className={`rounded-xl border p-2 transition-all ${
                            isEnabled
                              ? "border-emerald-500/50 bg-emerald-950/20 shadow-xs ring-1 ring-emerald-500/20"
                              : "border-white/[0.07] bg-zinc-900/60 hover:border-white/15"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className={`flex size-7 shrink-0 items-center justify-center rounded-lg border ${
                                  isConnected
                                    ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
                                    : isScanQr
                                      ? "border-amber-500/30 bg-amber-500/15 text-amber-400"
                                      : "border-zinc-700 bg-zinc-800 text-zinc-400"
                                }`}
                              >
                                <Smartphone className="size-3.5" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-semibold text-white truncate">
                                    {sess.name || sess.pushName || sess.id}
                                  </span>
                                  {isEnabled && (
                                    <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-1 py-0 text-[8.5px] font-bold text-emerald-300 uppercase tracking-wider">
                                      Active
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-zinc-400 truncate">
                                  {sess.phone
                                    ? `+${sess.phone}`
                                    : sess.me?.phone
                                      ? `+${sess.me.phone}`
                                      : sess.id}
                                  {sess.pushName && sess.name && sess.pushName !== sess.name
                                    ? ` • (${sess.pushName})`
                                    : ""}
                                </p>
                              </div>
                            </div>

                            {/* iOS Green Toggle Switch (Only 1 active at a time!) */}
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleToggleSession(sess.id)}
                                className={`relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                                  isEnabled ? "bg-[#34C759]" : "bg-zinc-700"
                                }`}
                                title={
                                  isEnabled
                                    ? "Active session (Bot uses this)"
                                    : "Click to enable for Bot"
                                }
                              >
                                <span
                                  className={`pointer-events-none inline-block size-3.5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                                    isEnabled ? "translate-x-3.5" : "translate-x-0"
                                  }`}
                                />
                              </button>
                            </div>
                          </div>

                          {/* Status bar & Action buttons */}
                          <div className="mt-1.5 flex items-center justify-between border-t border-white/[0.04] pt-1 text-[10px]">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`size-1.5 rounded-full ${
                                  isConnected
                                    ? "bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.8)]"
                                    : isScanQr
                                      ? "bg-amber-400 animate-pulse shadow-[0_0_5px_rgba(251,191,36,0.8)]"
                                      : "bg-rose-500"
                                }`}
                              />
                              <span className="text-zinc-300 font-medium capitalize">
                                {isConnected
                                  ? "Connected"
                                  : isScanQr
                                    ? "Scan QR Code"
                                    : sess.status}
                              </span>
                            </div>

                            <div className="flex items-center gap-1">
                              {isScanQr && (
                                <button
                                  type="button"
                                  onClick={() => handleShowQr(sess.id)}
                                  className="flex items-center gap-1 rounded-md bg-amber-500/20 border border-amber-500/30 px-1.5 py-0.5 text-[9.5px] font-semibold text-amber-300 hover:bg-amber-500/30 transition-all cursor-pointer"
                                >
                                  <QrCode className="size-2.5" />
                                  <span>Show QR</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleDeleteSession(sess.id)}
                                className="flex size-5 items-center justify-center rounded-md text-zinc-500 hover:bg-rose-950/40 hover:text-rose-400 transition-all cursor-pointer"
                                title="Delete Session"
                              >
                                <Trash2 className="size-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Multi-tenant note */}
                <div className="rounded-lg border border-white/[0.05] bg-zinc-900/40 p-2 text-[10px] text-zinc-400 space-y-0.5">
                  <div className="flex items-center gap-1 font-medium text-zinc-300">
                    <ShieldCheck className="size-3 text-emerald-400" />
                    <span>Multi-Session Isolation</span>
                  </div>
                  <p className="leading-tight">
                    Aap aur aapke dost ke accounts alag alag sessions mein isolated rahenge. Jis
                    session par green switch ON hoga, Bot usi ke clients ko handle karega.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "chats" && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {/* Pinned Controls: Header, Search, Filter Pills & Priority Hint */}
              <div className="shrink-0 px-2 py-1.5 space-y-1 border-b border-white/[0.06] bg-zinc-950/40">
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
                    Users & Groups {chats.length > 0 && `(${chats.length})`}
                  </span>
                  <button
                    type="button"
                    onClick={() => loadChats()}
                    disabled={chatsLoading}
                    className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
                  >
                    <RefreshCw className={`size-2.5 ${chatsLoading ? "animate-spin" : ""}`} />
                    <span>Reload</span>
                  </button>
                </div>

                {/* Search Bar - Compact */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-2 size-3 text-zinc-400" />
                  <input
                    type="text"
                    value={chatSearch}
                    onChange={(e) => setChatSearch(e.target.value)}
                    placeholder="Search contacts or groups..."
                    className="w-full rounded-lg border border-white/10 bg-zinc-900/90 pl-8 pr-7 py-1 text-xs text-white placeholder-zinc-500 focus:border-emerald-500/50 focus:outline-hidden"
                  />
                  {chatSearch && (
                    <button
                      type="button"
                      onClick={() => setChatSearch("")}
                      className="absolute right-2 top-1.5 text-zinc-400 hover:text-white cursor-pointer"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>

                {/* Filter Pill Buttons (All / Users / Groups / Priority) - Compact */}
                <div className="flex items-center gap-1 overflow-x-auto pb-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setChatFilter("all")}
                    className={`shrink-0 rounded-md px-2 py-0.5 font-medium transition-all cursor-pointer ${
                      chatFilter === "all"
                        ? "bg-white/20 text-white font-semibold shadow-xs"
                        : "bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 border border-white/[0.06]"
                    }`}
                  >
                    All ({chats.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setChatFilter("users")}
                    className={`shrink-0 rounded-md px-2 py-0.5 font-medium transition-all cursor-pointer ${
                      chatFilter === "users"
                        ? "bg-blue-500/30 text-blue-300 font-semibold border border-blue-500/40"
                        : "bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 border border-white/[0.06]"
                    }`}
                  >
                    Users ({chats.filter((c) => !c.isGroup).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setChatFilter("groups")}
                    className={`shrink-0 rounded-md px-2 py-0.5 font-medium transition-all cursor-pointer ${
                      chatFilter === "groups"
                        ? "bg-purple-500/30 text-purple-300 font-semibold border border-purple-500/40"
                        : "bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 border border-white/[0.06]"
                    }`}
                  >
                    Groups ({chats.filter((c) => c.isGroup).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setChatFilter("priority")}
                    className={`shrink-0 rounded-md px-2 py-0.5 font-medium transition-all cursor-pointer flex items-center gap-1 ${
                      chatFilter === "priority"
                        ? "bg-amber-500/30 text-amber-300 font-semibold border border-amber-500/40"
                        : "bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 border border-white/[0.06]"
                    }`}
                  >
                    <Star className="size-2.5 fill-amber-400 text-amber-400" />
                    <span>Priority ({settings.priorityTargets?.length || 0})</span>
                  </button>
                </div>

                {/* Priority instruction helper */}
                {showPriorityHint && (
                  <div className="rounded-lg border border-amber-500/25 bg-amber-950/25 px-2 py-1 text-[10px] text-amber-200/90 flex items-start justify-between gap-1.5 transition-all">
                    <div className="flex items-start gap-1.5 min-w-0">
                      <Star className="size-3 text-amber-400 shrink-0 mt-0.5 fill-amber-400" />
                      <div className="min-w-0 leading-tight">
                        <span className="font-semibold text-amber-300">Bot Priority Focus: </span>
                        <span className="text-zinc-300 text-[9.5px]">
                          Selected targets ko bot first priority par rakhega.
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowPriorityHint(false);
                        try {
                          localStorage.setItem("wa_hide_priority_hint", "true");
                        } catch {
                          // ignore
                        }
                      }}
                      className="text-amber-400/70 hover:text-amber-200 rounded p-0.5 shrink-0 transition-colors cursor-pointer"
                      title="Hide notification"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                )}
              </div>

              {/* Scrollable Chats List Only */}
              <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-1.5">
                {chatsLoading && chats.length === 0 ? (
                  <div className="rounded-xl border border-white/[0.08] p-6 text-center space-y-1.5 bg-zinc-900/40">
                    <RefreshCw className="mx-auto size-5 text-emerald-400 animate-spin" />
                    <p className="text-xs text-zinc-400">Loading chats from active session...</p>
                  </div>
                ) : filteredChats.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/10 p-5 text-center space-y-1 bg-zinc-900/30">
                    <MessageSquare className="mx-auto size-6 text-zinc-500" />
                    <p className="text-xs font-medium text-zinc-300">
                      {chats.length === 0
                        ? "No chats found in this session"
                        : "No matching contacts or groups"}
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      {chats.length === 0
                        ? "Make sure your WhatsApp session is connected and synced."
                        : "Try switching filter pills or clearing search."}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {filteredChats.map((chat) => {
                      const isPriority = (settings.priorityTargets || []).some(
                        (t) => t.jid === chat.id,
                      );
                      return (
                        <div
                          key={chat.id}
                          className={`rounded-xl border p-2 transition-all ${
                            isPriority
                              ? "border-amber-500/50 bg-amber-950/25 shadow-xs ring-1 ring-amber-500/30"
                              : "border-white/[0.07] bg-zinc-900/60 hover:border-white/15"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className={`flex size-7 shrink-0 items-center justify-center rounded-lg border ${
                                  chat.isGroup
                                    ? "border-purple-500/30 bg-purple-500/15 text-purple-400"
                                    : "border-blue-500/30 bg-blue-500/15 text-blue-400"
                                }`}
                              >
                                {chat.isGroup ? (
                                  <Users className="size-3.5" />
                                ) : (
                                  <User className="size-3.5" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-semibold text-white truncate">
                                    {chat.name}
                                  </span>
                                  <span
                                    className={`shrink-0 rounded-full px-1 py-0 text-[8.5px] font-bold uppercase tracking-wider ${
                                      chat.isGroup
                                        ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                        : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                                    }`}
                                  >
                                    {chat.isGroup ? "Group" : "User"}
                                  </span>
                                  {isPriority && (
                                    <span className="shrink-0 rounded-full bg-amber-500/20 border border-amber-500/40 px-1 py-0 text-[8.5px] font-bold text-amber-300 uppercase tracking-wider">
                                      ⭐ Focus
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-zinc-400 font-mono truncate">
                                  {chat.phone ? `+${chat.phone}` : chat.id}
                                </p>
                              </div>
                            </div>

                            {/* Select / Deselect Priority Button */}
                            <button
                              type="button"
                              onClick={() => handleTogglePriority(chat)}
                              className={`flex items-center gap-1 shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold transition-all cursor-pointer ${
                                isPriority
                                  ? "bg-amber-500 text-black shadow-xs active:scale-95 font-bold"
                                  : "bg-zinc-800 text-zinc-300 border border-white/10 hover:bg-zinc-700 hover:text-white"
                              }`}
                              title={
                                isPriority
                                  ? "Selected for Bot First Priority. Click to remove."
                                  : "Select this User/Group as First Priority for Super Bot"
                              }
                            >
                              <Star
                                className={`size-3 ${isPriority ? "fill-black" : "text-amber-400"}`}
                              />
                              <span>{isPriority ? "Selected" : "Select"}</span>
                            </button>
                          </div>

                          {chat.lastMessage && (
                            <div className="mt-1 text-[10px] text-zinc-400 truncate border-t border-white/[0.04] pt-1">
                              <span className="text-zinc-500">Last: </span>
                              <span>{chat.lastMessage}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "settings" && (
            <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2.5">
              {/* Cupertino Form Group 1: Bot Automations */}
              <div className="space-y-1">
                <span className="text-[10px] font-semibold tracking-wider text-zinc-400 uppercase px-1">
                  AI Bot Automations
                </span>
                <div className="rounded-xl border border-white/[0.08] bg-zinc-900/60 divide-y divide-white/[0.06] overflow-hidden">
                  {/* Master Bot Switch */}
                  <div className="flex items-center justify-between p-2.5">
                    <div>
                      <p className="text-xs font-semibold text-white">WhatsApp Bot Active</p>
                      <p className="text-[10px] text-zinc-400">
                        Enable AI Bot processing for incoming chats
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSaveSettings({ botEnabled: !settings.botEnabled })}
                      className={`relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out ${
                        settings.botEnabled ? "bg-[#34C759]" : "bg-zinc-700"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block size-3.5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                          settings.botEnabled ? "translate-x-3.5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Auto-Reply */}
                  <div className="flex items-center justify-between p-2.5">
                    <div>
                      <p className="text-xs font-semibold text-white">Auto-Reply to Clients</p>
                      <p className="text-[10px] text-zinc-400">
                        Automatically reply to deals and client queries
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSaveSettings({ autoReply: !settings.autoReply })}
                      className={`relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out ${
                        settings.autoReply ? "bg-[#34C759]" : "bg-zinc-700"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block size-3.5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                          settings.autoReply ? "translate-x-3.5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Media Support */}
                  <div className="flex items-center justify-between p-2.5">
                    <div>
                      <p className="text-xs font-semibold text-white">Media Files & Photos</p>
                      <p className="text-[10px] text-zinc-400">
                        Allow bot to send/receive images & documents
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSaveSettings({ mediaEnabled: !settings.mediaEnabled })}
                      className={`relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out ${
                        settings.mediaEnabled ? "bg-[#34C759]" : "bg-zinc-700"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block size-3.5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                          settings.mediaEnabled ? "translate-x-3.5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Voice Notes */}
                  <div className="flex items-center justify-between p-2.5">
                    <div>
                      <p className="text-xs font-semibold text-white">Voice Notes (PTT)</p>
                      <p className="text-[10px] text-zinc-400">
                        Allow bot to send audio voice messages
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        handleSaveSettings({ voiceNotesEnabled: !settings.voiceNotesEnabled })
                      }
                      className={`relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out ${
                        settings.voiceNotesEnabled ? "bg-[#34C759]" : "bg-zinc-700"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block size-3.5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                          settings.voiceNotesEnabled ? "translate-x-3.5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* Cupertino Form Group 2: OpenWA Connection */}
              <div className="space-y-1">
                <span className="text-[10px] font-semibold tracking-wider text-zinc-400 uppercase px-1">
                  Gateway Connection
                </span>
                <div className="rounded-xl border border-white/[0.08] bg-zinc-900/60 p-2.5 space-y-2">
                  <div>
                    <label className="text-[10.5px] font-medium text-zinc-400">
                      OpenWA Gateway URL
                    </label>
                    <input
                      type="text"
                      value={settings.gatewayUrl}
                      onChange={(e) => setSettings({ ...settings, gatewayUrl: e.target.value })}
                      onBlur={() => handleSaveSettings({ gatewayUrl: settings.gatewayUrl })}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2.5 py-1 text-xs text-white focus:outline-hidden focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-[10.5px] font-medium text-zinc-400">
                        Admin API Key
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(settings.apiKey);
                          setCopiedKey(true);
                          setTimeout(() => setCopiedKey(false), 2000);
                        }}
                        className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                      >
                        {copiedKey ? <Check className="size-3" /> : <Copy className="size-3" />}
                        <span>{copiedKey ? "Copied" : "Copy"}</span>
                      </button>
                    </div>
                    <input
                      type="password"
                      value={settings.apiKey}
                      onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                      onBlur={() => handleSaveSettings({ apiKey: settings.apiKey })}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2.5 py-1 text-xs text-white font-mono focus:outline-hidden focus:border-emerald-500"
                    />
                  </div>

                  <div className="pt-0.5 flex items-center justify-between text-[10.5px]">
                    <span className="text-zinc-400">OpenWA Dashboard:</span>
                    <a
                      href={settings.gatewayUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-400 hover:underline flex items-center gap-1 font-medium"
                    >
                      <span>Open</span>
                      <ExternalLink className="size-2.5" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "test" && (
            <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2">
              <span className="text-[10px] font-semibold tracking-wider text-zinc-400 uppercase px-1">
                Direct Message Tester
              </span>

              <div className="rounded-xl border border-white/[0.08] bg-zinc-900/60 p-2.5 space-y-2">
                {/* Active Session Indicator */}
                <div className="flex items-center justify-between rounded-lg bg-black/40 border border-white/[0.06] p-2 text-xs">
                  <span className="text-zinc-400">Via Session:</span>
                  <span className="font-semibold text-emerald-400 truncate ml-2">
                    {settings.activeSessionId || "None (Select in Sessions tab)"}
                  </span>
                </div>

                {/* Recipient Phone */}
                <div>
                  <label className="text-[10.5px] font-medium text-zinc-400">Recipient Phone</label>
                  <input
                    type="text"
                    placeholder="03001234567 or +92300..."
                    value={testRecipient}
                    onChange={(e) => setTestRecipient(e.target.value)}
                    className="mt-0.5 w-full rounded-lg border border-white/10 bg-black/40 px-2.5 py-1 text-xs text-white placeholder:text-zinc-600 focus:outline-hidden focus:border-emerald-500"
                  />
                </div>

                {/* Message Type Selector */}
                <div>
                  <label className="text-[10.5px] font-medium text-zinc-400">Message Type</label>
                  <div className="mt-0.5 flex rounded-lg bg-black/40 p-0.5 border border-white/[0.06] text-xs">
                    {(["text", "image", "voice"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTestMediaType(t)}
                        className={`flex-1 py-0.5 rounded-md capitalize transition-all cursor-pointer text-[11px] ${
                          testMediaType === t
                            ? "bg-zinc-800 text-white font-semibold"
                            : "text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Media URL input if not text */}
                {testMediaType !== "text" && (
                  <div>
                    <label className="text-[10.5px] font-medium text-zinc-400">Media URL</label>
                    <input
                      type="text"
                      placeholder="https://example.com/photo.jpg"
                      value={testMediaUrl}
                      onChange={(e) => setTestMediaUrl(e.target.value)}
                      className="mt-0.5 w-full rounded-lg border border-white/10 bg-black/40 px-2.5 py-1 text-xs text-white placeholder:text-zinc-600 focus:outline-hidden focus:border-emerald-500"
                    />
                  </div>
                )}

                {/* Message text */}
                <div>
                  <label className="text-[10.5px] font-medium text-zinc-400">
                    {testMediaType === "text" ? "Message Text" : "Caption (Optional)"}
                  </label>
                  <textarea
                    rows={2}
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    className="mt-0.5 w-full rounded-lg border border-white/10 bg-black/40 p-2 text-xs text-white placeholder:text-zinc-600 focus:outline-hidden focus:border-emerald-500 resize-none"
                  />
                </div>

                {/* Send Button */}
                <Button
                  type="button"
                  onClick={handleSendTest}
                  disabled={testSending || !settings.activeSessionId}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold py-1.5 h-8 cursor-pointer"
                >
                  {testSending ? (
                    <RefreshCw className="size-3 animate-spin mr-1.5" />
                  ) : (
                    <Send className="size-3 mr-1.5" />
                  )}
                  <span>{testSending ? "Sending..." : "Send Test Message"}</span>
                </Button>

                {/* Result box */}
                {testResult && (
                  <div
                    className={`rounded-lg border p-2 text-xs ${
                      testResult.ok
                        ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-300"
                        : "border-rose-500/30 bg-rose-950/20 text-rose-300"
                    }`}
                  >
                    <p className="font-semibold">{testResult.ok ? "Delivered!" : "Failed"}</p>
                    {testResult.messageId && (
                      <p className="text-[9.5px] text-zinc-400 mt-0.5 truncate">
                        ID: {testResult.messageId}
                      </p>
                    )}
                    {testResult.error && (
                      <p className="text-[10.5px] text-rose-400 mt-0.5">{testResult.error}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Create Session Modal */}
        {showNewModal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
            <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-zinc-900 p-4 shadow-2xl space-y-3.5">
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <h3 className="text-sm font-semibold text-white">Create New Session</h3>
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="space-y-2.5">
                <div>
                  <label className="text-[11px] font-medium text-zinc-400">
                    Session Identifier (e.g. hasan, friend, sales)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. hasan"
                    value={newSessionName}
                    onChange={(e) => setNewSessionName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-hidden focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-medium text-zinc-400">WhatsApp Engine</label>
                  <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setNewEngine("whatsapp-web.js")}
                      className={`rounded-xl border p-2.5 text-left cursor-pointer transition-all ${
                        newEngine === "whatsapp-web.js"
                          ? "border-emerald-500/50 bg-emerald-950/30 text-white font-semibold"
                          : "border-white/10 bg-black/30 text-zinc-400"
                      }`}
                    >
                      <p className="font-semibold text-emerald-400">Web.js (Chrome)</p>
                      <p className="text-[10px] text-zinc-500 mt-0.5">Safest (Simulates Web)</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewEngine("baileys")}
                      className={`rounded-xl border p-2.5 text-left cursor-pointer transition-all ${
                        newEngine === "baileys"
                          ? "border-emerald-500/50 bg-emerald-950/30 text-white font-semibold"
                          : "border-white/10 bg-black/30 text-zinc-400"
                      }`}
                    >
                      <p className="font-semibold text-emerald-400">Baileys</p>
                      <p className="text-[10px] text-zinc-500 mt-0.5">Ultra Light (Low RAM)</p>
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowNewModal(false)}
                  className="rounded-xl text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={loading || !newSessionName.trim()}
                  onClick={handleCreateSession}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold"
                >
                  {loading ? "Creating..." : "Create & Scan QR"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* QR Code Scan Modal */}
        {activeQrSession && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-zinc-900 p-5 shadow-2xl text-center space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-xs font-semibold text-white">
                  Link Device: {activeQrSession}
                </span>
                <button
                  type="button"
                  onClick={() => setActiveQrSession(null)}
                  className="text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="size-4" />
                </button>
              </div>

              <p className="text-[11px] text-zinc-400">
                Open WhatsApp on your phone ➡️ Settings ➡️ Linked Devices ➡️ Link a Device, then
                scan this QR code:
              </p>

              <div className="mx-auto flex size-56 items-center justify-center rounded-2xl bg-white p-3 shadow-inner">
                {qrLoading ? (
                  <RefreshCw className="size-8 animate-spin text-zinc-700" />
                ) : qrCodeData ? (
                  <img
                    src={
                      qrCodeData.startsWith("data:")
                        ? qrCodeData
                        : `data:image/png;base64,${qrCodeData}`
                    }
                    alt="WhatsApp QR Code"
                    className="size-full object-contain"
                  />
                ) : (
                  <div className="space-y-1">
                    <QrCode className="mx-auto size-10 text-zinc-400" />
                    <p className="text-[11px] text-zinc-600">Generating QR Code...</p>
                    <p className="text-[10px] text-zinc-500">Wait a few seconds and refresh</p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleShowQr(activeQrSession)}
                  className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-700 cursor-pointer"
                >
                  <RefreshCw className="size-3.5" />
                  <span>Refresh QR</span>
                </button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setActiveQrSession(null);
                    fetchData();
                  }}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold"
                >
                  Done
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Floating Bottom-Right Close Icon Button */}
        <div className="absolute bottom-5 right-5 z-30 pointer-events-auto">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-zinc-900/95 hover:bg-zinc-800 text-zinc-100 border border-white/20 shadow-2xl backdrop-blur-xl active:scale-95 transition-all text-xs font-semibold cursor-pointer"
            title="Close Sheet"
            aria-label="Close WhatsApp Sheet"
          >
            <X className="size-4 text-zinc-300" />
            <span className="text-[11px]">Close</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
