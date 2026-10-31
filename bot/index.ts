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
      listChats,
      listSessions,
      getWhatsAppSettings,
      getActivePriorityTarget,
    } = await import("./whatsapp/index.ts");

    const settings = getWhatsAppSettings();
    const activeSession = settings.activeSessionId || "default";

    // Resolve active session display name (Name & Phone Number)
    const sessions = await listSessions().catch(() => []);
    const activeSessionObj = sessions.find(
      (s) => s.id === activeSession || s.name === activeSession,
    );
    const sessionDisplayName = activeSessionObj
      ? `${activeSessionObj.name || activeSessionObj.pushName || activeSession} (${activeSessionObj.phone ? `+${activeSessionObj.phone}` : "No Phone"})`
      : activeSession;

    // Check if user is asking to EDIT a message
    if (/\b(edit\s*karo|tabdeel\s*karo|change\s*karo)\b/i.test(userText)) {
      const reply =
        lang === "urdu"
          ? `Main message edit kar sakta hoon! Message edit karne ke liye mujhe Client ka Number/ChatId aur Message ID darkaar hai.\n\n• **Active Session:** \`${sessionDisplayName}\`\n• **Action:** Edit Message\n\nAap WhatsApp Sheet ya Tester se direct 1-click edit kar sakte hain.`
          : `I can edit WhatsApp messages. Please specify the target message ID and the new text for session \`${sessionDisplayName}\`.`;
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
          ? `Message delete (Delete for Everyone) karne ke liye mujhe target Message ID aur Chat Number batayein.\n\n• **Active Session:** \`${sessionDisplayName}\`\n• **Action:** Delete Message`
          : `To delete a message for everyone, please provide the Message ID and Chat Number for session \`${sessionDisplayName}\`.`;
      return {
        reply,
        spokenReply: "Message delete karne ke liye target message ID darkaar hai.",
        intent: analysis.intent,
        actionTaken: "whatsapp_delete_prompt",
        systemPrompt: buildSmartBotSystemPrompt({ intentAnalysis: analysis, language: lang }),
      };
    }

    // Recipient & Priority Resolution
    const phoneMatch = userText.match(/(?:\+?92|0)?3\d{2}[- ]?\d{7}|\b\d{10,15}\b/);
    let rawTarget = phoneMatch ? phoneMatch[0].replace(/[- ]/g, "") : "";
    let targetName = "";
    let isTargetGroup = false;

    // 1st Priority: If no explicit phone number provided, use Selected Priority Target
    const priorityTarget = getActivePriorityTarget();
    if (!rawTarget && priorityTarget) {
      rawTarget = priorityTarget.jid;
      targetName = priorityTarget.name;
      isTargetGroup = priorityTarget.isGroup;
    }

    // 2nd Priority: Check if user mentioned any contact or group name from chats
    if (!rawTarget) {
      const allChats = await listChats(activeSession).catch(() => []);
      for (const chat of allChats) {
        if (
          chat.name &&
          chat.name.length > 2 &&
          userText.toLowerCase().includes(chat.name.toLowerCase())
        ) {
          rawTarget = chat.id;
          targetName = chat.name;
          isTargetGroup = chat.isGroup;
          break;
        }
      }
    }

    // Clean user message to extract actual text
    let messageToSend = userText
      .replace(
        /(?:whatsapp\s*(?:par|pe|karo)?|client\s*ko|is\s*(?:user|client|group|number)\s*ko|ko\s*message\s*(?:bhej|send|karo)?|message\s*send\s*karo|bhej\s*do|send\s*karo)/gi,
        "",
      )
      .replace(new RegExp(phoneMatch ? phoneMatch[0].replace(/[- ]/g, "") : "", "g"), "")
      .replace(/^[:\-\s]+/, "")
      .trim();

    if (targetName) {
      messageToSend = messageToSend
        .replace(new RegExp(targetName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "")
        .replace(/^[:\-\s]+/, "")
        .trim();
    }

    if (!messageToSend) {
      messageToSend = "Assalam-o-Alaikum! AutoJobs Bot ki taraf se message.";
    }

    // Outbound Send
    if (rawTarget) {
      const result = await sendTextMessage({
        to: rawTarget,
        text: messageToSend,
        sessionId: activeSession,
        simulateDelay: true,
      });

      const recipientLabel = targetName
        ? `${targetName} (${isTargetGroup ? "Group" : "Direct User"})`
        : `\`${rawTarget}\``;

      const reply = result.ok
        ? lang === "urdu"
          ? `✅ **WhatsApp Message Delivered!**\n\n• **Recipient:** ${recipientLabel}\n• **Active Session:** \`${sessionDisplayName}\`\n• **Message:** "${messageToSend}"\n• **Message ID:** \`${result.messageId || "delivered"}\`\n\nClient/Group ko message deliver ho chuka hai aur record WA Logs mein save ho gaya hai.`
          : `✅ Message successfully sent to ${recipientLabel} via session \`${sessionDisplayName}\`!`
        : lang === "urdu"
          ? `⚠️ **Message Send Failed:** ${result.error}\n\nMeherbani farma kar check karein ke WhatsApp Sheet mein active session \`${sessionDisplayName}\` connected hai ya nahi.`
          : `⚠️ Failed to send message: ${result.error}`;

      return {
        reply,
        spokenReply: result.ok
          ? `Maine ${targetName || rawTarget} ko WhatsApp message deliver kar diya hai.`
          : `Message bhejne mein error aaya hai.`,
        intent: analysis.intent,
        actionTaken: result.ok ? "whatsapp_message_sent" : "whatsapp_send_failed",
        systemPrompt: buildSmartBotSystemPrompt({ intentAnalysis: analysis, language: lang }),
      };
    }

    // If no target phone number and no priority target selected
    const reply =
      lang === "urdu"
        ? `Aap WhatsApp par message kis ko bhejna chahte hain?\n\n• **Active Session:** \`${sessionDisplayName}\`\n• **Connected Gateway:** \`${settings.gatewayUrl}\`\n\n💡 **Tip:** WhatsApp Sheet ke **Chats** tab mein ja kar kisi bhi User ya Group par **⭐ Select Priority** click karein. Phir Super Bot hamesha usi ko 1st priority par focus karega!`
        : `Please select a priority target in the WhatsApp Chats tab or provide a phone number to send via session \`${sessionDisplayName}\`.`;

    return {
      reply,
      spokenReply: "Aap kis number ya group ko WhatsApp message bhejna chahte hain?",
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
