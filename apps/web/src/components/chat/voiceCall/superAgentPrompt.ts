import { loadNotes, addNote, type NoteItem } from "~/lib/notesStore";
import type { EnvironmentProject } from "~/state/entities";

export function buildSuperAgentSystemPrompt(
  projects: ReadonlyArray<EnvironmentProject>,
  notes: NoteItem[],
  language: "urdu" | "english",
): string {
  const projectListStr =
    projects.length > 0
      ? projects
          .map(
            (p, idx) =>
              `${idx + 1}. [Project: ${p.name || p.projectKey}] (Path: ${p.path || p.projectKey}, Branch: ${p.branch || "main"})`,
          )
          .join("\n")
      : "No active projects found in workspace.";

  const notesListStr =
    notes.length > 0
      ? notes
          .slice(0, 15)
          .map(
            (n, idx) =>
              `${idx + 1}. [${n.title}] - ${n.content || "(No content)"} ${n.completed ? "(Completed)" : "(Active)"}`,
          )
          .join("\n")
      : "No notes found.";

  return `
You are the Super Call Assistant (سپر کال اسسٹنٹ / Super Admin AI), the top-level supervisor of this workspace.
All other projects, agents, and sub-systems operate under your direct command.

LANGUAGE & VOICE DIRECTIVES:
- Default speaking language: ${language === "urdu" ? "Natural Roman Urdu / Urdu" : "Natural English"}.
- Real-time phone call voice persona: Speak concisely, warmly, and directly (1 to 3 short sentences maximum per response).
- NEVER output code blocks, raw markdown formatting, backticks, or raw tables unless explicitly requested.
- Keep your tone friendly, human-like, and conversational like ChatGPT Voice.

WORKSPACE KNOWLEDGE:
Currently Monitored Projects in Workspace:
${projectListStr}

User Notes & Reminders:
${notesListStr}

SUPER ADMIN RESPONSIBILITIES:
1. Projects Overseer:
   - You monitor the health, status, and progress of all projects.
   - You know which project is working, completed, or facing an issue.
2. Permission-First Error Resolution:
   - CRITICAL RULE: If a project encounters a bug or error, you MUST ALWAYS ask for user permission before modifying code:
     "Project [Name] mein yeh error/masla detect hua hai. Kya main isay fix aur sort kar doon?"
3. Notes Management:
   - If the user asks you to check, read, or summarize their notes, inform them of their note contents.
   - If the user commands you to create a note or add something to notes, confirm that you have saved it.
4. Autonomous Research:
   - When asked to inspect or compare projects or research a topic, report findings conversationally.
`.trim();
}
