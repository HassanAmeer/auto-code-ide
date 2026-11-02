export interface BotAttachment {
  type: "file" | "folder";
  name: string;
  path: string;
  content?: string | undefined;
  size?: string | undefined;
}

let currentAttachment: BotAttachment | null = null;
const listeners = new Set<(attachment: BotAttachment | null) => void>();

export function setBotAttachment(attachment: BotAttachment | null): void {
  currentAttachment = attachment;
  if (typeof window !== "undefined") {
    if (attachment) {
      try {
        sessionStorage.setItem("autocode_bot_attachment", JSON.stringify(attachment));
      } catch {
        // Ignore storage write errors
      }
    } else {
      try {
        sessionStorage.removeItem("autocode_bot_attachment");
      } catch {
        // Ignore storage removal errors
      }
    }
  }
  listeners.forEach((fn) => fn(currentAttachment));
}

export function getBotAttachment(): BotAttachment | null {
  if (currentAttachment) return currentAttachment;
  if (typeof window !== "undefined") {
    try {
      const raw = sessionStorage.getItem("autocode_bot_attachment");
      if (raw) {
        currentAttachment = JSON.parse(raw);
        return currentAttachment;
      }
    } catch {
      // Ignore parse errors
    }
  }
  return null;
}

export function subscribeBotAttachment(fn: (attachment: BotAttachment | null) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
