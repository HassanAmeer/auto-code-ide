import * as fs from "node:fs";
import * as path from "node:path";
import type { WhatsAppLogEntry } from "./types.ts";

const MAX_LOGS = 500;
const LOGS_FILE = path.resolve(process.cwd(), "userdata", "whatsapp_logs.json");

let memoryLogs: WhatsAppLogEntry[] = [];
let loaded = false;

function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    if (fs.existsSync(LOGS_FILE)) {
      const data = fs.readFileSync(LOGS_FILE, "utf-8");
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        memoryLogs = parsed.slice(0, MAX_LOGS);
      }
    }
  } catch {
    memoryLogs = [];
  }
}

function persistLogs() {
  try {
    const dir = path.dirname(LOGS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(LOGS_FILE, JSON.stringify(memoryLogs.slice(0, 200), null, 2), "utf-8");
  } catch {
    // ignore persistence errors
  }
}

export function logWhatsAppEvent(
  entry: Omit<WhatsAppLogEntry, "id" | "timestamp"> & { timestamp?: string },
): WhatsAppLogEntry {
  ensureLoaded();
  const fullEntry: WhatsAppLogEntry = {
    id: `wa_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: entry.timestamp || new Date().toISOString(),
    ...entry,
  };

  memoryLogs.unshift(fullEntry);
  if (memoryLogs.length > MAX_LOGS) {
    memoryLogs = memoryLogs.slice(0, MAX_LOGS);
  }

  persistLogs();
  return fullEntry;
}

export function getWhatsAppLogs(filter?: {
  type?: string;
  sessionId?: string;
  search?: string;
  limit?: number;
}): WhatsAppLogEntry[] {
  ensureLoaded();
  let list = memoryLogs;

  if (filter?.type && filter.type !== "all") {
    list = list.filter((l) => l.type === filter.type);
  }

  if (filter?.sessionId) {
    list = list.filter((l) => l.sessionId === filter.sessionId);
  }

  if (filter?.search) {
    const q = filter.search.toLowerCase();
    list = list.filter(
      (l) =>
        (l.body && l.body.toLowerCase().includes(q)) ||
        (l.from && l.from.toLowerCase().includes(q)) ||
        (l.to && l.to.toLowerCase().includes(q)) ||
        (l.senderName && l.senderName.toLowerCase().includes(q)) ||
        (l.messageId && l.messageId.toLowerCase().includes(q)),
    );
  }

  const limit = filter?.limit || 100;
  return list.slice(0, limit);
}

export function clearWhatsAppLogs(): void {
  memoryLogs = [];
  persistLogs();
}
