// @effect-diagnostics globalDate:off globalConsole:off globalFetch:off
/**
 * Super Bot Bridge
 *
 * Thin adapter that dynamically imports bot/ at runtime so that:
 *  1. The server tsconfig never statically resolves bot/ files (no Effect-lint leakage).
 *  2. The bot/ folder keeps its own tsconfig with Effect diagnostics disabled.
 *
 * The exported type is declared manually here — no import from bot/ at the type level.
 */

export interface BotTurnResult {
  reply: string;
  spokenReply: string;
  intent: string;
  actionTaken?: string | undefined;
  systemPrompt: string;
}

export async function runSuperBotTurn(opts: {
  userText: string;
  projectName: string;
  projectRoot: string;
  selectedModel: string;
  language: "urdu" | "english";
  messages?: any[] | undefined;
}): Promise<BotTurnResult | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const mod = await import("../../../bot/index.ts" as string);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const result = (await (mod as any).processSuperBotTurn(opts)) as BotTurnResult;
    return result;
  } catch {
    return null;
  }
}

export async function getLiveKitToken(opts: {
  roomName?: string;
  participantIdentity?: string;
  participantName?: string;
}): Promise<{
  ok: boolean;
  token?: string;
  serverUrl?: string;
  roomName?: string;
  identity?: string;
  error?: string;
}> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const mod = await import("../../../bot/index.ts" as string);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const tokenResult = await (mod as any).createVoiceCallToken({
      roomName: opts.roomName || "autojobs-call-room",
      participantIdentity: opts.participantIdentity || `user_${Date.now().toString(36)}`,
      participantName: opts.participantName || "AutoCode User",
    });

    const jwtToken = typeof tokenResult === "string" ? tokenResult : tokenResult?.token || "";
    const config = ((mod as any).loadLiveKitConfig?.() || {}) as { url?: string };
    const serverUrl =
      config.url && !config.url.includes("127.0.0.1")
        ? config.url
        : "wss://autojobs.tokendeal.cloud";

    // Ensure AI Agent Worker is actively present in the room
    try {
      (mod as any).startLiveKitAgentWorker?.(opts.roomName || "autojobs-call-room");
    } catch (e) {
      console.warn("[LiveKit] Could not start agent worker:", e);
    }

    return {
      ok: true,
      token: jwtToken,
      serverUrl,
      roomName: tokenResult?.roomName || opts.roomName || "autojobs-call-room",
      identity: tokenResult?.identity || opts.participantIdentity,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || String(err),
    };
  }
}

export async function getLiveKitRoomInfo(roomName = "autojobs-call-room"): Promise<{
  ok: boolean;
  roomName: string;
  agentWorker?: any;
  error?: string;
}> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const mod = await import("../../../bot/index.ts" as string);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const workerStatus = (mod as any).getAgentWorkerStatus?.() || {};
    return {
      ok: true,
      roomName,
      agentWorker: workerStatus,
    };
  } catch (err: any) {
    return {
      ok: false,
      roomName,
      error: err?.message || String(err),
    };
  }
}

export { geminiKeyRotator, SmartGeminiKeyRotator } from "./geminiKeyRotator.ts";
import { geminiKeyRotator } from "./geminiKeyRotator.ts";

/**
 * Executes a Gemini request with Smart Multi-Key Auto-Rotation and Quota-Only Failover (Digi-Labs Inspired).
 * GOLDEN RULE:
 * 1. Only 429 / RESOURCE_EXHAUSTED rotates to next key.
 * 2. 400 Bad Request or client errors fail immediately without wasting healthy keys.
 */
export async function queryGeminiWithRotation(opts: {
  model?: string;
  prompt: string;
  systemInstruction?: string;
  temperature?: number;
}): Promise<{ ok: boolean; reply?: string; error?: string; keysAttempted: number }> {
  const model = opts.model || "gemini-2.5-flash";
  const systemInstruction = opts.systemInstruction || "";

  const outcome = await geminiKeyRotator.executeWithRotation(async (apiKey) => {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
      const payload: any = {
        contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
        generationConfig: {
          temperature: opts.temperature ?? 0.7,
          maxOutputTokens: 1500,
        },
      };
      if (systemInstruction) {
        payload.systemInstruction = { parts: [{ text: systemInstruction }] };
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      });

      const data: any = await res.json();
      if (!res.ok) {
        return {
          status: res.status,
          error: data?.error?.message || `HTTP ${res.status}`,
        };
      }

      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      return {
        status: 200,
        data: { text },
      };
    } catch (err: any) {
      return {
        status: 500,
        error: err?.message || String(err),
      };
    }
  });

  if (outcome.ok && outcome.data) {
    return { ok: true, reply: outcome.data.text, keysAttempted: outcome.keysAttempted };
  }
  return { ok: false, error: outcome.error, keysAttempted: outcome.keysAttempted };
}

// ============================================================================
// WhatsApp Gateway & Bot Bridge Methods
// ============================================================================

export async function processWhatsAppWebhook(payload: any): Promise<any> {
  try {
    const mod = await import("../../../bot/index.ts" as string);
    return await (mod as any).handleWhatsAppWebhook(payload);
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function getWhatsAppSessions(): Promise<any[]> {
  try {
    const mod = await import("../../../bot/index.ts" as string);
    return await (mod as any).listSessions();
  } catch {
    return [];
  }
}

export async function createWhatsAppSession(name: string, engine?: string): Promise<any> {
  try {
    const mod = await import("../../../bot/index.ts" as string);
    return await (mod as any).createSession(name, engine);
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function deleteWhatsAppSession(sessionId: string): Promise<any> {
  try {
    const mod = await import("../../../bot/index.ts" as string);
    return await (mod as any).deleteSession(sessionId);
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function getWhatsAppQr(sessionId: string): Promise<any> {
  try {
    const mod = await import("../../../bot/index.ts" as string);
    return await (mod as any).getSessionQr(sessionId);
  } catch (err: any) {
    return { status: "FAILED", error: err?.message || String(err) };
  }
}

export async function sendWhatsAppMessage(opts: {
  to: string;
  text?: string;
  mediaUrl?: string;
  caption?: string;
  mediaType?: "text" | "image" | "voice" | "document";
  sessionId?: string;
}): Promise<any> {
  try {
    const mod = await import("../../../bot/index.ts" as string);
    if (opts.mediaType === "voice" && opts.mediaUrl) {
      return await (mod as any).sendVoiceMessage({
        to: opts.to,
        audioUrl: opts.mediaUrl,
        sessionId: opts.sessionId,
      });
    }
    if (opts.mediaUrl) {
      return await (mod as any).sendMediaMessage({
        to: opts.to,
        mediaUrl: opts.mediaUrl,
        caption: opts.caption || opts.text,
        mimetype: opts.mediaType === "image" ? "image/jpeg" : undefined,
        sessionId: opts.sessionId,
      });
    }
    return await (mod as any).sendTextMessage({
      to: opts.to,
      text: opts.text || "",
      sessionId: opts.sessionId,
    });
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function editWhatsAppMessage(opts: {
  chatId: string;
  messageId: string;
  newText: string;
  sessionId?: string;
}): Promise<any> {
  try {
    const mod = await import("../../../bot/index.ts" as string);
    return await (mod as any).editMessage(opts);
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function deleteWhatsAppMessage(opts: {
  chatId: string;
  messageId: string;
  sessionId?: string;
}): Promise<any> {
  try {
    const mod = await import("../../../bot/index.ts" as string);
    return await (mod as any).deleteMessage(opts);
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function fetchWhatsAppSettings(): Promise<any> {
  try {
    const mod = await import("../../../bot/index.ts" as string);
    return (mod as any).getWhatsAppSettings();
  } catch {
    return {};
  }
}

export async function getWhatsAppChats(sessionId?: string): Promise<any[]> {
  try {
    const mod = await import("../../../bot/index.ts" as string);
    return await (mod as any).listChats(sessionId);
  } catch {
    return [];
  }
}

export async function toggleWhatsAppPriorityTarget(target: any): Promise<any> {
  try {
    const mod = await import("../../../bot/index.ts" as string);
    return (mod as any).togglePriorityTarget(target);
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function saveWhatsAppSettings(updates: any): Promise<any> {
  try {
    const mod = await import("../../../bot/index.ts" as string);
    return (mod as any).updateWhatsAppSettings(updates);
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function fetchWhatsAppLogs(filter?: any): Promise<any[]> {
  try {
    const mod = await import("../../../bot/index.ts" as string);
    return (mod as any).getWhatsAppLogs(filter);
  } catch {
    return [];
  }
}

export async function clearAllWhatsAppLogs(): Promise<void> {
  try {
    const mod = await import("../../../bot/index.ts" as string);
    (mod as any).clearWhatsAppLogs();
  } catch {
    // ignore
  }
}

export async function fetchScheduledWhatsAppTasks(): Promise<any[]> {
  try {
    const mod = await import("../../../bot/index.ts" as string);
    (mod as any).startWhatsAppSchedulerDaemon?.();
    return (mod as any).listScheduledWhatsAppTasks();
  } catch {
    return [];
  }
}

export async function addScheduledWhatsAppTask(task: any): Promise<any> {
  try {
    const mod = await import("../../../bot/index.ts" as string);
    (mod as any).startWhatsAppSchedulerDaemon?.();
    return (mod as any).createScheduledWhatsAppTask(task);
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function cancelScheduledWhatsAppTaskById(taskId: string): Promise<boolean> {
  try {
    const mod = await import("../../../bot/index.ts" as string);
    return (mod as any).cancelScheduledWhatsAppTask(taskId);
  } catch {
    return false;
  }
}

export async function runScheduledWhatsAppTaskNowById(taskId: string): Promise<any> {
  try {
    const mod = await import("../../../bot/index.ts" as string);
    return await (mod as any).runScheduledWhatsAppTaskNow(taskId);
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function getLiveWhatsAppContext(): Promise<string> {
  try {
    const mod = await import("../../../bot/whatsapp/client.ts" as string);
    return (mod as any).getLiveWhatsAppContext?.() || "";
  } catch {
    return "";
  }
}
