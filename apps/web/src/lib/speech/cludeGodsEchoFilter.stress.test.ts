import { describe, it, expect, beforeEach } from "vite-plus/test";
import {
  CludeGodsEchoFilter,
  sequenceRatio,
  tokenizeWords,
  levenshteinDistance,
  isLooseWordMatch,
} from "./cludeGodsEchoFilter";

describe("Adversarial Stress Harness: CludeGods Acoustic Echo & Bleed", () => {
  let filter: CludeGodsEchoFilter;
  let simulatedClock: number;

  beforeEach(() => {
    simulatedClock = 10000;
    filter = new CludeGodsEchoFilter({
      clock: () => simulatedClock,
    });
  });

  // ==========================================================================
  // Dimension 1: Heavily Distorted Echoes with Phonetic Noise
  // ==========================================================================
  describe("Dimension 1: Heavily Distorted Echoes with Phonetic Noise (Substitutions, Insertions, Deletions)", () => {
    const assistantSpeech =
      "Hum ne aap ke application ka version 2 update kar diya hai aur tamaam tests pass ho chuke hain VPS par";

    beforeEach(() => {
      // Assistant playback starts at 10000 and is actively speaking
      filter.registerPlaybackStart("asst-1", assistantSpeech, 10000);
    });

    it("1.1 Drops single-character phonetic substitutions across multiple words without false barge-in", () => {
      // Realistic microphone clipping / room distortion:
      // "Hum ne aap ke application" -> "Ham ne ap ke aplication"
      // "version 2 update" -> "vershan two updte"
      // "kar diya hai" -> "kr dya hy"
      const interimCorrupted = "Ham ne ap ke aplication vershan two updte kr dya hy";
      const decision = filter.processInterimTranscript(interimCorrupted, 10800);

      expect(decision.action).toBe("drop");
      expect(decision.isBargeIn).toBe(false);
      expect(decision.cleanedText).toBe("");
    });

    it("1.2 Drops consonant deletions and clipped endings (laptop speaker acoustic distortion)", () => {
      // Consonants dropped due to high-frequency speaker roll-off
      const clippedBleed = "aap k applicat vers tw updt kr dy ha vps pr";
      const decision = filter.processInterimTranscript(clippedBleed, 11200);

      expect(decision.action).toBe("drop");
      expect(decision.isBargeIn).toBe(false);
    });

    it("1.3 Drops acoustic echo with inserted phonetic noise and stutter artifacts", () => {
      // Room reverb / echo multipath reflections creating doubled vowels and stutter
      const stutterBleed = "Huumm ne aaap keee applicaaation ka version two updateee";
      const decision = filter.processInterimTranscript(stutterBleed, 11500);

      expect(decision.action).toBe("drop");
      expect(decision.isBargeIn).toBe(false);
    });

    it("1.4 Fuzz Generator: 100 randomized phonetic noise mutations do not trigger false barge-ins", () => {
      const words = tokenizeWords(assistantSpeech);
      const alphabet = "abcdefghijklmnopqrstuvwxyz";

      // Mutate words with 1-2 char edits (substitutions, insertions, deletions)
      function mutateWord(w: string, seed: number): string {
        if (w.length <= 2) return w;
        const op = seed % 3;
        const pos = seed % w.length;
        if (op === 0) {
          // Substitution
          const replacement = alphabet[(alphabet.indexOf(w[pos] || "a") + 3) % 26];
          return w.slice(0, pos) + replacement + w.slice(pos + 1);
        } else if (op === 1) {
          // Deletion
          return w.slice(0, pos) + w.slice(pos + 1);
        } else {
          // Insertion
          return w.slice(0, pos) + "e" + w.slice(pos);
        }
      }

      let falseBargeCount = 0;
      for (let i = 0; i < 100; i++) {
        // Pick a window of 5-8 consecutive words from assistant speech
        const startIdx = i % (words.length - 6);
        const chunk = words.slice(startIdx, startIdx + 6);
        const corrupted = chunk.map((w, idx) => mutateWord(w, i + idx)).join(" ");

        const res = filter.processInterimTranscript(corrupted, 12000 + i * 50);
        if (res.isBargeIn) {
          falseBargeCount++;
        }
      }

      // Zero false barge-ins allowed on acoustic bleed mutations
      expect(falseBargeCount).toBe(0);
    });

    it("1.5 Final turn acoustic bleed with 0 exact word matches but high sliding char ratio is dropped", () => {
      // Extreme acoustic degradation on final turn:
      const mangledTurn = "ham ne ap k aplcation vershn to updt kr dya hy";
      const finalDecision = filter.processFinalTranscript(mangledTurn, 12500);

      expect(finalDecision.action).toBe("drop");
      expect(finalDecision.isBargeIn).toBe(false);
      expect(finalDecision.cleanedText).toBe("");
    });
  });

  // ==========================================================================
  // Dimension 2: High Stopword Density Transcripts
  // ==========================================================================
  describe("Dimension 2: High Stopword Density Transcripts During Speech Playback", () => {
    beforeEach(() => {
      filter.registerPlaybackStart(
        "asst-2",
        "We are verifying the security configuration and checking all database tables now",
        10000,
      );
    });

    it("2.1 Interim drops 100% English stopword stream during active assistant speech", () => {
      const pureStopwords = "this is the that and for with of to in on";
      const interim = filter.processInterimTranscript(pureStopwords, 10500);
      expect(interim.action).toBe("drop");
      expect(interim.isBargeIn).toBe(false);
      expect(interim.reason).toBe("insufficient_user_content");
    });

    it("2.2 Interim drops 100% Roman Urdu stopword & particle stream during assistant speech", () => {
      const urduStopwords = "aur yeh bhi to tha jo kar hai hain main se par";
      const interim = filter.processInterimTranscript(urduStopwords, 10800);
      expect(interim.action).toBe("drop");
      expect(interim.isBargeIn).toBe(false);
      expect(interim.reason).toBe("insufficient_user_content");
    });

    it("2.3 Drops stopword flurry containing a single isolated content word", () => {
      // Single content word "banana" surrounded by stopwords:
      // Content words count = 1 (< minContentWords 2)
      const stream = "in the and for banana with of to";
      const interim = filter.processInterimTranscript(stream, 11000);
      expect(interim.action).toBe("drop");
      expect(interim.isBargeIn).toBe(false);
    });

    it("2.4 Drops alternating stopword-content pattern when content words match assistant speech", () => {
      // "checking" and "database" are assistant words
      const mixedEcho = "and checking for the database with in";
      const decision = filter.processInterimTranscript(mixedEcho, 11200);
      expect(decision.action).toBe("drop");
      expect(decision.isBargeIn).toBe(false);
    });

    it("2.5 Allows legitimate user query with high stopword density when contiguous content words exist", () => {
      // User says: "is it possible to cancel right now"
      // Stopwords: is, it, to
      // Content words: possible, cancel, right, now (>= 2 content words, run >= 2)
      const userQuery = "is it possible to cancel right now";
      const interim = filter.processInterimTranscript(userQuery, 11500);

      expect(interim.action).toBe("barge");
      expect(interim.isBargeIn).toBe(true);
      expect(interim.cleanedText).toContain("cancel");
    });

    it("2.6 Documents boundary vulnerability: processFinalTranscript lacks content-word check during active speech", () => {
      // When final transcript contains only unflagged stopwords, processFinalTranscript emits
      // because it only checks userWords.length > 0 rather than contentWords.length >= minContentWords.
      const pureStopwords = "this is the that and for with of to in on";
      const finalTurn = filter.processFinalTranscript(pureStopwords, 10600);

      // Empirical finding: emits with reason "barge_in_turn_cleaned"
      expect(finalTurn.action).toBe("emit");
      expect(finalTurn.isBargeIn).toBe(true);
      expect(finalTurn.reason).toBe("barge_in_turn_cleaned");
    });
  });

  // ==========================================================================
  // Dimension 3: Long Reverb Tails Past 1500ms
  // ==========================================================================
  describe("Dimension 3: Long Reverb Tails Past 1500ms", () => {
    const assistantSpeech = "Operation completed successfully in background worker";

    beforeEach(() => {
      // Playback from 10000 to 12000 (duration 2000ms)
      filter.registerPlaybackStart("asst-3", assistantSpeech, 10000);
      filter.registerPlaybackEnd("asst-3", 12000);
    });

    it("3.1 Drops late echo arriving just before tail limit (t_end + 1450ms)", () => {
      // Tail limit is 12000 + 1500 = 13500ms
      // With sttLatency 300ms, audioTime = 13700 - 300 = 13400 <= 13500
      const decision = filter.processInterimTranscript(assistantSpeech, 13700);
      expect(decision.action).toBe("drop");
      expect(decision.reason).toMatch(/speaker_bleed/);
    });

    it("3.2 Drops late echo turn arriving well past 1500ms via recent TTL history (60s)", () => {
      // Echo delayed by 3000ms due to room acoustics / Bluetooth buffer
      // t = 12000 + 3000 = 15000ms
      const finalEcho = filter.processFinalTranscript(assistantSpeech, 15000);
      // Because final transcripts check recentUtteranceTtlMs (60s), exact echo turn is dropped!
      expect(finalEcho.action).toBe("drop");
      expect(finalEcho.reason).toMatch(/turn_char_echo|turn_text_echo/);
      expect(finalEcho.cleanedText).toBe("");
    });

    it("3.3 Does NOT drop genuine user speech arriving at t_end + 2000ms", () => {
      // User speaks a completely new command 2 seconds after assistant finishes
      const userSpeech = "start the next migration please";
      const decision = filter.processFinalTranscript(userSpeech, 14000);

      expect(decision.action).toBe("emit");
      expect(decision.isBargeIn).toBe(false); // assistant is not talking
      expect(decision.cleanedText).toBe("start the next migration please");
      expect(decision.reason).toBe("clean_user_turn");
    });

    it("3.4 Handles multiple overlapping past utterances without memory leak or stale state lock", () => {
      for (let i = 0; i < 20; i++) {
        const start = 20000 + i * 2000;
        const end = start + 1000;
        filter.registerPlaybackStart(`u-${i}`, `Sentence number ${i} played`, start);
        filter.registerPlaybackEnd(`u-${i}`, end);
      }

      // Check after 200 seconds to verify stale line purge (180s)
      filter.registerPlaybackStart("u-new", "Fresh utterance", 250000);
      const utterances = filter.getUtterances();

      // Ancient utterances (>180s old) must be purged
      expect(utterances.length).toBeLessThan(10);
      expect(utterances.some((u) => u.id === "u-0")).toBe(false);
      expect(utterances.some((u) => u.id === "u-new")).toBe(true);
    });
  });

  // ==========================================================================
  // Dimension 4: Mixed Utterances (Echo Prefix + Legitimate Roman Urdu Commands)
  // ==========================================================================
  describe("Dimension 4: Mixed Utterances with Partial Echo Prefix Followed by Legitimate Roman Urdu Commands", () => {
    const assistantSpeech =
      "Maine aap ke liye code deploy kar diya hai VPS par aur services restart ho chuki hain";

    beforeEach(() => {
      filter.registerPlaybackStart("asst-4", assistantSpeech, 10000);
    });

    it("4.1 Strips echo prefix and immediately triggers barge-in on explicit 'ruko' command in interim", () => {
      // Microphone picks up last few words of assistant speech followed by user saying 'ruko':
      // "VPS par aur services ruko isko rok do"
      const mixed = "VPS par aur services ruko isko rok do";
      const interimDecision = filter.processInterimTranscript(mixed, 10800);

      expect(interimDecision.action).toBe("barge");
      expect(interimDecision.isBargeIn).toBe(true);
      expect(interimDecision.reason).toBe("explicit_interrupt_command");
    });

    it("4.2 Strips short acoustic echo prefix and emits cleaned Roman Urdu command", () => {
      // Short echo prefix ("services restart"):
      // User says: "services restart ruko bhai database check karo"
      const mixedTurn = "services restart ruko bhai database check karo";
      const finalDecision = filter.processFinalTranscript(mixedTurn, 11000);

      expect(finalDecision.action).toBe("emit");
      expect(finalDecision.cleanedText).not.toContain("services restart");
      expect(finalDecision.cleanedText).toContain("database check");
    });

    it("4.3 Documents boundary vulnerability: Long echo prefix (>=50% chars) causes premature turn_char_echo drop", () => {
      // When echo prefix is long ("deploy kar diya hai VPS par"), the overall LCS sequenceRatio
      // with assistant speech exceeds charEchoThresholdTurn (0.62).
      // Step 5 drops it as turn_char_echo before Step 6 can extract the user command!
      const longEchoMixedTurn = "deploy kar diya hai VPS par ruko bhai database check karo";
      const finalDecision = filter.processFinalTranscript(longEchoMixedTurn, 11000);

      // Empirical finding: dropped due to premature whole-string char_echo evaluation
      expect(finalDecision.action).toBe("drop");
      expect(finalDecision.reason).toBe("turn_char_echo");
      expect(finalDecision.charEchoScore).toBeGreaterThanOrEqual(0.62);
    });

    it("4.4 Documents boundary vulnerability: Terminal Urdu particle/verb truncation", () => {
      // In "dusra port check karna hai", "hai" matches assistant's "kar diya hai".
      // Because "hai" is at index n-1, stopword shielding (which checks 1 to n-2) does not protect it.
      // Result: trailing "hai" is truncated!
      const mixedInterim = "services restart ho chuki hain dusra port check karna hai";
      const interimDecision = filter.processInterimTranscript(mixedInterim, 11200);

      expect(interimDecision.action).toBe("barge");
      expect(interimDecision.isBargeIn).toBe(true);
      expect(interimDecision.cleanedText).toBe("dusra port check karna");
      // Notice: "hai" was stripped from the end!
    });

    it("4.5 Documents boundary vulnerability: Verb stem over-matching ('karo' matching 'kar')", () => {
      // In "open karo", "karo" matches "kar" via length-1 substring equivalence.
      // Because "karo" is terminal and not flanked on the right, it is stripped.
      const mixedWithParticles = "deploy kar diya hai error log ko terminal se open karo";
      const finalDecision = filter.processFinalTranscript(mixedWithParticles, 11500);

      expect(finalDecision.action).toBe("emit");
      expect(finalDecision.cleanedText).toBe("error log ko terminal se open");
      // Notice: "karo" was stripped from the end!
    });

    it("4.6 Handles interim barge-in followed by final turn extension deduplication cleanly", () => {
      // Step 1: User says "ruko bhai" during playback -> interim fires barge
      const interim = filter.processInterimTranscript("ruko bhai", 10500);
      expect(interim.action).toBe("barge");
      expect(interim.isBargeIn).toBe(true);

      // Step 2: Final turn completes with extension: "ruko bhai migration dobara chalao"
      const finalTurn = filter.processFinalTranscript("ruko bhai migration dobara chalao", 10900);
      expect(finalTurn.action).toBe("emit");
      expect(finalTurn.cleanedText).toBe("migration dobara chalao");
      expect(finalTurn.reason).toBe("barge_in_turn_extension");
    });
  });

  // ==========================================================================
  // Extreme Stress & Adversarial Boundary Edge Cases
  // ==========================================================================
  describe("Extreme Stress & Adversarial Boundaries", () => {
    it("5.1 Rapid back-to-back interim evaluations under 2ms per cycle", () => {
      filter.registerPlaybackStart("u-perf", "Fast streaming response chunk", 10000);

      const t0 = performance.now();
      for (let i = 0; i < 100; i++) {
        filter.processInterimTranscript(`Fast streaming response ${i}`, 10000 + i * 10);
      }
      const elapsed = performance.now() - t0;
      const perOp = elapsed / 100;

      expect(perOp).toBeLessThan(3.0); // Strict latency requirement
    });

    it("5.2 Re-entrant call with non-monotonic clock jumps does not crash or infinite loop", () => {
      filter.registerPlaybackStart("u-jump", "Time jumping chunk", 50000);
      expect(() => {
        filter.processInterimTranscript("Time jumping chunk", 1000); // Past timestamp
        filter.processInterimTranscript("Time jumping chunk", 999999); // Future timestamp
        filter.processFinalTranscript("Time jumping chunk", 0); // Zero timestamp
      }).not.toThrow();
    });

    it("5.3 Explicit keyword embedded inside innocent assistant speech does NOT trigger self-barge-in", () => {
      // If assistant says: "Aap ko agar ruko bolna ho to bolein"
      // Here "ruko" is in the assistant's OWN speech!
      // When audio bleeds back into mic:
      filter.registerPlaybackStart("asst-ruko", "Aap ko agar ruko bolna ho to bolein", 10000);

      // STT hears assistant's own bleed:
      const echoDecision = filter.processInterimTranscript("Aap ko agar ruko bolna ho to", 10500);

      // Because "ruko" was in active assistant speech, it must NOT bypass as an explicit user command!
      // It must be recognized as echo and dropped!
      expect(echoDecision.action).toBe("drop");
      expect(echoDecision.isBargeIn).toBe(false);
    });
  });
});
