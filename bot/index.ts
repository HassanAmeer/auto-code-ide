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
export * from "./memory/spaces.ts";
export * from "./cline/auto-healer.ts";
export * from "./cline/engine.ts";
export * from "./cline/tools.ts";
export * from "./watchdog/watchdog.ts";
export * from "./livekit/index.ts";
export * from "./whatsapp/index.ts";

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
    return {
      intent: analysis.intent,
      actionTaken: "farewell_ack",
      systemPrompt: buildSmartBotSystemPrompt({ intentAnalysis: analysis, language: lang }),
    };
  }

  // 2. Greeting / ChitChat
  if (analysis.intent === "GREETING_OR_CHITCHAT") {
    return {
      intent: analysis.intent,
      actionTaken: "greeting_ack",
      systemPrompt: buildSmartBotSystemPrompt({ intentAnalysis: analysis, language: lang }),
    };
  }

  // 2.1 Capabilities Inquiry (e.g. "aap kya kar sakte hain", "اپ کیا کر سکتے ہیں")
  if (analysis.intent === "CAPABILITIES_INQUIRY") {
    return {
      intent: analysis.intent,
      actionTaken: "capabilities_ack",
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

  // 7. WhatsApp Action Handler
  if (analysis.intent === "WHATSAPP_ACTION") {
    const {
      sendTextMessage,
      sendMediaMessage,
      sendVoiceMessage,
      editMessage,
      deleteMessage,
      findClient,
      getWhatsAppSettings,
    } = await import("./whatsapp/index.ts");

    const settings = getWhatsAppSettings();
    const activeSession = settings.activeSessionId || "default";

    // Extract potential phone number or client identifier
    const phoneMatch = userText.match(/(?:\+?92|0)?3\d{2}[- ]?\d{7}|\b\d{10,15}\b/);
    const rawTarget = phoneMatch ? phoneMatch[0].replace(/[- ]/g, "") : "";

    // Clean user message to extract actual text
    let messageToSend = userText
      .replace(
        /(?:whatsapp\s*(?:par|pe|karo)?|client\s*ko|is\s*number\s*ko|ko\s*message\s*(?:bhej|send|karo)?|message\s*send\s*karo|bhej\s*do|send\s*karo)/gi,
        "",
      )
      .replace(new RegExp(rawTarget, "g"), "")
      .replace(/^[:\-\s]+/, "")
      .trim();

    if (!messageToSend) {
      messageToSend = "Assalam-o-Alaikum! AutoJobs Bot ki taraf se message.";
    }

    // Check if user is asking to EDIT a message
    if (/\b(edit\s*karo|tabdeel\s*karo|change\s*karo)\b/i.test(userText)) {
      const reply =
        lang === "urdu"
          ? `Main message edit kar sakta hoon! Message edit karne ke liye mujhe Client ka Number/ChatId aur Message ID darkaar hai.\n\n• **Active Session:** \`${activeSession}\`\n• **Action:** Edit Message\n\nAap WhatsApp Sheet ya Tester se direct 1-click edit kar sakte hain.`
          : `I can edit WhatsApp messages. Please specify the target message ID and the new text for session \`${activeSession}\`.`;
      return {
        reply,
        spokenReply: "Message edit karne ke liye target message ID darkaar hai.",
        intent: analysis.intent,
        actionTaken: "whatsapp_edit_prompt",
        systemPrompt: buildSmartBotSystemPrompt({ intentAnalysis: analysis, language: lang }),
      };
    }

    // Check if user is asking to DELETE a message
    if (/\b(delete\s*karo|hata\s*do|mita\s*do)\b/i.test(userText)) {
      const reply =
        lang === "urdu"
          ? `Message delete (Delete for Everyone) karne ke liye mujhe target Message ID aur Chat Number batayein.\n\n• **Active Session:** \`${activeSession}\`\n• **Action:** Delete Message`
          : `To delete a message for everyone, please provide the Message ID and Chat Number for session \`${activeSession}\`.`;
      return {
        reply,
        spokenReply: "Message delete karne ke liye target message ID darkaar hai.",
        intent: analysis.intent,
        actionTaken: "whatsapp_delete_prompt",
        systemPrompt: buildSmartBotSystemPrompt({ intentAnalysis: analysis, language: lang }),
      };
    }

    // Outbound Send
    if (rawTarget) {
      const result = await sendTextMessage({
        to: rawTarget,
        text: messageToSend,
        sessionId: activeSession,
        simulateDelay: true,
      });

      const reply = result.ok
        ? lang === "urdu"
          ? `✅ **WhatsApp Message Sent!**\n\n• **Recipient:** \`${rawTarget}\`\n• **Session:** \`${activeSession}\`\n• **Message:** "${messageToSend}"\n• **Message ID:** \`${result.messageId || "delivered"}\`\n\nClient ko message deliver ho chuka hai aur record WA Logs mein save ho gaya hai.`
          : `✅ Message successfully sent to \`${rawTarget}\` via session \`${activeSession}\`!`
        : lang === "urdu"
          ? `⚠️ **Message Send Failed:** ${result.error}\n\nMeherbani farma kar check karein ke WhatsApp Sheet mein active session \`${activeSession}\` connected hai ya nahi.`
          : `⚠️ Failed to send message: ${result.error}`;

      return {
        reply,
        spokenReply: result.ok
          ? `Maine client ${rawTarget} ko WhatsApp message deliver kar diya hai.`
          : `Message bhejne mein error aaya hai.`,
        intent: analysis.intent,
        actionTaken: result.ok ? "whatsapp_message_sent" : "whatsapp_send_failed",
        systemPrompt: buildSmartBotSystemPrompt({ intentAnalysis: analysis, language: lang }),
      };
    }

    // If no target phone number found in query, search recent clients
    const clients = await findClient(messageToSend.slice(0, 15), activeSession);
    const reply =
      lang === "urdu"
        ? `Aap WhatsApp par message kis number ko bhejna chahte hain? Meherbani farma kar client ka number batayein (jaise: \`03001234567\`).\n\n• **Active Session:** \`${activeSession}\`\n• **Connected Gateway:** \`${settings.gatewayUrl}\`\n\nAap top header mein WhatsApp icon click kar ke direct chats aur sessions bhi manage kar sakte hain.`
        : `Please specify the recipient phone number (e.g. 03001234567) to send the message via session \`${activeSession}\`.`;

    return {
      reply,
      spokenReply: "Aap kis number ko WhatsApp message bhejna chahte hain?",
      intent: analysis.intent,
      actionTaken: "whatsapp_recipient_needed",
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
