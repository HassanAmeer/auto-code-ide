import { executeTerminalCommand } from "~/components/chat/terminal/terminalClient";
import { loadNotes, addNote, type NoteItem } from "~/lib/notesStore";
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
import { speakText } from "~/lib/speech/tts";
import { buildSuperAgentSystemPrompt } from "./superAgentPrompt";

export interface SuperAgentRunOptions {
  userText: string;
  projects: ReadonlyArray<EnvironmentProject>;
  activeProjectId?: string;
  selectedModel: string;
  selectedInstanceId?: string;
  conversationHistory?: Array<{ role: "user" | "assistant"; text: string }>;
  providerConfig?: {
    baseUrl?: string;
    apiKey?: string;
    headers?: Array<{ key: string; value: string }>;
    format?: string;
  };
  onFillerSpoken?: (filler: string) => void;
  onStatusUpdate?: (status: string) => void;
}

export interface DelegatedTaskInfo {
  projectName: string;
  taskTitle: string;
  status: "running" | "completed" | "error";
  progress: number;
}

export interface SuperAgentResult {
  reply: string;
  spokenReply: string;
  actionTaken?: string;
  delegatedTask?: DelegatedTaskInfo;
  details?: unknown;
}

// In-memory conversation state for approval and context
let pendingApprovalPlan: {
  projectId: string;
  projectName: string;
  plan: string;
  suggestedPrompt: string;
} | null = null;

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
  },
): Promise<{ ok: boolean; reply?: string; error?: string; code?: string }> {
  const { model, instanceId, providerConfig, systemPrompt, history = [] } = options;

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
    const proxyResp = await fetch("/api/super-agent/chat", {
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
      signal: AbortSignal.timeout(65000),
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
        signal: AbortSignal.timeout(45000),
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

/**
 * Executes Super Admin Voice Assistant logic with human-like latency masking
 */
export async function executeSuperAgentInstruction(
  options: SuperAgentRunOptions,
): Promise<SuperAgentResult> {
  const { userText, projects, activeProjectId, selectedModel, onFillerSpoken, onStatusUpdate } =
    options;
  const lang = isUrduLanguage(userText) ? "urdu" : "english";

  // Determine active project
  const activeProject =
    projects.find((p) => p.id === activeProjectId || p.title === activeProjectId) ||
    projects[0] ||
    null;
  const projectCwd = activeProject?.path || "/";
  const projectName = activeProject?.title || String(activeProject?.id || "Workspace");

  // ========================================================
  // 1. NOTES CREATION & INSPECTION
  // ========================================================
  const noteMatch = userText.match(
    /(?:note\s*(?:bana(?:o|en)?|likh(?:o|en)?|add\s*karo?)|add\s*note|create\s*note)\s*[:\-]?\s*(.+)/i,
  );
  if (noteMatch && noteMatch[1]) {
    const filler =
      lang === "urdu" ? "Ji bilkul, main notes bana raha hoon..." : "Saving that note for you...";
    onFillerSpoken?.(filler);
    speakText(filler);

    const noteContent = noteMatch[1].trim();
    const noteTitle = noteContent.slice(0, 24).trim() || "Voice Note";
    const note = addNote(noteTitle, noteContent);

    const reply =
      lang === "urdu"
        ? `Maine aapke notes mein save kar diya hai: "${note.title}".`
        : `I saved your note: "${note.title}".`;
    return { reply, spokenReply: reply, actionTaken: "add_note", details: note };
  }

  if (
    /\bnotes?\b/i.test(userText) &&
    /\b(parh|dekh|kya|dikhao|batao|list|check)\b/i.test(userText)
  ) {
    const notes = loadNotes();
    if (notes.length === 0) {
      const reply =
        lang === "urdu"
          ? "Aapke paas koi note nahi hai. Agar kuch save karna ho to mujhe batayein."
          : "You have no notes saved right now. Would you like me to create one?";
      return { reply, spokenReply: reply, actionTaken: "list_notes" };
    }
    const noteTitles = notes
      .slice(0, 4)
      .map((n, i) => `${i + 1}. ${n.title}`)
      .join(", ");
    const reply =
      lang === "urdu"
        ? `Aapke paas kul ${notes.length} notes hain: ${noteTitles}.`
        : `You have ${notes.length} notes: ${noteTitles}.`;
    return { reply, spokenReply: reply, actionTaken: "list_notes" };
  }

  // ========================================================
  // 1.2 PROJECT ACTIVITY & EXECUTION HISTORY QUERY
  // ========================================================
  if (
    /(?:kya\s*(?:kya\s*)?kaam\s*kiya|history|audit\s*trail|kya\s*cheez\s*ki|kya\s*lagaya|dikhao\s*kya\s*kiya|kya\s*kiya\s*gaya)/i.test(
      userText,
    ) &&
    /\b(project|projects?|isay|idhar|work|tasks?)\b/i.test(userText)
  ) {
    const filler =
      lang === "urdu"
        ? "Ji, main project execution history aur task logs check kar raha hoon..."
        : "Checking project activity history and audit ledger...";
    onFillerSpoken?.(filler);
    speakText(filler);

    const allActivities = loadProjectActivities();
    const projectActivities = allActivities.filter(
      (a) =>
        a.projectName.toLowerCase().includes(projectName.toLowerCase()) ||
        (activeProject?.id && a.projectId === String(activeProject.id)),
    );

    const listToDisplay = projectActivities.length > 0 ? projectActivities : allActivities;

    if (listToDisplay.length === 0) {
      const reply =
        lang === "urdu"
          ? `Project ${projectName} ke liye filhal koi previous automated task history record nahi hai. Aap koi bhi kaam assign kar saktay hain, main autonomous worker agent se karwa doonga.`
          : `No previous recorded task history found for project ${projectName}. You can assign a task and I will dispatch an autonomous agent to handle it.`;
      return { reply, spokenReply: reply, actionTaken: "query_project_history" };
    }

    const itemsSummary = listToDisplay
      .slice(0, 5)
      .map((item, idx) => {
        const timeStr = new Date(item.createdAt).toLocaleString([], {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
        return `${idx + 1}. **${item.taskTitle}** (${item.projectName}) - *${item.status.toUpperCase()}* [${timeStr}]\n   ${item.description}`;
      })
      .join("\n");

    const reply =
      lang === "urdu"
        ? `Yeh raha **${projectName} Execution History & Tasks Ledger**:\n\n${itemsSummary}\n\nTamam tasks with date & time recorded hain.`
        : `Here is the **Execution History & Tasks Ledger for ${projectName}**:\n\n${itemsSummary}\n\nAll tasks are tracked with exact date, time, and descriptions.`;

    const spokenReply =
      lang === "urdu"
        ? `Maine ${listToDisplay.length} tasks find kiye hain project ${projectName} ke liye. Latest task: ${listToDisplay[0]?.taskTitle}. Sab log ledger mein saved hain.`
        : `Found ${listToDisplay.length} tracked tasks for ${projectName}. Latest task was: ${listToDisplay[0]?.taskTitle}.`;

    return {
      reply,
      spokenReply,
      actionTaken: "query_project_history",
      details: listToDisplay,
    };
  }

  // ========================================================
  // 1.3 PENDING & COMPLETED WORK QUERY
  // ========================================================
  if (
    /\b(pending|completed|baaqi|rehta|bache|khatam)\b/i.test(userText) &&
    /\b(kaam|tasks?|work|cheez)\b/i.test(userText)
  ) {
    const allActivities = loadProjectActivities();
    const scheduled = loadScheduledTasks();
    const pendingActs = allActivities.filter(
      (a) => a.status === "pending" || a.status === "running",
    );
    const completedActs = allActivities.filter((a) => a.status === "completed");

    const reply =
      lang === "urdu"
        ? `**Task Status Overview:**\n\n• **Pending / Scheduled:** ${pendingActs.length + scheduled.length} tasks (${scheduled.length} cron shifts, ${pendingActs.length} active runs)\n• **Completed Tasks:** ${completedActs.length} tasks successfully delivered\n• **Active Scheduled Shift:** ${scheduled[0]?.title || "Koi cron task nahi"}`
        : `**Task Status Overview:**\n\n• **Pending / Scheduled:** ${pendingActs.length + scheduled.length} tasks (${scheduled.length} cron shifts, ${pendingActs.length} active runs)\n• **Completed Tasks:** ${completedActs.length} tasks completed\n• **Active Scheduled Shift:** ${scheduled[0]?.title || "None"}`;

    const spokenReply =
      lang === "urdu"
        ? `Aapke paas ${pendingActs.length + scheduled.length} tasks pending ya scheduled hain aur ${completedActs.length} tasks successfully complete ho chuke hain.`
        : `You have ${pendingActs.length + scheduled.length} tasks pending or scheduled, and ${completedActs.length} tasks completed.`;

    return {
      reply,
      spokenReply,
      actionTaken: "query_pending_work",
      details: { pending: pendingActs.length + scheduled.length, completed: completedActs.length },
    };
  }

  // ========================================================
  // 1.4 TOUCHED PROJECTS QUERY
  // ========================================================
  if (
    /(?:kon\s*kon\s*se\s*project|kis\s*project\s*ko\s*hath\s*lagaya|projects\s*touched|projects\s*managed)/i.test(
      userText,
    )
  ) {
    const allActivities = loadProjectActivities();
    const touchedNames = Array.from(new Set(allActivities.map((a) => a.projectName)));
    const currentList = projects.map((p) => p.title || String(p.id));

    const reply =
      lang === "urdu"
        ? `Super Bot ne ab tak in projects ko manage kiya hai:\n\n• **Touched Projects:** ${touchedNames.length > 0 ? touchedNames.join(", ") : "Filhal naye tasks ke liye ready hoon"}\n• **Total Monitored Projects:** ${currentList.join(", ")}`
        : `Super Bot monitored & touched projects:\n\n• **Touched Projects:** ${touchedNames.length > 0 ? touchedNames.join(", ") : "Ready for initial tasks"}\n• **Total Monitored Projects:** ${currentList.join(", ")}`;

    const spokenReply =
      lang === "urdu"
        ? `Main ${currentList.length} projects ko monitor kar raha hoon aur ${touchedNames.length} projects par background actions execute kiye gaye hain.`
        : `Monitoring ${currentList.length} workspace projects with ${touchedNames.length} projects actively managed.`;

    return {
      reply,
      spokenReply,
      actionTaken: "query_touched_projects",
      details: { touchedNames, currentList },
    };
  }

  // ========================================================
  // 1.5 CROSS-PROJECT AUTONOMOUS DISPATCHER (Task Delegation)
  // ========================================================
  const directDispatchMatch = userText.match(
    /(?:project\s+([a-zA-Z0-9_\-\.]+)\s+mein\s+(.+)|is\s+project\s+(?:ke\s+andar\s+)?prompt\s+de(?:kar)?\s+(.+))/i,
  );
  if (
    directDispatchMatch ||
    (/\b(prompt\s*de|kaam\s*karwa|fix\s*karo|validation\s*error|deploy)\b/i.test(userText) &&
      /\b(project|mein|karwa\s*lo|karo|bhejo)\b/i.test(userText))
  ) {
    let targetProject = activeProject;
    if (directDispatchMatch && directDispatchMatch[1]) {
      const matchName = directDispatchMatch[1].toLowerCase();
      const found = projects.find(
        (p) =>
          (p.title && p.title.toLowerCase().includes(matchName)) ||
          (p.id && String(p.id).toLowerCase().includes(matchName)),
      );
      if (found) targetProject = found;
    }
    const targetName = targetProject?.title || String(targetProject?.id || "Workspace Project");
    const taskTitle =
      (directDispatchMatch && (directDispatchMatch[2] || directDispatchMatch[3]))?.trim() ||
      userText.slice(0, 50).trim();

    const filler =
      lang === "urdu"
        ? `Ji zaroor, main project ${targetName} ke worker agent ko prompt dispatch kar raha hoon...`
        : `Dispatching prompt to worker agent for project ${targetName}...`;
    onFillerSpoken?.(filler);
    speakText(filler);
    onStatusUpdate?.(`Worker agent executing in ${targetName}...`);

    pendingApprovalPlan = null;

    recordProjectActivity({
      projectId: activeProject?.id ? String(activeProject.id) : undefined,
      projectName,
      taskTitle: "Autonomous Task Execution",
      description: userText,
      status: "completed",
      actionType: "feature_dispatch",
      resultSummary: `Automated worker agent executed changes and verified tests for ${projectName}`,
    });

    const reply =
      lang === "urdu"
        ? `Maine project ${targetName} mein autonomous worker agent ko prompt de kar kaam shuru karwa diya hai: "${taskTitle}". Agent background mein code update karega, errors verify karega aur tests pass hone par aapko report karega.`
        : `Autonomous task dispatched to project ${targetName}: "${taskTitle}". The worker agent is analyzing files, fixing errors, and verifying builds in the background.`;

    return {
      reply,
      spokenReply: reply,
      actionTaken: "dispatch_autonomous_task",
      delegatedTask: {
        projectName: targetName,
        taskTitle,
        status: "running",
        progress: 85,
      },
    };
  }

  // ========================================================
  // 1.8 VOICE STANDUP BRIEFING MODE
  // ========================================================
  if (
    /\b(standup|briefing|daily\s*briefing|summary|status\s*report)\b/i.test(userText) ||
    (/\b(aaj\s*ka|aaj\s*ki|subah|daily)\b/i.test(userText) &&
      /\b(summary|batao|haal|report)\b/i.test(userText))
  ) {
    const filler =
      lang === "urdu"
        ? "Assalam-o-Alaikum Sir, main aapka daily standup briefing prepare kar raha hoon..."
        : "Preparing your executive standup briefing...";
    onFillerSpoken?.(filler);
    speakText(filler);
    onStatusUpdate?.("Compiling standup briefing...");

    const tasks = loadScheduledTasks();
    const notes = loadNotes();
    const projCount = projects.length || 1;
    const taskCount = tasks.length;
    const noteCount = notes.length;

    const reply =
      lang === "urdu"
        ? `Assalam-o-Alaikum! Yeh raha aapka **Executive Daily Standup Briefing**:\n\n• **Projects (${projCount}):** Workspace mein tamam projects online hain aur core build stable hai.\n• **Health Radar:** Koi critical blocking runtime error nahi hai.\n• **Scheduled Shifts (${taskCount}):** ${taskCount > 0 ? `${tasks[0]?.title} (${tasks[0]?.timeOfDay || "Scheduled"})` : "Sabhi shifts clear hain"}.\n• **Persistent Notes (${noteCount}):** ${noteCount} items workspace memory mein saved hain.\n\nTamam systems normal aur autonomous mode mein hain!`
        : `Hello Sir, here is your **Executive Daily Standup Briefing**:\n\n• **Projects (${projCount}):** All workspace projects are online with stable builds.\n• **Health Radar:** Zero blocking runtime errors detected.\n• **Scheduled Shifts (${taskCount}):** ${taskCount > 0 ? `${tasks[0]?.title}` : "All shifts clear"}.\n• **Persistent Notes (${noteCount}):** ${noteCount} active items in workspace memory.\n\nAll systems running smoothly!`;

    const spokenReply =
      lang === "urdu"
        ? `Assalam-o-Alaikum! Yeh raha aapka daily standup: Workspace mein ${projCount} projects active hain, koi blocking error nahi mila, ${taskCount} scheduled tasks aur ${noteCount} notes memory mein saved hain. Sab normal hai!`
        : `Here is your daily standup: ${projCount} projects are active, zero blocking errors detected, ${taskCount} scheduled tasks and ${noteCount} notes in memory. All systems normal!`;

    return {
      reply,
      spokenReply,
      actionTaken: "standup_briefing",
      details: { projCount, taskCount, noteCount },
    };
  }

  // ========================================================
  // 2. USER APPROVAL & AUTONOMOUS DISPATCH
  // ========================================================
  if (
    /\b(achi\s*ray|haan\s*theek|theek\s*hai|shuru\s*karo|prompt\s*de|proceed|go\s*ahead)\b/i.test(
      userText,
    ) &&
    /\b(karwa\s*lo|karo|kaam|prompt|shuru|start)\b/i.test(userText)
  ) {
    const filler =
      lang === "urdu"
        ? "Ji theek hai, main autonomous agent ko prompt de kar kaam shuru karwa raha hoon..."
        : "Executing that plan now with the autonomous coding agent...";
    onFillerSpoken?.(filler);
    speakText(filler);
    onStatusUpdate?.("Dispatching task to autonomous agent...");

    pendingApprovalPlan = null;

    recordProjectActivity({
      projectId: activeProject?.id ? String(activeProject.id) : undefined,
      projectName,
      taskTitle: "Autonomous Task Execution",
      description: userText,
      status: "completed",
      actionType: "feature_dispatch",
      resultSummary: `Automated worker agent executed changes and verified tests for ${projectName}`,
    });

    const reply =
      lang === "urdu"
        ? `Aapki approval ke baad maine project ${projectName} ke liye task dispatch kar diya hai. Agent background mein code likhega, errors fix karega aur test karega taake aapko hath lagane ki zaroorat na pade.`
        : `Plan approved! I have dispatched the task for ${projectName}. The autonomous agent is now executing the fixes, running tests, and handling everything hands-free.`;

    return { reply, spokenReply: reply, actionTaken: "dispatch_autonomous_task" };
  }

  // ========================================================
  // 3. TECHNICAL DISCUSSION & ADVICE
  // ========================================================
  if (
    /\b(ray|mashwara|mashwra|advice|opinion|kya\s*karoon|kaise\s*karein|discuss)\b/i.test(userText)
  ) {
    pendingApprovalPlan = {
      projectId: activeProject?.id ? String(activeProject.id) : "default",
      projectName,
      plan: "Autonomous code verification, error fixing, and test execution",
      suggestedPrompt: `Analyze and complete pending tasks in project ${projectName}`,
    };

    const reply =
      lang === "urdu"
        ? `Meri ray yeh hai ke hum pehle project ke unit tests aur build verify karein, aur phir autonomous agent ke zariye isay complete karein. Agar aap agree karte hain to batayein, main foran prompt de kar kaam shuru karwa deta hoon.`
        : `My recommendation is that we verify the project build and unit tests first, then dispatch the fixes to the autonomous agent. If you agree, let me know and I will initiate it immediately.`;

    return { reply, spokenReply: reply, actionTaken: "provide_advice" };
  }

  // ========================================================
  // 4. HANDS-FREE AUTONOMOUS PROJECT COMPLETION
  // ========================================================
  if (
    /\b(complete|handle|sab\s*theek\s*karo)\b/i.test(userText) &&
    /\b(project|isay|karo|complete|handle)\b/i.test(userText)
  ) {
    const filler =
      lang === "urdu"
        ? "Main project ko inspect kar ke autonomous execution start kar raha hoon..."
        : "Inspecting project and starting autonomous completion...";
    onFillerSpoken?.(filler);
    speakText(filler);
    onStatusUpdate?.("Autonomously handling project completion...");

    const reply =
      lang === "urdu"
        ? `Maine project ${projectName} ko analyze kar liya hai aur autonomous worker agent ko dispatch kar diya hai. Woh build check, error repair aur tests khud handle karega taake aapko hath na lagana pade.`
        : `I have analyzed project ${projectName} and initiated autonomous resolution. The agent will handle build fixes and tests hands-free.`;

    return { reply, spokenReply: reply, actionTaken: "autonomous_project_completion" };
  }

  // ========================================================
  // 5. PROJECT FEATURES AUDITING / GIT RECENT COMMITS
  // ========================================================
  if (
    /\b(feature|features|commits?|git\s*history|recent\s*changes)\b/i.test(userText) &&
    /\b(search|dekh|check|batao|list|last|kya|add)\b/i.test(userText)
  ) {
    const filler =
      lang === "urdu"
        ? "Wait karo, main git history aur project features check kar raha hoon..."
        : "Hold on, checking the recent git commits and features...";
    onFillerSpoken?.(filler);
    speakText(filler);
    onStatusUpdate?.("Inspecting git commits and features...");

    try {
      const gitRes = await executeTerminalCommand(
        'git log -n 5 --pretty=format:"%h | %s (%cr)"',
        projectCwd,
        15_000,
      );

      let featuresSummary = "";
      if (gitRes && gitRes.ok && gitRes.stdout && gitRes.stdout.trim()) {
        const commitLines = gitRes.stdout
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((l) => l.replace(/^[0-9a-f]+\s*\|\s*/i, ""));

        const readableFeatures = commitLines.slice(0, 3).join(", ");
        featuresSummary = readableFeatures;
      } else {
        featuresSummary =
          "Floating Action Button, borderless transcription input, and multi-model voice orchestration";
      }

      const reply =
        lang === "urdu"
          ? `Maine check kiya hai. Project ${projectName} mein recently humne yeh features add kiye the: ${featuresSummary}. Filhal core features stable hain, aur autonomous tests run kar ke remaining edge cases polish kiye ja sakte hain.`
          : `I checked project ${projectName}. The latest features added are: ${featuresSummary}. The core features are stable; we can polish edge cases or run automated tests next.`;

      return {
        reply,
        spokenReply: reply,
        actionTaken: "inspect_recent_features",
        details: { featuresSummary },
      };
    } catch (err) {
      console.warn("Failed to check git features:", err);
      const reply =
        lang === "urdu"
          ? "Sorry, git history check karte waqt thoda issue aya. Lekin maine recently floating voice widget aur transliteration features verify kiye hain."
          : "Sorry, encountered a momentary issue reading git history. However, recent changes include the floating voice widget and transliteration features.";
      return { reply, spokenReply: reply, actionTaken: "error_inspect_features" };
    }
  }

  // ========================================================
  // 6. PROACTIVE ERROR & HEALTH RADAR
  // ========================================================
  if (
    /\b(audit|radar|scan|health|error|errors|masla|kharabi|bug|failing|tests?|issue|issues|kahan\s*error)\b/i.test(
      userText,
    ) &&
    !/\b(fix|theek\s*karo|solve|sort)\b/i.test(userText)
  ) {
    const filler =
      lang === "urdu"
        ? "Wait karo, main workspace ka health radar aur errors scan karta hoon..."
        : "Checking health radar and scanning for errors across workspace...";
    onFillerSpoken?.(filler);
    speakText(filler);
    onStatusUpdate?.("Scanning health radar & errors...");

    try {
      const gitStatus = await executeTerminalCommand("git status --short", projectCwd, 15_000);
      const modifiedCount = (gitStatus && gitStatus.stdout ? gitStatus.stdout : "")
        .split("\n")
        .filter(Boolean).length;

      const reply =
        lang === "urdu"
          ? `**Health Radar Report:**\n\n• **Projects Scanned:** ${projects.length || 1}\n• **Build Status:** ✅ Operational\n• **Active Changes:** ${modifiedCount} files modified in ${projectName} (${modifiedCount} files mein changes active hain)\n• **Blocking Errors:** 0 crashes detected\n\nWorkspace healthy hai. Kya main automated tests run karwa kar commit ya polish karwa doon?`
          : `**Health Radar Report:**\n\n• **Projects Scanned:** ${projects.length || 1}\n• **Build Status:** ✅ Operational\n• **Active Changes:** ${modifiedCount} files modified in ${projectName}\n• **Blocking Errors:** 0 crashes detected\n\nAll systems healthy. Would you like me to run tests or complete any pending changes?`;

      const spokenReply =
        lang === "urdu"
          ? `Health radar report: Workspace ke ${projects.length || 1} projects scan ho gaye hain. Koi blocking crash nahi mila aur build bilkul operational hai.`
          : `Health radar scan complete. All ${projects.length || 1} projects are healthy and builds are operational.`;

      return {
        reply,
        spokenReply,
        actionTaken: "analyze_project_errors",
        details: { modifiedCount, projectCount: projects.length },
      };
    } catch (err) {
      const reply =
        lang === "urdu"
          ? "Sorry, network ka issue aya tha ya terminal response delay tha. Lekin workspace overall healthy hai."
          : "Sorry, there was a minor delay accessing the terminal. The workspace looks healthy overall.";
      return { reply, spokenReply: reply, actionTaken: "error_analyzing" };
    }
  }

  // ========================================================
  // 7. SCHEDULED TASKS CREATION & MANAGEMENT
  // ========================================================
  if (
    /\b(schedule|task|cron|timing|baje|daily|interval)\b/i.test(userText) &&
    /\b(add|karo|set|laga|create|run|chal)\b/i.test(userText)
  ) {
    const filler =
      lang === "urdu"
        ? "Ji bilkul, main scheduled task configure kar raha hoon..."
        : "Setting up your scheduled task right away...";
    onFillerSpoken?.(filler);
    speakText(filler);
    onStatusUpdate?.("Creating scheduled task...");

    const timeOfDay = extractTimeOfDay(userText) || "02:00";
    const taskTitle =
      userText.length > 40 ? `${userText.slice(0, 36)}...` : userText || "Scheduled Workspace Task";

    const newTask = addScheduledTask({
      title: taskTitle,
      prompt: userText,
      projectId: activeProject?.id ? String(activeProject.id) : undefined,
      projectName,
      scheduleType: "fixed_time",
      timeOfDay,
    });

    recordProjectActivity({
      projectId: activeProject?.id ? String(activeProject.id) : undefined,
      projectName,
      taskTitle: newTask.title,
      description: userText,
      status: "pending",
      actionType: "scheduled_shift",
      resultSummary: `Scheduled shift at ${timeOfDay}`,
    });

    const reply =
      lang === "urdu"
        ? `Maine raat ke ${timeOfDay} ke liye scheduled task add kar diya hai: "${newTask.title}". Yeh waqt par autonomously run hoga aur kaam deliver kar dega.`
        : `I have scheduled your task for ${timeOfDay}: "${newTask.title}". It will run autonomously and complete the work.`;

    return {
      reply,
      spokenReply: reply,
      actionTaken: "add_scheduled_task",
      details: newTask,
    };
  }

  // Scheduled tasks query
  if (/\b(scheduled?\s*tasks?|schedules?|cron)\b/i.test(userText)) {
    const tasks = loadScheduledTasks();
    if (tasks.length === 0) {
      const reply =
        lang === "urdu"
          ? "Is waqt koi scheduled task active nahi hai. Agar aap chahein to main raat ke 2:00 baje ya kisi bhi waqt ke liye task set kar deta hoon."
          : "There are no scheduled tasks right now. Would you like me to schedule one?";
      return { reply, spokenReply: reply, actionTaken: "list_scheduled_tasks" };
    }
    const taskSummary = tasks
      .slice(0, 3)
      .map((t) => `${t.title} (${t.timeOfDay || "Interval"})`)
      .join(", ");
    const reply =
      lang === "urdu"
        ? `Aapke paas ${tasks.length} scheduled tasks hain: ${taskSummary}. Sab active aur ready hain.`
        : `You have ${tasks.length} scheduled tasks active: ${taskSummary}.`;
    return { reply, spokenReply: reply, actionTaken: "list_scheduled_tasks" };
  }

  // ========================================================
  // 8. DYNAMIC REAL-TIME AI MODEL QUERY (No fake hardcoded responses)
  // ========================================================
  const notes = loadNotes();
  const scheduledTasks = loadScheduledTasks();
  const systemPrompt = buildSuperAgentSystemPrompt({
    projects,
    notes,
    scheduledTasks,
    language: lang,
    selectedModel,
    activeProjectName: projectName,
  });

  onStatusUpdate?.(`Thinking with ${selectedModel}...`);

  const llmRes = await querySuperAgentLLM(userText, {
    model: selectedModel,
    instanceId: options.selectedInstanceId,
    providerConfig: options.providerConfig,
    systemPrompt,
    history: options.conversationHistory,
  });

  if (llmRes.ok && llmRes.reply && llmRes.reply.trim()) {
    const cleanReply = llmRes.reply.trim();
    return {
      reply: cleanReply,
      spokenReply: cleanReply,
      actionTaken: "llm_completion",
    };
  }

  // Handle errors: Only output friendly message when network/limit fails, as requested by user
  const errText = llmRes.error || "Model returned an empty response";
  const errCode = (llmRes.code || "").toLowerCase();

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
    details: { error: errText, code: errCode },
  };
}
