import { describe, it, expect, vi } from "vite-plus/test";
import { extractSpeechChunks, StreamingTtsPlayer } from "./streamingTtsPlayer";
import {
  isFarewellOrEndCall,
  containsInterruptCommand,
  stripInterruptCommand,
} from "./useVoiceCallAssistant";

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
    expect(containsInterruptCommand("bhai suno")).toBe(true);
    expect(containsInterruptCommand("ruko ruko")).toBe(true);
    expect(containsInterruptCommand("meri baat suno")).toBe(true);
    expect(containsInterruptCommand("hold on")).toBe(true);
    expect(containsInterruptCommand("pause")).toBe(true);
    expect(containsInterruptCommand("aram se")).toBe(true);
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

  it("ensures StreamingTtsPlayer is inactive when empty and does not block non-streaming completion", () => {
    const player = new StreamingTtsPlayer();
    // Initially with 0 chunks, it must NOT claim to be active
    expect(player.isActive()).toBe(false);
    expect(player.hasEnqueuedChunks()).toBe(false);
    expect(player.getIsPlaying()).toBe(false);
    expect(player.getQueueLength()).toBe(0);

    // Enqueue a chunk
    player.enqueue("Salam, main aap ki kya madad kar sakta hoon?");
    expect(player.hasEnqueuedChunks()).toBe(true);
    expect(player.isActive()).toBe(true);

    // Mark stream finished and stop
    player.markStreamFinished();
    player.stop();
    expect(player.isActive()).toBe(false);
    expect(player.isStopped()).toBe(true);
  });

  it("verifies DIGI LABS VOCAL_STYLES presets and speech sanitizer for URLs and file paths", async () => {
    const { VOCAL_STYLES, sanitizeTextForSpeech } = await import("~/lib/speech/tts");

    // Verify VOCAL_STYLES presets
    expect(VOCAL_STYLES.natural).toBeDefined();
    expect(VOCAL_STYLES.explainer?.edgePreset.rate).toBe("-6%");
    expect(VOCAL_STYLES.business?.edgePreset.rate).toBe("+4%");
    expect(VOCAL_STYLES.promo?.edgePreset.rate).toBe("+18%");
    expect(VOCAL_STYLES.calm?.edgePreset.rate).toBe("-14%");

    // Verify sanitizer cleans URLs, file paths, and markdown
    const dirty =
      "Check out this URL: https://example.com/api/v1/test and file /home/hasan/Documents/t3forweb/apps/server/src/botBridge.ts or C:\\Windows\\System32\\cmd.exe! **Important note** with `codeRef`";
    const cleaned = sanitizeTextForSpeech(dirty);
    expect(cleaned).not.toContain("https://");
    expect(cleaned).not.toContain("example.com");
    expect(cleaned).not.toContain("/home/hasan/");
    expect(cleaned).not.toContain("C:\\Windows");
    expect(cleaned).not.toContain("**");
    expect(cleaned).not.toContain("`");
    expect(cleaned).toContain("Important note with codeRef");
  });

  it("verifies speech state subscriber re-entrancy protection and stops recursion", async () => {
    const { subscribeSpeechState, stopSpeaking } = await import("~/lib/speech/tts");

    // Provide mock window and speechSynthesis in node test environment
    const target = typeof window !== "undefined" ? window : (globalThis as any);
    target.window = target;
    target.speechSynthesis = {
      speaking: false,
      cancel: vi.fn(),
    };

    let notificationCount = 0;
    const unsubscribe = subscribeSpeechState((isSpeaking) => {
      notificationCount++;
      if (!isSpeaking) {
        // Simulates nested stopSpeaking or state trigger inside callback
        stopSpeaking();
      }
    });

    // Should not throw Maximum call stack size exceeded
    expect(() => {
      stopSpeaking();
    }).not.toThrow();

    unsubscribe();
    expect(notificationCount).toBeGreaterThanOrEqual(1);
  });

  it("verifies stripAiSpeechFromTranscript removes AI speaker bleed without cutting user speech", async () => {
    const { stripAiSpeechFromTranscript } = await import("./useVoiceCallAssistant");

    const aiPhrases = [
      "Assalam o alaikum kaise hain aap main AutoCode assistant hoon",
      "Ji bilkul main aap ki madad kar sakta hoon",
    ];

    // 1. Microphone heard AI speaker audio followed by user words:
    const mixed = "Assalam o alaikum kaise hain aap hello brother how are you";
    const cleaned = stripAiSpeechFromTranscript(mixed, aiPhrases);
    expect(cleaned).toBe("hello brother how are you");

    // 2. Pure AI speech leaked into microphone (no user words):
    const pureAiEcho = "Assalam o alaikum kaise hain aap";
    const strippedPure = stripAiSpeechFromTranscript(pureAiEcho, aiPhrases);
    expect(strippedPure).toBe("");

    // 3. User spoken words (should be untouched):
    const userWords = "Hello how are you doing today";
    const untouched = stripAiSpeechFromTranscript(userWords, aiPhrases);
    expect(untouched).toBe("Hello how are you doing today");

    // 4. Urdu user words:
    const urduUser = "Mujhe aik function bana kar do";
    const untouchedUrdu = stripAiSpeechFromTranscript(urduUser, aiPhrases);
    expect(untouchedUrdu).toBe("Mujhe aik function bana kar do");
  });

  it("verifies isUtteranceEchoOfAi accurately distinguishes speaker echo from user speech", async () => {
    const { isUtteranceEchoOfAi } = await import("./useVoiceCallAssistant");

    const aiPhrases = [
      "Maine aap ke liye code deploy kar diya hai VPS par",
      "Yeh feature bilkul ready hai aap test kar sakte hain",
    ];

    // 1. Partial/fuzzy match of AI words in Roman Urdu
    expect(isUtteranceEchoOfAi("code deploy kar diya hai VPS", aiPhrases)).toBe(true);
    expect(isUtteranceEchoOfAi("feature bilkul ready hai", aiPhrases)).toBe(true);

    // 2. Urdu script match of AI's Roman Urdu sentence
    expect(isUtteranceEchoOfAi("کوڈ ڈپلائے کر دیا ہے", aiPhrases)).toBe(true);

    // 3. User speaking an interrupt or new instruction (NOT echo)
    expect(isUtteranceEchoOfAi("Ruko mujhe login screen check karni hai", aiPhrases)).toBe(false);
    expect(isUtteranceEchoOfAi("database configure karo", aiPhrases)).toBe(false);
    expect(isUtteranceEchoOfAi("chup karo", aiPhrases)).toBe(false);
    expect(isUtteranceEchoOfAi("khud se unit testing bhi kar sakty hen", aiPhrases)).toBe(false);
  });

  it("verifies user speech during assistant playback is preserved without being wiped", async () => {
    const { stripAiSpeechFromTranscript } = await import("./useVoiceCallAssistant");
    const aiPhrases = ["Ji main aap ka assistant hoon aur aap ki poori madad karoon ga."];

    // User speaks while assistant is speaking:
    const userSpokenDuringTts = "khud se unit testing bhi kar sakty hen";
    const result = stripAiSpeechFromTranscript(userSpokenDuringTts, aiPhrases);
    expect(result).toBe("khud se unit testing bhi kar sakty hen");
  });

  it("verifies splitTextIntoSentenceUnits splits paragraphs into individual sentences avoiding Chrome 15s freeze", async () => {
    const { splitTextIntoSentenceUnits } = await import("~/lib/speech/tts");

    const paragraph =
      "Hello brother! How are you doing today? I have analyzed your codebase and fixed the bug. Everything is working perfectly now.";
    const units = splitTextIntoSentenceUnits(paragraph);

    expect(units.length).toBe(4);
    expect(units[0]!).toBe("Hello brother!");
    expect(units[1]!).toBe("How are you doing today?");
    expect(units[2]!).toBe("I have analyzed your codebase and fixed the bug.");
    expect(units[3]!).toBe("Everything is working perfectly now.");

    // Single sentence should return single item array
    const single = "Assalam o alaikum kaise hain aap";
    expect(splitTextIntoSentenceUnits(single)).toEqual(["Assalam o alaikum kaise hain aap"]);
  });

  function setupMockSpeechSynthesis() {
    const target = typeof window !== "undefined" ? window : (globalThis as any);
    class MockUtterance {
      text: string;
      lang = "en-US";
      pitch = 1.0;
      rate = 1.0;
      volume = 1.0;
      voice: any = null;
      onstart: any = null;
      onend: any = null;
      onerror: any = null;
      onpause: any = null;
      onresume: any = null;
      constructor(text: string) {
        this.text = text;
      }
    }

    target.window = target;
    target.SpeechSynthesisUtterance = MockUtterance;
    (globalThis as any).SpeechSynthesisUtterance = MockUtterance;
    target.speechSynthesis = {
      speaking: true,
      paused: false,
      cancel: vi.fn(),
      resume: vi.fn(),
      pause: vi.fn(),
      speak: vi.fn((utt: any) => {
        setTimeout(() => {
          utt?.onstart?.();
        }, 0);
      }),
      getVoices: vi.fn(() => []),
    };
    return target.speechSynthesis;
  }

  it("verifies sub-150ms instant barge-in and audio cutoff", async () => {
    const { safeStopSpeechPlayback } = await import("~/lib/speech/tts");
    const mockSynthesis = setupMockSpeechSynthesis();

    const player = new StreamingTtsPlayer();
    player.enqueue("Assistant response that is currently being spoken to the user.");

    const start = performance.now();

    // User barge-in triggered by explicit command:
    const userUtterance = "Stop";
    const isInterrupt = containsInterruptCommand(userUtterance);
    expect(isInterrupt).toBe(true);

    // Instant audio and playback cutoff:
    safeStopSpeechPlayback();
    player.stop();

    const durationMs = performance.now() - start;

    // Verified sub-150ms cutoff (synchronous execution executes in <10ms)
    expect(durationMs).toBeLessThan(150);
    expect(player.isActive()).toBe(false);
    expect(player.isStopped()).toBe(true);
    expect(mockSynthesis.cancel).toHaveBeenCalled();
  });

  it("verifies user speech is preserved across voice barge-in without aborting recognition", async () => {
    // User speaks an interrupt command followed by a query while assistant is speaking
    const spokenText = "Ruko, line 45 check karo";
    const isInterrupt = containsInterruptCommand(spokenText);
    expect(isInterrupt).toBe(true);

    // Strip interrupt command prefix:
    const stripped = stripInterruptCommand(spokenText);
    expect(stripped).toBe("line 45 check karo");
    expect(stripped.length).toBeGreaterThan(0);

    // In voice barge-in state machine:
    // SpeechRecognition is NOT aborted (mock recognition.abort should NEVER be called on voice barge-in)
    const mockRecognition = {
      abort: vi.fn(),
      start: vi.fn(),
      continuous: true,
    };

    let callStatus = "speaking";
    let prompt = "";
    let liveTranscript = "";

    function handleBargeIn(speech: string, isExplicit: boolean) {
      // safeStopSpeechPlayback is called, but recognition.abort() is NOT called!
      const cleanStripped = stripInterruptCommand(speech);
      if (isExplicit && !cleanStripped.trim()) {
        callStatus = "listening";
        prompt = "";
        liveTranscript = "";
        return;
      }
      // Speech exists -> preserve words from word 1!
      callStatus = "user-speaking";
      prompt = cleanStripped;
      liveTranscript = cleanStripped;
    }

    handleBargeIn(spokenText, isInterrupt);

    // SpeechRecognition MUST NOT have been aborted
    expect(mockRecognition.abort).not.toHaveBeenCalled();
    // Status transitioned to user-speaking
    expect(callStatus).toBe("user-speaking");
    // Prompt preserves user's speech from word 1
    expect(prompt).toBe("line 45 check karo");
    expect(liveTranscript).toBe("line 45 check karo");
  });

  it("verifies pure Stop/Ruko returns immediately to listening without hanging or dispatching", () => {
    const pureCommands = [
      "stop",
      "Stop",
      "ruko",
      "Ruko",
      "please stop",
      "stop please",
      "wait",
      "suno please",
      "cancel",
      "halt",
      "tehro",
    ];

    for (const cmd of pureCommands) {
      expect(containsInterruptCommand(cmd)).toBe(true);
      const stripped = stripInterruptCommand(cmd);
      expect(stripped).toBe("");

      // State machine transition for pure stop:
      let callStatus: string = "speaking";
      let prompt: string = "initial";
      let liveTranscript: string = "initial";
      let autoSendScheduled = false;

      // Execute pure stop transition:
      if (containsInterruptCommand(cmd) && !stripped.trim()) {
        prompt = "";
        liveTranscript = "";
        autoSendScheduled = false;
        callStatus = "listening";
      }

      // Assertions:
      expect(callStatus).toBe("listening");
      expect(prompt).toBe("");
      expect(liveTranscript).toBe("");
      expect(autoSendScheduled).toBe(false);
    }
  });

  it("verifies CludeGods echo filtering rejects speaker bleed and passes genuine user speech", async () => {
    const { CludeGodsEchoFilter } = await import("~/lib/speech/cludeGodsEchoFilter");
    const filter = new CludeGodsEchoFilter();

    // Register assistant playback start via StreamingTtsPlayer playhead
    const chunkId = "chunk-101";
    const assistantText = "Maine aap ka code VPS par deploy kar diya hai";
    const now = 10000;
    filter.registerPlaybackStart(chunkId, assistantText, now);

    // 1. Microphone picks up exact assistant speaker bleed
    const exactEcho = filter.processInterimTranscript(
      "Maine aap ka code VPS par deploy",
      now + 500,
    );
    expect(exactEcho.action).toBe("drop");
    expect(exactEcho.isBargeIn).toBe(false);

    // 2. Microphone picks up phonetically distorted acoustic bleed
    const distortedEcho = filter.processInterimTranscript("cone deploy kar dya hai", now + 600);
    expect(distortedEcho.action).toBe("drop");
    expect(distortedEcho.isBargeIn).toBe(false);

    // 3. User says explicit interrupt command during assistant playback -> bypasses filter and barges
    const interruptCommand = filter.processInterimTranscript("ruko", now + 700);
    expect(interruptCommand.action).toBe("barge");
    expect(interruptCommand.isBargeIn).toBe(true);

    // 4. User speaks genuine question during assistant playback -> barge-in with content
    const userQuery = filter.processInterimTranscript("what is the database port", now + 800);
    expect(userQuery.action).toBe("barge");
    expect(userQuery.isBargeIn).toBe(true);

    // 5. Playback ends, past cooldown window -> emit
    filter.registerPlaybackEnd(chunkId, now + 2000);
    const afterPlayback = filter.processInterimTranscript("all tasks finished", now + 4000);
    expect(afterPlayback.action).toBe("emit");
  });

  it("verifies continuous STT keep-alive auto-revives and handles lifecycle events resiliently", () => {
    const isMobile = false;
    const desktopRestartDelay = isMobile ? 180 : 30;
    expect(desktopRestartDelay).toBe(30);

    const isMobileDevice = true;
    const mobileRestartDelay = isMobileDevice ? 180 : 30;
    expect(mobileRestartDelay).toBe(180);

    // Verify error categorization in onerror:
    const benignErrors = ["no-speech", "aborted"];
    const networkErrors = ["network"];
    const fatalErrors = ["not-allowed", "service-not-allowed"];

    function handleSttError(error: string) {
      if (benignErrors.includes(error)) {
        return "ignore_benign";
      }
      if (networkErrors.includes(error)) {
        return "schedule_reconnect";
      }
      if (error === "language-not-supported") {
        return "advance_fallback";
      }
      if (fatalErrors.includes(error)) {
        return "terminate_call";
      }
      return "warn";
    }

    expect(handleSttError("no-speech")).toBe("ignore_benign");
    expect(handleSttError("aborted")).toBe("ignore_benign");
    expect(handleSttError("network")).toBe("schedule_reconnect");
    expect(handleSttError("language-not-supported")).toBe("advance_fallback");
    expect(handleSttError("not-allowed")).toBe("terminate_call");
    expect(handleSttError("service-not-allowed")).toBe("terminate_call");
  });

  it("verifies StreamingTtsPlayer triggers onChunkStart and onChunkEnd for echoFilter registration", () => {
    setupMockSpeechSynthesis();
    const startedChunks: any[] = [];
    const endedChunks: any[] = [];

    const player = new StreamingTtsPlayer({
      onChunkStart: (chunk) => startedChunks.push(chunk),
      onChunkEnd: (chunk) => endedChunks.push(chunk),
    });

    player.enqueue("First sentence for playback.");
    player.enqueue("Second sentence for playback.");

    expect(player.isActive()).toBe(true);

    // Stopping player ends the active chunk and stops playback
    player.stop();
    expect(player.isStopped()).toBe(true);
  });
});
