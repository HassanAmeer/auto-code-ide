import { describe, expect, it } from "vite-plus/test";
import {
  stripCodeBlocks,
  sanitizeTextForSpeech,
  TTS_ACCENTS,
  getActiveTtsPreset,
  detectTextLanguage,
  normalizeTtsLanguage,
  isMaleVoice,
  isFemaleVoice,
} from "./tts";

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
