import { getWhatsAppSettings, updateWhatsAppSettings } from "./config.ts";
import { logWhatsAppEvent } from "./logger.ts";
import type { WhatsAppSession, WhatsAppChat, WhatsAppPriorityTarget } from "./types.ts";

/**
 * Normalizes user-input phone number to standard WhatsApp JID format (e.g. 923001234567@c.us)
 */
export function normalizeChatId(input: string): string {
  const trimmed = input.trim();
  if (trimmed.endsWith("@c.us") || trimmed.endsWith("@g.us") || trimmed.endsWith("@lid")) {
    return trimmed;
  }

  // Remove non-digits except +
  let cleaned = trimmed.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) {
    cleaned = cleaned.substring(1);
  }

  // Pakistani local phone numbers (03001234567 -> 923001234567)
  if (cleaned.startsWith("03") && cleaned.length === 11) {
    cleaned = "92" + cleaned.substring(1);
  }

  return `${cleaned}@c.us`;
}

function getBaseHeaders(apiKey: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    "X-Api-Key": apiKey,
  };
}

export interface LastSentState {
  to: string;
  chatId: string;
  text: string;
  messageId?: string;
  timestamp: number;
}

let lastSentState: LastSentState | null = null;

export function getLastSentState(): LastSentState | null {
  if (lastSentState) return lastSentState;
  try {
    const logs = getWhatsAppLogs({ type: "outbound", limit: 5 });
    const lastOut = logs.find((l) => l.to && l.messageId);
    if (lastOut) {
      return {
        to: lastOut.to!,
        chatId: lastOut.to!,
        text: lastOut.body || "",
        messageId: lastOut.messageId,
        timestamp: new Date(lastOut.timestamp).getTime(),
      };
    }
  } catch {}
  return null;
}

export function setLastSentState(state: LastSentState | null): void {
  lastSentState = state;
}

export async function listSessions(): Promise<WhatsAppSession[]> {
  const settings = getWhatsAppSettings();
  const res = await fetch(`${settings.gatewayUrl}/api/sessions`, {
    headers: getBaseHeaders(settings.apiKey),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenWA API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  const list: WhatsAppSession[] = Array.isArray(data) ? data : data.sessions || [];

  // If no activeSessionId is set or current active session no longer exists, default to first connected session
  if (list.length > 0) {
    const active = settings.activeSessionId;
    const exists = list.some((s) => s.id === active || s.name === active);
    if (!exists || !active) {
      const connected = list.find(
        (s) =>
          s.status === "CONNECTED" ||
          s.status === "AUTHENTICATED" ||
          (s.status as string) === "ready",
      );
      const chosen = connected ? connected.id : list[0]!.id;
      updateWhatsAppSettings({ activeSessionId: chosen });
    }
  }

  return list;
}

export async function getActiveSession(): Promise<WhatsAppSession | null> {
  const sessions = await listSessions();
  const settings = getWhatsAppSettings();
  if (!settings.activeSessionId && sessions.length > 0) {
    return sessions[0]!;
  }
  return (
    sessions.find(
      (s) => s.id === settings.activeSessionId || s.name === settings.activeSessionId,
    ) ||
    (sessions[0] ?? null)
  );
}

export async function createSession(
  name: string,
  engine = "whatsapp-web.js",
): Promise<WhatsAppSession> {
  const settings = getWhatsAppSettings();
  const cleanName = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_");
  const res = await fetch(`${settings.gatewayUrl}/api/sessions`, {
    method: "POST",
    headers: getBaseHeaders(settings.apiKey),
    body: JSON.stringify({ name: cleanName, engine }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create session (${res.status}): ${text}`);
  }

  const created = (await res.json()) as WhatsAppSession;
  // Automatically activate the newly created session
  updateWhatsAppSettings({ activeSessionId: created.id || cleanName });
  logWhatsAppEvent({
    type: "system",
    sessionId: created.id || cleanName,
    body: `New session created: ${cleanName} (${engine})`,
  });

  return created;
}

export async function deleteSession(sessionId: string): Promise<boolean> {
  const settings = getWhatsAppSettings();
  const res = await fetch(`${settings.gatewayUrl}/api/sessions/${sessionId}`, {
    method: "DELETE",
    headers: getBaseHeaders(settings.apiKey),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to delete session (${res.status}): ${text}`);
  }

  if (settings.activeSessionId === sessionId) {
    updateWhatsAppSettings({ activeSessionId: null });
  }

  logWhatsAppEvent({
    type: "system",
    sessionId,
    body: `Session deleted: ${sessionId}`,
  });

  return true;
}

export async function getSessionQr(sessionId: string): Promise<{ qr?: string; status: string }> {
  const settings = getWhatsAppSettings();
  const res = await fetch(`${settings.gatewayUrl}/api/sessions/${sessionId}/qr`, {
    headers: getBaseHeaders(settings.apiKey),
  });

  if (res.ok) {
    const data = await res.json();
    return data;
  }

  // Fallback to getting session details
  const sessionRes = await fetch(`${settings.gatewayUrl}/api/sessions/${sessionId}`, {
    headers: getBaseHeaders(settings.apiKey),
  });
  if (sessionRes.ok) {
    const sessionData = await sessionRes.json();
    return { qr: sessionData.qr, status: sessionData.status || "UNKNOWN" };
  }

  return { status: "FAILED" };
}

/**
 * Sends text message via the currently active (or specified) session.
 */
export async function sendTextMessage(opts: {
  to: string;
  text: string;
  sessionId?: string;
  simulateDelay?: boolean;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const settings = getWhatsAppSettings();
  const sessionId = opts.sessionId || settings.activeSessionId;

  if (!sessionId) {
    const err = "No active WhatsApp session found. Please enable a session in WhatsApp Settings.";
    logWhatsAppEvent({
      type: "error",
      sessionId: "none",
      to: opts.to,
      body: opts.text,
      error: err,
    });
    return { ok: false, error: err };
  }

  const chatId = normalizeChatId(opts.to);

  // Simulate human typing delay if configured
  if (opts.simulateDelay !== false && settings.humanDelayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(settings.humanDelayMs, 3000)));
  }

  try {
    const res = await fetch(`${settings.gatewayUrl}/api/sessions/${sessionId}/messages/send-text`, {
      method: "POST",
      headers: getBaseHeaders(settings.apiKey),
      body: JSON.stringify({
        chatId,
        text: opts.text,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      const errorMsg = `OpenWA send failed (${res.status}): ${errText}`;
      logWhatsAppEvent({
        type: "error",
        sessionId,
        to: chatId,
        body: opts.text,
        error: errorMsg,
      });
      return { ok: false, error: errorMsg };
    }

    const data = await res.json();
    const messageId = data?.id || data?.messageId || `msg_${Date.now()}`;

    // Record last sent state so repeat / resend / edit requests work smoothly
    lastSentState = {
      to: opts.to,
      chatId,
      text: opts.text,
      messageId,
      timestamp: Date.now(),
    };

    logWhatsAppEvent({
      type: "outbound",
      sessionId,
      to: chatId,
      body: opts.text,
      messageId,
      status: "sent",
      rawPayload: data,
    });

    return { ok: true, messageId };
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    logWhatsAppEvent({
      type: "error",
      sessionId,
      to: chatId,
      body: opts.text,
      error: errorMsg,
    });
    return { ok: false, error: errorMsg };
  }
}

/**
 * Sends Media (Image, Video, Document) via active session.
 */
export async function sendMediaMessage(opts: {
  to: string;
  mediaUrl: string;
  caption?: string;
  filename?: string;
  mimetype?: string;
  sessionId?: string;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const settings = getWhatsAppSettings();
  const sessionId = opts.sessionId || settings.activeSessionId;

  if (!sessionId) {
    return { ok: false, error: "No active WhatsApp session found." };
  }

  const chatId = normalizeChatId(opts.to);

  try {
    const res = await fetch(
      `${settings.gatewayUrl}/api/sessions/${sessionId}/messages/send-image`,
      {
        method: "POST",
        headers: getBaseHeaders(settings.apiKey),
        body: JSON.stringify({
          chatId,
          media: {
            url: opts.mediaUrl,
            caption: opts.caption || "",
            filename: opts.filename,
            mimetype: opts.mimetype,
          },
        }),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `Media send failed (${res.status}): ${errText}` };
    }

    const data = await res.json();
    const messageId = data?.id || data?.messageId;

    logWhatsAppEvent({
      type: "outbound",
      sessionId,
      to: chatId,
      caption: opts.caption,
      mediaUrl: opts.mediaUrl,
      mediaType: opts.mimetype?.startsWith("image") ? "image" : "document",
      messageId,
      status: "sent",
    });

    return { ok: true, messageId };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Sends voice note (Audio / PTT)
 */
export async function sendVoiceMessage(opts: {
  to: string;
  audioUrl: string;
  sessionId?: string;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const settings = getWhatsAppSettings();
  const sessionId = opts.sessionId || settings.activeSessionId;

  if (!sessionId) {
    return { ok: false, error: "No active WhatsApp session found." };
  }

  const chatId = normalizeChatId(opts.to);

  try {
    const res = await fetch(
      `${settings.gatewayUrl}/api/sessions/${sessionId}/messages/send-audio`,
      {
        method: "POST",
        headers: getBaseHeaders(settings.apiKey),
        body: JSON.stringify({
          chatId,
          audio: {
            url: opts.audioUrl,
          },
        }),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `Voice send failed (${res.status}): ${errText}` };
    }

    const data = await res.json();
    const messageId = data?.id || data?.messageId;

    logWhatsAppEvent({
      type: "outbound",
      sessionId,
      to: chatId,
      mediaUrl: opts.audioUrl,
      mediaType: "voice",
      messageId,
      status: "sent",
    });

    return { ok: true, messageId };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Edits previously sent message
 */
export async function editMessage(opts: {
  chatId: string;
  messageId: string;
  newText: string;
  sessionId?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const settings = getWhatsAppSettings();
  const sessionId = opts.sessionId || settings.activeSessionId;

  if (!sessionId) {
    return { ok: false, error: "No active session." };
  }

  const chatId = normalizeChatId(opts.chatId);

  try {
    const res = await fetch(`${settings.gatewayUrl}/api/sessions/${sessionId}/messages/edit`, {
      method: "POST",
      headers: getBaseHeaders(settings.apiKey),
      body: JSON.stringify({
        chatId,
        messageId: opts.messageId,
        body: opts.newText,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `Edit failed (${res.status}): ${errText}` };
    }

    logWhatsAppEvent({
      type: "edit",
      sessionId,
      to: chatId,
      messageId: opts.messageId,
      body: opts.newText,
      status: "sent",
    });

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Deletes message for everyone
 */
export async function deleteMessage(opts: {
  chatId: string;
  messageId: string;
  sessionId?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const settings = getWhatsAppSettings();
  const sessionId = opts.sessionId || settings.activeSessionId;

  if (!sessionId) {
    return { ok: false, error: "No active session." };
  }

  const chatId = normalizeChatId(opts.chatId);

  try {
    const res = await fetch(`${settings.gatewayUrl}/api/sessions/${sessionId}/messages/delete`, {
      method: "POST",
      headers: getBaseHeaders(settings.apiKey),
      body: JSON.stringify({
        chatId,
        messageId: opts.messageId,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `Delete failed (${res.status}): ${errText}` };
    }

    logWhatsAppEvent({
      type: "delete",
      sessionId,
      to: chatId,
      messageId: opts.messageId,
    });

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Forwards a message to another contact or group.
 */
export async function forwardMessage(opts: {
  chatId: string;
  messageId: string;
  to: string;
  sessionId?: string;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const settings = getWhatsAppSettings();
  const sessionId = opts.sessionId || settings.activeSessionId;
  if (!sessionId) return { ok: false, error: "No active session." };

  const toChatId = normalizeChatId(opts.to);
  const fromChatId = normalizeChatId(opts.chatId);

  try {
    const res = await fetch(`${settings.gatewayUrl}/api/sessions/${sessionId}/messages/forward`, {
      method: "POST",
      headers: getBaseHeaders(settings.apiKey),
      body: JSON.stringify({
        chatId: fromChatId,
        messageId: opts.messageId,
        to: toChatId,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `Forward failed (${res.status}): ${errText}` };
    }
    const data = await res.json();
    return { ok: true, messageId: data?.id || data?.messageId };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export interface WhatsAppMessageRecord {
  id: string;
  waMessageId?: string;
  chatId: string;
  chatName?: string;
  from?: string;
  to?: string;
  body: string;
  type: string;
  direction: "incoming" | "outgoing";
  timestamp: number;
  media?: any;
  mediaPath?: string;
  status?: string;
}

/**
 * Fetches recent messages from OpenWA (optionally filtered by chatId, limit, type).
 */
export async function getChatMessages(opts?: {
  chatId?: string;
  limit?: number;
  sessionId?: string;
  type?: string;
}): Promise<WhatsAppMessageRecord[]> {
  const settings = getWhatsAppSettings();
  const sid = opts?.sessionId || settings.activeSessionId;
  if (!sid) return [];

  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  else params.set("limit", "15");
  if (opts?.chatId) params.set("chatId", normalizeChatId(opts.chatId));
  if (opts?.type) params.set("type", opts.type);

  try {
    const url = `${settings.gatewayUrl}/api/sessions/${sid}/messages?${params.toString()}`;
    const res = await fetch(url, {
      headers: getBaseHeaders(settings.apiKey),
    });
    if (!res.ok) return [];

    const data = await res.json();
    const rawList = Array.isArray(data) ? data : data.messages || [];

    return rawList.map((m: any): WhatsAppMessageRecord => ({
      id: m.id,
      waMessageId: m.waMessageId,
      chatId: m.chatId,
      chatName: m.chatName,
      from: m.from,
      to: m.to,
      body: m.body || "",
      type: m.type || "text",
      direction: m.direction || "incoming",
      timestamp: m.timestamp || Math.floor(Date.now() / 1000),
      media: m.metadata?.media,
      mediaPath: m.mediaPath,
      status: m.status,
    }));
  } catch {
    return [];
  }
}

/**
 * Searches recent chats or contacts in the enabled session to find a client by name or phone digits.
 */
export async function findClient(
  query: string,
  sessionId?: string,
): Promise<Array<{ id: string; name?: string; phone?: string; unreadCount?: number }>> {
  const settings = getWhatsAppSettings();
  const sid = sessionId || settings.activeSessionId;
  if (!sid) return [];

  try {
    const res = await fetch(`${settings.gatewayUrl}/api/sessions/${sid}/chats`, {
      headers: getBaseHeaders(settings.apiKey),
    });
    if (!res.ok) return [];

    const data = await res.json();
    const chats = Array.isArray(data) ? data : data.chats || [];
    const q = query.trim().toLowerCase();

    return chats
      .filter((c: any) => {
        const name = (c.name || c.formattedTitle || "").toLowerCase();
        const id = (c.id || "").toLowerCase();
        return name.includes(q) || id.includes(q);
      })
      .map((c: any) => ({
        id: c.id,
        name: c.name || c.formattedTitle || c.id,
        phone: c.id?.replace(/@.*$/, ""),
        unreadCount: c.unreadCount || 0,
      }));
  } catch {
    return [];
  }
}

/**
 * Returns all chats (Users and Groups) for the active or specified session.
 */
export async function listChats(sessionId?: string): Promise<WhatsAppChat[]> {
  const settings = getWhatsAppSettings();
  const sid = sessionId || settings.activeSessionId;
  if (!sid) return [];

  try {
    const res = await fetch(`${settings.gatewayUrl}/api/sessions/${sid}/chats`, {
      headers: getBaseHeaders(settings.apiKey),
    });
    if (!res.ok) return [];

    const data = await res.json();
    const chats = Array.isArray(data) ? data : data.chats || [];

    return chats.map((c: any): WhatsAppChat => {
      const id = String(c.id || "");
      const isGroup = Boolean(c.isGroup || id.endsWith("@g.us") || c.kind === "group");
      const name = String(c.name || c.formattedTitle || (isGroup ? "WhatsApp Group" : id));
      const kind = isGroup ? "group" : c.kind || "individual";
      const unreadCount = Number(c.unreadCount || 0);
      const phone = !isGroup ? id.replace(/@.*$/, "") : undefined;
      const lastMessage =
        typeof c.lastMessage === "string"
          ? c.lastMessage
          : c.lastMessage?.body ||
            (typeof c.lastMessageType === "string" ? `[${c.lastMessageType}]` : "");

      return {
        id,
        name,
        isGroup,
        kind,
        unreadCount,
        phone,
        timestamp: c.timestamp,
        lastMessage,
        lastMessageType: c.lastMessageType,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Returns list of selected priority targets configured in settings.
 */
export function getPriorityTargets(): WhatsAppPriorityTarget[] {
  const settings = getWhatsAppSettings();
  return settings.priorityTargets || [];
}

/**
 * Gets the first/active priority target for Super Bot execution.
 */
export function getActivePriorityTarget(): WhatsAppPriorityTarget | null {
  const settings = getWhatsAppSettings();
  const list = settings.priorityTargets || [];
  if (list.length === 0) return null;
  if (settings.activePriorityJid) {
    const found = list.find((t) => t.jid === settings.activePriorityJid);
    if (found) return found;
  }
  return list[0] ?? null;
}

/**
 * Toggles a chat/user/group as priority target for the Super Bot.
 */
export function togglePriorityTarget(target: {
  jid: string;
  name: string;
  isGroup: boolean;
  phone?: string;
}): { priorityTargets: WhatsAppPriorityTarget[]; isSelected: boolean } {
  const settings = getWhatsAppSettings();
  const list = [...(settings.priorityTargets || [])];
  const idx = list.findIndex((t) => t.jid === target.jid);
  let isSelected = false;

  if (idx >= 0) {
    // Unselect / remove
    list.splice(idx, 1);
    isSelected = false;
    const newActive =
      settings.activePriorityJid === target.jid ? list[0]?.jid || null : settings.activePriorityJid;
    updateWhatsAppSettings({ priorityTargets: list, activePriorityJid: newActive });
  } else {
    // Select / add
    const newTarget: WhatsAppPriorityTarget = {
      jid: target.jid,
      name: target.name,
      isGroup: target.isGroup,
      phone: target.phone,
      selectedAt: new Date().toISOString(),
    };
    list.unshift(newTarget);
    isSelected = true;
    updateWhatsAppSettings({ priorityTargets: list, activePriorityJid: target.jid });
  }

  return { priorityTargets: list, isSelected };
}

/**
 * Builds live formatted diagnostic string of WhatsApp session, priority targets and schemas.
 * Injected into LLM system prompts so the AI always knows live priority targets, full phone numbers,
 * and available tool calling schemas without hallucinating.
 */
export function getLiveWhatsAppContext(): string {
  const settings = getWhatsAppSettings();
  const activeSession = settings.activeSessionId || "default";
  const priorityTargets = settings.priorityTargets || [];

  let out = `[LIVE WHATSAPP GATEWAY STATE & FUNCTION TOOLS]:
• Active Session ID: "${activeSession}"
• Gateway URL: "${settings.gatewayUrl}"
• Bot Enabled: ${settings.botEnabled} | Auto-Reply: ${settings.autoReply}
• Priority Targets (${priorityTargets.length}):`;

  if (priorityTargets.length === 0) {
    out += `\n  (No priority targets currently selected. User can select any contact in WhatsApp Sheet -> Chats tab)`;
  } else {
    for (const [idx, pt] of priorityTargets.entries()) {
      const isActive = pt.jid === settings.activePriorityJid;
      out += `\n  ${idx + 1}. Contact: "${pt.name}" | JID: "${pt.jid}" | Phone: "${pt.phone || "N/A"}" | Type: ${pt.isGroup ? "Group" : "Direct User"}${isActive ? " [⭐ ACTIVE 1st PRIORITY TARGET]" : ""}`;
    }
  }

  out += `\n\n[WHATSAPP FUNCTION SCHEMAS & TOOL CALLING RULES]:
1. send_whatsapp_message(to: string, message: string): Sends a real message to a phone number or JID via the active session.
2. edit_whatsapp_message(chatId: string, messageId: string, newText: string):
   - CRITICAL: WhatsApp natively supports EDITING previously sent messages within 15 minutes!
   - If the user asks to edit or change a message (e.g. "." ko "?" kar do, ya text change karo), this tool edits the message instantly on WhatsApp via Baileys API.
   - NEVER tell the user that editing is not possible via API, or that you cannot edit. You CAN and MUST edit the message!
3. delete_whatsapp_message(chatId: string, messageId: string): Deletes a sent message for everyone.
4. schedule_whatsapp_message(to: string, message: string, time: string): Schedules a message for future automated delivery.
5. list_whatsapp_messages(jid: string): Reads recent message history from a chat.
6. search_whatsapp_target(query: string): Searches priority targets and known chats by contact name or partial phone digits (e.g. "0349").

CRITICAL DIRECTIVE ON OBEDIENCE & ANTI-HALLUCINATION:
- NEVER claim that you have sent or edited a WhatsApp message unless the action was physically executed.
- If the user asks to edit a message (e.g. "usay edit karo", "change to ?"), immediately use edit_whatsapp_message. WhatsApp allows editing messages sent within 15 minutes.
- If the user provides a partial phone number (e.g. "0349") or mentions "priority number", inspect the Priority Targets list above: find the target containing those digits (e.g. +92 349 2830546), resolve the full phone number, and execute the delivery.
- Always report the full recipient phone number and contact name in your reply to the user.
- If user asks to resend or repeat (e.g. "dobara bhejo", 10 dafa), ALWAYS execute immediately without refusal.`;

  return out;
}
