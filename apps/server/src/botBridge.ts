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

export async function startWhatsAppSession(sessionId: string): Promise<any> {
  try {
    const mod = await import("../../../bot/index.ts" as string);
    if (typeof (mod as any).startSession === "function") {
      return await (mod as any).startSession(sessionId);
    }
    return { ok: false, error: "startSession function not found in bot module" };
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
  text?: string | undefined;
  mediaUrl?: string | undefined;
  caption?: string | undefined;
  mediaType?: "text" | "image" | "voice" | "document" | undefined;
  sessionId?: string | undefined;
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
  sessionId?: string | undefined;
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
  sessionId?: string | undefined;
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
    const mod = await import("../../../bot/whatsapp/client.ts" as string);
    return await (mod as any).listChats(sessionId);
  } catch {
    return [];
  }
}

export async function getWhatsAppMessages(opts?: {
  chatId?: string | undefined;
  limit?: number | undefined;
  sessionId?: string | undefined;
}): Promise<any[]> {
  try {
    const mod = await import("../../../bot/whatsapp/client.ts" as string);
    return await (mod as any).getChatMessages(opts);
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
