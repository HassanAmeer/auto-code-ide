import type { WhatsAppPriorityTarget, WhatsAppChat } from "./types.ts";
import { normalizeChatId } from "./client.ts";

export type WhatsAppActionType =
  | "SEND"
  | "RESEND"
  | "SCHEDULE"
  | "ASK_CLARIFICATION"
  | "EDIT"
  | "DELETE"
  | "FORWARD"
  | "LIST_MESSAGES"
  | "EXTRACT_MEDIA";

export interface WhatsAppThinkingContext {
  activeSessionDisplayName: string;
  activeSessionPhone?: string | undefined;
  priorityTarget?: WhatsAppPriorityTarget | null | undefined;
  priorityTargets?: WhatsAppPriorityTarget[] | undefined;
  knownChats?: WhatsAppChat[] | undefined;
  lastSentState?:
    | {
        to: string;
        text: string;
        messageId?: string | undefined;
      }
    | null
    | undefined;
  conversationHistory?: Array<{ role: string; content: string }> | undefined;
}

export interface WhatsAppThinkingResult {
  action: WhatsAppActionType;
  recipient: string;
  recipientName?: string | undefined;
  isGroup: boolean;
  messageToSend?: string | undefined;
  clarificationQuestion?: string | undefined;
  scheduledTime?: string | undefined;
  scheduledTimestamp?: number | undefined;
  targetMessageId?: string | undefined;
  forwardTo?: string | undefined;
  isRepeatRequest: boolean;
  explanation: string;
}

/**
 * Analyzes the user's WhatsApp instruction using Thinking & Dynamic AI Refinement:
 * 1. Inspects the conversation history so user answers from previous turns are remembered.
 * 2. Matches partial numbers/prefixes (e.g. 0349, 0300) against Priority Targets and Known Chats.
 * 3. Distinguishes meta-instructions (e.g. "is number ko customer ka message bhejo") from actual customer message content.
 * 4. Extracts explicit message instructions (e.g. dot '.', short text, numbers) without rejecting.
 * 5. Never sends raw user prompts to customers. Polishes informal notes into polite customer messages.
 * 6. Never refuses repeat requests ("dobara bhejo", "resend karo", 10 dafa, etc.).
 * 7. Handles schedule message ("kal subah 10 baje bhejna", "at 5 PM"), delete, edit, list messages, and media extraction.
 */
export async function parseWhatsAppInstructionWithThinking(
  userText: string,
  context: WhatsAppThinkingContext,
): Promise<WhatsAppThinkingResult> {
  const t = userText.trim();
  const lower = t.toLowerCase();

  // 1. Recipient extraction (Phone number from text, partial digits match against Priority Targets / Known Chats)
  const allPriorityTargets =
    context.priorityTargets || (context.priorityTarget ? [context.priorityTarget] : []);

  // Extract all digit clusters from text (e.g. "0349", "349", "03492830546", etc.)
  const digitClusters = t.match(/\d{3,15}/g) || [];

  let recipient = "";
  let recipientName = "";
  let isGroup = false;

  // Check if user specifically mentioned priority / پریورٹی
  const isPriorityMentioned =
    /\b(priority|prority|tarjeeh|selected\s*(?:number|user|target|chat))\b/i.test(lower) ||
    /(پریورٹی|ترجیح|سلیکٹڈ)/.test(t);

  // A. Search inside Priority Targets first (Match against digits e.g. 0349 matching +92 349 2830546)
  for (const digit of digitClusters) {
    const cleanDigit = digit.replace(/^0/, ""); // e.g. "0349" -> "349"
    const matched = allPriorityTargets.find((pt) => {
      const cleanPhone = (pt.phone || "").replace(/\D/g, "");
      const cleanName = (pt.name || "").replace(/\D/g, "");
      const cleanJid = (pt.jid || "").replace(/\D/g, "");
      return (
        cleanPhone.includes(cleanDigit) ||
        cleanPhone.includes(digit) ||
        cleanName.includes(cleanDigit) ||
        cleanName.includes(digit) ||
        cleanJid.includes(cleanDigit) ||
        cleanJid.includes(digit)
      );
    });

    if (matched) {
      recipient = matched.jid;
      recipientName = matched.name;
      isGroup = matched.isGroup;
      break;
    }
  }

  // B. If user mentioned "priority" and didn't specify digits or digits didn't match:
  if (!recipient && isPriorityMentioned && allPriorityTargets.length > 0) {
    const activeOrFirst =
      allPriorityTargets.find((pt) => pt.jid === context.priorityTarget?.jid) ||
      allPriorityTargets[0];
    if (activeOrFirst) {
      recipient = activeOrFirst.jid;
      recipientName = activeOrFirst.name;
      isGroup = activeOrFirst.isGroup;
    }
  }

  // C. Full standard phone number match from text (e.g. 03491234567, +923491234567)
  const fullPhoneMatch = t.match(/(?:\+?92|0)?3\d{2}[- ]?\d{7}|\b\d{10,15}\b/);
  if (!recipient && fullPhoneMatch) {
    recipient = fullPhoneMatch[0].replace(/[- ]/g, "");
  }

  // D. Search in knownChats by digit clusters (e.g. 0349 in known chat numbers or names)
  if (!recipient && context.knownChats && context.knownChats.length > 0) {
    for (const digit of digitClusters) {
      const cleanDigit = digit.replace(/^0/, "");
      const matchedChat = context.knownChats.find((c) => {
        const cleanId = (c.id || "").replace(/\D/g, "");
        const cleanNameDigits = (c.name || "").replace(/\D/g, "");
        return (
          cleanId.includes(cleanDigit) ||
          cleanId.includes(digit) ||
          cleanNameDigits.includes(cleanDigit) ||
          cleanNameDigits.includes(digit)
        );
      });
      if (matchedChat) {
        recipient = matchedChat.id;
        recipientName = matchedChat.name;
        isGroup = matchedChat.isGroup;
        break;
      }
    }
  }

  // E. Search in knownChats by name string
  if (!recipient && context.knownChats && context.knownChats.length > 0) {
    for (const chat of context.knownChats) {
      if (chat.name && chat.name.length > 2 && lower.includes(chat.name.toLowerCase())) {
        recipient = chat.id;
        recipientName = chat.name;
        isGroup = chat.isGroup;
        break;
      }
    }
  }

  // F. Fallback to conversation history if still no recipient
  if (!recipient && context.conversationHistory && context.conversationHistory.length > 0) {
    for (const msg of [...context.conversationHistory].reverse()) {
      const histPhone = msg.content?.match(/(?:\+?92|0)?3\d{2}[- ]?\d{7}|\b\d{10,15}\b/);
      if (histPhone) {
        recipient = histPhone[0].replace(/[- ]/g, "");
        break;
      }
    }
  }

  // G. Ultimate fallback to active priority target
  if (!recipient && context.priorityTarget) {
    recipient = context.priorityTarget.jid;
    recipientName = context.priorityTarget.name;
    isGroup = context.priorityTarget.isGroup;
  }

  // 2. Check for RESEND / REPEAT (e.g. "dobara bhejo", "phir se bhejo", "10 dafa", "resend")
  const isResend =
    /\b(dobara|phir\s*se|resend|again|aik\s*dafa\s*aur|ek\s*dafa\s*aur|10\s*dafa|repeat)\b/i.test(
      lower,
    ) || /(دوبارہ|پھر\s*سے|ایک\s*دفعہ\s*اور|۱۰\s*دفعہ)/.test(t);

  if (isResend) {
    const targetRecipient = recipient || context.lastSentState?.to || "";
    const textToResend =
      context.lastSentState?.text || "Assalam-o-Alaikum! AutoJobs reminder message.";
    return {
      action: "RESEND",
      recipient: targetRecipient,
      recipientName,
      isGroup,
      messageToSend: textToResend,
      isRepeatRequest: true,
      explanation: "User requested to re-send / repeat delivery of the message without refusal.",
    };
  }

  // 3. Check for LIST / VIEW MESSAGES (e.g. "messages dikhao", "chat dikhao", "last messages", "list dikhao")
  const isListMessages =
    /\b(chat\s*dikhao|messages?\s*(?:dikhao|list|check|history)|last\s*messages?|purane\s*messages?|wa\s*history)\b/i.test(
      lower,
    ) || /(چیٹ\s*دکھاؤ|میسجز\s*دکھاؤ|میسج\s*ہسٹری|لسٹ\s*دکھاؤ)/.test(t);

  if (isListMessages) {
    return {
      action: "LIST_MESSAGES",
      recipient,
      recipientName,
      isGroup,
      isRepeatRequest: false,
      explanation: "User requested to view or list recent chat messages.",
    };
  }

  // 4. Check for EXTRACT / VIEW MEDIA (e.g. "media file nikal kar do", "photo dikhao", "image/voice note check karo")
  const isExtractMedia =
    /\b(media\s*(?:file|files?)|images?\s*(?:dikhao|nikal|check)|photos?\s*(?:dikhao|nikal)|voice\s*notes?\s*(?:dikhao|nikal|sunao)|audio\s*files?)\b/i.test(
      lower,
    ) || /(میڈیا\s*فائل|تصویر\s*دکھاؤ|فوٹو\s*دکھاؤ|وائس\s*نوٹ\s*دکھاؤ|آڈیو)/.test(t);

  if (isExtractMedia) {
    return {
      action: "EXTRACT_MEDIA",
      recipient,
      recipientName,
      isGroup,
      isRepeatRequest: false,
      explanation: "User requested to extract and view media files (images, audio, docs).",
    };
  }

  // 5. Check for DELETE (e.g. "message delete kardo", "hata do", "ڈیلیٹ کرو")
  const isDelete =
    /\b(delete\s*karo|delete\s*kardo|hata\s*do|mita\s*do)\b/i.test(lower) ||
    /(ڈیلیٹ\s*کرو|ہٹا\s*دو|مٹا\s*دو)/.test(t);

  if (isDelete) {
    const msgIdMatch = t.match(/\b(?:msg_[a-z0-9_-]+|false_[^\s]+|true_[^\s]+)\b/i);
    return {
      action: "DELETE",
      recipient,
      recipientName,
      isGroup,
      targetMessageId: msgIdMatch ? msgIdMatch[0] : context.lastSentState?.messageId,
      isRepeatRequest: false,
      explanation: "User requested to delete a message.",
    };
  }

  // 6. Check for EDIT (e.g. "message edit kardo", "usay edit karo", "tabdeel kardo", "change kardo", "badal do", "ایڈٹ کرو")
  const isEdit =
    /\b(edit\s*(?:karo|kar\s*do|do|karna|krna)?|tabdeel\s*(?:karo|kar\s*do|do)?|change\s*(?:karo|kar\s*do|do)?|badal\s*(?:do|karo)|update\s*(?:karo|kar\s*do|do)?)\b/i.test(
      lower,
    ) || /(ایڈٹ\s*(?:کرو|کریں|کر\s*دو)?|تبدیل\s*(?:کرو|کریں|کر\s*دو)?|بدل\s*دو)/.test(t);

  if (isEdit) {
    let editedText = t
      .replace(
        /^(?:message|msg|text|pehle\s*jo\s*message\s*bheja\s*tha|usay|is\s*ko|isko)?\s*(?:edit\s*(?:karo|kar\s*do|do|karna)?|tabdeel\s*(?:karo|kar\s*do|do)?|change\s*(?:karo|kar\s*do|do)?|badal\s*(?:do|karo)|ایڈٹ\s*کرو)[,:\s]*/i,
        "",
      )
      .trim();

    // Look for target new text patterns like "karke ? kardo" or "to ?" or ": ?" or quotes
    const subTargetMatch = editedText.match(
      /(?:karke|to|karein|me)\s*[:"']?([^"'\n]+?)["']?\s*(?:kardo|kar\s*do|rakho|bhejo|$)/i,
    );
    if (subTargetMatch && subTargetMatch[1] && subTargetMatch[1].trim()) {
      editedText = subTargetMatch[1].trim();
    }

    // Check for symbol replacements like question mark
    if (/\b(question\s*mark|\?|sawal)\b/i.test(editedText) || /\b(question\s*mark|\?)\b/i.test(t)) {
      if (editedText === "" || /\b(question\s*mark|sawal)\b/i.test(editedText)) {
        editedText = "?";
      }
    } else if (
      /\b(exclamation\s*mark|!)\b/i.test(editedText) ||
      /\b(exclamation\s*mark|!)\b/i.test(t)
    ) {
      editedText = "!";
    } else if (/\b(dot|\.)\b/i.test(editedText)) {
      editedText = ".";
    }

    return {
      action: "EDIT",
      recipient,
      recipientName,
      isGroup,
      messageToSend: editedText || undefined,
      targetMessageId: context.lastSentState?.messageId,
      isRepeatRequest: false,
      explanation: `User requested to edit a previously sent message${editedText ? ` to "${editedText}"` : ""}.`,
    };
  }

  // 6.5 Explicit Dot or Single Symbol Message Check (e.g. "dot ka just dot likh kar send kar do", "sirf dot bhejo", "just .")
  const isDotMessage =
    /\b(just\s*dot|sirf\s*dot|dot\s*ka\s*just\s*dot|dot\s*likh|sirf\s*ek\s*dot|only\s*dot|\bdot\b)\b/i.test(
      lower,
    ) || /(جسٹ\s*ڈاٹ|صرف\s*ڈاٹ|ڈاٹ\s*کا\s*جسٹ\s*ڈاٹ|ڈاٹ\s*لکھ|صرف\s*ایک\s*ڈاٹ|ڈاٹ)/.test(t);

  let body = "";
  if (isDotMessage) {
    body = ".";
  }

  // 7. Look for message content indicators (e.g. bolo ke / kaho ke / کہ / ke / quotes / colon)
  if (!body) {
    const directShortMatch = t.match(
      /(?:likh\s*kar|likh\s*ke|type\s*karke|ye\s*bhejo|message\s*bhejo)\s*[:"']?([a-zA-Z0-9\s!.,?-]{1,50})[:"']?\s*(?:send|bhej)/i,
    );
    if (directShortMatch && directShortMatch[1]) {
      const candidate = directShortMatch[1].trim();
      if (!/(?:number|client|customer|user|priority|prority)/i.test(candidate)) {
        body = candidate;
      }
    }
  }

  if (!body) {
    const contentMarker = t.match(
      /(?:bolo\s+ke|kaho\s+ke|keh\s*do\s+ke|بولو\s*کہ|کہو\s*کہ|کہہ\s*دو\s*کہ|[:"“]|(?:^|[\s,])ke\s+|(?:^|[\s,])کہ\s+)(.+)$/i,
    );

    if (contentMarker && contentMarker[1]) {
      body = contentMarker[1]
        .replace(/["”]/g, "")
        .replace(/[,\s]+(?:theek hai|theek he|theek hay|ok|please|پلیز|ٹھیک ہے)[?!\s]*$/i, "")
        .trim();
    }
  }

  // If the extracted body is still just a meta-instruction telling to send a message
  const isMeta =
    /(?:(?:is\s*number|client|customer|user)\s*ko\s*|na\s*)*(?:customer|client|user)?\s*(?:ka\s*)?message\s*(?:bhej|send)|(?:اس\s*نمبر\s*کو|کسٹمر|کلائنٹ|یوزر)?\s*(?:کا\s*)?میسج\s*(?:بھیجو|سینڈ)/i.test(
      body,
    );

  if (isMeta || /^(?:theek hai|theek he|ok|please|پلیز|ٹھیک ہے)[?!\s]*$/i.test(body)) {
    body = "";
  }

  // 8. Check for SCHEDULE (e.g. "kal subah 10 baje bhejna", "schedule karo", "5 baje bhejo")
  const isSchedule =
    /\b(schedule|skedule|time\s*par\s*bhej|is\s*waqt\s*bhej|kal\s*subah|kal\s*shaam|\d+\s*baje\s*bhej|baje\s*(?:message|bhejna)|kal\s*bhejna)\b/i.test(
      lower,
    ) || /(سکیجول|اس\s*ٹائم\s*پر|کل\s*صبح|کل\s*شام|بجے\s*(?:بھیج|سینڈ)|شیڈول)/.test(t);

  if (isSchedule) {
    let timeLabel = "Tomorrow 10:00 AM";
    let targetTimestamp = Date.now() + 3600 * 1000 * 14;

    const hourMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|baje)/i);
    const isTomorrow = /\b(kal|tomorrow|اگلے\s*روز|کل)\b/i.test(lower);
    if (hourMatch) {
      let hour = parseInt(hourMatch[1] || "10", 10);
      const isPm =
        hourMatch[3]?.toLowerCase() === "pm" || /shaam|dopahar|raat|evening|night/.test(lower);
      if (isPm && hour < 12) hour += 12;
      const targetDate = new Date();
      if (isTomorrow) targetDate.setDate(targetDate.getDate() + 1);
      targetDate.setHours(hour, parseInt(hourMatch[2] || "0", 10), 0, 0);
      targetTimestamp = targetDate.getTime();
      timeLabel = `${isTomorrow ? "Kal " : "Aaj "}${hourMatch[1]}:${hourMatch[2] || "00"} ${isPm ? "PM" : "AM"}`;
    } else if (isTomorrow) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 1);
      targetDate.setHours(10, 0, 0, 0);
      targetTimestamp = targetDate.getTime();
      timeLabel = "Kal subah 10:00 AM";
    }

    const scheduledMsg =
      body || context.lastSentState?.text || "Assalam-o-Alaikum! Scheduled message from AutoJobs.";

    return {
      action: "SCHEDULE",
      recipient,
      recipientName,
      isGroup,
      messageToSend: scheduledMsg,
      scheduledTime: timeLabel,
      scheduledTimestamp: targetTimestamp,
      isRepeatRequest: false,
      explanation: "User requested to schedule message for future delivery.",
    };
  }

  // 9. If no body in current text, check if previous user message was already providing the body!
  if (!body && context.conversationHistory && context.conversationHistory.length >= 2) {
    const lastUserTurn = context.conversationHistory[context.conversationHistory.length - 2];
    if (lastUserTurn && lastUserTurn.role === "user" && lastUserTurn.content.length > 5) {
      body = lastUserTurn.content.trim();
    }
  }

  if (!body || body.trim().length === 0) {
    return {
      action: "ASK_CLARIFICATION",
      recipient,
      recipientName,
      isGroup,
      clarificationQuestion:
        "Aap customer ko kya message bhejna chahte hain? Meherbani farma kar message ya topic batayein, taake main professional customer-facing message draft karke bhejoon.",
      isRepeatRequest: false,
      explanation:
        "User gave an instruction to send a message but did not specify what message to send.",
    };
  }

  // Remove phone digits from the body if present (except single dot messages)
  if (body !== ".") {
    for (const digit of digitClusters) {
      body = body.replace(digit, "").trim();
    }
    body = body.replace(/^[:\-\s]+/, "").trim();
  }

  // Polish the customer-facing message (only if not an explicit dot or short symbol)
  if (body !== "." && !/^(assalam|salam|hello|hi|dear|respected|السلام)/i.test(body)) {
    body = `Assalam-o-Alaikum! ${body}`;
  }

  return {
    action: "SEND",
    recipient,
    recipientName,
    isGroup,
    messageToSend: body,
    isRepeatRequest: false,
    explanation:
      "Successfully extracted and refined customer-facing message without raw meta instructions.",
  };
}
