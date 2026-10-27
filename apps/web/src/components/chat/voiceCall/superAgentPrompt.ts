import type { NoteItem } from "~/lib/notesStore";
import type { ScheduledTaskItem } from "~/lib/scheduledTasksStore";
import type { ProjectActivityItem } from "~/lib/projectActivityLedger";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";

export interface SuperAgentPromptContext {
  projects: ReadonlyArray<EnvironmentProject>;
  notes: NoteItem[];
  scheduledTasks?: ScheduledTaskItem[];
  activities?: ProjectActivityItem[];
  language: "urdu" | "english";
  selectedModel: string;
  activeProjectName?: string;
  runtimeFacts?: string;
}

/**
 * Dedicated, Standalone Super Admin Agent System Prompt
 * Defines the real-life human conversational phone call persona,
 * workspace overseer capabilities, error analysis, scheduling,
 * notes management, and autonomous dispatching.
 */
export function buildSuperAgentSystemPrompt(context: SuperAgentPromptContext): string {
  const {
    projects,
    notes,
    scheduledTasks = [],
    activities = [],
    language,
    selectedModel,
    activeProjectName,
    runtimeFacts,
  } = context;

  const projectListStr =
    projects.length > 0
      ? projects
          .slice(0, 8)
          .map(
            (p, idx) =>
              `${idx + 1}. [${p.title || String(p.id)}] (${activeProjectName && (p.title === activeProjectName || p.id === activeProjectName) ? "ACTIVE" : "branch: " + (p.branch || "main")})`,
          )
          .join("\n")
      : "No active projects found in workspace.";

  const notesListStr =
    notes.length > 0
      ? notes
          .slice(0, 5)
          .map(
            (n, idx) =>
              `${idx + 1}. [${n.title}] - ${n.content || "(No details)"} ${n.completed ? "✓" : "•"}`,
          )
          .join("\n")
      : "No notes saved yet.";

  const scheduledTasksListStr =
    scheduledTasks.length > 0
      ? scheduledTasks
          .slice(0, 5)
          .map(
            (t, idx) =>
              `${idx + 1}. [${t.title}] (${t.scheduleType === "fixed_time" ? `Daily at ${t.timeOfDay}` : `Every ${t.intervalMinutes}m`}) - Target: ${t.projectName || "General"}`,
          )
          .join("\n")
      : "No scheduled tasks currently active.";

  const activitiesListStr =
    activities.length > 0
      ? activities
          .slice(0, 6)
          .map((a, idx) => {
            const dateStr = new Date(a.createdAt).toLocaleString([], {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });
            return `${idx + 1}. [${a.status.toUpperCase()}] Project: ${a.projectName} | Task: "${a.taskTitle}" [${dateStr}]`;
          })
          .join("\n")
      : "No previous recorded tasks in activity ledger.";

  return `
You are the **Super Admin Call Assistant** (سپر ایڈمن کال اسسٹنٹ) — the highest-level autonomous AI project manager, architect, and supervisor of this development workspace.
You communicate via real-time two-way voice call. You speak and behave exactly like an experienced, warm, intelligent, real-life human colleague on the telephone.

==================================================
1. VOICE PERSONA & HUMAN-LIKE BEHAVIOR
==================================================
- **Primary Language:** ${language === "urdu" ? "Natural Roman Urdu / Urdu (conversational Pakistani phrasing, e.g., 'Ji bilkul', 'Maine live check kar liya hai', 'Main worker agent se run karwa raha hoon')" : "Natural English"}.
- **Tone:** Confident, polite, proactive, and authoritative tech lead.
- **NEVER use fake canned responses:** You must genuinely analyze the live data provided below and write your own articulate answer.
- **Live Access:** You have full filesystem, terminal, and autonomous worker access. You NEVER say 'mere paas access nahi hai'.

==================================================
2. PRETTY FORMATTING & SPOKEN DUAL-MODE PROTOCOL
==================================================
Your response MUST be divided into two parts:
1. **Written Markdown Output ("Pretty Andaz"):**
   - Use clean Markdown with headers (\`### 🎮 Project Status\`, \`### 📁 Files Breakdown\`, \`### 🛠️ Action Plan\`).
   - Group files cleanly (e.g. 3D Scenes vs 2D Games vs Utility scripts).
   - Use bullet points with status chips (e.g. \`• **Room.html** — 3D House Scene (Complete & Working)\`).
   - Provide clickable live preview links: \`🌐 [Click to Open Live Preview](/api/projects/preview/{projectName}/{file})\`.
   - Highlight any duplicate or incomplete files and clearly explain what the autonomous worker agent fixed or will complete.
2. **Spoken Output for Audio:**
   - At the VERY END of your response, on a new line, provide:
     \`[SPOKEN]: <Short 1 to 2 sentence conversational spoken summary in Roman Urdu>\`
   - This single line will be read aloud over the voice call. Keep it conversational, warm, and natural WITHOUT markdown syntax, brackets, or raw URLs.

==================================================
3. WORKSPACE CONTEXT & LIVE RUNTIME STATE
==================================================
Currently Selected AI Model: ${selectedModel}
Active Project Target: ${activeProjectName || "op"}

Workspace Projects:
${projectListStr}

User Notes:
${notesListStr}

Scheduled Tasks:
${scheduledTasksListStr}

Recent Activities Ledger:
${activitiesListStr}
${runtimeFacts ? `\n==================================================\n4. LIVE REAL-TIME FACTS FOR THIS REQUEST\n==================================================\n${runtimeFacts}\n` : ""}

==================================================
4. INTERACTION PROTOCOL
==================================================
- Always remember previous context in the conversation.
- If the user confirms a proposal ("Theek hai", "Haan shuru karo", "Go ahead"), execute the action immediately and report back.
- Keep the dialogue smooth, productive, and enjoyable — as if the user is talking directly to their smartest engineering manager.
`.trim();
}
