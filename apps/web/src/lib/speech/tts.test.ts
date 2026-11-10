import { describe, expect, it, vi, beforeEach, afterEach } from "vite-plus/test";
import {
  stripCodeBlocks,
  sanitizeTextForSpeech,
  TTS_ACCENTS,
  getActiveTtsPreset,
  detectTextLanguage,
  normalizeTtsLanguage,
  isMaleVoice,
  isFemaleVoice,
  VOICE_DELIVERY_STYLES,
  VOCAL_STYLES,
  getGeminiActingPrefix,
  getDeliveryStyleMultipliers,
  getNeuralVoiceScore,
  injectNaturalCadencePauses,
  safeStopSpeechPlayback,
  stopSpeaking,
  speakText,
  subscribeSpeechState,
} from "./tts";
import {
  StreamingTtsPlayer,
  type SpeechChunk,
} from "~/components/chat/voiceCall/streamingTtsPlayer";

describe("stripCodeBlocks", () => {
  it("removes closed triple-backtick code blocks completely", () => {
    const input =
      "Here is the code:\n```python\ndef hello():\n    print('world')\n```\nHope that helps!";
    const result = stripCodeBlocks(input);
    expect(result).not.toContain("def hello");
    expect(result).not.toContain("print('world')");
    expect(result).toContain("Here is the code:");
    expect(result).toContain("Hope that helps!");
  });

  it("removes closed tilde code blocks completely", () => {
    const input = "Check this out:\n~~~javascript\nconst x = 42;\n~~~\nDone.";
    const result = stripCodeBlocks(input);
    expect(result).not.toContain("const x = 42;");
    expect(result).toContain("Check this out:");
    expect(result).toContain("Done.");
  });

  it("removes unclosed trailing code blocks during streaming", () => {
    const input = "Writing file now:\n```typescript\nexport const value = 123;";
    const result = stripCodeBlocks(input);
    expect(result).not.toContain("export const value");
    expect(result).toContain("Writing file now:");
  });

  it("removes closed and unclosed thinking/reasoning blocks completely", () => {
    const closed =
      "<think>I need to analyze this request first.</think>Here is your answer: all good.";
    expect(stripCodeBlocks(closed)).not.toContain("analyze this request");
    expect(stripCodeBlocks(closed)).toContain("Here is your answer: all good.");

    const unclosed = "<think>Let me reason about the logic...";
    expect(stripCodeBlocks(unclosed).trim()).toBe("");
  });

  it("removes HTML code and pre blocks completely", () => {
    const input =
      "Check this output:\n<pre><code>const a = 100;\nconsole.log(a);</code></pre>\nAll done.";
    const result = stripCodeBlocks(input);
    expect(result).not.toContain("const a = 100");
    expect(result).not.toContain("console.log");
    expect(result).toContain("Check this output:");
    expect(result).toContain("All done.");
  });

  it("removes git diff blocks completely", () => {
    const input =
      "Here is the fix:\ndiff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,3 @@\n-const old = 1;\n+const fixed = 2;\nEverything is updated.";
    const result = stripCodeBlocks(input);
    expect(result).not.toContain("diff --git");
    expect(result).not.toContain("const fixed = 2");
    expect(result).toContain("Here is the fix:");
    expect(result).toContain("Everything is updated.");
  });
});

describe("sanitizeTextForSpeech", () => {
  it("does not pronounce code blocks or say 'Code block omitted'", () => {
    const input = "All tests passed.\n```bash\nnpm test\n```\nReady to deploy.";
    const result = sanitizeTextForSpeech(input);
    expect(result).not.toContain("npm test");
    expect(result).not.toContain("Code block omitted");
    expect(result).toBe("All tests passed. Ready to deploy.");
  });

  it("completely strips thinking content so it is never spoken", () => {
    const input =
      "<think>Thinking process: checking files and database...</think>The task is finished.";
    const result = sanitizeTextForSpeech(input);
    expect(result).not.toContain("Thinking process");
    expect(result).toBe("The task is finished.");
  });

  it("cleans markdown headers, bold, list formatting, and tables", () => {
    const input = "# Overview\n\n**Important:**\n- Item 1\n- Item 2";
    const result = sanitizeTextForSpeech(input);
    expect(result).toBe("Overview Important: Item 1 Item 2");
  });

  it("cleans function parentheses in inline identifiers", () => {
    const input = "Call `getUserData()` to retrieve details.";
    const result = sanitizeTextForSpeech(input);
    expect(result).toBe("Call getUserData to retrieve details.");
  });
});

describe("TTS 6 Voice Presets & Gender Distinction", () => {
  it("contains exactly 6 presets for English, Roman Urdu, and Natural Urdu", () => {
    expect(TTS_ACCENTS).toHaveLength(6);
    const ids = TTS_ACCENTS.map((a) => a.id);
    expect(ids).toEqual([
      "english-male",
      "english-female",
      "roman-urdu-male",
      "roman-urdu-female",
      "natural-urdu-male",
      "natural-urdu-female",
    ]);
  });

  it("has exactly one male and one female preset for each language", () => {
    const english = TTS_ACCENTS.filter((a) => a.category === "english");
    expect(english).toHaveLength(2);
    expect(english.map((a) => a.gender).sort()).toEqual(["female", "male"]);

    const romanUrdu = TTS_ACCENTS.filter((a) => a.category === "roman-urdu");
    expect(romanUrdu).toHaveLength(2);
    expect(romanUrdu.map((a) => a.gender).sort()).toEqual(["female", "male"]);

    const naturalUrdu = TTS_ACCENTS.filter((a) => a.category === "natural-urdu");
    expect(naturalUrdu).toHaveLength(2);
    expect(naturalUrdu.map((a) => a.gender).sort()).toEqual(["female", "male"]);
  });

  it("contains accurate test sample phrases in the correct language and script", () => {
    const engMale = TTS_ACCENTS.find((a) => a.id === "english-male")!;
    const engFemale = TTS_ACCENTS.find((a) => a.id === "english-female")!;
    expect(engMale.sampleText).toContain("English");
    expect(engFemale.sampleText).toContain("English");

    const romanMale = TTS_ACCENTS.find((a) => a.id === "roman-urdu-male")!;
    const romanFemale = TTS_ACCENTS.find((a) => a.id === "roman-urdu-female")!;
    expect(romanMale.sampleText).toContain("Roman Urdu");
    expect(romanFemale.sampleText).toContain("Roman Urdu");

    const urduMale = TTS_ACCENTS.find((a) => a.id === "natural-urdu-male")!;
    const urduFemale = TTS_ACCENTS.find((a) => a.id === "natural-urdu-female")!;
    // Natural Urdu must be in Urdu script (Arabic unicode characters)
    expect(/[\u0600-\u06FF]/.test(urduMale.sampleText)).toBe(true);
    expect(/[\u0600-\u06FF]/.test(urduFemale.sampleText)).toBe(true);
    expect(urduMale.sampleText).toContain("السلام علیکم");
    expect(urduFemale.sampleText).toContain("السلام علیکم");
  });

  it("correctly identifies male and female voices and prevents female voices from being treated as male", () => {
    const googleUsEnglish = {
      name: "Google US English",
      lang: "en-US",
      voiceURI: "Google US English",
      default: true,
      localService: false,
    } as SpeechSynthesisVoice;

    const googleHindi = {
      name: "Google हिन्दी",
      lang: "hi-IN",
      voiceURI: "Google हिन्दी",
      default: false,
      localService: false,
    } as SpeechSynthesisVoice;

    const msDavid = {
      name: "Microsoft David - English (United States)",
      lang: "en-US",
      voiceURI: "Microsoft David",
      default: false,
      localService: true,
    } as SpeechSynthesisVoice;

    const msZira = {
      name: "Microsoft Zira - English (United States)",
      lang: "en-US",
      voiceURI: "Microsoft Zira",
      default: false,
      localService: true,
    } as SpeechSynthesisVoice;

    // Google US English and Google Hindi must NOT be identified as male
    expect(isMaleVoice(googleUsEnglish)).toBe(false);
    expect(isMaleVoice(googleHindi)).toBe(false);

    // Microsoft David is male
    expect(isMaleVoice(msDavid)).toBe(true);
    expect(isFemaleVoice(msDavid)).toBe(false);

    // Microsoft Zira is female
    expect(isFemaleVoice(msZira)).toBe(true);
    expect(isMaleVoice(msZira)).toBe(false);
  });

  it("getActiveTtsPreset resolves correctly from settings", () => {
    expect(getActiveTtsPreset({ voiceURI: "natural-urdu-male" }).id).toBe("natural-urdu-male");
    expect(getActiveTtsPreset({ voiceURI: "natural-urdu-female" }).id).toBe("natural-urdu-female");
    expect(getActiveTtsPreset({ voiceURI: "english-male" }).id).toBe("english-male");
    expect(getActiveTtsPreset({ voiceURI: "english-female" }).id).toBe("english-female");
    expect(getActiveTtsPreset({ voiceURI: "roman-urdu-male" }).id).toBe("roman-urdu-male");
    expect(getActiveTtsPreset({ voiceURI: "roman-urdu-female" }).id).toBe("roman-urdu-female");

    // Legacy fallbacks
    expect(getActiveTtsPreset({ voiceURI: "accent:natural-urdu-male-1" }).id).toBe(
      "natural-urdu-male",
    );
    expect(getActiveTtsPreset({ language: "english" }).id).toBe("english-male");
  });

  it("detectTextLanguage correctly identifies Urdu script, Roman Urdu, and English", () => {
    expect(detectTextLanguage("السلام علیکم! آپ کیسے ہیں؟")).toBe("natural-urdu");
    expect(detectTextLanguage("Assalam o alaikum! Yeh Roman Urdu hai.")).toBe("roman-urdu");
    expect(detectTextLanguage("Aap ka kya haal hai bhai")).toBe("roman-urdu");
    expect(detectTextLanguage("Hello, how can I help you today?")).toBe("english");
  });

  it("identifies native Pakistani and Indian voices (Asad, Uzma, Ravi, etc.) correctly", () => {
    const msAsad = {
      name: "Microsoft Asad Online (Natural) - Urdu (Pakistan)",
      lang: "ur-PK",
      voiceURI: "Microsoft Asad",
    } as SpeechSynthesisVoice;

    const msUzma = {
      name: "Microsoft Uzma Online (Natural) - Urdu (Pakistan)",
      lang: "ur-PK",
      voiceURI: "Microsoft Uzma",
    } as SpeechSynthesisVoice;

    const msRavi = {
      name: "Microsoft Ravi Online (Natural) - English (India)",
      lang: "en-IN",
      voiceURI: "Microsoft Ravi",
    } as SpeechSynthesisVoice;

    expect(isMaleVoice(msAsad)).toBe(true);
    expect(isFemaleVoice(msAsad)).toBe(false);

    expect(isFemaleVoice(msUzma)).toBe(true);
    expect(isMaleVoice(msUzma)).toBe(false);

    expect(isMaleVoice(msRavi)).toBe(true);
    expect(isFemaleVoice(msRavi)).toBe(false);
  });

  it("normalizes legacy language modes and sanitizes settings safely", () => {
    expect(normalizeTtsLanguage("roman-urdu-male")).toBe("roman-urdu");
    expect(normalizeTtsLanguage("roman-urdu-female")).toBe("roman-urdu");
    expect(normalizeTtsLanguage("natural-urdu-male")).toBe("natural-urdu");
    expect(normalizeTtsLanguage("english-female")).toBe("english");
    expect(normalizeTtsLanguage("auto")).toBe("auto-male");
    expect(normalizeTtsLanguage("auto-male")).toBe("auto-male");
    expect(normalizeTtsLanguage("auto-female")).toBe("auto-female");
    expect(normalizeTtsLanguage("invalid-mode")).toBe("roman-urdu");
  });
});

describe("Digi-Labs Voice Delivery Styles & Co-Tuning", () => {
  it("contains all 5 vocal delivery styles with proper rate, pitch, and volume co-tuning", () => {
    expect(VOCAL_STYLES.natural).toBeDefined();
    expect(VOCAL_STYLES.business).toBeDefined();
    expect(VOCAL_STYLES.promo).toBeDefined();
    expect(VOCAL_STYLES.explainer).toBeDefined();
    expect(VOCAL_STYLES.calm).toBeDefined();

    expect(VOCAL_STYLES.business!.edgePreset.rate).toBe("+4%");
    expect(VOCAL_STYLES.business!.edgePreset.pitch).toBe("+5Hz");
    expect(VOCAL_STYLES.business!.edgePreset.volume).toBe("+6%");

    expect(getGeminiActingPrefix("explainer")).toContain("friendly expert");
    expect(getGeminiActingPrefix("business")).toContain("confident");
    expect(getGeminiActingPrefix("promo")).toContain("excited product promo");
    expect(getGeminiActingPrefix("calm")).toContain("narrator");

    expect(VOICE_DELIVERY_STYLES.promo!.rate).toBe("+18%");
    expect(VOICE_DELIVERY_STYLES.calm!.rate).toBe("-14%");
  });

  it("calculates accurate multipliers from delivery style presets", () => {
    const natural = getDeliveryStyleMultipliers("natural");
    expect(natural.rateMultiplier).toBe(1.0);
    expect(natural.pitchMultiplier).toBe(1.0);
    expect(natural.volumeMultiplier).toBe(1.0);

    const business = getDeliveryStyleMultipliers("business");
    expect(business.rateMultiplier).toBeCloseTo(1.04, 2);
    expect(business.pitchMultiplier).toBeGreaterThan(1.0);
    expect(business.volumeMultiplier).toBeCloseTo(1.06, 2);

    const promo = getDeliveryStyleMultipliers("promo");
    expect(promo.rateMultiplier).toBeCloseTo(1.18, 2);
    expect(promo.volumeMultiplier).toBeCloseTo(1.12, 2);

    const calm = getDeliveryStyleMultipliers("calm");
    expect(calm.rateMultiplier).toBeCloseTo(0.86, 2);
    expect(calm.pitchMultiplier).toBeLessThan(1.0);
    expect(calm.volumeMultiplier).toBeCloseTo(0.96, 2);
  });
});

describe("Neural Voices Priority (Digi-Labs / Edge Neural)", () => {
  it("ranks Microsoft Edge Neural voices (Asad, Uzma, Madhur, Swara, Andrew) higher than generic synthesizers", () => {
    const asadVoice = {
      name: "Microsoft Asad Online (Natural) - Urdu (Pakistan)",
      voiceURI: "ur-PK-AsadNeural",
      lang: "ur-PK",
    } as SpeechSynthesisVoice;
    const uzmaVoice = {
      name: "Microsoft Uzma Online (Natural) - Urdu (Pakistan)",
      voiceURI: "ur-PK-UzmaNeural",
      lang: "ur-PK",
    } as SpeechSynthesisVoice;
    const madhurVoice = {
      name: "Microsoft Madhur Online (Natural) - Hindi (India)",
      voiceURI: "hi-IN-MadhurNeural",
      lang: "hi-IN",
    } as SpeechSynthesisVoice;
    const andrewVoice = {
      name: "Microsoft Andrew Multilingual Online (Natural)",
      voiceURI: "en-US-AndrewMultilingualNeural",
      lang: "en-US",
    } as SpeechSynthesisVoice;
    const googleVoice = {
      name: "Google US English",
      voiceURI: "Google US English",
      lang: "en-US",
    } as SpeechSynthesisVoice;
    const genericVoice = {
      name: "eSpeak generic",
      voiceURI: "espeak",
      lang: "en",
    } as SpeechSynthesisVoice;

    expect(getNeuralVoiceScore(asadVoice)).toBe(100);
    expect(getNeuralVoiceScore(uzmaVoice)).toBe(100);
    expect(getNeuralVoiceScore(madhurVoice)).toBe(90);
    expect(getNeuralVoiceScore(andrewVoice)).toBe(85);
    expect(getNeuralVoiceScore(googleVoice)).toBe(50);
    expect(getNeuralVoiceScore(genericVoice)).toBe(10);

    expect(getNeuralVoiceScore(asadVoice)).toBeGreaterThan(getNeuralVoiceScore(googleVoice));
    expect(getNeuralVoiceScore(uzmaVoice)).toBeGreaterThan(getNeuralVoiceScore(genericVoice));
  });
});

describe("Natural Urdu Cadence & Breath-Punctuation", () => {
  it("standardizes Urdu Unicode punctuation to natural speech pauses", () => {
    const input = "وعلیکم السلام باس۔ میں ٹھیک ہوں، آپ بتائیں۔";
    const result = injectNaturalCadencePauses(input);
    expect(result).toContain(". ");
    expect(result).toContain(", ");
    expect(result).not.toContain("۔");
    expect(result).not.toContain("،");
  });

  it("adds micro-pauses at Subcontinental conjunctions (lekin, magar, kyunki, taake)", () => {
    const input = "Main ne file check ki lekin us mein issue tha kyunki server band tha";
    const result = injectNaturalCadencePauses(input);
    expect(result).toContain("ki, lekin");
    expect(result).toContain("tha, kyunki");
  });

  it("adds micro-pause after conversational honorifics without double commas", () => {
    const input = "Assalam o alaikum boss hum ne deploy kar diya";
    const result = injectNaturalCadencePauses(input);
    expect(result).toContain("Assalam o alaikum, boss");

    const alreadyPunctuated = "Ji boss, main dekh raha hoon.";
    const result2 = injectNaturalCadencePauses(alreadyPunctuated);
    expect(result2).toBe("Ji boss, main dekh raha hoon.");
  });
});

describe("Zero-Freeze TTS Lifecycle & Cancel Deadlock Elimination", () => {
  let originalWindow: any;
  let originalSpeechSynthesis: any;
  let originalUtterance: any;

  beforeEach(() => {
    const target = typeof window !== "undefined" ? window : (globalThis as any);
    originalWindow = target.window;
    originalSpeechSynthesis = target.speechSynthesis;
    originalUtterance = target.SpeechSynthesisUtterance;

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
      speaking: false,
      paused: false,
      cancel: vi.fn(),
      resume: vi.fn(),
      pause: vi.fn(),
      speak: vi.fn(),
      getVoices: vi.fn(() => []),
    };
  });

  afterEach(() => {
    const target = typeof window !== "undefined" ? window : (globalThis as any);
    target.window = originalWindow;
    target.speechSynthesis = originalSpeechSynthesis;
    target.SpeechSynthesisUtterance = originalUtterance;
    (globalThis as any).SpeechSynthesisUtterance = originalUtterance;
    safeStopSpeechPlayback();
  });

  it("safeStopSpeechPlayback unpauses paused synthesis before cancel and resumes immediately after to eliminate browser freeze deadlocks", () => {
    const target = typeof window !== "undefined" ? window : (globalThis as any);
    const callOrder: string[] = [];

    target.speechSynthesis = {
      speaking: true,
      paused: true,
      getVoices: vi.fn(() => []),
      cancel: vi.fn(() => {
        callOrder.push("cancel");
      }),
      resume: vi.fn(() => {
        callOrder.push("resume");
        target.speechSynthesis.paused = false;
      }),
    };

    safeStopSpeechPlayback();

    expect(target.speechSynthesis.cancel).toHaveBeenCalled();
    expect(target.speechSynthesis.resume).toHaveBeenCalled();
    // Order must be resume (unpause before cancel) -> cancel -> resume (state machine unblock)
    expect(callOrder).toEqual(["resume", "cancel", "resume"]);
  });

  it("safeStopSpeechPlayback detaches and nullifies event listeners on retained active utterances preventing ghost callbacks", () => {
    const target = typeof window !== "undefined" ? window : (globalThis as any);
    let capturedUtterance: any = null;

    target.speechSynthesis = {
      speaking: true,
      paused: false,
      getVoices: vi.fn(() => []),
      cancel: vi.fn(),
      resume: vi.fn(),
      speak: vi.fn((utt) => {
        capturedUtterance = utt;
      }),
    };

    speakText("Test utterance for listener nullification");

    expect(capturedUtterance).not.toBeNull();
    expect(capturedUtterance.onstart).toBeTypeOf("function");
    expect(capturedUtterance.onend).toBeTypeOf("function");

    safeStopSpeechPlayback();

    expect(capturedUtterance.onstart).toBeNull();
    expect(capturedUtterance.onend).toBeNull();
    expect(capturedUtterance.onerror).toBeNull();
    expect(capturedUtterance.onpause).toBeNull();
    expect(capturedUtterance.onresume).toBeNull();
  });

  it("stopSpeaking delegates directly to safeStopSpeechPlayback and notifies speech state subscribers", () => {
    const target = typeof window !== "undefined" ? window : (globalThis as any);
    target.speechSynthesis = {
      speaking: true,
      paused: false,
      getVoices: vi.fn(() => []),
      cancel: vi.fn(),
      resume: vi.fn(),
    };

    const stateEvents: Array<{ isSpeaking: boolean; text: string | null }> = [];
    const unsubscribe = subscribeSpeechState((isSpeaking, text) => {
      stateEvents.push({ isSpeaking, text });
    });

    stopSpeaking();
    unsubscribe();

    expect(target.speechSynthesis.cancel).toHaveBeenCalled();
    expect(stateEvents.length).toBeGreaterThan(0);
    expect(stateEvents[stateEvents.length - 1]).toEqual({ isSpeaking: false, text: null });
  });

  it("resumes synthesis before speaking if paused to prevent Chromium initial stall", () => {
    const target = typeof window !== "undefined" ? window : (globalThis as any);
    const callOrder: string[] = [];

    target.speechSynthesis = {
      speaking: false,
      paused: true,
      getVoices: vi.fn(() => []),
      resume: vi.fn(() => {
        callOrder.push("resume");
        target.speechSynthesis.paused = false;
      }),
      speak: vi.fn(() => {
        callOrder.push("speak");
      }),
      cancel: vi.fn(),
    };

    speakText("AutoCode test message");

    expect(target.speechSynthesis.resume).toHaveBeenCalled();
    expect(target.speechSynthesis.speak).toHaveBeenCalled();
    expect(callOrder[0]).toBe("resume");
    expect(callOrder).toContain("speak");
  });

  it("StreamingTtsPlayer dispatches onChunkStart and onChunkEnd with SpeechChunk metadata", async () => {
    const target = typeof window !== "undefined" ? window : (globalThis as any);

    target.speechSynthesis = {
      speaking: false,
      paused: false,
      getVoices: vi.fn(() => []),
      resume: vi.fn(),
      speak: vi.fn((utt) => {
        // Mock speak completes asynchronously
        setTimeout(() => {
          utt.onend?.();
        }, 10);
      }),
      cancel: vi.fn(),
    };

    const startedChunks: SpeechChunk[] = [];
    const endedChunks: SpeechChunk[] = [];

    const player = new StreamingTtsPlayer({
      onChunkStart: (chunk) => startedChunks.push(chunk),
      onChunkEnd: (chunk) => endedChunks.push(chunk),
    });

    player.enqueue("Pehla jumla yahan hai.");

    expect(startedChunks.length).toBe(1);
    expect(startedChunks[0]!.text).toContain("Pehla jumla yahan hai.");
    expect(startedChunks[0]!.id).toMatch(/^chunk_\d+_\d+$/);
    expect(startedChunks[0]!.index).toBe(0);
    expect(typeof startedChunks[0]!.timestamp).toBe("number");

    // Wait for mock speech completion
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(endedChunks.length).toBe(1);
    expect(endedChunks[0]!.id).toBe(startedChunks[0]!.id);
    expect(endedChunks[0]!.text).toBe(startedChunks[0]!.text);

    player.stop();
  });

  it("StreamingTtsPlayer supports instant stop during chunk playback without synthesis deadlock", () => {
    const target = typeof window !== "undefined" ? window : (globalThis as any);

    target.speechSynthesis = {
      speaking: true,
      paused: false,
      getVoices: vi.fn(() => []),
      resume: vi.fn(),
      speak: vi.fn(),
      cancel: vi.fn(),
    };

    const endedChunks: SpeechChunk[] = [];
    const player = new StreamingTtsPlayer({
      onChunkEnd: (chunk) => endedChunks.push(chunk),
    });

    player.enqueue("Assistant response that will be cut off.");
    expect(player.getCurrentChunk()).not.toBeNull();
    const activeChunk = player.getCurrentChunk()!;

    // Trigger instant stop
    player.stop();

    expect(player.isStopped()).toBe(true);
    expect(player.getQueueLength()).toBe(0);
    expect(player.getCurrentChunk()).toBeNull();
    expect(target.speechSynthesis.cancel).toHaveBeenCalled();
    expect(endedChunks.length).toBe(1);
    expect(endedChunks[0]!.id).toBe(activeChunk.id);
  });
});
