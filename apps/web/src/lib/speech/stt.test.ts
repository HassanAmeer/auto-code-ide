import { describe, expect, it } from "vite-plus/test";
import { deduplicateOverlap, removeConsecutiveDuplicateWords, normalizeWord } from "./stt";

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
