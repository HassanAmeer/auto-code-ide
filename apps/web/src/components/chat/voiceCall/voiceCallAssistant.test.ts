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

  it("ensures multi-sentence responses are preserved completely without truncation", async () => {
    const { sanitizeTextForSpeech } = await import("~/lib/speech/tts");
    const longReply =
      "Theek hai bhai, maine project check kiya hai. Pehla error login function mein tha jahan token null aa raha tha. Doosra error styling mein tha. Maine dono issues fix kar diye hain aur ab application bilkul theek kaam kar rahi hai.";
    const spoken = sanitizeTextForSpeech(longReply);
    expect(spoken).toContain("Pehla error login");
    expect(spoken).toContain("Doosra error styling");
    expect(spoken).toContain("theek kaam kar rahi hai");
    expect(spoken.length).toBeGreaterThan(160);
  });

  it("removes consecutive duplicate words from STT output", async () => {
    const { removeConsecutiveDuplicateWords } = await import("~/lib/speech/stt");
    expect(removeConsecutiveDuplicateWords("hello hello how are you")).toBe("hello how are you");
    expect(removeConsecutiveDuplicateWords("kya kya haal hai")).toBe("kya haal hai");
    expect(removeConsecutiveDuplicateWords("testing one two three")).toBe("testing one two three");
  });

  it("simulates WebSpeech continuous resultIndex progression across turns without duplication", () => {
    // Simulated state for a call session across 2 turns
    let lastFinalizedIndex = -1;
    let accumulatedTurnFinal = "";

    function processResults(event: { resultIndex: number; results: any[] }) {
      let newlyFinalized = "";
      let currentInterim = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        if (!item || !item[0]) continue;
        const transcript = item[0].transcript || "";
        if (item.isFinal) {
          if (i > lastFinalizedIndex) {
            lastFinalizedIndex = i;
            newlyFinalized += (newlyFinalized ? " " : "") + transcript.trim();
          }
        } else {
          currentInterim += (currentInterim ? " " : "") + transcript.trim();
        }
      }

      if (newlyFinalized) {
        accumulatedTurnFinal = (
          accumulatedTurnFinal ? accumulatedTurnFinal + " " + newlyFinalized : newlyFinalized
        ).trim();
      }

      return (
        accumulatedTurnFinal
          ? accumulatedTurnFinal + (currentInterim ? " " + currentInterim : "")
          : currentInterim
      ).trim();
    }

    // Turn 1: user says "hello"
    const turn1Result = processResults({
      resultIndex: 0,
      results: [{ 0: { transcript: "hello" }, isFinal: true }],
    });
    expect(turn1Result).toBe("hello");

    // Turn 1 dispatched -> reset turn buffer
    accumulatedTurnFinal = "";

    // Turn 2: recognition stays continuous! results array now has 2 items, resultIndex = 1
    const turn2Result = processResults({
      resultIndex: 1,
      results: [
        { 0: { transcript: "hello" }, isFinal: true },
        { 0: { transcript: "how are you" }, isFinal: true },
      ],
    });

    // Crucial: Turn 2 MUST only be "how are you", NEVER "hello how are you"!
    expect(turn2Result).toBe("how are you");
    expect(turn2Result).not.toContain("hello");
  });
});
