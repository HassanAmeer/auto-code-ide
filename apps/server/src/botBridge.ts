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

      const data = await res.json();
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
