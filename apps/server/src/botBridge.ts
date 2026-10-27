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
}): Promise<{ ok: boolean; token?: string; serverUrl?: string; error?: string }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const mod = await import("../../../bot/index.ts" as string);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const token = (await (mod as any).createVoiceCallToken({
      roomName: opts.roomName || "autojobs-call-room",
      participantIdentity: opts.participantIdentity || `user_${Date.now().toString(36)}`,
      participantName: opts.participantName || "AutoCode User",
    })) as string;
    const config = ((mod as any).loadLiveKitConfig?.() || {}) as { url?: string };
    const serverUrl =
      config.url && !config.url.includes("127.0.0.1") ? config.url : "ws://201.18.218.29:7880";
    return {
      ok: true,
      token,
      serverUrl,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || String(err),
    };
  }
}
