import { describe, it, expect, beforeEach } from "vitest";
import {
  addVoiceCallLog,
  getVoiceCallLogs,
  clearVoiceCallLogs,
  subscribeVoiceCallLogs,
} from "./voiceCallLogger";

describe("voiceCallLogger", () => {
  beforeEach(() => {
    clearVoiceCallLogs();
  });

  it("stores and retrieves log entries", () => {
    addVoiceCallLog({
      category: "STT",
      title: "Recognized Speech",
      detail: "Hello test",
    });

    const logs = getVoiceCallLogs();
    expect(logs.length).toBe(1);
    expect(logs[0].category).toBe("STT");
    expect(logs[0].title).toBe("Recognized Speech");
    expect(logs[0].detail).toBe("Hello test");
    expect(logs[0].id).toBeDefined();
    expect(logs[0].timestamp).toBeGreaterThan(0);
  });

  it("notifies subscribers when new log is added", () => {
    const received: number[] = [];
    const unsubscribe = subscribeVoiceCallLogs((logs) => {
      received.push(logs.length);
    });

    addVoiceCallLog({
      category: "NOISE_GATE",
      title: "Dropped Ambient Noise",
      metadata: { energy: 8.5 },
    });

    expect(received).toContain(1);
    unsubscribe();
  });

  it("clears all logs correctly", () => {
    addVoiceCallLog({ category: "AI", title: "Prompt" });
    addVoiceCallLog({ category: "TTS", title: "Playing" });
    expect(getVoiceCallLogs().length).toBe(2);

    clearVoiceCallLogs();
    expect(getVoiceCallLogs().length).toBe(0);
  });
});
