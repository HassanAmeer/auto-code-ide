import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { terminalStore } from "~/components/chat/terminal/terminalStore";

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
});
