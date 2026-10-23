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
  threadId?: string | undefined;
  runId?: string | undefined;
  provider: string;
  providerInstanceId: string;
  model: string;
  baseUrl: string;
  endpoint: string;
  requestHeaders: Record<string, string>;
  apiKeyMasked: string;
  userPrompt: string;
  messages: Array<{ role: string; content: string }>;
  status?: number | undefined;
  statusText?: string | undefined;
  durationMs?: number | undefined;
  state: "pending" | "streaming" | "completed" | "error";
  responseBody?: string | undefined;
  error?: string | undefined;
  errorType?: string | undefined;
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

export function updateAiModelLogByRunId(runId: string, updates: Partial<AiModelLogEntry>): boolean {
  const existing = GLOBAL_AI_MODEL_LOGS.find((l) => l.runId === runId);
  if (existing) {
    Object.assign(existing, updates);
    return true;
  }
  return false;
}

export function getAiModelLogByRunId(runId: string): AiModelLogEntry | undefined {
  return GLOBAL_AI_MODEL_LOGS.find((l) => l.runId === runId);
}

export function extractStatusCode(
  err: unknown,
  seen = new Set<unknown>(),
  depth = 0,
): number | undefined {
  if (err == null || depth > 8 || seen.has(err)) return undefined;
  if (typeof err === "number" && err >= 100 && err <= 599) return err;

  if (typeof err === "object") {
    seen.add(err);
    try {
      const obj = err as any;
      if (typeof obj.status === "number" && obj.status >= 100 && obj.status <= 599)
        return obj.status;
      if (typeof obj.statusCode === "number" && obj.statusCode >= 100 && obj.statusCode <= 599)
        return obj.statusCode;
      if (
        typeof obj.response?.status === "number" &&
        obj.response.status >= 100 &&
        obj.response.status <= 599
      )
        return obj.response.status;
      if (obj.cause) {
        const nested = extractStatusCode(obj.cause, seen, depth + 1);
        if (nested) return nested;
      }
    } catch {}
  }

  try {
    const str =
      typeof err === "string"
        ? err
        : typeof (err as any)?.message === "string"
          ? (err as any).message
          : "";
    if (str) {
      const match = str.match(/\b(400|401|402|403|404|408|409|422|429|500|502|503|504)\b/);
      if (match && match[1]) return parseInt(match[1], 10);
      if (/rate\s*limit|too\s*many\s*requests/i.test(str)) return 429;
      if (/overloaded|circuit\s*breaker|unavailable/i.test(str)) return 503;
      if (/timed?\s*out|stalled/i.test(str)) return 504;
      if (/unauthorized|invalid\s*api\s*key/i.test(str)) return 401;
      if (/forbidden/i.test(str)) return 403;
      if (/not\s*found/i.test(str)) return 404;
    }
  } catch {}
  return undefined;
}

export function extractStatusText(statusCode?: number): string | undefined {
  if (!statusCode) return undefined;
  switch (statusCode) {
    case 200:
      return "OK";
    case 400:
      return "Bad Request";
    case 401:
      return "Unauthorized";
    case 403:
      return "Forbidden";
    case 404:
      return "Not Found";
    case 408:
      return "Request Timeout";
    case 429:
      return "Too Many Requests (Rate Limited)";
    case 500:
      return "Internal Server Error";
    case 502:
      return "Bad Gateway";
    case 503:
      return "Service Unavailable (Overloaded)";
    case 504:
      return "Gateway Timeout";
    default:
      return statusCode >= 400 ? `HTTP ${statusCode}` : "OK";
  }
}

export function extractUnderlyingErrorMessage(cause: unknown, maxDepth = 12): string | undefined {
  if (cause == null) return undefined;
  const seen = new Set<unknown>();
  let current: any = cause;

  for (let i = 0; i < maxDepth && current != null && !seen.has(current); i++) {
    seen.add(current);
    if (typeof current === "string") {
      const trimmed = current.trim();
      if (!trimmed) return undefined;
      if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed === "object") {
            current = parsed;
            continue;
          }
        } catch {}
      }
      return trimmed;
    }

    if (typeof current !== "object") return undefined;

    // Effect Cause / Fail / Die / Defect checks
    if (typeof current._tag === "string" && current._tag === "Fail" && current.error) {
      current = current.error;
      continue;
    }
    if (typeof current._tag === "string" && current._tag === "Die" && current.defect) {
      current = current.defect;
      continue;
    }
    if (Array.isArray(current.failures) && current.failures.length > 0) {
      current = current.failures[0];
      continue;
    }

    // Response body check
    if (current.response && typeof current.response === "object") {
      if (typeof current.response.text === "string" && current.response.text.trim()) {
        current = current.response.text;
        continue;
      }
      if (current.response.data) {
        current = current.response.data;
        continue;
      }
    }

    const messageCandidate =
      (typeof current.message === "string" && current.message.trim()) ||
      (typeof current.detail === "string" && current.detail.trim()) ||
      (typeof current.error === "string" && current.error.trim()) ||
      (current.error &&
        typeof current.error === "object" &&
        typeof current.error.message === "string" &&
        current.error.message.trim());

    const isGenericWrapper =
      messageCandidate &&
      (/^Failed to start run run:thread/i.test(messageCandidate) ||
        /^Failed to open .* provider session/i.test(messageCandidate) ||
        /^Provider turn failed/i.test(messageCandidate));

    if (messageCandidate && !isGenericWrapper) {
      return messageCandidate;
    }

    if (current.cause != null) {
      current = current.cause;
      continue;
    }
    if (current.error != null && typeof current.error === "object") {
      current = current.error;
      continue;
    }
    if (messageCandidate) {
      return messageCandidate;
    }
    break;
  }
  return undefined;
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
