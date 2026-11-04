import { describe, it, expect, beforeEach } from "vitest";
import {
  CludeGodsEchoFilter,
  levenshteinDistance,
  lcsLength,
  sequenceRatio,
  cleanAlphanumeric,
  expandNumerals,
  tokenizeWords,
  isLooseWordMatch,
  isExplicitInterruptWord,
} from "./cludeGodsEchoFilter";

describe("CludeGodsEchoFilter Unit Tests", () => {
  let filter: CludeGodsEchoFilter;
  let simulatedClock = 10000;

  beforeEach(() => {
    simulatedClock = 10000;
    filter = new CludeGodsEchoFilter({
      clock: () => simulatedClock,
    });
  });

  describe("1. Primitive String & Sequence Matching Algorithms", () => {
    it("computes Levenshtein edit distance correctly", () => {
      expect(levenshteinDistance("", "")).toBe(0);
      expect(levenshteinDistance("a", "")).toBe(1);
      expect(levenshteinDistance("", "abc")).toBe(3);
      expect(levenshteinDistance("deploy", "deploy")).toBe(0);
      expect(levenshteinDistance("deploy", "dploy")).toBe(1); // 1 deletion
      expect(levenshteinDistance("code", "cone")).toBe(1); // 1 substitution
      expect(levenshteinDistance("ruko", "rukoo")).toBe(1); // 1 insertion
      expect(levenshteinDistance("vps", "server")).toBe(5);
    });

    it("computes Longest Common Subsequence (LCS) length and ratio correctly", () => {
      expect(lcsLength("deploy", "deploy")).toBe(6);
      expect(sequenceRatio("deploy", "deploy")).toBe(1.0);
      expect(lcsLength("deploy", "dploy")).toBe(5);
      expect(sequenceRatio("deploy", "dploy")).toBeCloseTo(10 / 11, 2); // > 0.90
      expect(sequenceRatio("abc", "xyz")).toBe(0);
    });

    it("expands digits and numerals to words", () => {
      expect(expandNumerals("error code 404")).toBe("error code 404"); // non-mapped large digits keep format or handled
      expect(expandNumerals("test 1 2 3")).toBe("test one two three");
      expect(expandNumerals("step 0")).toBe("step zero");
      expect(expandNumerals("step 10")).toBe("step ten");
    });

    it("normalizes Roman Urdu words and transliteration variations", () => {
      const tokens1 = tokenizeWords("maine aap ke liye code deploy kar dya hai");
      expect(tokens1).toContain("diya"); // dya -> diya
      expect(tokens1).toContain("aap");

      const tokens2 = tokenizeWords("mein kia karun ye bhee batao");
      expect(tokens2).toContain("main"); // mein -> main
      expect(tokens2).toContain("kya"); // kia -> kya
      expect(tokens2).toContain("yeh"); // ye -> yeh
      expect(tokens2).toContain("bhi"); // bhee -> bhi
    });
  });

  describe("2. Loose Word Matching (mine_word)", () => {
    const saidWords = ["deploy", "vps", "server", "outbox", "code", "kar", "diya"];
    const saidJoined = saidWords.join("");

    it("matches exact words", () => {
      expect(isLooseWordMatch("deploy", saidWords, saidJoined)).toBe(true);
      expect(isLooseWordMatch("vps", saidWords, saidJoined)).toBe(true);
      expect(isLooseWordMatch("random", saidWords, saidJoined)).toBe(false);
    });

    it("matches compound splits in joined text", () => {
      // 'out' and 'box' in 'outbox'
      expect(isLooseWordMatch("outbox", saidWords, saidJoined)).toBe(true);
      expect(isLooseWordMatch("box", saidWords, saidJoined)).toBe(false); // length < 4
      expect(isLooseWordMatch("server", saidWords, saidJoined)).toBe(true);
    });

    it("matches 4-character prefix equivalence", () => {
      // 'deploying' shares 4-char prefix 'depl' with 'deploy'
      expect(isLooseWordMatch("deploying", saidWords, saidJoined)).toBe(true);
      expect(isLooseWordMatch("deploys", saidWords, saidJoined)).toBe(true);
    });

    it("matches edit distance 1 (acoustic distortion)", () => {
      // 'cone' vs 'code' (distance 1)
      expect(isLooseWordMatch("cone", saidWords, saidJoined)).toBe(true);
      // 'dploy' vs 'deploy' (distance 1)
      expect(isLooseWordMatch("dploy", saidWords, saidJoined)).toBe(true);
    });

    it("matches fuzzy sequence ratio >= 0.80", () => {
      expect(isLooseWordMatch("deplay", saidWords, saidJoined)).toBe(true);
    });
  });

  describe("3. Explicit Interrupt Command Bypass", () => {
    it("detects explicit English and Roman Urdu interrupt commands", () => {
      expect(isExplicitInterruptWord("stop")).toBe(true);
      expect(isExplicitInterruptWord("ruko")).toBe(true);
      expect(isExplicitInterruptWord("wait")).toBe(true);
      expect(isExplicitInterruptWord("suno")).toBe(true);
      expect(isExplicitInterruptWord("bas")).toBe(true);
      expect(isExplicitInterruptWord("cancel")).toBe(true);
      expect(isExplicitInterruptWord("ruk jao")).toBe(true);
      expect(isExplicitInterruptWord("rok do")).toBe(true);
      expect(isExplicitInterruptWord("chup")).toBe(true);
      expect(isExplicitInterruptWord("hello")).toBe(false);
    });

    it("bypasses echo filtering when assistant is actively speaking", () => {
      filter.registerPlaybackStart(
        "u1",
        "Maine aap ke liye code VPS par deploy kar diya hai",
        10000,
      );

      // User says 'Stop' during playback
      const decision = filter.processInterimTranscript("Stop", 10500);
      expect(decision.action).toBe("barge");
      expect(decision.isBargeIn).toBe(true);
      expect(decision.reason).toBe("explicit_interrupt_command");

      // User says 'Ruko'
      const rukoDecision = filter.processInterimTranscript("Ruko", 10600);
      expect(rukoDecision.action).toBe("barge");
      expect(rukoDecision.isBargeIn).toBe(true);

      // User says 'Wait'
      const waitDecision = filter.processInterimTranscript("Wait please", 10700);
      expect(waitDecision.action).toBe("barge");
      expect(waitDecision.isBargeIn).toBe(true);
    });
  });

  describe("4. Playhead Windowing [t_start - 300ms, t_end + 1500ms]", () => {
    it("recognizes playback inside lead window (audio arriving slightly before start timestamp)", () => {
      // Utterance starts at t = 10000
      filter.registerPlaybackStart("u1", "Building web bundle for production", 10000);

      // STT interim arrives at t = 9800 (within lead window 10000 - 300 = 9700)
      const decision = filter.processInterimTranscript("Building web bundle", 9800);
      expect(decision.action).toBe("drop");
      expect(decision.reason).toMatch(/speaker_bleed/);
    });

    it("recognizes playback inside tail window (reverb / room resonance up to 1500ms after end)", () => {
      // Utterance played from 10000 to 12000
      filter.registerPlaybackStart("u1", "Database backup complete", 10000);
      filter.registerPlaybackEnd("u1", 12000);

      // Bleed arrives at t = 13000 (within tail window 12000 + 1500 = 13500)
      const decision = filter.processInterimTranscript("Database backup complete", 13000);
      expect(decision.action).toBe("drop");
      expect(decision.reason).toMatch(/speaker_bleed/);
    });

    it("emits user speech when outside active playhead and tail windows", () => {
      filter.registerPlaybackStart("u1", "First utterance", 10000);
      filter.registerPlaybackEnd("u1", 11000);

      // Arrives well past tailMs (11000 + 1500 = 12500 < 15000)
      const decision = filter.processInterimTranscript("Can you check the server status", 15000);
      expect(decision.action).toBe("emit");
      expect(decision.reason).toBe("no_active_assistant_speech");
      expect(decision.cleanedText).toBe("Can you check the server status");
    });
  });

  describe("5. Sliding Character Sequence Matching (char_echo)", () => {
    it("drops phonetically distorted acoustic echoes with char_echo >= 0.58", () => {
      filter.registerPlaybackStart(
        "u1",
        "Maine aap ke liye code deploy kar diya hai VPS par",
        10000,
      );

      // Distorted acoustic bleed where words are mangled by room noise:
      // "cone deploy kar dya"
      const interimDecision = filter.processInterimTranscript("cone deploy kar dya hai", 10500);
      expect(interimDecision.action).toBe("drop");
      expect(interimDecision.charEchoScore).toBeGreaterThanOrEqual(0.58);

      // Final turn test with distorted character bleed >= 0.62
      const turnDecision = filter.processFinalTranscript("cone deploy kar dya hai vps", 10600);
      expect(turnDecision.action).toBe("drop");
      expect(turnDecision.charEchoScore).toBeGreaterThanOrEqual(0.62);
    });
  });

  describe("6. Stopword Shielding", () => {
    it("protects user prepositions and conjunctions flanked by user words", () => {
      // Assistant said: "The system is running on port 4000"
      filter.registerPlaybackStart("u1", "The system is running on port 4000", 10000);

      // User says: "look at the code please"
      // Notice "at" and "the" are stopwords flanked by "look" and "code"
      // Even if assistant line had "the", "at the" must NOT be stripped from the user!
      const decision = filter.processFinalTranscript("look at the code please", 10500);
      expect(decision.action).toBe("emit");
      expect(decision.cleanedText).toContain("look");
      expect(decision.cleanedText).toContain("at");
      expect(decision.cleanedText).toContain("the");
      expect(decision.cleanedText).toContain("code");
    });

    it("protects Roman Urdu stopwords in user speech (e.g. 'ko', 'se', 'main')", () => {
      filter.registerPlaybackStart("u1", "Maine server ko update kar diya hai", 10000);

      // User says: "ruko database ko check karo"
      // "ko" is flanked by "database" and "check"
      const decision = filter.processFinalTranscript("database ko check karo", 10500);
      expect(decision.action).toBe("emit");
      expect(decision.cleanedText).toContain("database");
      expect(decision.cleanedText).toContain("ko");
      expect(decision.cleanedText).toContain("check");
    });
  });

  describe("7. Contiguous User Run Extraction (his_runs >= 2 words)", () => {
    it("rejects isolated unflagged words (<2 words) surrounded by echo", () => {
      // Assistant said: "Maine aap ke liye code deploy kar diya hai VPS par"
      filter.registerPlaybackStart(
        "u1",
        "Maine aap ke liye code deploy kar diya hai VPS par",
        10000,
      );

      // STT hears assistant audio bleed, but 1 stray word is misrecognized as "banana":
      // "Maine aap ke liye banana deploy kar diya hai VPS par"
      // The single word "banana" has run length 1 (< 2 words) -> must NOT trigger barge-in!
      const decision = filter.processInterimTranscript(
        "Maine aap ke liye banana deploy kar diya hai VPS par",
        10500,
      );
      expect(decision.action).toBe("drop");
      expect(decision.isBargeIn).toBe(false);
    });

    it("accepts contiguous blocks of >= 2 genuine user words", () => {
      filter.registerPlaybackStart(
        "u1",
        "Maine aap ke liye code deploy kar diya hai VPS par",
        10000,
      );

      // User speaks: "cancel that now please"
      const decision = filter.processInterimTranscript("cancel that now please", 10500);
      expect(decision.action).toBe("barge");
      expect(decision.isBargeIn).toBe(true);
      expect(decision.cleanedText).toBe("cancel that now please");
    });
  });

  describe("8. Mixed Utterance Echo Stripping", () => {
    it("strips echo prefix and preserves user speech", () => {
      // Assistant said: "Please wait while building"
      filter.registerPlaybackStart("u1", "Please wait while building", 10000);

      // User speaks over assistant: "Please wait no cancel it"
      // "Please wait" is echo from assistant.
      // "no cancel it" is user speech (run >= 2 words).
      const decision = filter.processFinalTranscript("Please wait no cancel it", 10500);
      expect(decision.action).toBe("emit");
      expect(decision.cleanedText).toBe("no cancel it");
    });
  });

  describe("9. Deduplication After Barge-In (after_barge)", () => {
    it("drops exact duplicate final transcript after interim barge-in", () => {
      filter.registerPlaybackStart("u1", "Running tests on server", 10000);

      // 1. Interim triggers barge-in
      const interim = filter.processInterimTranscript("cancel that", 10500);
      expect(interim.action).toBe("barge");
      expect(interim.isBargeIn).toBe(true);

      // 2. Final transcript arrives with identical text
      const finalTurn = filter.processFinalTranscript("cancel that", 10800);
      expect(finalTurn.action).toBe("drop");
      expect(finalTurn.reason).toBe("duplicate_barge_in");
    });

    it("emits extension remainder if final transcript has additional words", () => {
      filter.registerPlaybackStart("u1", "Running tests on server", 10000);

      // 1. Interim triggers barge-in
      const interim = filter.processInterimTranscript("cancel that", 10500);
      expect(interim.action).toBe("barge");

      // 2. Final transcript arrives with extension
      const finalTurn = filter.processFinalTranscript("cancel that immediately please", 10800);
      expect(finalTurn.action).toBe("emit");
      expect(finalTurn.cleanedText).toBe("immediately please");
      expect(finalTurn.reason).toBe("barge_in_turn_extension");
    });
  });

  describe("10. Headphones Mode Support", () => {
    it("lowers barge-in threshold to 2 words with zero echo stripping in headphones mode", () => {
      const headphonesFilter = new CludeGodsEchoFilter({
        isHeadphones: () => true,
        clock: () => simulatedClock,
      });

      headphonesFilter.registerPlaybackStart("u1", "Assistant talking loudly", 10000);

      // User says 2 words
      const decision = headphonesFilter.processInterimTranscript("hello there", 10500);
      expect(decision.action).toBe("barge");
      expect(decision.isBargeIn).toBe(true);
      expect(decision.reason).toBe("headphones_barge_in");
    });
  });

  describe("11. Latency & Performance Benchmark (<5ms)", () => {
    it("executes processInterimTranscript and processFinalTranscript in <5ms per call", () => {
      filter.registerPlaybackStart(
        "u1",
        "Hum ne aap ke application ka version 2 update kar diya hai aur tamaam tests pass ho chuke hain",
        10000,
      );

      const complexTranscript =
        "Hum ne aap ke application ka version 2 update kar diya hai aur nayi request check karo";

      const iterations = 50;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        filter.processInterimTranscript(complexTranscript, 10500);
      }
      const totalElapsed = performance.now() - start;
      const avgElapsed = totalElapsed / iterations;

      expect(avgElapsed).toBeLessThan(5.0); // Must be strictly under 5ms
    });
  });

  describe("12. Bilingual Urdu Script Transliteration & Echo Cancellation", () => {
    it("drops Urdu script acoustic echo when assistant spoke in Roman Urdu", () => {
      filter.registerPlaybackStart("u1", "Main aap ka kaam mukammal kar raha hoon", 10000);

      // Microphone transcribes Chrome's ur-PK Urdu script:
      const decision = filter.processInterimTranscript("میں آپ کا کام مکمل کر رہا ہوں", 10500);

      expect(decision.action).toBe("drop");
      expect(decision.isBargeIn).toBe(false);
    });

    it("triggers instant barge-in when user speaks Urdu script stop command during playback", () => {
      filter.registerPlaybackStart("u1", "Main aap ko sun raha hoon", 10000);

      const decisionStop = filter.processInterimTranscript("سٹاپ", 10500);
      expect(decisionStop.action).toBe("barge");
      expect(decisionStop.isBargeIn).toBe(true);

      const decisionRuko = filter.processInterimTranscript("روکو", 10500);
      expect(decisionRuko.action).toBe("barge");
      expect(decisionRuko.isBargeIn).toBe(true);
    });
  });
});
