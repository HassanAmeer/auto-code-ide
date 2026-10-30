export interface WhatsAppSession {
  id: string;
  name?: string;
  status: "CONNECTED" | "STARTING" | "SCAN_QR" | "AUTHENTICATED" | "STOPPED" | "FAILED" | "UNKNOWN";
  engine?: string;
  phone?: string | null;
  me?: {
    id?: string;
    name?: string;
    phone?: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface WhatsAppLogEntry {
  id: string;
  timestamp: string;
  type: "inbound" | "outbound" | "edit" | "delete" | "status" | "error" | "system";
  sessionId: string;
  from?: string;
  to?: string;
  body?: string;
  caption?: string;
  mediaUrl?: string;
  mediaType?: "image" | "video" | "audio" | "document" | "voice";
  messageId?: string;
  status?: "pending" | "sent" | "delivered" | "read" | "revoked" | "failed";
  error?: string;
  senderName?: string;
  chatName?: string;
  rawPayload?: Record<string, unknown>;
}

export interface WhatsAppSettings {
  botEnabled: boolean;
  autoReply: boolean;
  mediaEnabled: boolean;
  voiceNotesEnabled: boolean;
  gatewayUrl: string;
  apiKey: string;
  activeSessionId: string | null;
  humanDelayMs: number;
}
