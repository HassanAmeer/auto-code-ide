import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import {
  loadCallSessions,
  createNewCallSession,
  deleteCallSession,
  clearAllCallSessions,
} from "~/lib/callAssistantStore";

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

describe("SidebarBotSection session management", () => {
  beforeEach(() => {
    storage.clear();
  });

  it("creates a new bot chat session with default welcome message", () => {
    const session = createNewCallSession();
    expect(session.id).toBeDefined();
    expect(session.title).toMatch(/Call Session #/);
    expect(session.messages.length).toBeGreaterThan(0);

    const stored = loadCallSessions();
    expect(stored.length).toBe(1);
    expect(stored[0]!.id).toBe(session.id);
  });

  it("creates multiple unique bot chat sessions", () => {
    const s1 = createNewCallSession("Bot Chat 1");
    const s2 = createNewCallSession("Bot Chat 2");

    const stored = loadCallSessions();
    expect(stored.length).toBe(2);
    expect(stored[0]!.title).toBe("Bot Chat 2");
    expect(stored[1]!.title).toBe("Bot Chat 1");
  });

  it("deletes a specific bot chat session", () => {
    const s1 = createNewCallSession("First");
    const s2 = createNewCallSession("Second");

    deleteCallSession(s1.id);
    const stored = loadCallSessions();
    expect(stored.length).toBe(1);
    expect(stored[0]!.id).toBe(s2.id);
  });

  it("clears all bot chat sessions", () => {
    createNewCallSession("Chat A");
    createNewCallSession("Chat B");
    expect(loadCallSessions().length).toBe(2);

    clearAllCallSessions();
    expect(loadCallSessions().length).toBe(0);
  });
});
