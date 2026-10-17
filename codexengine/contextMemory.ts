import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const IN_MEMORY_CACHE = new Map<string, ChatMessage[]>();
let persistentHistoryPath: string | null = null;

function resolveHistoryFilePath(): string {
  if (persistentHistoryPath) return persistentHistoryPath;

  const homeDir = NodeOS.homedir();
  const possibleDirs = [
    NodePath.join(homeDir, ".autocode", "userdata"),
    NodePath.join(homeDir, ".t3", "userdata"),
    NodePath.join(homeDir, ".autojobs", "data", "userdata"),
  ];

  for (const dir of possibleDirs) {
    if (NodeFS.existsSync(dir)) {
      persistentHistoryPath = NodePath.join(dir, "codexengine-thread-history.json");
      return persistentHistoryPath;
    }
  }

  const defaultDir = NodePath.join(homeDir, ".autocode", "userdata");
  try {
    NodeFS.mkdirSync(defaultDir, { recursive: true });
  } catch {}
  persistentHistoryPath = NodePath.join(defaultDir, "codexengine-thread-history.json");
  return persistentHistoryPath;
}

function loadFromDisk(): Record<string, ChatMessage[]> {
  try {
    const filePath = resolveHistoryFilePath();
    if (NodeFS.existsSync(filePath)) {
      const raw = NodeFS.readFileSync(filePath, "utf-8");
      return JSON.parse(raw) as Record<string, ChatMessage[]>;
    }
  } catch {}
  return {};
}

let saveTimeout: NodeJS.Timeout | null = null;
function scheduleSaveToDisk() {
  if (saveTimeout) return;
  saveTimeout = setTimeout(() => {
    saveTimeout = null;
    try {
      const filePath = resolveHistoryFilePath();
      const obj: Record<string, ChatMessage[]> = {};
      for (const [key, msgs] of IN_MEMORY_CACHE.entries()) {
        obj[key] = msgs;
      }
      NodeFS.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf-8");
    } catch (err) {
      console.error("ContextMemory: Failed saving thread history to disk:", err);
    }
  }, 1000);
}

// Initial hydration from disk
try {
  const diskData = loadFromDisk();
  for (const [key, msgs] of Object.entries(diskData)) {
    if (Array.isArray(msgs)) {
      IN_MEMORY_CACHE.set(key, msgs);
    }
  }
} catch {}

/**
 * Compresses raw code blocks in older assistant turns to save tokens
 * while preserving the semantic understanding of what was created/modified.
 */
function pruneAssistantCodeBlocks(text: string): string {
  return text.replace(/```([^\n]*)\n([\s\S]*?)```/g, (match, header, content) => {
    const lineCount = content.split("\n").length;
    // If it's a short snippet (< 8 lines), keep it
    if (lineCount <= 8) return match;

    // Detect path if present
    const headerMatch = header.match(/(?:file|filepath|path)\s*=\s*["']?([^\s"']+)["']?/i);
    const path = headerMatch ? headerMatch[1] : "code";
    return `[Code block for \`${path}\` (${lineCount} lines) - Saved to workspace]`;
  });
}

/**
 * Gets the pruned and sanitized conversation history for a thread.
 * Applies sliding window and token pruning to prevent "forgetting" and token overflow.
 */
export function getThreadHistory(
  threadKey: string,
  options: { maxTurns?: number } = {},
): ChatMessage[] {
  const raw = IN_MEMORY_CACHE.get(threadKey) ?? [];
  if (raw.length === 0) return [];

  const maxTurns = options.maxTurns ?? 10;
  // If history is small, return pruned
  if (raw.length <= maxTurns) {
    return raw.map((msg, index) => {
      // Don't prune the very last assistant message so immediate context is fresh
      if (msg.role === "assistant" && index < raw.length - 1) {
        return {
          role: msg.role,
          content: pruneAssistantCodeBlocks(msg.content),
        };
      }
      return msg;
    });
  }

  // Sliding window: Keep first turn (initial task/goal) + last (maxTurns - 2) turns
  const firstTurn = raw.slice(0, 2);
  const recentTurns = raw.slice(-(maxTurns - 2));

  const combined = [...firstTurn, ...recentTurns];

  return combined.map((msg, index) => {
    // Only keep code in the very last turn
    if (msg.role === "assistant" && index < combined.length - 1) {
      return {
        role: msg.role,
        content: pruneAssistantCodeBlocks(msg.content),
      };
    }
    return msg;
  });
}

/**
 * Appends a new turn (user prompt + assistant response) to persistent thread history.
 */
export function appendTurnToHistory(
  threadKey: string,
  userPrompt: string,
  assistantResponse: string,
): void {
  const current = IN_MEMORY_CACHE.get(threadKey) ?? [];
  const next: ChatMessage[] = [
    ...current,
    { role: "user", content: userPrompt.trim() },
    { role: "assistant", content: assistantResponse.trim() },
  ];

  // Cap at 40 total messages per thread in memory
  if (next.length > 40) {
    next.splice(2, next.length - 30);
  }

  IN_MEMORY_CACHE.set(threadKey, next);
  scheduleSaveToDisk();
}

/**
 * Injects historical messages (e.g. from T3 orchestration handoffs).
 */
export function injectHistoricalMessages(
  threadKey: string,
  messages: Array<{ role: string; content?: string; text?: string }>,
  systemContext?: string,
): void {
  const existing = IN_MEMORY_CACHE.get(threadKey) ?? [];
  const next: ChatMessage[] = [...existing];

  if (systemContext && systemContext.trim()) {
    next.push({ role: "system", content: systemContext.trim() });
  }

  for (const m of messages) {
    const text = (m.content || m.text || "").trim();
    if (!text) continue;
    next.push({
      role: m.role === "assistant" ? "assistant" : "user",
      content: text,
    });
  }

  if (next.length > 0) {
    IN_MEMORY_CACHE.set(threadKey, next);
    scheduleSaveToDisk();
  }
}
