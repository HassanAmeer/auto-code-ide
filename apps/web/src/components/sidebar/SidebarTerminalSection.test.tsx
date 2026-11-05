import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { terminalStore } from "~/components/chat/terminal/terminalStore";
import {
  getTerminalThreadIds,
  addTerminalThreadId,
  removeTerminalThreadId,
  isTerminalThreadId,
} from "~/components/chat/terminal/terminalThreadRegistry";

const storage = new Map<string, string>();
const localStorageMock = {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => storage.set(k, v),
  removeItem: (k: string) => storage.delete(k),
  clear: () => storage.clear(),
};
vi.stubGlobal("localStorage", localStorageMock);
vi.stubGlobal("window", {
  dispatchEvent: vi.fn(),
  localStorage: localStorageMock,
});

describe("SidebarTerminalSection chat management", () => {
  beforeEach(() => {
    storage.clear();
  });

  it("creates a new terminal chat session and sets it active", () => {
    const chat = terminalStore.createTerminalChat({ title: "Test Terminal Chat" });
    expect(chat.id).toBeDefined();
    expect(chat.title).toBe("Test Terminal Chat");

    const state = terminalStore.getState();
    expect(state.terminalChats.some((c) => c.id === chat.id)).toBe(true);
    expect(state.activeChatId).toBe(chat.id);
  });

  it("updates terminal chat title", () => {
    const chat = terminalStore.createTerminalChat({ title: "Old Title" });
    terminalStore.updateTerminalChatTitle(chat.id, "Renamed Title");

    const updated = terminalStore.getState().terminalChats.find((c) => c.id === chat.id);
    expect(updated?.title).toBe("Renamed Title");
  });

  it("deletes a terminal chat session", () => {
    const chat1 = terminalStore.createTerminalChat({ title: "Chat 1" });
    const chat2 = terminalStore.createTerminalChat({ title: "Chat 2" });

    terminalStore.deleteTerminalChat(chat1.id);
    const chats = terminalStore.getState().terminalChats;
    expect(chats.some((c) => c.id === chat1.id)).toBe(false);
    expect(chats.some((c) => c.id === chat2.id)).toBe(true);
  });

  it("switches chat and updates terminal screen with that chat's history", () => {
    const chatA = terminalStore.createTerminalChat({ title: "Session A" });
    terminalStore.recordAiToolRun({
      id: "run_a_1",
      command: "echo 'hello from session A'",
      stdout: "hello from session A\n",
    });

    const chatB = terminalStore.createTerminalChat({ title: "Session B" });
    terminalStore.recordAiToolRun({
      id: "run_b_1",
      command: "echo 'hello from session B'",
      stdout: "hello from session B\n",
    });

    // When switching to Session A, runs must reflect Session A's history
    terminalStore.setActiveChatId(chatA.id);
    let state = terminalStore.getState();
    expect(state.activeChatId).toBe(chatA.id);
    expect(state.runs.some((r) => r.command.includes("Session A") || r.id === "run_a_1")).toBe(
      true,
    );
    expect(state.runs.some((r) => r.id === "run_b_1")).toBe(false);

    // When switching back to Session B, runs must reflect Session B's history
    terminalStore.setActiveChatId(chatB.id);
    state = terminalStore.getState();
    expect(state.activeChatId).toBe(chatB.id);
    expect(state.runs.some((r) => r.id === "run_b_1")).toBe(true);
    expect(state.runs.some((r) => r.id === "run_a_1")).toBe(false);
  });

  it("manages isolated terminal chat running/working status", () => {
    const chat = terminalStore.createTerminalChat({ title: "Isolated Terminal Session" });
    expect(terminalStore.getState().isAnyTerminalRunning).toBe(false);
    expect(terminalStore.getState().runningChatIds[chat.id]).toBeFalsy();

    terminalStore.setChatRunning(chat.id, true);
    expect(terminalStore.getState().isAnyTerminalRunning).toBe(true);
    expect(terminalStore.getState().runningChatIds[chat.id]).toBe(true);

    terminalStore.setChatRunning(chat.id, false);
    expect(terminalStore.getState().isAnyTerminalRunning).toBe(false);
    expect(terminalStore.getState().runningChatIds[chat.id]).toBeFalsy();
  });

  it("registers and isolates terminal threads in registry", () => {
    const testThreadId = "test-terminal-thread-123";
    expect(isTerminalThreadId(testThreadId)).toBe(false);

    addTerminalThreadId(testThreadId);
    expect(isTerminalThreadId(testThreadId)).toBe(true);
    expect(getTerminalThreadIds()).toContain(testThreadId);

    removeTerminalThreadId(testThreadId);
    expect(isTerminalThreadId(testThreadId)).toBe(false);
  });
});
