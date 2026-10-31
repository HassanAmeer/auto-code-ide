import type { WhatsAppPriorityTarget, WhatsAppChat } from "./types.ts";
import { normalizeChatId } from "./client.ts";

export type WhatsAppActionType =
  | "SEND"
  | "RESEND"
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
  knownChats?: WhatsAppChat[] | undefined;
  lastSentState?:
    | {
        to: string;
        text: string;
        messageId?: string | undefined;
      }
    | null
    | undefined;
}

export interface WhatsAppThinkingResult {
  action: WhatsAppActionType;
  recipient: string;
  recipientName?: string | undefined;
  isGroup: boolean;
  messageToSend?: string | undefined;
  clarificationQuestion?: string | undefined;
  targetMessageId?: string | undefined;
  forwardTo?: string | undefined;
  isRepeatRequest: boolean;
  explanation: string;
}

/**
 * Analyzes the user's WhatsApp instruction using Thinking & Intent Refinement:
 * 1. Distinguishes meta-instructions (e.g. "is number ko customer ka message bhejo") from actual customer message content.
 * 2. If the user only gave an instruction without the message, asks for clarification.
 * 3. Never sends raw user prompts to customers. Polishes informal notes into polite customer messages.
 * 4. Never refuses repeat requests ("dobara bhejo", "resend karo", 10 dafa, etc.).
 * 5. Handles delete, edit, list messages, and media extraction.
 */
export async function parseWhatsAppInstructionWithThinking(
  userText: string,
  context: WhatsAppThinkingContext,
): Promise<WhatsAppThinkingResult> {
  const t = userText.trim();
  const lower = t.toLowerCase();

  // 1. Recipient extraction (Phone number from text, chat name match, or Priority Target)
  const phoneMatch = t.match(/(?:\+?92|0)?3\d{2}[- ]?\d{7}|\b\d{10,15}\b/);
  let recipient = phoneMatch ? phoneMatch[0].replace(/[- ]/g, "") : "";
  let recipientName = "";
  let isGroup = false;

  // Match chat names from known chats if no raw phone in prompt
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

  // Fallback to active priority target if no target specified in text
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

  // 6. Check for EDIT (e.g. "message edit kardo", "tabdeel kardo", "ایڈٹ کرو")
  const isEdit =
    /\b(edit\s*karo|tabdeel\s*karo|change\s*karo)\b/i.test(lower) ||
    /(ایڈٹ\s*کرو|تبدیل\s*کرو)/.test(t);

  if (isEdit) {
    const editedText = t
      .replace(
        /^(?:message\s*)?(?:edit\s*karo|tabdeel\s*karo|change\s*karo|ایڈٹ\s*کرو)[,:\s]*/i,
        "",
      )
      .trim();

    return {
      action: "EDIT",
      recipient,
      recipientName,
      isGroup,
      messageToSend: editedText || undefined,
      targetMessageId: context.lastSentState?.messageId,
      isRepeatRequest: false,
      explanation: "User requested to edit a previously sent message.",
    };
  }

  // 7. Look for message content indicators (e.g. bolo ke / kaho ke / کہ / ke / quotes / colon)
  const contentMarker = t.match(
    /(?:bolo\s+ke|kaho\s+ke|keh\s*do\s+ke|بولو\s*کہ|کہو\s*کہ|کہہ\s*دو\s*کہ|[:"“]|(?:^|[\s,])ke\s+|(?:^|[\s,])کہ\s+)(.+)$/i,
  );

  if (!contentMarker || !contentMarker[1] || contentMarker[1].trim().length < 4) {
    return {
      action: "ASK_CLARIFICATION",
      recipient,
      recipientName,
      isGroup,
      clarificationQuestion:
        "Aap customer ko kya message bhejna chahte hain? Meherbani farma kar message ya topic batayein (jaise Deal confirmation, Order dispatch status, Greeting, ya koi specific message), taake main professional customer-facing message draft karke bhejoon.",
      isRepeatRequest: false,
      explanation:
        "User gave an instruction to send a message but did not specify what message to send.",
    };
  }

  let body = contentMarker[1]
    .replace(/["”]/g, "")
    .replace(/[,\s]+(?:theek hai|theek he|theek hay|ok|please|پلیز|ٹھیک ہے)[?!\s]*$/i, "")
    .trim();

  // If the extracted body is still just a meta-instruction telling to send a message
  const isMeta =
    /(?:(?:is\s*number|client|customer|user)\s*ko\s*|na\s*)*(?:customer|client|user)?\s*(?:ka\s*)?message\s*(?:bhej|send)|(?:اس\s*نمبر\s*کو|کسٹمر|کلائنٹ|یوزر)?\s*(?:کا\s*)?میسج\s*(?:بھیجو|سینڈ)/i.test(
      body,
    );

  if (
    isMeta ||
    /^(?:theek hai|theek he|ok|please|پلیز|ٹھیک ہے)[?!\s]*$/i.test(body) ||
    body.length < 4
  ) {
    return {
      action: "ASK_CLARIFICATION",
      recipient,
      recipientName,
      isGroup,
      clarificationQuestion:
        "Aap customer ko kya message bhejna chahte hain? Meherbani farma kar message ya topic batayein (jaise Deal confirmation, Order dispatch status, Greeting, ya koi specific message), taake main professional customer-facing message draft karke bhejoon.",
      isRepeatRequest: false,
      explanation: "No actual customer content found; prompt consisted only of meta instructions.",
    };
  }

  // Remove phone digits from the body if present
  if (phoneMatch) {
    body = body
      .replace(phoneMatch[0], "")
      .replace(/^[:\-\s]+/, "")
      .trim();
  }

  // Polish the customer-facing message
  if (!/^(assalam|salam|hello|hi|dear|respected|السلام)/i.test(body)) {
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
