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

export interface BotMasterSheetSettings {
  primaryClientPhone: string;
  absenceMode: boolean;
}

/**
 * Reads the master-sheet settings that the Bot UI writes through
 * /api/app-settings/save (primary client phone + autonomous absence mode).
 * Without this, those two toggles were saved but never honoured by the
 * inbound webhook, so every sender was auto-replied to.
 */
export function getBotMasterSheetSettings(): BotMasterSheetSettings {
  const result: BotMasterSheetSettings = { primaryClientPhone: "", absenceMode: false };
  try {
    const autocodeHome = process.env.AUTOCODE_HOME?.trim();
    const t3Home = process.env.T3CODE_BASE_DIR?.trim();
    const candidateDirs = [
      ...(autocodeHome ? [path.join(autocodeHome, "userdata"), autocodeHome] : []),
      ...(t3Home ? [path.join(t3Home, "userdata"), t3Home] : []),
      "/root/autojobs/data/userdata",
      "/root/autojobs/data",
      path.resolve(process.cwd(), "data", "userdata"),
      path.resolve(process.cwd(), "data"),
      path.resolve(process.cwd(), "userdata"),
    ];
    for (const dir of candidateDirs) {
      const filePath = path.join(dir, "app-settings.json");
      if (!fs.existsSync(filePath)) continue;
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const phone =
        typeof parsed?.primary_client_phone === "string" ? parsed.primary_client_phone : "";
      const absence =
        parsed?.autonomous_absence_mode === true || parsed?.autonomous_absence_mode === "true";
      result.primaryClientPhone = phone.trim();
      result.absenceMode = absence;
      return result;
    }
  } catch {
    // fall through with defaults
  }
  return result;
}
