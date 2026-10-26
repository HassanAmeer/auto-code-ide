import { describe, it, expect, vi } from "vite-plus/test";
import { extractSpeechChunks, StreamingTtsPlayer } from "./streamingTtsPlayer";
import { isFarewellOrEndCall, containsInterruptCommand } from "./useVoiceCallAssistant";

describe("VoiceCall Assistant & StreamingTtsPlayer", () => {
  it("extracts speech chunks cleanly and strips code blocks", () => {
    const raw =
      "Hello world! Here is some code:\n```typescript\nconst a = 1;\n```\nEverything looks good.";
    const { chunks } = extractSpeechChunks(raw, 0, true);
    expect(chunks.length).toBeGreaterThan(0);
    // Code block should not be present in extracted chunks
    chunks.forEach((chunk) => {
      expect(chunk).not.toContain("const a = 1");
      expect(chunk).not.toContain("```");
    });
  });

  it("StreamingTtsPlayer deduplicates identical sentence chunks", () => {
    const onChunkStarted = vi.fn();
    const player = new StreamingTtsPlayer({
      onChunkStarted,
    });

    // Enqueue duplicate sentences
    player.enqueue("Kaam ho gaya hai.");
    player.enqueue("Kaam ho gaya hai.");
    player.enqueue("  kaam ho gaya hai.  ");

    // Stop the player
    player.stop();
  });

  it("detects interrupt commands instantly across variants", () => {
    expect(containsInterruptCommand("stop")).toBe(true);
    expect(containsInterruptCommand("stop it")).toBe(true);
    expect(containsInterruptCommand("please stop")).toBe(true);
    expect(containsInterruptCommand("ruko")).toBe(true);
    expect(containsInterruptCommand("ruk jao")).toBe(true);
    expect(containsInterruptCommand("wait")).toBe(true);
    expect(containsInterruptCommand("suno")).toBe(true);
    expect(containsInterruptCommand("suno bhai")).toBe(true);
    expect(containsInterruptCommand("سٹاپ")).toBe(true);
    expect(containsInterruptCommand("روکو")).toBe(true);
    expect(containsInterruptCommand("رک جاؤ")).toBe(true);
    expect(containsInterruptCommand("سنو")).toBe(true);

    // Regular speech should not trigger interrupt
    expect(containsInterruptCommand("what is the weather")).toBe(false);
    expect(containsInterruptCommand("database migration script")).toBe(false);
  });

  it("detects farewell and end call intents accurately", () => {
    // English farewells
    expect(isFarewellOrEndCall("bye").isFarewell).toBe(true);
    expect(isFarewellOrEndCall("goodbye!").isFarewell).toBe(true);
    expect(isFarewellOrEndCall("ok bye").isFarewell).toBe(true);
    expect(isFarewellOrEndCall("see you later").isFarewell).toBe(true);

    // Roman Urdu farewells
    expect(isFarewellOrEndCall("allah hafiz").isFarewell).toBe(true);
    expect(isFarewellOrEndCall("acha allah hafiz").isFarewell).toBe(true);
    expect(isFarewellOrEndCall("khuda hafiz").isFarewell).toBe(true);
    expect(isFarewellOrEndCall("chalo bye").isFarewell).toBe(true);
    expect(isFarewellOrEndCall("theek hai bye").isFarewell).toBe(true);
    expect(isFarewellOrEndCall("call kato").isFarewell).toBe(true);
    expect(isFarewellOrEndCall("call band karo").isFarewell).toBe(true);

    // Urdu script
    expect(isFarewellOrEndCall("اللہ حافظ").isFarewell).toBe(true);
    expect(isFarewellOrEndCall("خدا حافظ").isFarewell).toBe(true);
    expect(isFarewellOrEndCall("الوداع").isFarewell).toBe(true);
    expect(isFarewellOrEndCall("کال بند کرو").isFarewell).toBe(true);

    // Non-farewell regular conversation should NOT trigger
    expect(isFarewellOrEndCall("we want to buy something").isFarewell).toBe(false);
    expect(isFarewellOrEndCall("standby mode").isFarewell).toBe(false);
    expect(isFarewellOrEndCall("kya hal hai").isFarewell).toBe(false);
  });

  it("verifies Urdu and English STT language mappings", async () => {
    const { getRecognitionLanguageCodes } = await import("~/lib/speech/stt");
    const urduCodes = getRecognitionLanguageCodes("natural-urdu");
    expect(urduCodes).toContain("ur-PK");

    const englishCodes = getRecognitionLanguageCodes("english");
    expect(englishCodes).toContain("en-US");
  });
});
