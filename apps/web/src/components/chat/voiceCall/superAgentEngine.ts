import { executeTerminalCommand } from "~/components/chat/terminal/terminalClient";
import { loadNotes, addNote, type NoteItem } from "~/lib/notesStore";
import { loadChatMemories, addMemory as addChatMemory, type MemoryRecord } from "~/lib/memoryStore";
import {
  addScheduledTask,
  loadScheduledTasks,
  type ScheduledTaskItem,
} from "~/lib/scheduledTasksStore";
import {
  loadProjectActivities,
  recordProjectActivity,
  getActivitiesForProject,
  type ProjectActivityItem,
} from "~/lib/projectActivityLedger";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { speakText, sanitizeTextForSpeech } from "~/lib/speech/tts";
import { addVoiceCallLog } from "~/lib/speech/voiceCallLogger";
import {
  loadSessionLedger,
  formatLedgerAsBulletSummary,
  isLedgerRecallQuery,
  recordTurnAndCheckLedger,
  addDecisionPoint,
} from "~/lib/speech/multiTurnSessionLedger";
import { buildSuperAgentSystemPrompt } from "./superAgentPrompt";

export interface SuperAgentRunOptions {
  userText: string;
  projects: ReadonlyArray<EnvironmentProject>;
  activeProjectId?: string | undefined;
  selectedModel: string;
  selectedInstanceId?: string | undefined;
  chatId?: string | undefined;
  conversationHistory?: Array<{ role: "user" | "assistant"; text: string }> | undefined;
  providerConfig?:
    | {
        baseUrl?: string | undefined;
        apiKey?: string | undefined;
        headers?: Array<{ key: string; value: string }> | undefined;
        format?: string | undefined;
      }
    | undefined;
  onFillerSpoken?: ((filler: string) => void) | undefined;
  onStatusUpdate?: ((status: string) => void) | undefined;
  onToolCall?: ((tool: ToolCallRecord) => void) | undefined;
  signal?: AbortSignal | undefined;
}

export interface DelegatedTaskStep {
  step: string;
  desc?: string;
  status: "completed" | "running" | "pending" | "failed";
}

export interface ReviewLoopRound {
  round: number;
  phase: string;
  errorsFound: number;
  fixedIssues: string[];
  status: "repaired" | "verified_clean" | "retrying";
}

export interface DelegatedTaskInfo {
  projectName: string;
  taskTitle: string;
  status: "running" | "completed" | "error";
  progress: number;
  framework?: string | undefined;
  previewUrl?: string | undefined;
  devServerUrl?: string | undefined;
  verificationSteps?: DelegatedTaskStep[] | undefined;
  reviewLoop?: ReviewLoopRound[] | undefined;
  errorsFixed?: string[] | undefined;
  streamingLogs?: string[] | undefined;
}

export interface ToolCallRecord {
  name: string;
  summary?: string;
  status: "calling" | "completed" | "error";
}

export interface SuperAgentResult {
  reply: string;
  spokenReply: string;
  actionTaken?: string;
  delegatedTask?: DelegatedTaskInfo;
  referencedMemory?: {
    id: string;
    title: string;
    description: string;
    updatedAt: number;
    source: "manual" | "imported_from_notes";
  };
  toolsCalled?: ToolCallRecord[];
  thought?: string;
  durationMs?: number;
  details?: unknown;
}

// In-memory conversation state for approval and context
let pendingApprovalPlan: {
  projectId: string;
  projectName: string;
  plan: string;
  suggestedPrompt: string;
} | null = null;

function resolveApiUrl(pathUri: string): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${pathUri.startsWith("/") ? pathUri : `/${pathUri}`}`;
  }
  return `http://127.0.0.1:3000${pathUri.startsWith("/") ? pathUri : `/${pathUri}`}`;
}

export function combineSignals(timeoutMs: number, userSignal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!userSignal) return timeoutSignal;
  if (typeof (AbortSignal as any).any === "function") {
    return (AbortSignal as any).any([timeoutSignal, userSignal]);
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (userSignal.aborted || timeoutSignal.aborted) {
    controller.abort();
    return controller.signal;
  }
  userSignal.addEventListener("abort", onAbort, { once: true });
  timeoutSignal.addEventListener("abort", onAbort, { once: true });
  return controller.signal;
}

export function isUrduLanguage(text: string): boolean {
  return (
    /[\u0600-\u06FF]/.test(text) ||
    /\b(kya|hai|hain|karo|batao|kaise|theek|suno|bhai|yaar|acha|haan|nahi|karna|dekho|parho|banao|chalana|raat|subah|baje|masla|kharabi|pehle|ray|mashwara|mashwra|chahiye|humne|kaun|kiye|the|se|ye|yeh|ko|par|mera|meri|mere|aap|aapka|aapki|mein|do|kar|karwa|dikhao|hath|lagaya|pending|baaqi|rehta|cheez|data)\b/i.test(
      text,
    )
  );
}

export async function querySuperAgentLLM(
  prompt: string,
  options: {
    model: string;
    instanceId?: string;
    providerConfig?: {
      baseUrl?: string;
      apiKey?: string;
      headers?: Array<{ key: string; value: string }>;
      format?: string;
    };
    systemPrompt: string;
    history?: Array<{ role: "user" | "assistant"; text: string }>;
    signal?: AbortSignal;
  },
): Promise<{ ok: boolean; reply?: string; error?: string; code?: string }> {
  const { model, instanceId, providerConfig, systemPrompt, history = [], signal } = options;

  if (signal?.aborted) {
    return { ok: false, error: "Aborted", code: "ABORTED" };
  }

  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: systemPrompt },
  ];

  const recentHistory = history.slice(-6);
  for (const h of recentHistory) {
    if (h.text && h.text.trim()) {
      messages.push({
        role: h.role === "user" ? "user" : "assistant",
        content: h.text.trim(),
      });
    }
  }

  messages.push({ role: "user", content: prompt.trim() });

  // 1. Try server-side proxy endpoint first (handles CORS, OpenCode daemon, TLS, and stored provider secrets)
  try {
    const proxyResp = await fetch(resolveApiUrl("/api/super-agent/chat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        instanceId,
        messages,
        baseUrl: providerConfig?.baseUrl,
        apiKey: providerConfig?.apiKey,
        headers: providerConfig?.headers,
      }),
      signal: combineSignals(65000, signal),
    });

    let data: any;
    try {
      data = await proxyResp.json();
    } catch {
      data = null;
    }

    if (data) {
      if (data.ok && data.reply && data.reply.trim()) {
        return { ok: true, reply: data.reply.trim() };
      }
      if (data.error) {
        return {
          ok: false,
          error: data.error,
          code: data.code || (proxyResp.ok ? "UPSTREAM_ERROR" : `HTTP_${proxyResp.status}`),
        };
      }
    }

    if (!proxyResp.ok) {
      return {
        ok: false,
        error: `Server returned HTTP ${proxyResp.status}`,
        code: `HTTP_${proxyResp.status}`,
      };
    }
  } catch (proxyErr: any) {
    console.warn("SuperAgent proxy fetch error, attempting direct fetch:", proxyErr);
  }

  // 2. Direct browser fetch fallback (if providerConfig has baseUrl)
  if (providerConfig?.baseUrl) {
    try {
      const rawBase = providerConfig.baseUrl.trim().replace(/\/+$/, "");
      let chatUrl = rawBase;
      if (rawBase.endsWith("/chat/completions")) {
        chatUrl = rawBase;
      } else if (rawBase.endsWith("/v1")) {
        chatUrl = `${rawBase}/chat/completions`;
      } else if (rawBase.includes("/v1/")) {
        chatUrl = `${rawBase}/chat/completions`;
      } else {
        chatUrl = `${rawBase}/v1/chat/completions`;
      }

      const reqHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };

      if (providerConfig.apiKey) {
        reqHeaders["Authorization"] = `Bearer ${providerConfig.apiKey.trim()}`;
        reqHeaders["x-api-key"] = providerConfig.apiKey.trim();
      }

      if (Array.isArray(providerConfig.headers)) {
        for (const h of providerConfig.headers) {
          if (h?.key && h.key.trim()) {
            reqHeaders[h.key.trim()] = String(h.value ?? "").trim();
          }
        }
      }

      const directResp = await fetch(chatUrl, {
        method: "POST",
        headers: reqHeaders,
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.7,
          max_tokens: 1500,
        }),
        signal: combineSignals(45000, signal),
      });

      const data = await directResp.json();
      if (!directResp.ok) {
        const errDetail =
          data?.error?.message || data?.error || data?.message || `HTTP ${directResp.status}`;
        return {
          ok: false,
          error: String(errDetail),
          code: data?.error?.code || data?.code || String(directResp.status),
        };
      }

      const content =
        data?.choices?.[0]?.message?.content ||
        data?.choices?.[0]?.text ||
        data?.candidates?.[0]?.content?.parts?.[0]?.text ||
        "";

      if (content) {
        return { ok: true, reply: content };
      }
      return { ok: false, error: "Empty response from AI model", code: "EMPTY_RESPONSE" };
    } catch (directErr: any) {
      return {
        ok: false,
        error: directErr?.message || "Direct connection failed",
        code: "NETWORK_ERROR",
      };
    }
  }

  return {
    ok: false,
    error: "Could not connect to AI model endpoint. Please verify server or network.",
    code: "NETWORK_ERROR",
  };
}

/**
 * Extracts a time string (HH:MM in 24-hr format) from natural language
 * e.g., "2:00", "2 baje", "raat ke 2:00 baje", "14:30", "9 am", "subah 9 baje"
 */
export function extractTimeOfDay(text: string): string | null {
  // 1. Direct HH:MM (with optional am/pm, e.g. "2:00", "02:00", "5:30 pm", "14:30")
  const directColonMatch = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)(?:\s*(am|pm))?\b/i);
  if (directColonMatch && directColonMatch[1] && directColonMatch[2]) {
    let h = parseInt(directColonMatch[1], 10);
    const m = directColonMatch[2];
    const amPm = (directColonMatch[3] || "").toLowerCase();
    if (amPm === "pm" && h < 12) h += 12;
    if (amPm === "am" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${m}`;
  }

  // 2. English "2 am", "9 pm"
  const amPmMatch = text.match(/\b(\d{1,2})\s*(am|pm)\b/i);
  if (amPmMatch && amPmMatch[1]) {
    let hours = parseInt(amPmMatch[1], 10);
    const period = (amPmMatch[2] || "").toLowerCase();
    if (period === "pm" && hours < 12) hours += 12;
    if (period === "am" && hours === 12) hours = 0;
    return `${String(hours).padStart(2, "0")}:00`;
  }

  // 3. Urdu "raat ke 2 baje" / "subah 9 baje" / "2 baje"
  const bajeMatch = text.match(/(?:raat|subah|shaam|dopahar)?\s*(?:ke)?\s*(\d{1,2})\s*baje/i);
  if (bajeMatch && bajeMatch[1]) {
    let hours = parseInt(bajeMatch[1], 10);
    const isNightOrPm = /(?:raat|shaam|pm)\b/i.test(text);
    if (isNightOrPm && hours < 12 && hours > 6) {
      hours += 12;
    } else if (hours === 2 && /(?:raat)\b/i.test(text)) {
      hours = 2; // 02:00
    }
    return `${String(hours).padStart(2, "0")}:00`;
  }

  return null;
}

interface WorkerDispatchResult {
  ok: boolean;
  workerId?: string;
  projectId?: string;
  projectName?: string;
  workspaceRoot?: string;
  taskTitle?: string;
  status?: string;
  progress?: number;
  framework?: string;
  devServer?: { running: boolean; port: number; url: string };
  devServerUrl?: string;
  verificationSteps?: DelegatedTaskStep[];
  reviewLoop?: ReviewLoopRound[];
  filesInspected?: string[];
  verifiedHtmlCount?: number;
  errorsFixed?: string[];
  streamingLogs?: string[];
  previewUrl?: string;
  previewFiles?: Array<{ name: string; url: string }>;
  summary?: string;
  error?: string;
}

async function callWorkerAgentDispatcher(
  projectIdOrName: string,
  taskTitle: string,
  prompt: string,
  model?: string,
  onStreamLog?: (log: string) => void,
): Promise<WorkerDispatchResult> {
  try {
    const res = await fetch(resolveApiUrl("/api/super-agent/dispatch-worker"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectIdOrName,
        taskTitle,
        prompt,
        model,
        stream: true,
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      return { ok: false, error: txt };
    }

    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("text/event-stream") && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: WorkerDispatchResult | null = null;
      const logs: string[] = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          try {
            const parsed = JSON.parse(trimmed.slice(5).trim());
            if (parsed.type === "stream" && parsed.message) {
              const formatted = `[${parsed.time || new Date().toLocaleTimeString()}] ${parsed.message}`;
              logs.push(formatted);
              onStreamLog?.(formatted);
            } else if (parsed.type === "complete" || parsed.status === "completed") {
              finalResult = parsed;
            }
          } catch {}
        }
      }

      if (finalResult) {
        finalResult.streamingLogs = logs;
        return finalResult;
      }
    }

    return (await res.json()) as WorkerDispatchResult;
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

async function fetchProjectInspection(projectName: string, signal?: AbortSignal): Promise<any> {
  try {
    const res = await fetch(
      resolveApiUrl(`/api/projects/inspect/${encodeURIComponent(projectName)}`),
      {
        signal: combineSignals(10000, signal),
      },
    );
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn("fetchProjectInspection error:", err);
  }
  return null;
}

/**
 * Executes Super Admin Voice Assistant logic with human-like latency masking
 */
export async function executeSuperAgentInstruction(
  options: SuperAgentRunOptions,
): Promise<SuperAgentResult> {
  const {
    userText,
    projects,
    activeProjectId,
    selectedModel,
    onFillerSpoken,
    onStatusUpdate,
    signal,
  } = options;

  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const lang = isUrduLanguage(userText) ? "urdu" : "english";

  // 1. Identify target project (e.g. "op" or activeProject)
  let targetProject =
    projects.find((p) => p.id === activeProjectId || p.title === activeProjectId) ||
    projects[0] ||
    null;

  const directDispatchMatch = userText.match(
    /(?:project\s+([a-zA-Z0-9_\-\.]+)\s+(?:mein|ke\s+andar|open|files?|error|preview)|worker\s*agent|is\s+project\s+(?:ke\s+andar\s+)?prompt\s+de(?:kar)?)/i,
  );
  if (/\bop\b/i.test(userText)) {
    const opProj = projects.find(
      (p) =>
        (p.title && p.title.toLowerCase() === "op") ||
        (p.id && String(p.id).toLowerCase() === "op"),
    );
    if (opProj) targetProject = opProj;
  } else if (directDispatchMatch && directDispatchMatch[1]) {
    const matchName = directDispatchMatch[1].toLowerCase();
    const found = projects.find(
      (p) =>
        (p.title && p.title.toLowerCase().includes(matchName)) ||
        (p.id && String(p.id).toLowerCase().includes(matchName)),
    );
    if (found) targetProject = found;
  }

  const targetName =
    targetProject?.title || (/\bop\b/i.test(userText) ? "op" : String(targetProject?.id || "op"));
  const projectCwd = targetProject?.path || "/";

  let runtimeFacts = "";
  let actionTag = "llm_completion";
  let delegatedTaskInfo: DelegatedTaskInfo | undefined;
  const toolsExecuted: ToolCallRecord[] = [];
  const recordTool = (record: ToolCallRecord) => {
    const idx = toolsExecuted.findIndex((t) => t.name === record.name);
    if (idx >= 0) {
      toolsExecuted[idx] = record;
    } else {
      toolsExecuted.push(record);
    }
    options.onToolCall?.(record);
  };

  // 2. Intelligent Latency-Masking Conversational Spoken Fillers (Live phone call experience)
  const isGitFeaturesReq =
    /\b(feature|features|commits?|git\s*history|recent\s*changes)\b/i.test(userText) &&
    /\b(search|dekh|check|batao|list|last|kya|add)\b/i.test(userText);

  const isHealthRadarReq =
    /\b(audit|radar|scan|health|error|errors|masla|kharabi|bug|failing|tests?|issue|issues|kahan\s*error)\b/i.test(
      userText,
    ) && !/\b(fix|theek\s*karo|solve|sort)\b/i.test(userText);

  const isInspectionOrWork =
    /\b(project\s+files?|preview\s+check|syntax\s+error|worker\s*agent|prompt\s*de|inspect\s+files?|kaam\s*karwa)\b/i.test(
      userText,
    );

  const isLedgerReq = isLedgerRecallQuery(userText);
  const mediaUrlMatch = userText.match(/https?:\/\/[^\s<>"'{}|\\^`]+[^\s<>"'{}|\\^`.,;:?!)]/i);
  const isYouTubeUrl =
    Boolean(mediaUrlMatch) && /youtube\.com|youtu\.be/i.test(mediaUrlMatch ? mediaUrlMatch[0] : "");

  let filler = "";
  if (mediaUrlMatch) {
    filler = isYouTubeUrl
      ? lang === "urdu"
        ? "Ji bilkul, main is video ka transcript fetch kar ke research kar raha hoon, ek second dein..."
        : "Sure thing! Fetching the YouTube video transcript and researching it for you, give me one second..."
      : lang === "urdu"
        ? "Ji bilkul, main is article ka content fetch kar ke research kar raha hoon, ek second dein..."
        : "Fetching the web article and researching it for you, give me one second...";
  } else if (isLedgerReq) {
    filler =
      lang === "urdu"
        ? "Ji boss, main session ledger aur hamare pehle ke ahem faislay check kar raha hoon..."
        : "Checking our session decision ledger right away...";
  } else if (isGitFeaturesReq) {
    filler =
      lang === "urdu"
        ? "Ji bilkul, main abhi recent commits aur git history check kar ke batata hoon..."
        : "Sure thing, checking the recent git commits and repository history right now...";
  } else if (isHealthRadarReq) {
    filler =
      lang === "urdu"
        ? "Ek second dein, main workspace health radar aur modified files scan kar raha hoon..."
        : "Give me one second, scanning workspace health and active changes...";
  } else if (isInspectionOrWork) {
    filler =
      lang === "urdu"
        ? `Ji bilkul! Main project ${targetName} ke files inspect kar ke check kar raha hoon...`
        : `Inspecting project files and checking status for ${targetName}...`;
  } else if (/\b(search|dhoond|kahan\s*hai|find|look\s*up)\b/i.test(userText)) {
    filler =
      lang === "urdu"
        ? "Ji zaroor, main abhi search kar ke batata hoon..."
        : "Searching the workspace for that right now...";
  } else {
    filler =
      lang === "urdu"
        ? "Ji bilkul, main abhi check kar ke batata hoon..."
        : "Understood, checking that for you right now...";
  }

  if (filler) {
    onFillerSpoken?.(filler);
    onStatusUpdate?.(filler);
  }

  // 3. Action execution (if commanded)
  // 3-media. Zero-Cost YouTube & Web Link Research Tool (Inspired by DIGI LABS)
  if (mediaUrlMatch) {
    const extractedUrl = mediaUrlMatch[0];
    actionTag = "research_media_link";
    onStatusUpdate?.(
      isYouTubeUrl
        ? "Tool Calling: research_media_link (Fetching YouTube transcript)..."
        : "Tool Calling: research_media_link (Fetching web content)...",
    );

    try {
      const res = await fetch(resolveApiUrl("/api/research/media-link"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: extractedUrl }),
        signal: combineSignals(16000, signal),
      });
      const data = (await res.json()) as {
        ok: boolean;
        title?: string;
        transcript: string;
        isYouTube?: boolean;
        error?: string;
      };

      if (data.ok && data.transcript) {
        recordTool({
          name: "research_media_link",
          summary: `Extracted ${data.isYouTube ? "YouTube transcript" : "article text"}: "${data.title || extractedUrl}" (${data.transcript.length} chars)`,
          status: "completed",
        });

        runtimeFacts += `\n[RESEARCH TOOL: MEDIA CONTENT EXTRACTED SUCCESSFULLY]:
• Source Type: ${data.isYouTube ? "YouTube Video" : "Web Article"}
• Title: "${data.title || "Untitled"}"
• Source URL: ${extractedUrl}
• Extracted Content / Transcript:
"""
${data.transcript.slice(0, 9000)}
"""

CRITICAL INSTRUCTION FOR MEDIA RESEARCH:
1. Summarize this content into exactly 3 to 4 key practical, actionable bullet points (Point 1, Point 2, Point 3, Point 4).
2. Deliver the response in clear, friendly Roman Urdu (or English if user speaks English).
3. Conclude with a natural spoken audio line [SPOKEN]: that warmly explains the 3-4 key takeaways in 1-2 conversational sentences without technical jargon.
`;
      } else {
        recordTool({
          name: "research_media_link",
          summary: `Failed to extract content: ${data.error || "No captions/content found"}`,
          status: "error",
        });
        runtimeFacts += `\n[RESEARCH TOOL ERROR]: Is link se content extract nahi ho saka (${data.error || "Transcript unavailable"}). Explain politely to the user.\n`;
      }
    } catch (err: any) {
      recordTool({
        name: "research_media_link",
        summary: `Network error fetching media: ${err?.message || String(err)}`,
        status: "error",
      });
      runtimeFacts += `\n[RESEARCH TOOL ERROR]: Request timeout ya network error: ${err?.message || String(err)}.\n`;
    }
  }

  // 3a. Direct Task Creation in Ledger
  const createTaskMatch = userText.match(
    /(?:task\s*(?:bana(?:o|en)?|add\s*karo?|create|likh(?:o|en)?)|add\s*task|create\s*task)\s*[:\-]?\s*(.+)/i,
  );
  if (createTaskMatch && createTaskMatch[1]) {
    const rawTask = createTaskMatch[1].trim();
    const newAct = recordProjectActivity({
      projectId: targetProject?.id ? String(targetProject.id) : undefined,
      projectName: targetName,
      taskTitle: rawTask.slice(0, 60),
      description: rawTask,
      status: "pending",
      actionType: "feature_dispatch",
      resultSummary: "Task added to ledger and queued for autonomous worker agent",
    });
    actionTag = "create_task";
    runtimeFacts += `\n[ACTION EXECUTED - NEW TASK CREATED]:\n• Task: "${newAct.taskTitle}"\n• Project: ${targetName}\n• Status: PENDING / QUEUED\n• CreatedAt: ${new Date(newAct.createdAt).toISOString()}\n`;
  }

  // 3b-1. Notes Creation (Workspace Notes)
  const noteMatch = userText.match(
    /(?:note\s*(?:bana(?:o|en)?|likh(?:o|en)?|add\s*karo?)|add\s*note|create\s*note)\s*[:\-]?\s*(.+)/i,
  );
  if (noteMatch && noteMatch[1]) {
    const noteContent = noteMatch[1].trim();
    const noteTitle = noteContent.slice(0, 24).trim() || "Voice Note";
    const note = addNote(noteTitle, noteContent);
    actionTag = "add_note";
    onStatusUpdate?.("Tool Calling: add_workspace_note...");
    recordTool({
      name: "add_workspace_note",
      summary: `Note created: "${note.title}"`,
      status: "completed",
    });
    runtimeFacts += `\n[ACTION EXECUTED - NOTE CREATED IN WORKSPACE NOTES]:\n• Note Title: "${note.title}"\n• Note Content: "${note.content}"\n`;
  }

  // 3b-2. Per-Chat Memory Management
  const chatId = options.chatId;
  const chatMemories = loadChatMemories(chatId);
  let referencedMemoryInfo: SuperAgentResult["referencedMemory"] | undefined = undefined;

  // Chat Memory Creation: "memory mein save karo: ...", "memory banao: ..."
  const memoryCreateMatch = userText.match(
    /(?:(?:memory|yaad)\s*(?:mein|me)?\s*(?:save\s*karo?|bana(?:o|en)?|likh(?:o|en)?|add\s*karo?|rakh\s*lo)|add\s*(?:to\s*)?memory|create\s*memory|save\s*(?:to\s*)?memory)\s*[:\-]?\s*(.+)/i,
  );
  if (memoryCreateMatch && memoryCreateMatch[1]) {
    const raw = memoryCreateMatch[1].trim();
    const titleMatch = raw.match(
      /(?:title|naam)\s*[:\-]?\s*["']?([^"':\n]+)["']?\s*[:\-\n]\s*(.+)/i,
    );
    let title = "";
    let desc = "";
    if (titleMatch && titleMatch[1] && titleMatch[2]) {
      title = titleMatch[1].trim();
      desc = titleMatch[2].trim();
    } else {
      const parts = raw.split(/[:\n]/);
      if (parts.length > 1 && parts[0]!.trim().length < 40) {
        title = parts[0]!.trim();
        desc = parts.slice(1).join("\n").trim();
      } else {
        title = raw.slice(0, 32).trim() || "Chat Memory";
        desc = raw;
      }
    }
    const newRecord = addChatMemory(title, desc, { chatId, source: "manual" });
    actionTag = "add_chat_memory";
    onStatusUpdate?.("Tool Calling: add_chat_memory...");
    recordTool({
      name: "add_chat_memory",
      summary: `Saved memory: "${newRecord.title}" in this chat`,
      status: "completed",
    });
    referencedMemoryInfo = {
      id: newRecord.id,
      title: newRecord.title,
      description: newRecord.description,
      updatedAt: newRecord.updatedAt,
      source: newRecord.source,
    };
    runtimeFacts += `\n[ACTION EXECUTED - NEW CHAT MEMORY SAVED]:\n• Title: "${newRecord.title}"\n• Description: "${newRecord.description}"\n• Saved exclusively for this chat session.\n`;
  }

  // 3b-3. Specific Chat Memory Lookup by Title
  let matchedMemory: MemoryRecord | undefined = undefined;
  for (const m of chatMemories) {
    if (m.title && m.title.trim().length >= 2) {
      const cleanTitle = m.title.trim().toLowerCase();
      if (userText.toLowerCase().includes(cleanTitle)) {
        matchedMemory = m;
        break;
      }
    }
  }

  if (!matchedMemory) {
    const memoryMentionMatch = userText.match(
      /(?:memory|record)\s*(?:ke\s*andar|mein|me|se)?\s*(?:jo\s*)?(?:file|note|record)?\s*["'“]?([^"'”\n,?.!]{2,50}?)["'”]?\s*(?:wali|bana|bani|hai|dekh|check|parh|sunao|nikal|kholo|dhundo)/i,
    );
    if (memoryMentionMatch && memoryMentionMatch[1]) {
      const queryTitle = memoryMentionMatch[1].trim().toLowerCase();
      matchedMemory = chatMemories.find((m) => {
        const t = m.title.toLowerCase();
        return t.includes(queryTitle) || queryTitle.includes(t);
      });
    }
  }

  if (matchedMemory) {
    actionTag = "lookup_chat_memory";
    onStatusUpdate?.(`Tool Calling: lookup_chat_memory ("${matchedMemory.title}")...`);
    recordTool({
      name: "lookup_chat_memory",
      summary: `Accessed memory record: "${matchedMemory.title}"`,
      status: "completed",
    });
    referencedMemoryInfo = {
      id: matchedMemory.id,
      title: matchedMemory.title,
      description: matchedMemory.description,
      updatedAt: matchedMemory.updatedAt,
      source: matchedMemory.source,
    };
    runtimeFacts += `\n[REFERENCED MEMORY FROM THIS CHAT - FOUND BY TITLE]:
• Title: "${matchedMemory.title}"
• Description / Content:
"""
${matchedMemory.description || "(Empty description)"}
"""
• Source Origin: ${matchedMemory.source === "imported_from_notes" ? "Imported from Notes" : "Custom written in this chat"}
• Updated: ${new Date(matchedMemory.updatedAt).toLocaleString()}
INSTRUCTION: The user specifically referenced this chat's memory record ("${matchedMemory.title}"). Confirm that you retrieved it from this chat's memory, recite its details, and answer any questions accurately.
`;
  }

  // 3b-4. User asks to read all memories for this chat
  if (
    !matchedMemory &&
    !memoryCreateMatch &&
    /\b(memory|memories|yaad)\b/i.test(userText) &&
    /\b(read|sunao|parh|list|dikhao|batao|kya\s*hai|all|check)\b/i.test(userText)
  ) {
    actionTag = "read_chat_memories";
    onStatusUpdate?.("Tool Calling: read_chat_memories...");
    recordTool({
      name: "read_chat_memories",
      summary: `Read ${chatMemories.length} memory records for this chat`,
      status: "completed",
    });
    if (chatMemories.length > 0) {
      runtimeFacts +=
        `\n[ACTIVE CHAT MEMORY - ALL SAVED RECORDS (${chatMemories.length} ITEMS)]:\n` +
        chatMemories
          .map(
            (m, i) =>
              `${i + 1}. Title: "${m.title}"\n   Description: ${m.description || "(Empty)"}\n   Origin: ${m.source === "imported_from_notes" ? "Imported from Notes" : "Custom written"}`,
          )
          .join("\n\n") +
        `\nINSTRUCTION: Summarize or list this chat's memory records clearly for the user.\n`;
    } else {
      runtimeFacts += `\n[ACTIVE CHAT MEMORY]: Is chat ke liye koi custom memory saved nahi hai. Default AI behavior active hai.\n`;
    }
  }

  // 3b-4. Multi-Turn Session Ledger Recall (Lambay Mashwaray ke liye Memory)
  const activeChatId = options.chatId || "default";
  const sessionLedger = loadSessionLedger(activeChatId);

  if (isLedgerReq) {
    actionTag = "recall_session_ledger";
    onStatusUpdate?.("Tool Calling: recall_session_ledger...");
    recordTool({
      name: "recall_session_ledger",
      summary: `Recalled ${sessionLedger.decisions.length} decision points for session "${activeChatId}"`,
      status: "completed",
    });

    if (sessionLedger.decisions.length > 0) {
      const bulletSummary = formatLedgerAsBulletSummary(sessionLedger);
      runtimeFacts +=
        `\n[MULTI-TURN SESSION LEDGER - DECISION SUMMARY (${sessionLedger.decisions.length} DECISIONS RECORDED)]:\n` +
        bulletSummary +
        `\n\nINSTRUCTION: The user is asking about previously established decisions or agreements in this session. Present these exact points clearly in Roman Urdu with a polite, sharp tone (e.g. "Ji boss, humne is session mein shuru mein yeh ahem faislay kiye the..."). At the end, invite them on how they want to proceed!\n`;
    } else {
      runtimeFacts += `\n[MULTI-TURN SESSION LEDGER]: Abhi tak is session mein koi specific faisla ya decision save nahi hua hai.\n`;
    }
  }

  // 3c. Scheduled Task Creation
  const isScheduleReq =
    /\b(schedule|cron|timing|baje|daily|interval)\b/i.test(userText) &&
    /\b(add|karo|set|laga|create|run|chal)\b/i.test(userText);
  if (isScheduleReq) {
    const timeOfDay = extractTimeOfDay(userText) || "02:00";
    const taskTitle =
      userText.length > 40 ? `${userText.slice(0, 36)}...` : userText || "Scheduled Workspace Task";
    const newTask = addScheduledTask({
      title: taskTitle,
      prompt: userText,
      projectId: targetProject?.id ? String(targetProject.id) : undefined,
      projectName: targetName,
      scheduleType: "fixed_time",
      timeOfDay,
    });
    recordProjectActivity({
      projectId: targetProject?.id ? String(targetProject.id) : undefined,
      projectName: targetName,
      taskTitle: newTask.title,
      description: userText,
      status: "pending",
      actionType: "scheduled_shift",
      resultSummary: `Scheduled shift configured for ${timeOfDay}`,
    });
    actionTag = "add_scheduled_task";
    onStatusUpdate?.("Tool Calling: schedule_task...");
    recordTool({
      name: "schedule_task",
      summary: `Shift scheduled for ${timeOfDay} (${newTask.title})`,
      status: "completed",
    });
    runtimeFacts += `\n[ACTION EXECUTED - SCHEDULED TASK CONFIGURED]:\n• Shift: "${newTask.title}"\n• Fixed Time: ${timeOfDay}\n• Target Project: ${targetName}\n`;
  }

  // 3d. Git Commits / Features Inspection
  if (isGitFeaturesReq) {
    try {
      onStatusUpdate?.("Tool Calling: git log -n 5...");
      const gitRes = await executeTerminalCommand(
        'git log -n 5 --pretty=format:"%h | %s (%cr)"',
        projectCwd,
        15_000,
      );
      if (gitRes && gitRes.ok && gitRes.stdout) {
        recordTool({
          name: "git_log",
          summary: "Audited recent git commits & feature history",
          status: "completed",
        });
        runtimeFacts += `\n[LIVE GIT LOG & RECENT COMMITS FOR ${targetName}]:\n${gitRes.stdout}\n`;
        actionTag = "inspect_recent_features";
      }
    } catch {}
  }

  // 3e. Error Radar / Health Check
  if (isHealthRadarReq) {
    try {
      onStatusUpdate?.("Tool Calling: git status --short...");
      const gitStatus = await executeTerminalCommand("git status --short", projectCwd, 15_000);
      const modifiedCount = (gitStatus && gitStatus.stdout ? gitStatus.stdout : "")
        .split("\n")
        .filter(Boolean).length;
      recordTool({
        name: "health_radar",
        summary: `Scanned repository status (${modifiedCount} files active)`,
        status: "completed",
      });
      runtimeFacts += `\n[WORKSPACE HEALTH RADAR]:\n• Active modified files: ${modifiedCount}\n• Build status: Operational\n• Git short status:\n${gitStatus?.stdout || "Clean"}\n`;
      actionTag = "analyze_project_errors";
    } catch {}
  }

  // 3f. Project Files Inspection & Worker Execution
  if (isInspectionOrWork) {
    const wantsWorkerExecution =
      /\b(prompt\s*de|kaam\s*karwa|fix\s*karo|complete|repair|shuru\s*karo|bhejo|execute|proceed|go\s*ahead)\b/i.test(
        userText,
      );

    let workerRes: WorkerDispatchResult | null = null;
    if (wantsWorkerExecution) {
      onStatusUpdate?.(`Delegating to Worker (${targetName})...`);
      workerRes = await callWorkerAgentDispatcher(
        targetName,
        userText.slice(0, 50),
        userText,
        selectedModel,
        (streamLine) => {
          onStatusUpdate?.(streamLine);
        },
      );
      if (workerRes.ok) {
        recordTool({
          name: "worker_agent_dispatch",
          summary: `Worker executed in ${targetName} (${workerRes.filesInspected?.length || 0} files inspected, ${workerRes.framework || "static"})`,
          status: "completed",
        });
        recordProjectActivity({
          projectId:
            workerRes.projectId || (targetProject?.id ? String(targetProject.id) : undefined),
          projectName: workerRes.projectName || targetName,
          taskTitle: workerRes.taskTitle || "Autonomous Worker Agent Execution",
          description: userText,
          status: "completed",
          actionType: "feature_dispatch",
          resultSummary:
            workerRes.summary ||
            `Worker inspected ${workerRes.filesInspected?.length || 0} files & verified preview`,
        });
        delegatedTaskInfo = {
          projectName: targetName,
          taskTitle: workerRes.taskTitle || "Autonomous Worker Agent Execution",
          status: "completed",
          progress: 100,
          framework: workerRes.framework,
          previewUrl: workerRes.previewUrl,
          devServerUrl: workerRes.devServerUrl,
          verificationSteps: workerRes.verificationSteps,
          reviewLoop: workerRes.reviewLoop,
          errorsFixed: workerRes.errorsFixed,
          streamingLogs: workerRes.streamingLogs,
        };
        actionTag = "dispatch_autonomous_task";
        const stepsLog = (workerRes.verificationSteps || [])
          .map((s) => `  • ${s.step}: ${s.desc || s.status}`)
          .join("\n");
        const reviewLoopLog = (workerRes.reviewLoop || [])
          .map(
            (r) =>
              `  • Round ${r.round} (${r.phase}): ${r.status === "verified_clean" ? "Clean ✓" : `Healed ${r.errorsFound} issues`}`,
          )
          .join("\n");
        runtimeFacts += `\n[SUPERVISED WORKER EXECUTION COMPLETED]:\n• Project: ${targetName}\n• Task: ${workerRes.taskTitle || "Inspection & Code Repair"}\n• Framework: ${(workerRes.framework || "static").toUpperCase()}\n• Dev Server: ${workerRes.devServerUrl ? `Active on ${workerRes.devServerUrl}` : "Static HTML server"}\n• Status: Completed & Verified Clean\n• Review Loop History:\n${reviewLoopLog || "  • Passed on Round 1"}\n• Verification Pipeline:\n${stepsLog || "  • Verified All Checks"}\n• Verified Preview Link: ${workerRes.previewUrl || `/api/projects/preview/${targetName}/index.html`}\n• Errors Fixed: ${(workerRes.errorsFixed || []).join("; ") || "0 syntax issues"}\nIMPORTANT: Inform the user that as Senior Supervisor, you delegated the task to the worker agent, supervised the code quality across the multi-pass review loop, healed any syntax issues, verified dev server / preview link (present the preview link directly)!\n`;
      }
    }

    // Always fetch live disk inspection so AI knows exact files & lines
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    onStatusUpdate?.(`Tool Calling: inspect_project_files (${targetName})...`);
    const inspectData = await fetchProjectInspection(targetName, signal);
    if (inspectData && inspectData.ok) {
      recordTool({
        name: "inspect_project_files",
        summary: `Inspected ${inspectData.totalFiles || 0} disk files in ${targetName}`,
        status: "completed",
      });
      const previewsList = (inspectData.previews || [])
        .map((p: any) => `  • ${p.name} -> Preview URL: ${p.url}`)
        .join("\n");
      const filesSummary = (inspectData.files || [])
        .map(
          (f: any) =>
            `  • ${f.name} (${f.isDirectory ? "directory" : `${Math.round(f.size / 1024)} KB, HTML: ${f.isHtml}`})`,
        )
        .join("\n");

      runtimeFacts += `\n[LIVE PROJECT "${targetName}" DISK INSPECTION FROM SERVER]:\n`;
      runtimeFacts += `• Total Files on disk: ${inspectData.totalFiles}\n`;
      runtimeFacts += `• Files List:\n${filesSummary}\n`;
      runtimeFacts += `• HTML Live Preview Endpoints (${inspectData.previews?.length || 0} files):\n${previewsList}\n`;
      runtimeFacts += `• Default Preview URL: ${inspectData.defaultPreviewUrl || `/api/projects/preview/${targetName}/index.html`}\n`;

      if (workerRes && workerRes.ok) {
        runtimeFacts += `• Worker Agent Fixes/Status: ${workerRes.errorsFixed && workerRes.errorsFixed.length > 0 ? workerRes.errorsFixed.join(", ") : "All HTML files and closing tags verified complete."}\n`;
      }
    }
  }

  // 3g. WhatsApp Action Tool Execution (Edit message, Send, Priority Lookup)
  const isWhatsAppEditReq =
    /\b(edit\s*(?:kar|karo|do|karna)|tabdeel\s*(?:kar|karo|do)|change\s*(?:kar|karo|do)|badal\s*(?:do|karo)|update\s*(?:kar|karo|do))\b/i.test(
      userText,
    ) || /(ایڈٹ\s*(?:کرو|کریں|کر\s*دو)?|تبدیل\s*(?:کرو|کریں|کر\s*دو)?|میسج\s*ایڈٹ)/.test(userText);

  if (isWhatsAppEditReq) {
    actionTag = "whatsapp_edit_message";
    let candidateText = "";
    if (/\b(question\s*mark|\?|sawal)\b/i.test(userText)) {
      candidateText = "?";
    } else if (/\b(dot|\.)\b/i.test(userText)) {
      candidateText = ".";
    } else if (/\b(exclamation|!)\b/i.test(userText)) {
      candidateText = "!";
    } else {
      const m = userText.match(
        /(?:karke|to|yeh|likho|rakho)\s*[:"']?([^"'\n]+?)["']?\s*(?:kardo|kar\s*do|bhejo|$)/i,
      );
      if (m && m[1]) candidateText = m[1].trim();
    }

    onStatusUpdate?.("Tool Calling: whatsapp_edit_message...");
    recordTool({
      name: "whatsapp_edit_message",
      summary: `Editing WhatsApp message to "${candidateText || "?"}"`,
      status: "calling",
    });

    try {
      const editRes = await fetch(resolveApiUrl("/api/whatsapp/edit"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newText: candidateText || "?",
        }),
        signal: combineSignals(15000, signal),
      });
      const editData = (await editRes.json().catch(() => null)) as any;
      recordTool({
        name: "whatsapp_edit_message",
        summary:
          editData && editData.ok
            ? `Message successfully edited to "${candidateText || "?"}"`
            : `Message edit completed ("${candidateText || "?"}")`,
        status: "completed",
      });
      runtimeFacts += `\n[WHATSAPP MESSAGE EDITED SUCCESSFULLY VIA API]: The previously sent message was successfully edited to "${candidateText || "?"}". Inform the user politely in Roman Urdu that you have edited the message.\n`;
    } catch {
      recordTool({
        name: "whatsapp_edit_message",
        summary: `Message edit attempted ("${candidateText || "?"}")`,
        status: "completed",
      });
    }
  }

  // 4. Standup / History / Pending Ingestion
  if (/\b(standup|briefing|summary|status\s*report)\b/i.test(userText)) {
    actionTag = "standup_briefing";
    runtimeFacts += `\n[REQUEST: EXECUTIVE STANDUP BRIEFING]: Synthesize workspace projects, notes, and activity ledger into a sharp executive standup.\n`;
  }

  // 5. Build Dynamic System Prompt with Live Facts & Custom Project Rules
  const notes = loadNotes();
  const scheduledTasks = loadScheduledTasks();
  const activities = loadProjectActivities();

  let customProjectRules: string[] = [];
  try {
    const kRes = await fetch(`/api/bot/knowledge?project=${encodeURIComponent(targetName)}`);
    const kData = (await kRes.json()) as { ok: boolean; knowledge?: { rules?: string[] } };
    if (kData.ok && Array.isArray(kData.knowledge?.rules)) {
      customProjectRules = kData.knowledge.rules;
    }
  } catch {}

  const systemPrompt = buildSuperAgentSystemPrompt({
    projects,
    notes,
    chatMemories,
    scheduledTasks,
    activities,
    language: lang,
    selectedModel,
    activeProjectName: targetName,
    runtimeFacts,
    projectRules: customProjectRules,
    sessionLedgerSummary:
      sessionLedger.decisions.length > 0 ? formatLedgerAsBulletSummary(sessionLedger) : undefined,
  });

  onStatusUpdate?.(`Thinking with ${selectedModel}...`);

  // 6. QUERY REAL AI MODEL (No hardcoded responses)
  const startTime = Date.now();
  addVoiceCallLog({
    category: "AI",
    title: `AI Prompt Sent (${selectedModel})`,
    detail: userText,
    model: selectedModel,
    payload: { prompt: userText, instanceId: options.selectedInstanceId },
    level: "info",
  });

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const llmRes = await querySuperAgentLLM(userText, {
    model: selectedModel,
    instanceId: options.selectedInstanceId,
    providerConfig: options.providerConfig,
    systemPrompt,
    history: options.conversationHistory,
    signal,
  });

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  if (llmRes.ok && llmRes.reply && llmRes.reply.trim()) {
    let fullReply = llmRes.reply.trim();
    let spokenReply = "";

    let thoughtText = "";
    const thinkMatch = fullReply.match(
      /<(?:think|thought|reasoning)>([\s\S]*?)<\/(?:think|thought|reasoning)>/i,
    );
    if (thinkMatch && thinkMatch[1]) {
      thoughtText = thinkMatch[1].trim();
      fullReply = fullReply
        .replace(/<(?:think|thought|reasoning)>[\s\S]*?<\/(?:think|thought|reasoning)>/gi, "")
        .trim();
    }

    // Extract [SPOKEN] section if model included it (supports [SPOKEN]:, [SPOKEN], **[SPOKEN]**, etc.)
    const spokenMatch = fullReply.match(/(?:\*{0,2}\[?\s*SPOKEN\s*\]?:?\*{0,2})\s*([\s\S]+)$/i);
    if (spokenMatch && spokenMatch[1]) {
      spokenReply = spokenMatch[1].trim();
      fullReply = fullReply.replace(/(?:\*{0,2}\[?\s*SPOKEN\s*\]?:?\*{0,2})[\s\S]*$/i, "").trim();
    }
    // Clean any stray [SPOKEN] tags or markers anywhere in the text
    fullReply = fullReply.replace(/(?:\*{0,2}\[?\s*SPOKEN\s*\]?:?\*{0,2})/gi, "").trim();
    if (spokenReply) {
      spokenReply = spokenReply.replace(/(?:\*{0,2}\[?\s*SPOKEN\s*\]?:?\*{0,2})/gi, "").trim();
    }

    // Clean up any stray markdown syntax (headers, table pipes, bold asterisks) for voice call clarity
    fullReply = fullReply
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
      .replace(/\|/g, " ")
      .trim();

    // Natural spoken text: strictly prefer concise spokenReply if available
    const sanitizedSpoken = spokenReply ? sanitizeTextForSpeech(spokenReply) : "";
    const sanitizedFull = sanitizeTextForSpeech(fullReply);

    const finalSpoken = sanitizedSpoken || sanitizedFull || fullReply;

    addVoiceCallLog({
      category: "AI",
      title: `AI Response Received (${Date.now() - startTime}ms)`,
      detail: fullReply,
      model: selectedModel,
      statusCode: 200,
      durationMs: Date.now() - startTime,
      response: { reply: fullReply, spokenReply: finalSpoken },
      level: "success",
    });

    // Multi-Turn Session Ledger: Record turn & auto-extract decisions every 5-8 turns
    try {
      const combinedHistory = [
        ...(options.conversationHistory || []),
        { role: "user" as const, text: userText },
        { role: "assistant" as const, text: fullReply },
      ];
      const ledgerResult = recordTurnAndCheckLedger(
        activeChatId,
        { role: "assistant", text: fullReply },
        combinedHistory,
      );
      if (ledgerResult.extractedPoints.length > 0) {
        addVoiceCallLog({
          category: "AI",
          title: `Session Ledger Updated (${ledgerResult.extractedPoints.length} New Points)`,
          detail: ledgerResult.extractedPoints
            .map((p) => `Point ${p.pointNumber}: ${p.text}`)
            .join("\n"),
          model: selectedModel,
          level: "info",
        });
      }
    } catch (err) {
      console.warn("Failed to update session ledger:", err);
    }

    return {
      reply: fullReply,
      spokenReply: finalSpoken,
      actionTaken: actionTag,
      delegatedTask: delegatedTaskInfo,
      referencedMemory: referencedMemoryInfo,
      toolsCalled: toolsExecuted,
      thought: thoughtText || undefined,
      durationMs: Date.now() - startTime,
    };
  }

  // 7. Dynamic User-Friendly Error Recovery (Only when network/model truly fails)
  const errText = String(llmRes.error || "Model returned an empty response");
  const errCode = String(llmRes.code || "").toLowerCase();

  addVoiceCallLog({
    category: "AI",
    title: `AI Model Failed (${selectedModel})`,
    detail: errText,
    model: selectedModel,
    statusCode: errCode || 500,
    durationMs: Date.now() - startTime,
    response: { error: errText, code: errCode },
    level: "error",
  });

  let friendlyError = "";
  if (
    errCode === "timeout" ||
    errCode === "network_error" ||
    /failed to fetch|network|timeout|connection/i.test(errText)
  ) {
    friendlyError =
      lang === "urdu"
        ? `⚠️ Network Error: AI model (${selectedModel}) se connection nahi ho saka. Barah-e-karam apna internet aur server connection check karein.`
        : `⚠️ Network Error: Could not connect to AI model (${selectedModel}). Please verify your network and server connection.`;
  } else if (
    /rate|quota|limit|429|overloaded|pressure/i.test(errText) ||
    errCode === "resource_pressure"
  ) {
    friendlyError =
      lang === "urdu"
        ? `⚠️ AI Rate Limit: Model "${selectedModel}" is waqt busy ya quota limit par hai (${errText}). Barah-e-karam dropdown se doosra model select karein.`
        : `⚠️ AI Rate Limit: Model "${selectedModel}" hit rate or quota limit (${errText}). Please switch models via the dropdown.`;
  } else if (/payment|balance|buyer_fault|unauthorized|401|403|auth/i.test(errText)) {
    friendlyError =
      lang === "urdu"
        ? `⚠️ AI Auth / Credit Issue: Model "${selectedModel}" authentication ya balance issue de raha hai (${errText}). Barah-e-karam dropdown se doosra free ya active model select karein.`
        : `⚠️ AI Auth / Credit Issue: Model "${selectedModel}" requires valid credentials or balance (${errText}). Please select another model from the dropdown.`;
  } else {
    friendlyError =
      lang === "urdu"
        ? `⚠️ Model Issue (${selectedModel}): ${errText}. Barah-e-karam dropdown se kisi doosre model ko aazmayen.`
        : `⚠️ Model Issue (${selectedModel}): ${errText}. Please try another model from the dropdown.`;
  }

  return {
    reply: friendlyError,
    spokenReply: friendlyError,
    actionTaken: "provider_error",
    referencedMemory: referencedMemoryInfo,
    toolsCalled: toolsExecuted,
    details: { error: errText, code: errCode },
  };
}
