import { autoHealProject } from "./cline/auto-healer.ts";
import { type ClineTaskResult } from "./cline/engine.ts";

export * from "./cline/auto-healer.ts";
export * from "./cline/engine.ts";
export * from "./cline/tools.ts";
export * from "./whatsapp/index.ts";

export interface BotTurnOptions {
  userText: string;
  projectName?: string | undefined;
  projectRoot?: string | undefined;
  selectedModel?: string | undefined;
  language?: "urdu" | "english" | undefined;
  messages?: Array<{ role: string; content: string }> | undefined;
}

export interface BotTurnResult {
  reply: string;
  spokenReply: string;
  intent: string;
  actionTaken?: string | undefined;
  systemPrompt: string;
  taskResult?: ClineTaskResult | undefined;
}

/**
 * Super Bot Turn Handler (Cleaned of legacy watchdog/supervisor/wishlist memory)
 */
export async function processSuperBotTurn(options: BotTurnOptions): Promise<BotTurnResult> {
  const {
    userText,
    projectName = "Workspace",
    projectRoot = process.cwd(),
    language = "urdu",
  } = options;

  const isUrdu =
    language === "urdu" || /[\u0600-\u06FF]|aap|main|karo|batao|kya|hai|theek/i.test(userText);
  const lang = isUrdu ? "urdu" : "english";

  // Check if error healing is explicitly requested
  if (/\b(auto[- ]?heal|fix\s*errors?|repair\s*workspace|theek\s*karo)\b/i.test(userText)) {
    const healResult = await autoHealProject(projectRoot);
    const reply = healResult.fixed
      ? lang === "urdu"
        ? `✅ **Auto-Healing Mukammal!**\n\n• Fixed Errors: ${healResult.fixedErrors.length}\n• Summary: ${healResult.summary}`
        : `✅ **Auto-Healing Complete!**\n\n• Fixed Errors: ${healResult.fixedErrors.length}\n• Summary: ${healResult.summary}`
      : lang === "urdu"
        ? `ℹ️ Koi auto-fixable errors nahi milay. Summary: ${healResult.summary}`
        : `ℹ️ No auto-fixable errors found. Summary: ${healResult.summary}`;

    return {
      reply,
      spokenReply: healResult.fixed
        ? lang === "urdu"
          ? "Maine errors fix kar diye hain."
          : "I have fixed the detected errors."
        : lang === "urdu"
          ? "Workspace mein koi errors nahi milay."
          : "No errors found in workspace.",
      intent: "ERROR_HEALING_FIX",
      actionTaken: "auto_healer_ran",
      systemPrompt: "You are AutoCode Super Bot.",
    };
  }

  const defaultPrompt = `You are AutoCode Super Bot, an expert coding assistant and tech lead.
Project: ${projectName}
Root: ${projectRoot}
Language: ${lang === "urdu" ? "Roman Urdu with friendly tech guidance" : "English"}
Always respond directly, concisely, and help the user build their software efficiently.`;

  return {
    reply: "",
    spokenReply: "",
    intent: "GENERAL_QUERY",
    systemPrompt: defaultPrompt,
  };
}
