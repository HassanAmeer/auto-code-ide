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
