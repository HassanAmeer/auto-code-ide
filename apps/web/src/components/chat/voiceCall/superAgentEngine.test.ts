import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { isUrduLanguage, extractTimeOfDay, executeSuperAgentInstruction } from "./superAgentEngine";
import * as terminalClient from "~/components/chat/terminal/terminalClient";
import * as notesStore from "~/lib/notesStore";
import * as scheduledTasksStore from "~/lib/scheduledTasksStore";
import * as tts from "~/lib/speech/tts";

const mockStorage = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => mockStorage.get(key) || null,
  setItem: (key: string, value: string) => mockStorage.set(key, value),
  removeItem: (key: string) => mockStorage.delete(key),
  clear: () => mockStorage.clear(),
};
vi.stubGlobal("localStorage", localStorageMock);
vi.stubGlobal("window", {
  dispatchEvent: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});

vi.mock("~/components/chat/terminal/terminalClient", () => ({
  executeTerminalCommand: vi.fn(),
}));

vi.mock("~/lib/speech/tts", () => ({
  speakText: vi.fn(),
  stopSpeaking: vi.fn(),
}));

describe("superAgentEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe("language detection & time parsing", () => {
    it("detects Urdu / Roman Urdu accurately", () => {
      expect(isUrduLanguage("humne last kaun se feature add kiye the")).toBe(true);
      expect(isUrduLanguage("ye error fix kar do")).toBe(true);
      expect(isUrduLanguage("سپر کال اسسٹنٹ")).toBe(true);
      expect(isUrduLanguage("hello how are you")).toBe(false);
      expect(isUrduLanguage("list all scheduled tasks")).toBe(false);
    });

    it("extracts time of day from various natural language formats", () => {
      expect(extractTimeOfDay("raat ke 2:00 baje")).toBe("02:00");
      expect(extractTimeOfDay("schedule add kar do 02:00 par")).toBe("02:00");
      expect(extractTimeOfDay("subah 9 baje")).toBe("09:00");
      expect(extractTimeOfDay("run at 2 am")).toBe("02:00");
      expect(extractTimeOfDay("run at 5:30 pm")).toBe("17:30");
      expect(extractTimeOfDay("random text without time")).toBeNull();
    });
  });

  describe("executeSuperAgentInstruction", () => {
    const mockProjects = [
      {
        id: "proj-1",
        title: "auto-code-ide",
        path: "/home/hasan/Documents/reactjs/t3forweb",
        branch: "main",
      },
    ] as any;

    it("audits recent git commits and features when asked", async () => {
      vi.mocked(terminalClient.executeTerminalCommand).mockResolvedValueOnce({
        ok: true,
        command: "git log",
        cwd: "/",
        stdout:
          "a1b2c3d | feat(voice): add floating action button\ne4f5g6h | fix(call): borderless transcription line",
        stderr: "",
        exitCode: 0,
        durationMs: 50,
      });

      const res = await executeSuperAgentInstruction({
        userText: "humne last kaun se feature add kiye the search karke batao",
        projects: mockProjects,
        selectedModel: "Gemini 2.5 Flash",
      });

      expect(res.actionTaken).toBe("inspect_recent_features");
      expect(res.reply).toContain("auto-code-ide");
      expect(tts.speakText).toHaveBeenCalled();
    });

    it("analyzes project errors when asked", async () => {
      vi.mocked(terminalClient.executeTerminalCommand).mockResolvedValueOnce({
        ok: true,
        command: "git status",
        cwd: "/",
        stdout: "M apps/web/src/components/chat/voiceCall/SuperCallAssistantView.tsx\n",
        stderr: "",
        exitCode: 0,
        durationMs: 30,
      });

      const res = await executeSuperAgentInstruction({
        userText: "project ke andar error check karo aur analyze karo",
        projects: mockProjects,
        selectedModel: "Gemini 2.5 Flash",
      });

      expect(res.actionTaken).toBe("analyze_project_errors");
      expect(res.reply).toContain("auto-code-ide");
      expect(res.reply).toContain("files mein changes active hain");
    });

    it("creates a scheduled task with extracted time", async () => {
      const res = await executeSuperAgentInstruction({
        userText: "schedule add kar do ke raat ke 2:00 baje chalne lag jaye",
        projects: mockProjects,
        selectedModel: "Gemini 2.5 Flash",
      });

      expect(res.actionTaken).toBe("add_scheduled_task");
      expect(res.reply).toContain("02:00");
      const tasks = scheduledTasksStore.loadScheduledTasks();
      expect(tasks.length).toBe(1);
      expect(tasks[0]?.timeOfDay).toBe("02:00");
    });

    it("creates and inspects notes", async () => {
      const res1 = await executeSuperAgentInstruction({
        userText: "note banao: verify TTS echo cancellation on mobile",
        projects: mockProjects,
        selectedModel: "Gemini 2.5 Flash",
      });

      expect(res1.actionTaken).toBe("add_note");
      const notes = notesStore.loadNotes();
      expect(notes.length).toBe(1);

      const res2 = await executeSuperAgentInstruction({
        userText: "notes check karo kya hai",
        projects: mockProjects,
        selectedModel: "Gemini 2.5 Flash",
      });
      expect(res2.actionTaken).toBe("list_notes");
      expect(res2.reply).toContain("1 notes");
    });

    it("provides expert advice when asked for an opinion/mashwara", async () => {
      const res = await executeSuperAgentInstruction({
        userText: "Is feature ke baare mein aapki kya ray hai?",
        projects: mockProjects,
        selectedModel: "Gemini 2.5 Flash",
      });

      expect(res.actionTaken).toBe("provide_advice");
      expect(res.reply).toContain("Meri ray yeh hai");
    });

    it("autonomously dispatches execution when user approves advice", async () => {
      const res = await executeSuperAgentInstruction({
        userText: "haan theek hai aapki ray achi hai prompt de kar kaam shuru karwa do",
        projects: mockProjects,
        selectedModel: "Gemini 2.5 Flash",
      });

      expect(res.actionTaken).toBe("dispatch_autonomous_task");
      expect(res.reply).toContain("task dispatch kar diya hai");
    });

    it("handles direct cross-project dispatch with delegatedTask info", async () => {
      const res = await executeSuperAgentInstruction({
        userText: "project auto-code-ide mein login page ka validation error fix kar do",
        projects: mockProjects,
        selectedModel: "Gemini 2.5 Flash",
      });

      expect(res.actionTaken).toBe("dispatch_autonomous_task");
      expect(res.delegatedTask).toBeDefined();
      expect(res.delegatedTask?.projectName).toBe("auto-code-ide");
      expect(res.delegatedTask?.progress).toBe(85);
      expect(res.reply).toContain("worker agent ko prompt de kar");
    });

    it("provides executive daily standup briefing", async () => {
      const res = await executeSuperAgentInstruction({
        userText: "daily standup briefing summary do",
        projects: mockProjects,
        selectedModel: "Gemini 2.5 Flash",
      });

      expect(res.actionTaken).toBe("standup_briefing");
      expect(res.reply).toContain("Executive Daily Standup Briefing");
      expect(res.reply).toContain("Projects (1)");
    });

    it("queries project execution history and task ledger", async () => {
      // First dispatch a task to record in the ledger
      await executeSuperAgentInstruction({
        userText: "project auto-code-ide mein fix login validation error karo",
        projects: mockProjects,
        selectedModel: "Gemini 2.5 Flash",
      });

      // Now query history
      const res = await executeSuperAgentInstruction({
        userText: "is project se dikhana kya kya kaam kiya gaya hai",
        projects: mockProjects,
        selectedModel: "Gemini 2.5 Flash",
      });

      expect(res.actionTaken).toBe("query_project_history");
      expect(res.reply).toContain("Execution History & Tasks Ledger");
    });

    it("queries pending and completed work overview", async () => {
      const res = await executeSuperAgentInstruction({
        userText: "kon sa kaam pending hai aur kon sa complete hua hai",
        projects: mockProjects,
        selectedModel: "Gemini 2.5 Flash",
      });

      expect(res.actionTaken).toBe("query_pending_work");
      expect(res.reply).toContain("Task Status Overview");
    });

    it("handles hands-free project completion command", async () => {
      const res = await executeSuperAgentInstruction({
        userText: "is project ko complete karo aur handle karo",
        projects: mockProjects,
        selectedModel: "Gemini 2.5 Flash",
      });

      expect(res.actionTaken).toBe("autonomous_project_completion");
      expect(res.reply).toContain("autonomous worker agent ko dispatch");
    });
  });
});
