import { describe, expect, it } from "vite-plus/test";
import {
  deduplicateOverlap,
  formatSttTranscript,
  getRecognitionLanguageCodes,
  removeConsecutiveDuplicateWords,
  normalizeWord,
} from "./stt";

describe("stt deduplication", () => {
  describe("normalizeWord", () => {
    it("strips punctuation and downcases", () => {
      expect(normalizeWord("Hello,")).toBe("hello");
      expect(normalizeWord("world!")).toBe("world");
      expect(normalizeWord("Test.")).toBe("test");
    });
  });

  describe("removeConsecutiveDuplicateWords", () => {
    it("removes rapid repeated identical words in speech recognizer stream", () => {
      expect(removeConsecutiveDuplicateWords("hello hello hello")).toBe("hello");
      expect(removeConsecutiveDuplicateWords("hello Hello hello world")).toBe("hello world");
      expect(removeConsecutiveDuplicateWords("kese ho ho")).toBe("kese ho");
    });

    it("leaves distinct consecutive words intact", () => {
      expect(removeConsecutiveDuplicateWords("hello world how are you")).toBe(
        "hello world how are you",
      );
    });
  });

  describe("deduplicateOverlap", () => {
    it("removes overlapping prefix from incoming text", () => {
      expect(deduplicateOverlap("hello", "hello")).toBe("");
      expect(deduplicateOverlap("hello", "hello how are you")).toBe("how are you");
      expect(deduplicateOverlap("hello world", "world how are you")).toBe("how are you");
      expect(deduplicateOverlap("I am here today", "today I am working")).toBe("I am working");
    });

    it("returns entire incoming text when there is no overlap", () => {
      expect(deduplicateOverlap("hello world", "something completely new")).toBe(
        "something completely new",
      );
      expect(deduplicateOverlap("", "hello")).toBe("hello");
    });

    it("handles trailing punctuation gracefully", () => {
      expect(deduplicateOverlap("hello world,", "world how are you")).toBe("how are you");
      expect(deduplicateOverlap("hello.", "Hello")).toBe("");
    });
  });
});

describe("formatSttTranscript", () => {
  it("returns Roman Urdu for Urdu script recognizer output", () => {
    expect(formatSttTranscript("میں نے کہا تھا کہ یہ کام نہیں ہوگا", "roman-urdu")).toBe(
      "main ne kaha tha keh yeh kaam nahi hoga",
    );
  });

  it("converts Urdu punctuation and tidies spacing", () => {
    expect(formatSttTranscript("کیا آپ نے نیا فیچر بنایا ہے؟", "roman-urdu")).toBe(
      "kya ap ne naya feature banaya hai?",
    );
    expect(formatSttTranscript("فائل میں مسئلہ ہے ۔ اسے حل کریں ، پلیز", "roman-urdu")).toBe(
      "file main masla hai. usey hal karein, please",
    );
  });

  it("leaves non-Roman modes unchanged", () => {
    expect(formatSttTranscript("کیا حال ہے", "natural-urdu")).toBe("کیا حال ہے");
    expect(formatSttTranscript("hello hello world", "english")).toBe("hello world");
  });
});

describe("getRecognitionLanguageCodes", () => {
  it("prefers Urdu and falls back to phonetically related locales for Roman Urdu", () => {
    expect(getRecognitionLanguageCodes("roman-urdu")).toEqual(["ur-PK", "hi-IN", "en-IN", "en-US"]);
    expect(getRecognitionLanguageCodes("auto")).toEqual(["ur-PK", "hi-IN", "en-IN", "en-US"]);
  });

  it("does not romanize fallback locales for natural Urdu", () => {
    expect(getRecognitionLanguageCodes("natural-urdu")).toEqual(["ur-PK"]);
    expect(getRecognitionLanguageCodes("english")).toEqual(["en-US", "en-IN"]);
  });
});
