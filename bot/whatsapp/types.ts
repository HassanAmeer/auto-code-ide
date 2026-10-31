export interface WhatsAppSession {
  id: string;
  name?: string;
  pushName?: string;
  status:
    | "CONNECTED"
    | "STARTING"
    | "SCAN_QR"
    | "AUTHENTICATED"
    | "STOPPED"
    | "FAILED"
    | "UNKNOWN"
    | "ready";
  engine?: string;
  phone?: string | null;
  me?: {
    id?: string;
    name?: string;
    phone?: string;
  };
  connectedAt?: string;
  lastActive?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface WhatsAppChat {
  id: string;
  name: string;
  isGroup: boolean;
  kind?: "group" | "individual" | "channel" | string;
  unreadCount?: number;
  phone?: string;
  timestamp?: number;
  lastMessage?: string;
  lastMessageType?: string;
}

export interface WhatsAppPriorityTarget {
  jid: string;
  name: string;
  isGroup: boolean;
  phone?: string;
  selectedAt?: string;
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
  priorityTargets?: WhatsAppPriorityTarget[] | undefined;
  activePriorityJid?: string | null | undefined;
}
