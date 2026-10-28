import { describe, expect, it } from "vite-plus/test";
import {
  adaptRomanUrduForVoice,
  phoneticizeRomanUrduForEnglishVoice,
  transliterateRomanToUrduScript,
  transliterateRomanToHindiScript,
} from "./romanUrduSpeechAdapter";

describe("Roman Urdu Speech Adapter", () => {
  it("converts Roman Urdu to Urdu script when an Urdu voice is provided", () => {
    const mockUrduVoice = {
      name: "Microsoft Asad Online (Natural) - Urdu (Pakistan)",
      lang: "ur-PK",
      voiceURI: "Microsoft Asad",
    } as SpeechSynthesisVoice;

    const input =
      "Assalam o alaikum! Yeh Roman Urdu ka test hai. Main aap ki kya madad kar sakta hoon?";
    const result = adaptRomanUrduForVoice(input, mockUrduVoice);

    expect(result.lang).toBe("ur-PK");
    expect(result.text).toContain("السلام");
    expect(result.text).toContain("علیکم");
    expect(result.text).toContain("یہ");
    expect(result.text).toContain("ٹیسٹ");
    expect(result.text).toContain("ہے");
    expect(result.text).toContain("مدد");
    expect(result.text).toContain("سکتا");
    expect(result.text).toContain("ہوں");
  });

  it("converts Roman Urdu to Hindi script when a Hindi voice is provided", () => {
    const mockHindiVoice = {
      name: "Google हिन्दी",
      lang: "hi-IN",
      voiceURI: "Google हिन्दी",
    } as SpeechSynthesisVoice;

    const input = "Assalam o alaikum! Main aap ki kya madad kar sakta hoon?";
    const result = adaptRomanUrduForVoice(input, mockHindiVoice);

    expect(result.lang).toBe("hi-IN");
    expect(result.text).toContain("अस्सलाम");
    expect(result.text).toContain("मदद");
    expect(result.text).toContain("सकता");
  });

  it("applies phonetic respelling when an English / Indian English voice is provided", () => {
    const mockEnglishVoice = {
      name: "Google US English",
      lang: "en-US",
      voiceURI: "Google US English",
    } as SpeechSynthesisVoice;

    const input = "Assalam o alaikum! Main aap ki kya madad kar sakta hoon? Theek hai bhai.";
    const result = adaptRomanUrduForVoice(input, mockEnglishVoice);

    expect(result.lang).toBe("en-US");
    // Should respell phonetic syllables
    expect(result.text).toContain("Uh-salaam o alay-koom");
    expect(result.text).toContain("ahp");
    expect(result.text).toContain("muh-dud");
    expect(result.text).toContain("suk-tah");
    expect(result.text).toContain("teek");
    expect(result.text).toContain("bha-ee");
  });

  it("preserves native Urdu script if already in Urdu", () => {
    const input = "السلام علیکم! یہ ٹیسٹ ہے۔";
    const result = adaptRomanUrduForVoice(input);
    expect(result.text).toBe(input);
    expect(result.lang).toBe("ur-PK");
  });

  it("phoneticizeRomanUrduForEnglishVoice handles capital letters and punctuation properly", () => {
    const input = "Kese ho aap? Main theek hoon, shukriya!";
    const phonetic = phoneticizeRomanUrduForEnglishVoice(input);

    expect(phonetic).toContain("Kay-say");
    expect(phonetic).toContain("ahp");
    expect(phonetic).toContain("teek");
    expect(phonetic).toContain("shook-ree-yah");
  });
});
