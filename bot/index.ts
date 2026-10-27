import { classifyIntent, type IntentAnalysis } from "./supervisor/intentClassifier.ts";
import { buildSmartBotSystemPrompt } from "./supervisor/prompt.ts";
import { formatSpecForPrompt } from "./memory/projectSpecs.ts";
import { addBacklogItem, formatBacklogForDisplay } from "./memory/featureBacklog.ts";
import { autoHealProject } from "./cline/auto-healer.ts";
import { type ClineTaskResult } from "./cline/engine.ts";
import { startWatchdog } from "./watchdog/watchdog.ts";

export * from "./supervisor/intentClassifier.ts";
export * from "./supervisor/prompt.ts";
export * from "./memory/projectSpecs.ts";
export * from "./memory/featureBacklog.ts";
export * from "./cline/auto-healer.ts";
export * from "./cline/engine.ts";
export * from "./cline/tools.ts";
export * from "./watchdog/watchdog.ts";

export interface BotTurnOptions {
  userText: string;
  projectName?: string | undefined;
  projectRoot?: string | undefined;
  selectedModel?: string | undefined;
  language?: "urdu" | "english" | undefined;
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
 * Master Controller for Super Bot Turn
 * Implements intent classification, memory enrichment, auto-healing, and wishlist backlog management.
 */
export async function processSuperBotTurn(options: BotTurnOptions): Promise<BotTurnResult> {
  const {
    userText,
    projectName = "Workspace",
    projectRoot = process.cwd(),
    selectedModel: _model = "gemini-2.5-flash",
  } = options;
  const analysis = classifyIntent(userText);
  const lang = options.language || (analysis.isUrdu ? "urdu" : "english");

  // 1. Farewell / Exit
  if (analysis.intent === "FAREWELL_OR_EXIT") {
    const text =
      lang === "urdu"
        ? "Ji theek hai bilkul! Jab bhi aap farigh hon ya koi zaroorat ho, bataiye ga. Khuda hafiz aur apna khayal rakhein!"
        : "Sure, no problem at all! Whenever you're back or need anything, just ping me. Take care and talk soon!";
    return {
      reply: text,
      spokenReply: text,
      intent: analysis.intent,
      actionTaken: "farewell_ack",
      systemPrompt: buildSmartBotSystemPrompt({ intentAnalysis: analysis, language: lang }),
    };
  }

  // 2. Greeting / ChitChat
  if (analysis.intent === "GREETING_OR_CHITCHAT") {
    const text =
      lang === "urdu"
        ? "Walaikum Assalam! Kaisay hain aap? Main bilkul tayyar hoon, batayein aaj kis project par mashwara karein ya kaam shuru karna hai?"
        : "Hello! How are you doing? I'm ready — let me know what project we are planning today or what you'd like to work on!";
    return {
      reply: text,
      spokenReply: text,
      intent: analysis.intent,
      actionTaken: "greeting_ack",
      systemPrompt: buildSmartBotSystemPrompt({ intentAnalysis: analysis, language: lang }),
    };
  }

  // 3. Wishlist / Feature Backlog Addition
  if (analysis.intent === "WISHLIST_ADD") {
    // Extract clean feature title from user sentence
    const cleanTitle =
      userText
        .replace(
          /\b(mujhe|ye|bhi|chahiye|add|karna|hona|save|wishlist|backlog|mein|daalo|rakho)\b/gi,
          "",
        )
        .replace(/[:\-]/g, "")
        .trim() || userText.slice(0, 45);

    const isImprovement = /\b(speed|tez|behtar|performance|optimize|improve)\b/i.test(userText);
    const item = addBacklogItem(projectName, {
      title: cleanTitle,
      description: userText,
      type: isImprovement ? "improvement" : "feature",
      priority: "high",
    });

    const reply =
      lang === "urdu"
        ? `Zabardast! Maine aapki wishlist mein yeh feature save kar liya hai:\n\n• **${item.title}** (${item.type === "improvement" ? "Improvement" : "New Feature"})\n• **Project:** ${projectName}\n• **Status:** Saved to Wishlist (Pending)\n\nJab aap kahenge, hum isko worker agent se execute karwa lenge.`
        : `Added to project wishlist:\n\n• **${item.title}** (${item.type})\n• **Project:** ${projectName}\n• **Status:** Saved to Wishlist (Pending)\n\nReady to build whenever you confirm.`;

    const spokenReply =
      lang === "urdu"
        ? `Maine aapki wishlist mein ${item.title} save kar liya hai.`
        : `Saved ${item.title} to your project wishlist.`;

    return {
      reply,
      spokenReply,
      intent: analysis.intent,
      actionTaken: "wishlist_item_added",
      systemPrompt: buildSmartBotSystemPrompt({ intentAnalysis: analysis, language: lang }),
    };
  }

  // 4. Wishlist / Backlog Listing
  if (analysis.intent === "WISHLIST_LIST") {
    const listDisplay = formatBacklogForDisplay(projectName);
    const spokenReply =
      lang === "urdu"
        ? `Yeh rahi aapki wishlist aur pending features ki mukammal list.`
        : `Here is the current backlog and wishlist for ${projectName}.`;
    return {
      reply: listDisplay,
      spokenReply,
      intent: analysis.intent,
      actionTaken: "wishlist_listed",
      systemPrompt: buildSmartBotSystemPrompt({ intentAnalysis: analysis, language: lang }),
    };
  }

  // 5. Auto-Healer Request
  if (analysis.intent === "AUTO_HEAL_REQUEST") {
    const healResult = await autoHealProject(projectRoot);
    const reply =
      lang === "urdu"
        ? `### 🛠️ Auto-Healer Diagnosis & Repair Report\n\n• **Action:** ${healResult.actionTaken}\n• **Affected File:** ${healResult.affectedFile || "None"}\n• **Verified Clean:** ${healResult.verifiedClean ? "✓ Pass" : "Needs verification"}\n• **Details:** ${healResult.details || "Code syntax and structure verified healthy."}`
        : `### 🛠️ Auto-Healer Report\n\n• **Action:** ${healResult.actionTaken}\n• **File:** ${healResult.affectedFile || "None"}\n• **Status:** ${healResult.verifiedClean ? "Clean" : "Under review"}`;

    const spokenReply =
      lang === "urdu"
        ? healResult.healed
          ? `Auto healer ne project check kar ke issues repair kar diye hain.`
          : `Auto healer ne errors diagnose kar liye hain.`
        : `Auto healer routine completed.`;

    return {
      reply,
      spokenReply,
      intent: analysis.intent,
      actionTaken: "auto_heal_executed",
      systemPrompt: buildSmartBotSystemPrompt({ intentAnalysis: analysis, language: lang }),
    };
  }

  // 6. Away Supervision / Watchdog
  if (analysis.intent === "AWAY_SUPERVISION") {
    startWatchdog(projectName, projectRoot, 25);
    const text =
      lang === "urdu"
        ? `Aap be-fikr ho kar jayein! Maine project "${projectName}" par Autonomous Watchdog activate kar diya hai. Main background mein continuous errors, build, aur preview ko monitor karta rahoonga. Agar koi masla aaya to main khud solve kar loonga.`
        : `Go ahead, don't worry! I have activated the Autonomous Watchdog on project "${projectName}". I will continuously monitor preview health, builds, and errors while you are away.`;
    return {
      reply: text,
      spokenReply: text,
      intent: analysis.intent,
      actionTaken: "watchdog_activated",
      systemPrompt: buildSmartBotSystemPrompt({ intentAnalysis: analysis, language: lang }),
    };
  }

  // Load project memory spec if available
  const specText = formatSpecForPrompt(projectName);

  const smartSystemPrompt = buildSmartBotSystemPrompt({
    intentAnalysis: analysis,
    projectName,
    projectMemorySpec: specText,
    language: lang,
  });

  return {
    reply: "",
    spokenReply: "",
    intent: analysis.intent,
    systemPrompt: smartSystemPrompt,
  };
}
