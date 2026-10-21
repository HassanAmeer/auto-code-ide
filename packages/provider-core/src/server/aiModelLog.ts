// @effect-diagnostics globalDate:off globalDateInEffect:off globalRandom:off globalRandomInEffect:off
/**
 * Shared in-memory AI model request log.
 *
 * Every provider driver that talks to a model endpoint records here so the
 * Request Logs panel can show the exact payload, model, and response for the
 * turn the user just ran, regardless of which driver handled it.
 *
 * @module provider-core/server/aiModelLog
 */

export interface AiModelLogEntry {
  id: string;
  timestamp: number;
  timeFormatted: string;
  threadId?: string;
  runId?: string;
  provider: string;
  providerInstanceId: string;
  model: string;
  baseUrl: string;
  endpoint: string;
  requestHeaders: Record<string, string>;
  apiKeyMasked: string;
  userPrompt: string;
  messages: Array<{ role: string; content: string }>;
  status?: number;
  statusText?: string;
  durationMs?: number;
  state: "pending" | "streaming" | "completed" | "error";
  responseBody?: string;
  error?: string;
  errorType?: string;
}

const MAX_AI_MODEL_LOGS = 300;

export const GLOBAL_AI_MODEL_LOGS: AiModelLogEntry[] = [];

export function recordAiModelLog(entry: AiModelLogEntry): void {
  const existingIdx = GLOBAL_AI_MODEL_LOGS.findIndex((l) => l.id === entry.id);
  if (existingIdx !== -1) {
    GLOBAL_AI_MODEL_LOGS[existingIdx] = entry;
    return;
  }
  GLOBAL_AI_MODEL_LOGS.unshift(entry);
  if (GLOBAL_AI_MODEL_LOGS.length > MAX_AI_MODEL_LOGS) {
    GLOBAL_AI_MODEL_LOGS.pop();
  }
}

export function updateAiModelLog(id: string, updates: Partial<AiModelLogEntry>): void {
  const existing = GLOBAL_AI_MODEL_LOGS.find((l) => l.id === id);
  if (existing) {
    Object.assign(existing, updates);
  }
}

export function clearAiModelLogs(): void {
  GLOBAL_AI_MODEL_LOGS.length = 0;
}

export function createAiModelLogId(): string {
  return `ai-log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function formatAiModelLogTime(input: number | Date = Date.now()): string {
  return (typeof input === "number" ? new Date(input) : input).toLocaleTimeString();
}

export function maskAiApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length === 0) return "(No API key)";
  if (trimmed.length <= 12) return "***";
  return `${trimmed.slice(0, 7)}...${trimmed.slice(-4)}`;
}
