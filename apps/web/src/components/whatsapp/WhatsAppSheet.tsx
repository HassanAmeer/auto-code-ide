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
} from "lucide-react";
import { Button } from "../ui/button";
import { WhatsAppIcon } from "./WhatsAppHeaderButton";

interface WhatsAppSession {
  id: string;
  name?: string;
  status: "CONNECTED" | "STARTING" | "SCAN_QR" | "AUTHENTICATED" | "STOPPED" | "FAILED" | "UNKNOWN";
  engine?: string;
  phone?: string | null;
  me?: {
    id?: string;
    name?: string;
    phone?: string;
  };
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
}

interface WhatsAppSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WhatsAppSheet({ isOpen, onClose }: WhatsAppSheetProps) {
  const [activeTab, setActiveTab] = useState<"sessions" | "settings" | "test">("sessions");
  const [sessions, setSessions] = useState<WhatsAppSession[]>([]);
  const [settings, setSettings] = useState<WhatsAppSettingsData>({
    botEnabled: true,
    autoReply: true,
    mediaEnabled: true,
    voiceNotesEnabled: true,
    gatewayUrl: "https://w.tokendeal.cloud",
    apiKey: "owa_k1_bd105b7013973116841acdc2fa381a87499a47f09c67fad26fb7cf5a3da2f973",
    activeSessionId: null,
    humanDelayMs: 2500,
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
        if (data.settings) setSettings(data.settings);
      }
    } catch (err: any) {
      setErrorMsg("Failed to connect to WhatsApp API: " + (err?.message || String(err)));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
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
    } catch {
      setErrorMsg("Failed to update active session");
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
        {/* iOS Navigation Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3.5 bg-zinc-950/40">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#25D366]/15 border border-[#25D366]/30 text-[#25D366] shadow-sm">
              <WhatsAppIcon className="size-5 text-[#25D366]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-white flex items-center gap-1.5">
                WhatsApp Manager
                {settings.botEnabled && (
                  <span className="flex size-2 rounded-full bg-[#25D366] animate-pulse" />
                )}
              </h2>
              <p className="text-[11px] text-zinc-400">Cupertino Multi-Session Gateway</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
              title="Refresh status"
            >
              <RefreshCw
                className={`size-3.5 ${refreshing ? "animate-spin text-emerald-400" : ""}`}
              />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Cupertino Segmented Control Tab Switcher */}
        <div className="p-3 border-b border-white/[0.06] bg-zinc-950/20">
          <div className="flex rounded-xl bg-zinc-900/90 p-0.5 border border-white/[0.08] shadow-inner text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveTab("sessions")}
              className={`flex-1 py-1.5 rounded-lg transition-all text-center cursor-pointer ${
                activeTab === "sessions"
                  ? "bg-zinc-800 text-white shadow-sm font-semibold border border-white/[0.12]"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Sessions ({sessions.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("settings")}
              className={`flex-1 py-1.5 rounded-lg transition-all text-center cursor-pointer ${
                activeTab === "settings"
                  ? "bg-zinc-800 text-white shadow-sm font-semibold border border-white/[0.12]"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Bot Settings
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("test")}
              className={`flex-1 py-1.5 rounded-lg transition-all text-center cursor-pointer ${
                activeTab === "test"
                  ? "bg-zinc-800 text-white shadow-sm font-semibold border border-white/[0.12]"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Tester
            </button>
          </div>
        </div>

        {/* Notification alerts */}
        {errorMsg && (
          <div className="mx-3 mt-2 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-950/40 px-3 py-2 text-xs text-rose-300">
            <AlertCircle className="size-4 shrink-0 text-rose-400" />
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
          <div className="mx-3 mt-2 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-300">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
            <span className="flex-1">{successMsg}</span>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
          {activeTab === "sessions" && (
            <div className="space-y-3">
              {/* Header with Add Session button */}
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
                  Connected Accounts
                </span>
                <button
                  type="button"
                  onClick={() => setShowNewModal(true)}
                  className="flex items-center gap-1 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition-all cursor-pointer"
                >
                  <Plus className="size-3.5" />
                  <span>New Session</span>
                </button>
              </div>

              {/* Sessions List */}
              {sessions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center space-y-2 bg-zinc-900/30">
                  <Smartphone className="mx-auto size-8 text-zinc-500" />
                  <p className="text-xs font-medium text-zinc-300">
                    No WhatsApp sessions connected
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    Click &quot;New Session&quot; to connect your or your friend&apos;s WhatsApp via
                    QR code.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setShowNewModal(true)}
                    className="mt-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs"
                  >
                    <Plus className="size-3.5 mr-1" />
                    Create First Session
                  </Button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {sessions.map((sess) => {
                    const isEnabled = settings.activeSessionId === sess.id;
                    const isConnected =
                      sess.status === "CONNECTED" || sess.status === "AUTHENTICATED";
                    const isScanQr = sess.status === "SCAN_QR" || sess.status === "STARTING";

                    return (
                      <div
                        key={sess.id}
                        className={`rounded-2xl border p-3.5 transition-all ${
                          isEnabled
                            ? "border-emerald-500/50 bg-emerald-950/20 shadow-md ring-1 ring-emerald-500/20"
                            : "border-white/[0.08] bg-zinc-900/60 hover:border-white/15"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={`flex size-9 shrink-0 items-center justify-center rounded-xl border ${
                                isConnected
                                  ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
                                  : isScanQr
                                    ? "border-amber-500/30 bg-amber-500/15 text-amber-400"
                                    : "border-zinc-700 bg-zinc-800 text-zinc-400"
                              }`}
                            >
                              <Smartphone className="size-4.5" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-white truncate">
                                  {sess.id}
                                </span>
                                {isEnabled && (
                                  <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-1.5 py-0.2 text-[9px] font-bold text-emerald-300 uppercase tracking-wider">
                                    Active Bot
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-zinc-400 truncate">
                                {sess.phone || sess.me?.phone || sess.engine || "WhatsApp Account"}
                              </p>
                            </div>
                          </div>

                          {/* iOS Green Toggle Switch (Only 1 active at a time!) */}
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleToggleSession(sess.id)}
                              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                                isEnabled ? "bg-[#34C759]" : "bg-zinc-700"
                              }`}
                              title={
                                isEnabled
                                  ? "Active session (Bot uses this)"
                                  : "Click to enable for Bot"
                              }
                            >
                              <span
                                className={`pointer-events-none inline-block size-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                  isEnabled ? "translate-x-4" : "translate-x-0"
                                }`}
                              />
                            </button>
                          </div>
                        </div>

                        {/* Status bar & Action buttons */}
                        <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-2.5 text-[11px]">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`size-2 rounded-full ${
                                isConnected
                                  ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"
                                  : isScanQr
                                    ? "bg-amber-400 animate-pulse shadow-[0_0_6px_rgba(251,191,36,0.8)]"
                                    : "bg-rose-500"
                              }`}
                            />
                            <span className="text-zinc-300 font-medium capitalize">
                              {isConnected ? "Connected" : isScanQr ? "Scan QR Code" : sess.status}
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            {isScanQr && (
                              <button
                                type="button"
                                onClick={() => handleShowQr(sess.id)}
                                className="flex items-center gap-1 rounded-lg bg-amber-500/20 border border-amber-500/30 px-2 py-0.8 text-[10px] font-semibold text-amber-300 hover:bg-amber-500/30 transition-all cursor-pointer"
                              >
                                <QrCode className="size-3" />
                                <span>Show QR</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleDeleteSession(sess.id)}
                              className="flex size-6 items-center justify-center rounded-lg text-zinc-500 hover:bg-rose-950/40 hover:text-rose-400 transition-all cursor-pointer"
                              title="Delete Session"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Multi-tenant note */}
              <div className="rounded-xl border border-white/[0.06] bg-zinc-900/40 p-3 text-[11px] text-zinc-400 space-y-1">
                <div className="flex items-center gap-1.5 font-medium text-zinc-300">
                  <ShieldCheck className="size-3.5 text-emerald-400" />
                  <span>Multi-Session Isolation</span>
                </div>
                <p>
                  Aap aur aapke dost ke accounts alag alag sessions mein isolated rahenge. Jis
                  session par green switch ON hoga, Bot usi ke clients ko handle karega.
                </p>
              </div>
            </div>
          )}

          {activeTab === "settings" && (
            <div className="space-y-4">
              {/* Cupertino Form Group 1: Bot Automations */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold tracking-wider text-zinc-400 uppercase px-1">
                  AI Bot Automations
                </span>
                <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/60 divide-y divide-white/[0.06] overflow-hidden">
                  {/* Master Bot Switch */}
                  <div className="flex items-center justify-between p-3.5">
                    <div>
                      <p className="text-xs font-semibold text-white">WhatsApp Bot Active</p>
                      <p className="text-[11px] text-zinc-400">
                        Enable AI Bot processing for incoming chats
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSaveSettings({ botEnabled: !settings.botEnabled })}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        settings.botEnabled ? "bg-[#34C759]" : "bg-zinc-700"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block size-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          settings.botEnabled ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Auto-Reply */}
                  <div className="flex items-center justify-between p-3.5">
                    <div>
                      <p className="text-xs font-semibold text-white">Auto-Reply to Clients</p>
                      <p className="text-[11px] text-zinc-400">
                        Automatically reply to deals and client queries
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSaveSettings({ autoReply: !settings.autoReply })}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        settings.autoReply ? "bg-[#34C759]" : "bg-zinc-700"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block size-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          settings.autoReply ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Media Support */}
                  <div className="flex items-center justify-between p-3.5">
                    <div>
                      <p className="text-xs font-semibold text-white">Media Files & Photos</p>
                      <p className="text-[11px] text-zinc-400">
                        Allow bot to send/receive images & documents
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSaveSettings({ mediaEnabled: !settings.mediaEnabled })}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        settings.mediaEnabled ? "bg-[#34C759]" : "bg-zinc-700"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block size-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          settings.mediaEnabled ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Voice Notes */}
                  <div className="flex items-center justify-between p-3.5">
                    <div>
                      <p className="text-xs font-semibold text-white">Voice Notes (PTT)</p>
                      <p className="text-[11px] text-zinc-400">
                        Allow bot to send audio voice messages
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        handleSaveSettings({ voiceNotesEnabled: !settings.voiceNotesEnabled })
                      }
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        settings.voiceNotesEnabled ? "bg-[#34C759]" : "bg-zinc-700"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block size-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          settings.voiceNotesEnabled ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* Cupertino Form Group 2: OpenWA Connection */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold tracking-wider text-zinc-400 uppercase px-1">
                  Gateway Connection
                </span>
                <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/60 p-3.5 space-y-3">
                  <div>
                    <label className="text-[11px] font-medium text-zinc-400">
                      OpenWA Gateway URL
                    </label>
                    <input
                      type="text"
                      value={settings.gatewayUrl}
                      onChange={(e) => setSettings({ ...settings, gatewayUrl: e.target.value })}
                      onBlur={() => handleSaveSettings({ gatewayUrl: settings.gatewayUrl })}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white focus:outline-hidden focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-medium text-zinc-400">Admin API Key</label>
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
                      className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white font-mono focus:outline-hidden focus:border-emerald-500"
                    />
                  </div>

                  <div className="pt-1 flex items-center justify-between text-[11px]">
                    <span className="text-zinc-400">OpenWA Web Dashboard:</span>
                    <a
                      href={settings.gatewayUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-400 hover:underline flex items-center gap-1 font-medium"
                    >
                      <span>Open Dashboard</span>
                      <ExternalLink className="size-3" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "test" && (
            <div className="space-y-3">
              <span className="text-[11px] font-semibold tracking-wider text-zinc-400 uppercase px-1">
                Direct Message Tester
              </span>

              <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/60 p-3.5 space-y-3">
                {/* Active Session Indicator */}
                <div className="flex items-center justify-between rounded-xl bg-black/40 border border-white/[0.06] p-2.5 text-xs">
                  <span className="text-zinc-400">Sending via Session:</span>
                  <span className="font-semibold text-emerald-400">
                    {settings.activeSessionId || "None (Select in Sessions tab)"}
                  </span>
                </div>

                {/* Recipient Phone */}
                <div>
                  <label className="text-[11px] font-medium text-zinc-400">
                    Recipient Phone (e.g. 03001234567 or +92300...)
                  </label>
                  <input
                    type="text"
                    placeholder="03001234567"
                    value={testRecipient}
                    onChange={(e) => setTestRecipient(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-hidden focus:border-emerald-500"
                  />
                </div>

                {/* Message Type Selector */}
                <div>
                  <label className="text-[11px] font-medium text-zinc-400">Message Type</label>
                  <div className="mt-1 flex rounded-xl bg-black/40 p-0.5 border border-white/[0.06] text-xs">
                    {(["text", "image", "voice"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTestMediaType(t)}
                        className={`flex-1 py-1 rounded-lg capitalize transition-all cursor-pointer ${
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
                    <label className="text-[11px] font-medium text-zinc-400">Media URL</label>
                    <input
                      type="text"
                      placeholder="https://example.com/photo.jpg or audio.mp3"
                      value={testMediaUrl}
                      onChange={(e) => setTestMediaUrl(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-hidden focus:border-emerald-500"
                    />
                  </div>
                )}

                {/* Message text */}
                <div>
                  <label className="text-[11px] font-medium text-zinc-400">
                    {testMediaType === "text" ? "Message Text" : "Caption (Optional)"}
                  </label>
                  <textarea
                    rows={3}
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 p-2.5 text-xs text-white placeholder:text-zinc-600 focus:outline-hidden focus:border-emerald-500 resize-none"
                  />
                </div>

                {/* Send Button */}
                <Button
                  type="button"
                  onClick={handleSendTest}
                  disabled={testSending || !settings.activeSessionId}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold py-2 cursor-pointer"
                >
                  {testSending ? (
                    <RefreshCw className="size-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Send className="size-3.5 mr-1.5" />
                  )}
                  <span>{testSending ? "Sending..." : "Send Test Message"}</span>
                </Button>

                {/* Result box */}
                {testResult && (
                  <div
                    className={`rounded-xl border p-2.5 text-xs ${
                      testResult.ok
                        ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-300"
                        : "border-rose-500/30 bg-rose-950/20 text-rose-300"
                    }`}
                  >
                    <p className="font-semibold">{testResult.ok ? "Delivered!" : "Failed"}</p>
                    {testResult.messageId && (
                      <p className="text-[10px] text-zinc-400 mt-0.5 truncate">
                        ID: {testResult.messageId}
                      </p>
                    )}
                    {testResult.error && (
                      <p className="text-[11px] text-rose-400 mt-0.5">{testResult.error}</p>
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
