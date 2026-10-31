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

  // 7. WhatsApp Action Handler - Powered by AI Thinking & Zero-Refusal Obedience
  if (analysis.intent === "WHATSAPP_ACTION") {
    const {
      sendTextMessage,
      sendMediaMessage,
      sendVoiceMessage,
      editMessage,
      deleteMessage,
      forwardMessage,
      getChatMessages,
      getLastSentState,
      findClient,
      listChats,
      listSessions,
      getWhatsAppSettings,
      getActivePriorityTarget,
      parseWhatsAppInstructionWithThinking,
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

    const allChats = await listChats(activeSession).catch(() => []);
    const priorityTarget = getActivePriorityTarget();
    const lastSent = getLastSentState();

    // Run AI Thinking & Intent Extraction with full conversation history
    const parsed = await parseWhatsAppInstructionWithThinking(userText, {
      activeSessionDisplayName: sessionDisplayName,
      activeSessionPhone: activeSessionObj?.phone,
      priorityTarget,
      knownChats: allChats,
      lastSentState: lastSent,
      conversationHistory: options.messages,
    });

    const recipientLabel = parsed.recipientName
      ? `${parsed.recipientName} (${parsed.isGroup ? "Group" : "Direct User"})`
      : parsed.recipient
        ? `\`${parsed.recipient}\``
        : "";

    // ── CASE A: ASK CLARIFICATION (User gave an instruction without the message content) ──
    if (parsed.action === "ASK_CLARIFICATION") {
      const targetHint = recipientLabel
        ? `\n• **Target:** ${recipientLabel}`
        : priorityTarget
          ? `\n• **Target:** ${priorityTarget.name} (⭐ Priority Target)`
          : "";

      const reply =
        lang === "urdu"
          ? `Aap customer ko kya message bhejna chahte hain? Meherbani farma kar message ya topic batayein (jaise Deal confirmation, Order dispatch status, Greeting, ya koi specific message), taake main professional customer-facing message draft karke bhej sakoon.${targetHint}\n• **Active Session:** \`${sessionDisplayName}\``
          : `What message would you like to send to the customer? Please provide the message content or topic so I can draft and send a professional message.${targetHint}\n• **Active Session:** \`${sessionDisplayName}\``;

      return {
        reply,
        spokenReply:
          "Aap customer ko kya message bhejna chahte hain? Meherbani karke message batayein.",
        intent: analysis.intent,
        actionTaken: "whatsapp_clarification_needed",
        systemPrompt: buildSmartBotSystemPrompt({ intentAnalysis: analysis, language: lang }),
      };
    }

    // ── CASE B: LIST MESSAGES / VIEW RECENT CHAT HISTORY ──
    if (parsed.action === "LIST_MESSAGES") {
      const messages = await getChatMessages({
        chatId: parsed.recipient || priorityTarget?.jid || undefined,
        limit: 10,
        sessionId: activeSession,
      });

      let reply = "";
      if (messages.length === 0) {
        reply =
          lang === "urdu"
            ? `Koi messages nahi mile ya chat history abhi sync nahi hui.\n\n• **Active Session:** \`${sessionDisplayName}\`\n• **Target:** ${recipientLabel || "All Chats"}`
            : `No recent messages found for ${recipientLabel || "active session"}.`;
      } else {
        const targetTitle = recipientLabel || "Recent WhatsApp Messages";
        reply = `### 💬 ${targetTitle} (Last ${messages.length})\n\n`;
        for (const m of messages.slice(0, 10)) {
          const dir = m.direction === "outgoing" ? "📤 Sent" : "📥 Received";
          const time = new Date(m.timestamp * 1000).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
          const sender = m.chatName || m.from || "Contact";
          const body = m.body || (m.type !== "text" ? `[Media: ${m.type}]` : "");
          reply += `• **[${time}] ${dir} (${sender}):** ${body}\n`;
        }
        reply += `\n*Session:* \`${sessionDisplayName}\``;
      }

      return {
        reply,
        spokenReply: `Maine recent ${messages.length} messages ki list nikal li hai.`,
        intent: analysis.intent,
        actionTaken: "whatsapp_messages_listed",
        systemPrompt: buildSmartBotSystemPrompt({ intentAnalysis: analysis, language: lang }),
      };
    }

    // ── CASE C: EXTRACT / VIEW MEDIA FILES ──
    if (parsed.action === "EXTRACT_MEDIA") {
      const messages = await getChatMessages({
        chatId: parsed.recipient || priorityTarget?.jid || undefined,
        limit: 30,
        sessionId: activeSession,
      });

      const mediaItems = messages.filter((m) => m.type !== "text" || m.media || m.mediaPath);

      let reply = "";
      if (mediaItems.length === 0) {
        reply =
          lang === "urdu"
            ? `Is chat mein koi media files (photos, audio, docs) nahi mili hain.\n\n• **Active Session:** \`${sessionDisplayName}\``
            : `No media files found in this chat for session \`${sessionDisplayName}\`.`;
      } else {
        reply = `### 📸 WhatsApp Media Files (${mediaItems.length} Found)\n\n`;
        for (const [idx, item] of mediaItems.slice(0, 10).entries()) {
          const time = new Date(item.timestamp * 1000).toLocaleString();
          reply += `**${idx + 1}. [${item.type.toUpperCase()}]** - ${time}\n`;
          if (item.media?.mimetype) {
            reply += `• Type: \`${item.media.mimetype}\`\n`;
          }
          if (item.body) {
            reply += `• Caption/Text: "${item.body}"\n`;
          }
          if (item.media?.data) {
            reply += `• Base64 Data: Available (${Math.round(item.media.data.length / 1024)} KB)\n`;
          }
          reply += "\n";
        }
      }

      return {
        reply,
        spokenReply: `Maine ${mediaItems.length} media files extract kar li hain.`,
        intent: analysis.intent,
        actionTaken: "whatsapp_media_extracted",
        systemPrompt: buildSmartBotSystemPrompt({ intentAnalysis: analysis, language: lang }),
      };
    }

    // ── CASE D: DELETE MESSAGE ──
    if (parsed.action === "DELETE") {
      const targetId = parsed.targetMessageId || lastSent?.messageId;
      const targetChat = parsed.recipient || lastSent?.chatId;

      if (!targetId || !targetChat) {
        const reply =
          lang === "urdu"
            ? `Message delete karne ke liye Message ID darkaar hai. Aap WhatsApp Sheet ke logs se message ID dekh sakte hain ya mujhe batayein.`
            : `Please provide the Message ID to delete.`;
        return {
          reply,
          spokenReply: "Message delete karne ke liye message ID darkaar hai.",
          intent: analysis.intent,
          actionTaken: "whatsapp_delete_prompt",
          systemPrompt: buildSmartBotSystemPrompt({ intentAnalysis: analysis, language: lang }),
        };
      }

      const delRes = await deleteMessage({
        chatId: targetChat,
        messageId: targetId,
        sessionId: activeSession,
      });

      const reply = delRes.ok
        ? lang === "urdu"
          ? `🗑️ **Message Successfully Deleted (For Everyone)!**\n\n• **Chat:** \`${targetChat}\`\n• **Message ID:** \`${targetId}\`\n• **Active Session:** \`${sessionDisplayName}\``
          : `🗑️ Message \`${targetId}\` successfully deleted for everyone.`
        : `⚠️ Failed to delete message: ${delRes.error}`;

      return {
        reply,
        spokenReply: delRes.ok
          ? "Message delete kar diya gaya hai."
          : "Message delete nahi ho saka.",
        intent: analysis.intent,
        actionTaken: "whatsapp_message_deleted",
        systemPrompt: buildSmartBotSystemPrompt({ intentAnalysis: analysis, language: lang }),
      };
    }

    // ── CASE E: EDIT MESSAGE ──
    if (parsed.action === "EDIT") {
      const targetId = parsed.targetMessageId || lastSent?.messageId;
      const targetChat = parsed.recipient || lastSent?.chatId;
      const newText = parsed.messageToSend;

      if (!targetId || !targetChat || !newText) {
        const reply =
          lang === "urdu"
            ? `Message edit karne ke liye naya text batayein. E.g. "message edit karke yeh kardo: Kal meeting 4 baje hogi".\n\n• **Active Session:** \`${sessionDisplayName}\``
            : `Please provide the new message text to update for session \`${sessionDisplayName}\`.`;
        return {
          reply,
          spokenReply: "Message edit karne ke liye naya text batayein.",
          intent: analysis.intent,
          actionTaken: "whatsapp_edit_prompt",
          systemPrompt: buildSmartBotSystemPrompt({ intentAnalysis: analysis, language: lang }),
        };
      }

      const editRes = await editMessage({
        chatId: targetChat,
        messageId: targetId,
        newText,
        sessionId: activeSession,
      });

      const reply = editRes.ok
        ? lang === "urdu"
          ? `✏️ **Message Successfully Edited!**\n\n• **Chat:** \`${targetChat}\`\n• **Updated Text:** "${newText}"\n• **Message ID:** \`${targetId}\`\n• **Active Session:** \`${sessionDisplayName}\``
          : `✏️ Message updated to: "${newText}"`
        : `⚠️ Failed to edit message: ${editRes.error}`;

      return {
        reply,
        spokenReply: editRes.ok ? "Message edit kar diya gaya hai." : "Message edit nahi ho saka.",
        intent: analysis.intent,
        actionTaken: "whatsapp_message_edited",
        systemPrompt: buildSmartBotSystemPrompt({ intentAnalysis: analysis, language: lang }),
      };
    }

    // ── CASE F: SCHEDULE MESSAGE ──
    if (parsed.action === "SCHEDULE") {
      const { createScheduledWhatsAppTask } = await import("./whatsapp/index.ts");
      const schedMsg = messageToSend || "Assalam-o-Alaikum! Scheduled message from AutoJobs.";
      const target = targetRecipient;

      if (!target) {
        const reply =
          lang === "urdu"
            ? `Aap kis number ya group ke liye message schedule karna chahte hain? Meherbani karke recipient batayein.`
            : `Please specify the recipient for this scheduled message.`;
        return {
          reply,
          spokenReply: "Aap kis recipient ke liye message schedule karna chahte hain?",
          intent: analysis.intent,
          actionTaken: "whatsapp_recipient_needed",
          systemPrompt: buildSmartBotSystemPrompt({ intentAnalysis: analysis, language: lang }),
        };
      }

      const task = createScheduledWhatsAppTask({
        recipient: target,
        recipientName: parsed.recipientName,
        isGroup: parsed.isGroup,
        messageType: "text",
        messageText: schedMsg,
        scheduledTime: parsed.scheduledTime || "Tomorrow 10:00 AM",
        scheduledTimestamp: parsed.scheduledTimestamp || Date.now() + 3600 * 1000 * 12,
        sessionId: activeSession,
      });

      const reply =
        lang === "urdu"
          ? `📅 **WhatsApp Message Scheduled Successfully!**\n\n• **Recipient:** ${recipientLabel || `\`${target}\``}\n• **Scheduled Delivery Time:** **${task.scheduledTime}**\n• **Message:** "${task.messageText}"\n• **Task ID:** \`${task.id}\`\n\nYeh scheduled message right-side sheet ke **Tasks** tab mein list ho gaya hai. Muqarrara waqt par bot isey khud ba khud deliver kar dega.`
          : `📅 **WhatsApp Message Scheduled Successfully!**\n\n• **Recipient:** ${recipientLabel || target}\n• **Scheduled Time:** **${task.scheduledTime}**\n• **Message:** "${task.messageText}"\n• **Task ID:** \`${task.id}\`\n\nViewable under the Tasks tab in the right-side sheet.`;

      return {
        reply,
        spokenReply: `Maine ${recipientLabel || target} ke liye message schedule kar diya hai.`,
        intent: analysis.intent,
        actionTaken: "whatsapp_message_scheduled",
        systemPrompt: buildSmartBotSystemPrompt({ intentAnalysis: analysis, language: lang }),
      };
    }

    // ── CASE G: SEND OR RESEND (Zero Refusal, Repeat up to 10+ times) ──
    const targetRecipient = parsed.recipient || lastSent?.to || priorityTarget?.jid;
    const messageToSend = parsed.messageToSend || lastSent?.text;

    if (!targetRecipient) {
      const reply =
        lang === "urdu"
          ? `Aap WhatsApp par message kis ko bhejna chahte hain?\n\n• **Active Session:** \`${sessionDisplayName}\`\n• **Connected Gateway:** \`${settings.gatewayUrl}\`\n\n💡 **Tip:** WhatsApp Sheet ke **Chats** tab mein ja kar kisi bhi User ya Group par **⭐ Select Priority** click karein. Phir Super Bot hamesha usi ko 1st priority par focus karega!`
          : `Please specify a phone number or select a priority target in the WhatsApp Chats tab to send via session \`${sessionDisplayName}\`.`;

      return {
        reply,
        spokenReply: "Aap kis number ya group ko WhatsApp message bhejna chahte hain?",
        intent: analysis.intent,
        actionTaken: "whatsapp_recipient_needed",
        systemPrompt: buildSmartBotSystemPrompt({ intentAnalysis: analysis, language: lang }),
      };
    }

    if (!messageToSend) {
      const reply =
        lang === "urdu"
          ? `Aap ${recipientLabel || targetRecipient} ko kya message bhejna chahte hain? Meherbani karke message batayein taake main send kar sakoon.`
          : `Please specify the message text to send to ${recipientLabel || targetRecipient}.`;
      return {
        reply,
        spokenReply: "Aap kya message bhejna chahte hain?",
        intent: analysis.intent,
        actionTaken: "whatsapp_clarification_needed",
        systemPrompt: buildSmartBotSystemPrompt({ intentAnalysis: analysis, language: lang }),
      };
    }

    // Execute Outbound Send (Every single time requested, zero refusal!)
    const sendResult = await sendTextMessage({
      to: targetRecipient,
      text: messageToSend,
      sessionId: activeSession,
      simulateDelay: true,
    });

    const isResend = parsed.action === "RESEND" || parsed.isRepeatRequest;
    const actionTitle = isResend ? "Dobara (Resend)" : "";

    const reply = sendResult.ok
      ? lang === "urdu"
        ? `✅ **WhatsApp Message ${actionTitle} Delivered!**\n\n• **Recipient:** ${recipientLabel || `\`${targetRecipient}\``}\n• **Active Session:** \`${sessionDisplayName}\`\n• **Delivered Message:** "${messageToSend}"\n• **Message ID:** \`${sendResult.messageId || "delivered"}\`\n\nClient ko message deliver ho chuka hai aur record WA Logs mein save ho gaya hai.`
        : `✅ Message ${actionTitle} successfully sent to ${recipientLabel || targetRecipient} via session \`${sessionDisplayName}\`!`
      : lang === "urdu"
        ? `⚠️ **Message Send Failed:** ${sendResult.error}\n\nMeherbani farma kar check karein ke WhatsApp Sheet mein active session \`${sessionDisplayName}\` connected hai ya nahi.`
        : `⚠️ Failed to send message: ${sendResult.error}`;

    return {
      reply,
      spokenReply: sendResult.ok
        ? `Maine ${recipientLabel || targetRecipient} ko WhatsApp message ${isResend ? "dobara " : ""}deliver kar diya hai.`
        : `Message bhejne mein error aaya hai.`,
      intent: analysis.intent,
      actionTaken: sendResult.ok ? "whatsapp_message_sent" : "whatsapp_send_failed",
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
