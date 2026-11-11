import * as fs from "node:fs";
import * as path from "node:path";
import type { WhatsAppSettings } from "./types.ts";

const SETTINGS_FILE = path.resolve(process.cwd(), "userdata", "whatsapp_settings.json");

const DEFAULT_SETTINGS: WhatsAppSettings = {
  botEnabled: true,
  autoReply: true,
  mediaEnabled: true,
  voiceNotesEnabled: true,
  gatewayUrl: process.env.OPENWA_GATEWAY_URL || "",
  apiKey: process.env.OPENWA_API_KEY || "",
  activeSessionId: null,
  humanDelayMs: 2500,
  priorityTargets: [],
  activePriorityJid: null,
};

let cachedSettings: WhatsAppSettings | null = null;

export function getWhatsAppSettings(): WhatsAppSettings {
  if (cachedSettings) return cachedSettings;
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, "utf-8");
      const parsed = JSON.parse(data);
      cachedSettings = { ...DEFAULT_SETTINGS, ...parsed };
      return cachedSettings!;
    }
  } catch {
    // fallback
  }
  cachedSettings = { ...DEFAULT_SETTINGS };
  return cachedSettings;
}

export function updateWhatsAppSettings(updates: Partial<WhatsAppSettings>): WhatsAppSettings {
  const current = getWhatsAppSettings();
  const updated: WhatsAppSettings = { ...current, ...updates };
  cachedSettings = updated;
  try {
    const dir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmpFile = `${SETTINGS_FILE}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmpFile, JSON.stringify(updated, null, 2), "utf-8");
    fs.renameSync(tmpFile, SETTINGS_FILE);
  } catch {
    // ignore
  }
  return updated;
}
