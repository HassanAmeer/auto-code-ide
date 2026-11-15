import { getWhatsAppSettings, getBotMasterSheetSettings } from "./config.ts";
import { logWhatsAppEvent } from "./logger.ts";
import { sendTextMessage } from "./client.ts";

export interface OpenWAWebhookPayload {
  event?: string;
  type?: string;
  sessionId?: string;
  session?: string;
  timestamp?: string | number;
  data?: any;
  message?: any;
  [key: string]: any;
}

/**
 * Master Webhook Event Receiver from OpenWA Gateway
 */
export async function handleWhatsAppWebhook(
  payload: OpenWAWebhookPayload,
): Promise<{ ok: boolean; processed: boolean; action?: string; error?: string }> {
  const settings = getWhatsAppSettings();
  const event = payload.event || payload.type || "unknown";
  const sessionId = payload.sessionId || payload.session || settings.activeSessionId || "default";
  const data = payload.data || payload.message || payload;

  // 1. Inbound Message Received
  if (
    event === "message.create" ||
    event === "message.received" ||
    event === "message" ||
    event === "messages.upsert"
  ) {
    const msg = data.message || data;
    const from = msg.from || msg.sender || msg.chatId || "";
    const fromMe = msg.fromMe === true || msg.key?.fromMe === true;
    const body = msg.body || msg.text || msg.message?.conversation || msg.caption || "";
    const senderName = msg.senderName || msg.pushName || msg.name || from;
    const messageId = msg.id || msg.key?.id;

    // Skip our own outbound echoes here (they get logged via sendTextMessage)
    if (fromMe) {
      return { ok: true, processed: true, action: "skip_echo" };
    }

    // Log the inbound message
    logWhatsAppEvent({
      type: "inbound",
      sessionId,
      from,
      to: msg.to,
      body,
      senderName,
      messageId,
      status: "delivered",
      rawPayload: payload,
    });

    // Check if Bot is enabled and auto-reply is ON
    if (settings.botEnabled && settings.autoReply && body.trim().length > 0) {
      // Honour the Bot master-sheet settings. Before this, both were persisted
      // by the UI but completely ignored here, so every stranger got auto-replies
      // even with a primary client set and absence mode OFF.
      const masterSheet = getBotMasterSheetSettings();
      const digitsOf = (value: string) => value.replace(/@.*$/, "").replace(/\D/g, "");
      const primaryDigits = digitsOf(masterSheet.primaryClientPhone);
      if (primaryDigits) {
        const senderDigits = digitsOf(String(from));
        const isPrimary =
          senderDigits.endsWith(primaryDigits) || primaryDigits.endsWith(senderDigits.slice(-9));
        if (!isPrimary) {
          logWhatsAppEvent({
            type: "inbound",
            sessionId,
            from,
            to: msg.to,
            body,
            senderName,
            messageId,
            status: "delivered",
            error: "Ignored: sender is not the configured Primary Client Phone",
            rawPayload: payload,
          });
          return { ok: true, processed: true, action: "ignored_non_primary_sender" };
        }
      }

      try {
        // Dynamically import processSuperBotTurn to avoid circular imports
        const { processSuperBotTurn } = await import("../index.ts");
        const botTurnResult = await processSuperBotTurn({
          userText: body,
          projectName: "WhatsApp Client",
          language: "urdu",
        });

        const replyText = botTurnResult?.reply || botTurnResult?.spokenReply;
        if (replyText && replyText.trim().length > 0) {
          // In absence mode the bot answers freely; otherwise it only records
          // the inbound message so the human can reply from WhatsApp itself.
          if (!masterSheet.absenceMode) {
            logWhatsAppEvent({
              type: "inbound",
              sessionId,
              from,
              to: msg.to,
              body,
              senderName,
              messageId,
              status: "delivered",
              error: "Auto-reply skipped: Autonomous Absence Mode is OFF",
              rawPayload: payload,
            });
            return { ok: true, processed: true, action: "auto_reply_suppressed_absence_off" };
          }

          // Send response back to the client
          await sendTextMessage({
            to: from,
            text: replyText,
            sessionId,
            simulateDelay: true,
          });

          return { ok: true, processed: true, action: "auto_replied" };
        }
      } catch (err: any) {
        logWhatsAppEvent({
          type: "error",
          sessionId,
          from,
          error: `Bot auto-reply failed: ${err?.message || String(err)}`,
        });
      }
    }

    return { ok: true, processed: true, action: "inbound_recorded" };
  }

  // 2. Message Revoked / Deleted for everyone
  if (event === "message.revoked" || event === "message.delete" || event === "message_revoke") {
    const msg = data.message || data;
    logWhatsAppEvent({
      type: "delete",
      sessionId,
      from: msg.from || msg.chatId,
      messageId: msg.id || msg.messageId,
      body: "[Deleted for Everyone]",
      rawPayload: payload,
    });
    return { ok: true, processed: true, action: "revoked_recorded" };
  }

  // 3. Message Edited
  if (event === "message.edited" || event === "message.edit") {
    const msg = data.message || data;
    logWhatsAppEvent({
      type: "edit",
      sessionId,
      from: msg.from || msg.chatId,
      messageId: msg.id || msg.messageId,
      body: msg.body || msg.text || "",
      rawPayload: payload,
    });
    return { ok: true, processed: true, action: "edit_recorded" };
  }

  // 4. Session Status Events
  if (event.startsWith("session.") || event.startsWith("connection.")) {
    logWhatsAppEvent({
      type: "status",
      sessionId,
      body: `Status event: ${event} -> ${JSON.stringify(data.status || data)}`,
      rawPayload: payload,
    });
    return { ok: true, processed: true, action: "status_recorded" };
  }

  // Default record
  logWhatsAppEvent({
    type: "system",
    sessionId,
    body: `Event: ${event}`,
    rawPayload: payload,
  });

  return { ok: true, processed: true, action: "event_logged" };
}
