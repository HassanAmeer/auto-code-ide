import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { isUrduLanguage, extractTimeOfDay, executeSuperAgentInstruction } from "./superAgentEngine";
import * as terminalClient from "~/components/chat/terminal/terminalClient";
import * as notesStore from "~/lib/notesStore";
import * as memoryStore from "~/lib/memoryStore";
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
  sanitizeTextForSpeech: vi.fn((text: string) => text),
}));

describe("superAgentEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              ok: true,
              reply: "Mock SuperAgent AI response.\n\n[SPOKEN]: Mock spoken reply.",
              spokenReply: "Mock spoken reply.",
            }),
        });
      }),
    );
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
      expect(res.reply).toBeDefined();
    });

    it("creates workspace notes and keeps them distinct from memory", async () => {
      const res = await executeSuperAgentInstruction({
        userText: "note banao: verify TTS echo cancellation on mobile",
        projects: mockProjects,
        selectedModel: "Gemini 2.5 Flash",
      });

      expect(res.actionTaken).toBe("add_note");
      const notes = notesStore.loadNotes();
      expect(notes.length).toBe(1);
      expect(notes[0]?.title).toContain("verify TTS");
    });

    it("creates per-chat memory records with title and description", async () => {
      const chatId = "chat-session-alpha";
      const res = await executeSuperAgentInstruction({
        userText: "memory mein save karo title Supabase Config: Use public anon key only for auth",
        projects: mockProjects,
        selectedModel: "Gemini 2.5 Flash",
        chatId,
      });

      expect(res.actionTaken).toBe("add_chat_memory");
      expect(res.referencedMemory).toBeDefined();
      expect(res.referencedMemory?.title).toBe("Supabase Config");
      expect(res.referencedMemory?.description).toContain("Use public anon key");

      const chatMemories = memoryStore.loadChatMemories(chatId);
      expect(chatMemories.length).toBe(1);
      expect(chatMemories[0]?.source).toBe("manual");
    });

    it("retrieves chat memory by title when referenced by user", async () => {
      const chatId = "chat-session-beta";
      memoryStore.addMemory("Database Schema", "PostgreSQL tables: users, profiles, tasks", {
        chatId,
        source: "manual",
      });

      const res = await executeSuperAgentInstruction({
        userText: "memory ke andar Database Schema wali file bani hui hai, dekh lo",
        projects: mockProjects,
        selectedModel: "Gemini 2.5 Flash",
        chatId,
      });

      expect(res.actionTaken).toBe("lookup_chat_memory");
      expect(res.referencedMemory).toBeDefined();
      expect(res.referencedMemory?.title).toBe("Database Schema");
      expect(res.referencedMemory?.description).toContain("PostgreSQL tables");
    });

    it("ensures memory isolation across different chats", async () => {
      const chatA = "chat-101";
      const chatB = "chat-102";

      memoryStore.addMemory("Secret Token Rule", "Never commit .env", {
        chatId: chatA,
        source: "manual",
      });

      // Chat A has 1 memory
      const memsA = memoryStore.loadChatMemories(chatA);
      expect(memsA.length).toBe(1);

      // Chat B has 0 memories (fresh chat behavior)
      const memsB = memoryStore.loadChatMemories(chatB);
      expect(memsB.length).toBe(0);

      // Querying Chat B returns no memory lookup
      const resB = await executeSuperAgentInstruction({
        userText: "is chat ki memory mein kya hai?",
        projects: mockProjects,
        selectedModel: "Gemini 2.5 Flash",
        chatId: chatB,
      });
      expect(resB.actionTaken).toBe("read_chat_memories");
      expect(resB.referencedMemory).toBeUndefined();
    });

    it("supports importing notes into chat memory with origin attribution", () => {
      const note = notesStore.addNote("Tailwind Config", "content: ['./src/**/*.{ts,tsx}']");
      expect(notesStore.loadNotes().length).toBe(1);

      const chatId = "chat-session-gamma";
      const imported = memoryStore.importNotesIntoMemory([note], chatId);

      expect(imported.length).toBe(1);
      expect(imported[0]?.title).toBe("Tailwind Config");
      expect(imported[0]?.source).toBe("imported_from_notes");
      expect(imported[0]?.sourceNoteTitle).toBe("Tailwind Config");

      const chatMemories = memoryStore.loadChatMemories(chatId);
      expect(chatMemories.length).toBe(1);
      expect(chatMemories[0]?.source).toBe("imported_from_notes");

      // Full CRUD update
      memoryStore.updateMemory(imported[0]!.id, {
        title: "Updated Tailwind Rules",
        description: "Dark mode: class, and modern tokens",
      });
      const updated = memoryStore.loadChatMemories(chatId);
      expect(updated[0]?.title).toBe("Updated Tailwind Rules");

      // Full CRUD delete
      memoryStore.deleteMemory(imported[0]!.id);
      expect(memoryStore.loadChatMemories(chatId).length).toBe(0);

      // Original note remains completely intact!
      expect(notesStore.loadNotes().length).toBe(1);
    });

    it("recalls multi-turn session ledger decisions when asked 'humne shuru mein kya decide kiya tha'", async () => {
      const { addDecisionPoint } = await import("~/lib/speech/multiTurnSessionLedger");
      const testChatId = "chat-ledger-session";

      addDecisionPoint(testChatId, "LiveKit VPS setup barkarar rakhna hai.");
      addDecisionPoint(testChatId, "Edge-TTS Asad Neural voice use hogi.");
      addDecisionPoint(testChatId, "Codebase review complete ho chuka hai.");

      const res = await executeSuperAgentInstruction({
        userText: "Acha humne shuru mein kya decide kiya tha?",
        projects: [],
        selectedModel: "Gemini 2.5 Flash",
        chatId: testChatId,
      });

      expect(res.actionTaken).toBe("recall_session_ledger");
      expect(res.toolsCalled).toBeDefined();
      expect(res.toolsCalled?.some((t) => t.name === "recall_session_ledger")).toBe(true);
    });

    it("triggers research_media_link tool when user provides a YouTube link", async () => {
      let spokenFiller = "";
      const res = await executeSuperAgentInstruction({
        userText: "Is YouTube video ko research karo https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        projects: [],
        selectedModel: "Gemini 2.5 Flash",
        onFillerSpoken: (f) => {
          spokenFiller = f;
        },
      });

      expect(spokenFiller).toContain("transcript");
      expect(res.actionTaken).toBe("research_media_link");
      expect(res.toolsCalled).toBeDefined();
      expect(res.toolsCalled?.some((t) => t.name === "research_media_link")).toBe(true);
    });
  });
});
