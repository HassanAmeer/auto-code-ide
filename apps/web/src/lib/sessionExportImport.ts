/**
 * Session Export & Import Utilities
 * Allows exporting full chat sessions to JSON or Markdown, and importing them back.
 */

export interface ExportedMessage {
  id?: string;
  role: "user" | "assistant" | "system";
  text: string;
  createdAt?: string;
  model?: string;
}

export interface ExportedTimelineItem {
  kind: string;
  label?: string;
  detail?: string;
  timestamp?: string;
}

export interface ExportedSession {
  version: "1.0";
  exportedAt: string;
  generator: "AutoCode IDE";
  thread: {
    id: string;
    title: string;
    environmentId?: string;
    createdAt?: string;
  };
  messages: ExportedMessage[];
  timelineSummary?: ExportedTimelineItem[];
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-\u0600-\u06FF]/g, "_").slice(0, 50) || "chat_session";
}

/**
 * Serializes and triggers browser download of the thread as JSON.
 */
export function exportSessionToJson(
  thread: { id: string; title: string; environmentId?: string; createdAt?: string },
  timelineEntries: readonly any[],
): void {
  const messages: ExportedMessage[] = [];
  const timelineSummary: ExportedTimelineItem[] = [];

  for (const entry of timelineEntries) {
    if (!entry) continue;

    if (entry.kind === "message" && entry.message) {
      messages.push({
        id: entry.message.id,
        role: entry.message.role || "user",
        text: entry.message.text || "",
        createdAt: entry.message.createdAt,
      });
    } else if (entry.kind === "assistant-meta" || entry.kind === "turn") {
      // capture assistant text if present
      if (entry.text) {
        messages.push({
          role: "assistant",
          text: entry.text,
          createdAt: entry.createdAt,
          model: entry.model,
        });
      }
    } else if (entry.kind === "event" || entry.kind === "work-entry") {
      timelineSummary.push({
        kind: entry.kind,
        label: entry.label || entry.title || "Step",
        detail: entry.detail || entry.message || undefined,
        timestamp: entry.createdAt,
      });
    }
  }

  const exportData: ExportedSession = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    generator: "AutoCode IDE",
    thread: {
      id: thread.id,
      title: thread.title,
      environmentId: thread.environmentId,
      createdAt: thread.createdAt,
    },
    messages,
    timelineSummary,
  };

  const jsonString = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonString], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const fileName = `session_${sanitizeFileName(thread.title)}_${thread.id.slice(-6)}.json`;
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Formats and triggers browser download of the thread as readable Markdown.
 */
export function exportSessionToMarkdown(
  thread: { id: string; title: string; environmentId?: string; createdAt?: string },
  timelineEntries: readonly any[],
): void {
  let md = `# ${thread.title || "Chat Session"}\n\n`;
  md += `> **Thread ID:** \`${thread.id}\`  \n`;
  md += `> **Exported At:** ${new Date().toLocaleString()}  \n`;
  if (thread.createdAt) {
    md += `> **Created:** ${new Date(thread.createdAt).toLocaleString()}  \n`;
  }
  md += `\n---\n\n`;

  for (const entry of timelineEntries) {
    if (!entry) continue;

    if (entry.kind === "message" && entry.message) {
      const isUser = entry.message.role === "user";
      md += `### ${isUser ? "👤 User" : "🤖 Assistant"}\n\n`;
      md += `${entry.message.text || ""}\n\n`;
      md += `---\n\n`;
    } else if (entry.kind === "work-entry" && entry.label) {
      md += `> ⚙️ **Tool Execution:** ${entry.label}\n`;
      if (entry.detail) {
        md += `> \`\`\`\n> ${entry.detail.replace(/\n/g, "\n> ")}\n> \`\`\`\n`;
      }
      md += `\n`;
    }
  }

  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const fileName = `session_${sanitizeFileName(thread.title)}_${thread.id.slice(-6)}.md`;
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Validates and parses an uploaded JSON session file.
 */
export function parseImportedSession(rawText: string): {
  success: boolean;
  data?: ExportedSession;
  error?: string;
} {
  try {
    const parsed = JSON.parse(rawText) as Record<string, any>;
    if (!parsed || typeof parsed !== "object") {
      return { success: false, error: "Invalid JSON format: file does not contain a JSON object." };
    }

    const title = parsed.thread?.title || parsed.title || "Imported Session";
    const id = parsed.thread?.id || parsed.id || `imported_${Date.now()}`;
    const rawMessages = Array.isArray(parsed.messages) ? parsed.messages : [];

    const messages: ExportedMessage[] = rawMessages.map((m: any) => ({
      id: m.id ? String(m.id) : undefined,
      role: m.role === "assistant" ? "assistant" : "user",
      text: String(m.text || m.content || ""),
      createdAt: m.createdAt ? String(m.createdAt) : undefined,
      model: m.model ? String(m.model) : undefined,
    }));

    return {
      success: true,
      data: {
        version: "1.0",
        exportedAt: parsed.exportedAt || new Date().toISOString(),
        generator: "AutoCode IDE",
        thread: {
          id,
          title,
          environmentId: parsed.thread?.environmentId,
          createdAt: parsed.thread?.createdAt,
        },
        messages,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to parse JSON file.",
    };
  }
}
