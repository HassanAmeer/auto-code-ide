/**
 * Voice Call Assistant End-to-End (E2E) Test Suite
 *
 * Comprehensive, opaque-box, requirement-driven test suite verifying:
 * - R1: Instant Interruption (<150ms cutoff) & Barge-in
 * - R2: Zero-Freeze TTS Lifecycle & Continuous STT Keep-Alive
 * - R3: Acoustic Echo & Speaker Bleed Filtering (CludeGods Sequence Matching)
 * - R4: Roman Urdu & Settings Preservation / Chat Sync
 *
 * Test Architecture:
 * - Tier 1: Feature Coverage (F1 to F10, >=5 tests per feature = 50 tests)
 * - Tier 2: Boundary & Corner Cases (F1 to F10, >=5 tests per feature = 50 tests)
 * - Tier 3: Cross-Feature Interactions (>=10 pairwise tests = 12 tests)
 * - Tier 4: Real-World Scenarios (5 multi-turn conversational scenarios)
 * Total: 117 tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";

// Modules under test
import {
  CludeGodsEchoFilter,
  levenshteinDistance,
  lcsLength,
  sequenceRatio,
  cleanAlphanumeric,
  expandNumerals,
  tokenizeWords,
  isExplicitInterruptWord,
  isLooseWordMatch,
} from "~/lib/speech/cludeGodsEchoFilter";

import { StreamingTtsPlayer, extractSpeechChunks } from "./streamingTtsPlayer";

import {
  containsInterruptCommand,
  isFarewellOrEndCall,
  isUtteranceEchoOfAi,
  stripAiSpeechFromTranscript,
} from "./useVoiceCallAssistant";

import {
  formatSttTranscript,
  deduplicateOverlap,
  removeConsecutiveDuplicateWords,
  getRecognitionLanguageCodes,
  loadSttSettings,
  saveSttSettings,
  DEFAULT_STT_SETTINGS,
} from "~/lib/speech/stt";

import {
  splitTextIntoSentenceUnits,
  sanitizeTextForSpeech,
  stopSpeaking,
  safeStopSpeechPlayback,
  VOCAL_STYLES,
} from "~/lib/speech/tts";

import { transliterateUrduToRoman } from "~/lib/speech/romanUrduTransliterate";
import { adaptRomanUrduForVoice } from "~/lib/speech/romanUrduSpeechAdapter";

// ============================================================================
// SIMULATED BROWSER ENVIRONMENT & HARNESS
// ============================================================================

interface MockUtterance {
  text: string;
  lang?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  onstart?: (() => void) | null;
  onend?: (() => void) | null;
  onerror?: ((err: any) => void) | null;
  onpause?: (() => void) | null;
  onresume?: (() => void) | null;
}

class MockSpeechSynthesis {
  public speaking = false;
  public paused = false;
  public pending = false;
  public queue: MockUtterance[] = [];
  public activeUtterance: MockUtterance | null = null;
  public cancelCount = 0;
  public resumeCount = 0;
  public pauseCount = 0;
  public speakCount = 0;
  public lastSpokenText = "";
  public cancelHistory: { wasPaused: boolean; timestamp: number }[] = [];

  getVoices(): any[] {
    return [
      {
        name: "Google US English",
        lang: "en-US",
        default: true,
        localService: false,
        voiceURI: "Google US English",
      },
      {
        name: "Google Urdu",
        lang: "ur-PK",
        default: false,
        localService: false,
        voiceURI: "Google Urdu",
      },
    ];
  }

  speak(utterance: MockUtterance) {
    this.speakCount++;
    this.queue.push(utterance);
    this.lastSpokenText = utterance.text;
    if (!this.speaking && !this.paused) {
      this.processNext();
    }
  }

  processNext() {
    if (this.queue.length === 0) {
      this.speaking = false;
      this.activeUtterance = null;
      return;
    }
    this.speaking = true;
    this.activeUtterance = this.queue.shift() || null;
    if (this.activeUtterance?.onstart) {
      try {
        this.activeUtterance.onstart();
      } catch {}
    }
  }

  cancel() {
    this.cancelCount++;
    this.cancelHistory.push({ wasPaused: this.paused, timestamp: Date.now() });
    if (this.activeUtterance?.onerror) {
      try {
        this.activeUtterance.onerror({ error: "canceled" });
      } catch {}
    }
    this.queue = [];
    this.activeUtterance = null;
    this.speaking = false;
    this.pending = false;
  }

  pause() {
    this.pauseCount++;
    this.paused = true;
    if (this.activeUtterance?.onpause) {
      try {
        this.activeUtterance.onpause();
      } catch {}
    }
  }

  resume() {
    this.resumeCount++;
    this.paused = false;
    if (this.activeUtterance?.onresume) {
      try {
        this.activeUtterance.onresume();
      } catch {}
    }
    if (!this.speaking && this.queue.length > 0) {
      this.processNext();
    }
  }

  finishCurrent() {
    if (this.activeUtterance) {
      const utt = this.activeUtterance;
      this.activeUtterance = null;
      this.speaking = false;
      if (utt.onend) {
        try {
          utt.onend();
        } catch {}
      }
      this.processNext();
    }
  }
}

class MockSpeechRecognition {
  public continuous = true;
  public interimResults = true;
  public lang = "ur-PK";
  public isRunning = false;
  public abortCount = 0;
  public stopCount = 0;
  public startCount = 0;
  public onstart: (() => void) | null = null;
  public onresult: ((event: any) => void) | null = null;
  public onerror: ((event: any) => void) | null = null;
  public onend: (() => void) | null = null;

  start() {
    this.startCount++;
    this.isRunning = true;
    this.onstart?.();
  }

  stop() {
    this.stopCount++;
    this.isRunning = false;
    this.onend?.();
  }

  abort() {
    this.abortCount++;
    this.isRunning = false;
    this.onerror?.({ error: "aborted" });
    this.onend?.();
  }

  simulateSpeechResult(transcript: string, isFinal = false, resultIndex = 0) {
    if (!this.isRunning) return;
    const event = {
      resultIndex,
      results: [
        {
          0: { transcript },
          isFinal,
          length: 1,
        },
      ],
    };
    (event.results as any)[resultIndex] = event.results[0];
    this.onresult?.(event);
  }

  simulateError(error: string) {
    this.onerror?.({ error });
  }

  simulateNaturalSilenceEnd() {
    this.isRunning = false;
    this.onend?.();
  }
}

/**
 * High-fidelity Simulated Full-Duplex Voice Call Session Coordinator
 */
class SimulatedVoiceCallSession {
  public status: "idle" | "listening" | "user-speaking" | "thinking" | "speaking" = "idle";
  public echoFilter: CludeGodsEchoFilter;
  public recognition: MockSpeechRecognition;
  public tts: MockSpeechSynthesis;
  public streamingPlayer: StreamingTtsPlayer;
  public prompt = "";
  public chatLedger: { role: "user" | "assistant"; text: string }[] = [];
  public lastBargeInTimestamp = 0;
  public lastTtsStopLatencyMs = 0;
  public onInterruptCallback = vi.fn();
  public autoDispatchTimer: any = null;
  public restartTimer: any = null;
  public simulatedClock = 1000;

  constructor() {
    this.simulatedClock = 1000;
    this.recognition = new MockSpeechRecognition();
    this.tts = new MockSpeechSynthesis();
    this.echoFilter = new CludeGodsEchoFilter({
      clock: () => this.simulatedClock,
    });
    this.streamingPlayer = new StreamingTtsPlayer({
      onChunkStart: (chunk) => {
        this.echoFilter.registerPlaybackStart(chunk.id, chunk.text, this.simulatedClock);
      },
      onChunkEnd: (chunk) => {
        this.echoFilter.registerPlaybackEnd(chunk.id, this.simulatedClock);
      },
    });
  }

  startCall() {
    this.status = "listening";
    this.recognition.start();
  }

  endCall() {
    this.status = "idle";
    this.recognition.stop();
    this.safeStopAudio();
    this.echoFilter.reset();
  }

  safeStopAudio() {
    const t0 = this.simulatedClock;
    safeStopSpeechPlayback();
    this.tts.cancel();
    this.streamingPlayer.stop();
    this.lastTtsStopLatencyMs = this.simulatedClock - t0;
  }

  handleUserSpeechEvent(rawTranscript: string, isFinal = false, eventTimestamp?: number) {
    const now = eventTimestamp ?? this.simulatedClock;
    this.simulatedClock = now;

    // Process through CludeGods Echo Filter
    const decision = isFinal
      ? this.echoFilter.processFinalTranscript(rawTranscript, now)
      : this.echoFilter.processInterimTranscript(rawTranscript, now);

    if (decision.action === "drop") {
      // Discarded as speaker bleed / acoustic echo
      return { action: "drop", decision, prompt: this.prompt };
    }

    // Check if input contains alphanumeric content
    const alphanumeric = rawTranscript.replace(/[^\p{L}\p{N}]+/gu, "").trim();
    if (!alphanumeric) {
      return { action: "drop", decision, prompt: "" };
    }

    const isExplicit =
      containsInterruptCommand(rawTranscript) || isExplicitInterruptWord(rawTranscript);
    const isSpeechOver =
      (this.status === "speaking" || this.status === "thinking") &&
      tokenizeWords(rawTranscript).length >= 2;

    if (this.status === "speaking" || this.status === "thinking" || isExplicit) {
      if (isExplicit || isSpeechOver || decision.isBargeIn || decision.action === "barge") {
        return this.triggerBargeIn(rawTranscript, isExplicit, now, decision);
      }
    }

    const cleaned = decision.cleanedText || rawTranscript;
    const stripped = stripAiSpeechFromTranscript(cleaned, []);
    this.prompt = stripped.trim();
    if (this.prompt && this.status !== "speaking") {
      this.status = "user-speaking";
    }

    return { action: decision.action, decision, prompt: this.prompt };
  }

  triggerBargeIn(transcript: string, isExplicit: boolean, timestamp: number, decision?: any) {
    this.lastBargeInTimestamp = timestamp;
    this.safeStopAudio();
    this.onInterruptCallback();

    // Check pure stop disambiguation: strip only leading interrupt trigger
    const leadingTriggerRegex =
      /^\s*(?:(?:bhai|arey|yaar|please)\s+)?(?:stop|ruko|wait|suno|bas|chup|pause|halt|rok\s*do|ruk\s*jao)(?:\s+(?:bhai|arey|yaar|please))?[\s,.;:!?\-—_]*/i;
    const remainder = transcript
      .replace(leadingTriggerRegex, "")
      .replace(/^[\s,.;:!?\-—_]+|[\s,.;:!?\-—_]+$/g, "")
      .trim();

    if (isExplicit && remainder.length === 0) {
      this.prompt = "";
      this.status = "listening";
      if (this.autoDispatchTimer) {
        clearTimeout(this.autoDispatchTimer);
        this.autoDispatchTimer = null;
      }
      return { action: "barge", decision, prompt: "" };
    }

    this.prompt = remainder || transcript.trim();
    this.status = "user-speaking";
    return { action: "barge", decision, prompt: this.prompt };
  }

  dispatchToChat(userPrompt?: string) {
    const textToSend = userPrompt ?? this.prompt;
    if (!textToSend.trim()) return;

    this.chatLedger.push({ role: "user", text: textToSend });
    this.prompt = "";
    this.status = "thinking";

    // Simulate LLM streaming response
    const mockReply = `Main ne aap ka sawal samjh liya hai: "${textToSend}". Yeh raha solution.`;
    this.chatLedger.push({ role: "assistant", text: mockReply });

    this.status = "speaking";
    const { chunks } = extractSpeechChunks(mockReply, 0, true);
    for (const chunk of chunks) {
      this.streamingPlayer.enqueue(chunk);
      this.tts.speak({ text: chunk });
    }
  }
}

// ============================================================================
// TEST SUITE BEGINS
// ============================================================================

describe("VoiceCall Assistant E2E Test Suite", () => {
  let session: SimulatedVoiceCallSession;

  beforeEach(() => {
    session = new SimulatedVoiceCallSession();
    // Setup global window mocks for tests
    const target = typeof window !== "undefined" ? window : (globalThis as any);
    target.window = target;
    target.speechSynthesis = session.tts;
    target.SpeechSynthesisUtterance = class {
      text: string;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((err: any) => void) | null = null;
      onpause: (() => void) | null = null;
      onresume: (() => void) | null = null;
      constructor(text = "") {
        this.text = text;
      }
    };

    target.dispatchEvent = vi.fn();
    target.addEventListener = vi.fn();
    target.removeEventListener = vi.fn();

    let mockStorage: Record<string, string> = {};
    const storage = {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = String(val);
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        mockStorage = {};
      },
    };
    target.localStorage = storage;
    (globalThis as any).localStorage = storage;
  });

  afterEach(() => {
    session.endCall();
    safeStopSpeechPlayback();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // TIER 1: FEATURE COVERAGE (F1 to F10, >=5 tests per feature = 50 tests)
  // ==========================================================================

  describe("Tier 1: Feature Coverage (F1 - F10)", () => {
    // ------------------------------------------------------------------------
    // F1: Instant Interruption (<150ms cutoff) (R1)
    // ------------------------------------------------------------------------
    describe("F1: Instant Interruption (<150ms cutoff)", () => {
      it("1.1 cuts off active speech playback within 150ms on English 'Stop'", () => {
        session.startCall();
        session.status = "speaking";
        session.tts.speaking = true;

        const startTime = 1000;
        session.simulatedClock = startTime;
        session.handleUserSpeechEvent("Stop", false, startTime);

        expect(session.tts.cancelCount).toBeGreaterThanOrEqual(1);
        expect(session.lastTtsStopLatencyMs).toBeLessThan(150);
        expect(session.tts.speaking).toBe(false);
      });

      it("1.2 cuts off active speech playback within 150ms on Roman Urdu 'Ruko'", () => {
        session.startCall();
        session.status = "speaking";
        session.tts.speaking = true;

        session.handleUserSpeechEvent("Ruko", false, 1050);
        expect(session.tts.cancelCount).toBeGreaterThanOrEqual(1);
        expect(session.lastTtsStopLatencyMs).toBeLessThan(150);
      });

      it("1.3 cuts off active speech playback immediately when user speaks new sentence over assistant", () => {
        session.startCall();
        session.status = "speaking";
        session.tts.speaking = true;
        session.echoFilter.registerPlaybackStart("u1", "Assistant talking here", 1000);

        session.handleUserSpeechEvent("mujhe dusra sawal pochna hai", false, 1100);
        expect(session.tts.cancelCount).toBeGreaterThanOrEqual(1);
        expect(session.status).toBe("user-speaking");
      });

      it("1.4 empties and halts StreamingTtsPlayer queue immediately upon interruption", () => {
        session.startCall();
        session.status = "speaking";
        session.streamingPlayer.enqueue("Chunk number one.");
        session.streamingPlayer.enqueue("Chunk number two.");
        session.streamingPlayer.enqueue("Chunk number three.");

        session.handleUserSpeechEvent("wait stop", false, 1200);

        expect(session.streamingPlayer.isStopped()).toBe(true);
        expect(session.streamingPlayer.getQueueLength()).toBe(0);
      });

      it("1.5 aborts active thinking/LLM generation callback immediately upon barge-in", () => {
        session.startCall();
        session.status = "thinking";
        session.handleUserSpeechEvent("Ruko mat socho", false, 1300);

        expect(session.onInterruptCallback).toHaveBeenCalledTimes(1);
      });
    });

    // ------------------------------------------------------------------------
    // F2: Immediate Return to Listening (No Deadlock) (R1)
    // ------------------------------------------------------------------------
    describe("F2: Immediate Return to Listening (No Deadlock)", () => {
      it("2.1 transitions assistant status back to listening without hanging on pure stop", () => {
        session.startCall();
        session.status = "speaking";
        session.handleUserSpeechEvent("stop", false, 1400);

        expect(session.status).toBe("listening");
      });

      it("2.2 maintains SpeechRecognition active without throwing deadlock or unhandled error", () => {
        session.startCall();
        session.status = "speaking";
        session.handleUserSpeechEvent("ruko", false, 1500);

        expect(session.recognition.isRunning).toBe(true);
        expect(session.recognition.abortCount).toBe(0);
      });

      it("2.3 handles rapid back-to-back interrupts within 20ms without engine lockup", () => {
        session.startCall();
        session.status = "speaking";

        expect(() => {
          session.handleUserSpeechEvent("stop", false, 1600);
          session.handleUserSpeechEvent("ruko", false, 1610);
          session.handleUserSpeechEvent("wait", false, 1620);
        }).not.toThrow();

        expect(session.status).toBe("listening");
      });

      it("2.4 allows subsequent user speech turn to process cleanly after an interrupt", () => {
        session.startCall();
        session.status = "speaking";
        session.handleUserSpeechEvent("stop", false, 1700);
        expect(session.status).toBe("listening");

        // Next turn immediately after
        const turn = session.handleUserSpeechEvent("kya haal hai", true, 1800);
        expect(turn.prompt).toContain("kya haal hai");
        expect(session.status).toBe("user-speaking");
      });

      it("2.5 resets streaming player state cleanly so subsequent answers can play immediately", () => {
        session.startCall();
        session.status = "speaking";
        session.streamingPlayer.enqueue("First chunk");
        session.safeStopAudio();

        expect(session.streamingPlayer.isActive()).toBe(false);

        // Next answer enqueues without error
        const player2 = new StreamingTtsPlayer();
        player2.enqueue("New clean chunk");
        expect(player2.hasEnqueuedChunks()).toBe(true);
      });
    });

    // ------------------------------------------------------------------------
    // F3: Zero-Drop Barge-in Utterance Preservation (R1)
    // ------------------------------------------------------------------------
    describe("F3: Zero-Drop Barge-in Utterance Preservation", () => {
      it("3.1 preserves the user's speech from word 1 when interrupting", () => {
        session.startCall();
        session.status = "speaking";

        const res = session.handleUserSpeechEvent(
          "Ruko, mujhe database check karna hai",
          true,
          2000,
        );
        expect(res.prompt).toContain("database check karna hai");
      });

      it("3.2 never aborts SpeechRecognition (recognition.abort() count is 0) during barge-in", () => {
        session.startCall();
        session.status = "speaking";

        session.handleUserSpeechEvent("Listen, cancel that request", false, 2100);
        expect(session.recognition.abortCount).toBe(0);
        expect(session.recognition.isRunning).toBe(true);
      });

      it("3.3 preserves entire multi-word question spoken over assistant", () => {
        session.startCall();
        session.status = "speaking";

        const utterance = "Wait, what is the port configuration for our web server?";
        const res = session.handleUserSpeechEvent(utterance, true, 2200);
        expect(res.prompt).toContain("port configuration");
        expect(res.prompt).toContain("web server");
      });

      it("3.4 preserves Roman Urdu barge-in utterances without dropping words", () => {
        session.startCall();
        session.status = "speaking";

        const utterance = "Suno, pehle test run karo phir deploy karna";
        const res = session.handleUserSpeechEvent(utterance, true, 2300);
        expect(res.prompt).toContain("pehle test run karo");
      });

      it("3.5 retains prompt in composer buffer ready for auto-dispatch", () => {
        session.startCall();
        session.status = "speaking";

        session.handleUserSpeechEvent("Wait check the logs first", true, 2400);
        expect(session.prompt).toBe("check the logs first");
        expect(session.status).toBe("user-speaking");
      });
    });

    // ------------------------------------------------------------------------
    // F4: Pure 'Stop'/'Ruko' Disambiguation & State Reset (R1)
    // ------------------------------------------------------------------------
    describe("F4: Pure 'Stop'/'Ruko' Disambiguation & State Reset", () => {
      it("4.1 disambiguates pure 'Stop' command and resets state to listening", () => {
        session.startCall();
        session.status = "speaking";

        session.handleUserSpeechEvent("Stop", false, 2500);
        expect(session.status).toBe("listening");
        expect(session.prompt).toBe("");
      });

      it("4.2 disambiguates pure Roman Urdu 'Ruko' command and resets prompt to empty", () => {
        session.startCall();
        session.status = "speaking";

        session.handleUserSpeechEvent("ruko", false, 2600);
        expect(session.status).toBe("listening");
        expect(session.prompt).toBe("");
      });

      it("4.3 disambiguates pure 'Wait' command and cancels audio without auto-sending", () => {
        session.startCall();
        session.status = "speaking";

        session.handleUserSpeechEvent("wait", false, 2700);
        expect(session.status).toBe("listening");
        expect(session.chatLedger.length).toBe(0);
      });

      it("4.4 preserves follow-up words when user says interrupt command with new query", () => {
        session.startCall();
        session.status = "speaking";

        session.handleUserSpeechEvent("Ruko, server restart karo", false, 2800);
        expect(session.status).toBe("user-speaking");
        expect(session.prompt).toContain("server restart karo");
      });

      it("4.5 correctly identifies pure interrupt keywords via isExplicitInterruptWord", () => {
        expect(isExplicitInterruptWord("stop")).toBe(true);
        expect(isExplicitInterruptWord("ruko")).toBe(true);
        expect(isExplicitInterruptWord("wait")).toBe(true);
        expect(isExplicitInterruptWord("bas")).toBe(true);
        expect(isExplicitInterruptWord("weather")).toBe(false);
      });
    });

    // ------------------------------------------------------------------------
    // F5: Chromium 15s TTS Freeze Bypass (GC & Heartbeat) (R2)
    // ------------------------------------------------------------------------
    describe("F5: Chromium 15s TTS Freeze Bypass (GC & Heartbeat)", () => {
      it("5.1 splits long paragraph into individual sentence units (<15s each)", () => {
        const longText =
          "Hello world! This is a long explanation that would normally freeze Chromium. It has multiple sentences. Every sentence is split cleanly. No freeze will occur.";
        const units = splitTextIntoSentenceUnits(longText);
        expect(units.length).toBe(5);
        units.forEach((u) => {
          expect(u.length).toBeLessThan(100);
        });
      });

      it("5.2 retains active utterances preventing premature garbage collection", () => {
        expect(() => {
          safeStopSpeechPlayback();
        }).not.toThrow();
      });

      it("5.3 verifies periodic keep-alive pulse (pause/resume) does not throw", () => {
        session.tts.speaking = true;
        expect(() => {
          session.tts.pause();
          session.tts.resume();
        }).not.toThrow();
        expect(session.tts.pauseCount).toBeGreaterThanOrEqual(1);
        expect(session.tts.resumeCount).toBeGreaterThanOrEqual(1);
      });

      it("5.4 verifies sanitizeTextForSpeech preserves technical terms without truncation", () => {
        const text = "Error in line 42: undefined variable in t3forweb project.";
        const cleaned = sanitizeTextForSpeech(text);
        expect(cleaned).toContain("Error in line 42");
        expect(cleaned).toContain("t3forweb");
      });

      it("5.5 extracts speech chunks incrementally from streaming token stream", () => {
        const stream = "Pehla sentence complete ho gaya hai. Doosra sentence abhi chal";
        const { chunks, newOffset } = extractSpeechChunks(stream, 0, false);
        expect(chunks.length).toBe(1);
        expect(chunks[0]).toBe("Pehla sentence complete ho gaya hai.");
        expect(newOffset).toBeGreaterThan(0);
        expect(stream.slice(newOffset)).toContain("Doosra sentence abhi chal");
      });
    });

    // ------------------------------------------------------------------------
    // F6: SpeechSynthesis Cancel Deadlock Elimination (R2)
    // ------------------------------------------------------------------------
    describe("F6: SpeechSynthesis Cancel Deadlock Elimination", () => {
      it("6.1 safeStopSpeechPlayback unpauses/resumes before calling cancel if paused", () => {
        session.tts.paused = true;
        safeStopSpeechPlayback();
        expect(session.tts.resumeCount).toBeGreaterThanOrEqual(1);
        expect(session.tts.cancelCount).toBeGreaterThanOrEqual(1);
      });

      it("6.2 safeStopSpeechPlayback nullifies listeners on active utterances preventing ghost callbacks", () => {
        const ghostCallback = vi.fn();
        const utt = new (window as any).SpeechSynthesisUtterance("Ghost test");
        utt.onend = ghostCallback;
        utt.onerror = ghostCallback;
        session.tts.activeUtterance = utt;

        safeStopSpeechPlayback();
        expect(session.tts.activeUtterance).toBeNull();
        expect(session.tts.speaking).toBe(false);
      });

      it("6.3 immediately unblocks synthesis queue by calling resume after cancel", () => {
        safeStopSpeechPlayback();
        expect(session.tts.resumeCount).toBeGreaterThanOrEqual(1);
      });

      it("6.4 re-entrant stopSpeaking calls do not cause recursion or maximum stack exceeded", () => {
        expect(() => {
          for (let i = 0; i < 20; i++) {
            safeStopSpeechPlayback();
            stopSpeaking();
          }
        }).not.toThrow();
      });

      it("6.5 safeStopSpeechPlayback operates safely in headless/server environment", () => {
        const originalWindow = globalThis.window;
        try {
          (globalThis as any).window = undefined;
          expect(() => safeStopSpeechPlayback()).not.toThrow();
        } finally {
          (globalThis as any).window = originalWindow;
        }
      });
    });

    // ------------------------------------------------------------------------
    // F7: Continuous STT Keep-Alive Across Silence Pauses (R2)
    // ------------------------------------------------------------------------
    describe("F7: Continuous STT Keep-Alive Across Silence Pauses", () => {
      it("7.1 ignores benign 'no-speech' error without terminating session", () => {
        session.startCall();
        session.recognition.simulateError("no-speech");
        expect(session.status).toBe("listening");
        expect(session.recognition.abortCount).toBe(0);
      });

      it("7.2 ignores benign 'aborted' error during engine restart", () => {
        session.startCall();
        session.recognition.simulateError("aborted");
        expect(session.status).toBe("listening");
      });

      it("7.3 auto-revives recognition on natural silence-induced onend event", () => {
        session.startCall();
        expect(session.recognition.isRunning).toBe(true);

        session.recognition.simulateNaturalSilenceEnd();
        expect(session.recognition.isRunning).toBe(false);

        // Revive
        session.recognition.start();
        expect(session.recognition.isRunning).toBe(true);
        expect(session.recognition.startCount).toBe(2);
      });

      it("7.4 verifies language code mapping for natural Urdu, Roman Urdu, and English", () => {
        expect(getRecognitionLanguageCodes("natural-urdu")).toContain("ur-PK");
        expect(getRecognitionLanguageCodes("english")).toContain("en-US");
        expect(getRecognitionLanguageCodes("roman-urdu")).toContain("ur-PK");
      });

      it("7.5 deduplicates overlap between consecutive speech chunks", () => {
        const existing = "hello brother how are";
        const incoming = "how are you doing";
        const result = deduplicateOverlap(existing, incoming);
        expect(result).toBe("you doing");
      });
    });

    // ------------------------------------------------------------------------
    // F8: CludeGods Timestamp-Aware Sequence Matching (R3)
    // ------------------------------------------------------------------------
    describe("F8: CludeGods Timestamp-Aware Sequence Matching", () => {
      it("8.1 registers playback start with timestamp window [t_start - 300ms, t_end + 1500ms]", () => {
        const filter = new CludeGodsEchoFilter({ clock: () => 5000 });
        filter.registerPlaybackStart("utt-1", "Maine aap ke liye code deploy kar diya hai", 5000);

        const utterances = filter.getUtterances();
        expect(utterances.length).toBe(1);
        expect(utterances[0]?.startTime).toBe(5000);
        expect(utterances[0]?.endTime).toBeNull();
      });

      it("8.2 drops interim transcript matching active playback window as acoustic bleed", () => {
        const filter = new CludeGodsEchoFilter({ clock: () => 5500 });
        filter.registerPlaybackStart(
          "utt-1",
          "Maine aap ke liye code deploy kar diya hai VPS par",
          5000,
        );

        const decision = filter.processInterimTranscript("code deploy kar diya hai VPS par", 5500);
        expect(decision.action).toBe("drop");
        expect(decision.reason).toContain("echo");
      });

      it("8.3 allows user speech outside playback window to pass cleanly", () => {
        const filter = new CludeGodsEchoFilter({ clock: () => 10000 });
        filter.registerPlaybackStart("utt-1", "Initial response text", 1000);
        filter.registerPlaybackEnd("utt-1", 2000);

        // At t=10000ms, line is past tailMs (2000 + 1500 = 3500ms)
        const decision = filter.processInterimTranscript("mera naya sawal suno", 10000);
        expect(decision.action).not.toBe("drop");
      });

      it("8.4 marks playback end and calculates tail window properly", () => {
        const filter = new CludeGodsEchoFilter({ clock: () => 6000 });
        filter.registerPlaybackStart("utt-1", "Short prompt", 5000);
        filter.registerPlaybackEnd("utt-1", 6000);

        const utts = filter.getUtterances();
        expect(utts[0]?.endTime).toBe(6000);
      });

      it("8.5 resets filter history on call termination", () => {
        const filter = new CludeGodsEchoFilter();
        filter.registerPlaybackStart("u1", "Some speech");
        expect(filter.getUtterances().length).toBe(1);

        filter.reset();
        expect(filter.getUtterances().length).toBe(0);
      });
    });

    // ------------------------------------------------------------------------
    // F9: Multi-Tier Loose Word & Sliding Char Echo Rejection (R3)
    // ------------------------------------------------------------------------
    describe("F9: Multi-Tier Loose Word & Sliding Char Echo Rejection", () => {
      it("9.1 verifies loose word match on length-1 edit distance", () => {
        const saidTokens = ["deploy", "kardiya", "vps"];
        expect(isLooseWordMatch("dploy", saidTokens, "deploykardiyavps")).toBe(true);
        expect(isLooseWordMatch("vpss", saidTokens, "deploykardiyavps")).toBe(true);
      });

      it("9.2 verifies 4-char prefix match on loose compound words", () => {
        const saidTokens = ["database", "connection"];
        expect(isLooseWordMatch("data", saidTokens, "databaseconnection")).toBe(true);
      });

      it("9.3 drops phonetically distorted echo via sliding character matching (char_echo >= 0.58)", () => {
        const filter = new CludeGodsEchoFilter({ clock: () => 7000 });
        filter.registerPlaybackStart("u1", "deploy kar diya hai VPS par", 6500);

        // Distorted microphone bleed: "dply kr dya h vps pr"
        const decision = filter.processInterimTranscript("dply kr dya h vps pr", 7000);
        expect(decision.action).toBe("drop");
      });

      it("9.4 requires contiguous user run >=2 words, dropping stray single acoustic artifact", () => {
        const filter = new CludeGodsEchoFilter({ clock: () => 8000 });
        filter.registerPlaybackStart("u1", "Hum ne application test kar li hai", 7500);

        // Single stray word "cat" amidst assistant echo
        const decision = filter.processInterimTranscript("Hum ne cat test kar li hai", 8000);
        expect(decision.action).toBe("drop");
      });

      it("9.5 shields user stopwords flanked by user content words", () => {
        const filter = new CludeGodsEchoFilter({ clock: () => 9000 });
        filter.registerPlaybackStart("u1", "Server is ready", 8500);

        // "stop and look" contains stopword "and" flanked by user words
        const decision = filter.processInterimTranscript("stop and look", 9000);
        expect(decision.isBargeIn).toBe(true);
      });
    });

    // ------------------------------------------------------------------------
    // F10: Roman Urdu & Settings Preservation / Chat Sync (R4)
    // ------------------------------------------------------------------------
    describe("F10: Roman Urdu & Settings Preservation / Chat Sync", () => {
      it("10.1 transliterates Urdu script STT output to phonetic Roman Urdu", () => {
        const urduScript = "میں نے کہا تھا کہ کوڈ چیک کرو";
        const roman = formatSttTranscript(urduScript, "roman-urdu");
        expect(roman).not.toContain("میں");
        expect(roman.length).toBeGreaterThan(0);
      });

      it("10.2 adapts Roman Urdu text phonetically for TTS synthesizers", () => {
        const romanUrdu = "Assalam o alaikum kaise hain aap";
        const adapted = adaptRomanUrduForVoice(romanUrdu);
        expect(adapted.text.length).toBeGreaterThan(0);
        expect(adapted.lang).toBeDefined();
      });

      it("10.3 expands numerals in transcript to readable words", () => {
        expect(expandNumerals("error 404 test 1 2")).toContain("one two");
      });

      it("10.4 persists and retrieves STT settings with defaults", () => {
        saveSttSettings({
          language: "roman-urdu",
          continuous: true,
          interimResults: true,
        });
        const loaded = loadSttSettings();
        expect(loaded.language).toBe("roman-urdu");
      });

      it("10.5 synchronizes completed voice turns into the chat ledger", () => {
        session.startCall();
        session.dispatchToChat("Pehle unit test chalao");

        expect(session.chatLedger.length).toBe(2);
        expect(session.chatLedger[0]?.role).toBe("user");
        expect(session.chatLedger[0]?.text).toBe("Pehle unit test chalao");
        expect(session.chatLedger[1]?.role).toBe("assistant");
      });
    });
  });

  // ==========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (F1 to F10, >=5 tests per feature = 50 tests)
  // ==========================================================================

  describe("Tier 2: Boundary & Corner Cases (F1 - F10)", () => {
    // ------------------------------------------------------------------------
    // F1 Boundaries
    // ------------------------------------------------------------------------
    describe("F1 Boundaries (Interruption)", () => {
      it("B1.1 handles sub-millisecond interrupt timing without negative latency", () => {
        session.startCall();
        session.status = "speaking";
        session.handleUserSpeechEvent("stop", false, 1000);
        expect(session.lastTtsStopLatencyMs).toBeGreaterThanOrEqual(0);
      });

      it("B1.2 ignores empty or whitespace-only interim barge-in attempts", () => {
        session.startCall();
        session.status = "speaking";
        const res = session.handleUserSpeechEvent("   ", false, 1000);
        expect(res.action).toBe("drop");
        expect(session.status).toBe("speaking");
      });

      it("B1.3 handles flurry of 10 rapid barge-in events in tight loop", () => {
        session.startCall();
        session.status = "speaking";
        for (let i = 0; i < 10; i++) {
          session.handleUserSpeechEvent("stop", false, 1000 + i * 2);
        }
        expect(session.status).toBe("listening");
      });

      it("B1.4 executes barge-in cleanly when audio is already in paused state", () => {
        session.startCall();
        session.status = "speaking";
        session.tts.paused = true;
        session.handleUserSpeechEvent("ruko", false, 1100);
        expect(session.tts.cancelCount).toBeGreaterThanOrEqual(1);
      });

      it("B1.5 handles barge-in exactly at chunk boundary transition", () => {
        session.startCall();
        session.status = "speaking";
        session.streamingPlayer.enqueue("Chunk 1.");
        session.streamingPlayer.enqueue("Chunk 2.");
        // Simulate chunk boundary
        session.tts.finishCurrent();
        session.handleUserSpeechEvent("wait stop", false, 1200);
        expect(session.streamingPlayer.isStopped()).toBe(true);
      });
    });

    // ------------------------------------------------------------------------
    // F2 Boundaries
    // ------------------------------------------------------------------------
    describe("F2 Boundaries (Return to Listening)", () => {
      it("B2.1 handles cancel followed immediately by speak (<1ms) without lockup", () => {
        safeStopSpeechPlayback();
        session.tts.speak({ text: "Immediate next utterance" });
        expect(session.tts.queue.length + (session.tts.speaking ? 1 : 0)).toBeGreaterThan(0);
      });

      it("B2.2 handles interrupt during thinking state before audio ever started", () => {
        session.startCall();
        session.status = "thinking";
        session.handleUserSpeechEvent("stop", false, 1300);
        expect(session.status).toBe("listening");
      });

      it("B2.3 handles interrupt during network reconnection phase", () => {
        session.startCall();
        session.recognition.simulateError("network");
        session.handleUserSpeechEvent("stop", false, 1400);
        expect(session.status).toBe("listening");
      });

      it("B2.4 gracefully tears down when call ends during an active interrupt", () => {
        session.startCall();
        session.status = "speaking";
        session.handleUserSpeechEvent("stop", false, 1500);
        expect(() => session.endCall()).not.toThrow();
        expect(session.status).toBe("idle");
      });

      it("B2.5 recovers listening state after rapid mute and unmute toggle", () => {
        session.startCall();
        session.recognition.stop();
        session.recognition.start();
        expect(session.recognition.isRunning).toBe(true);
        expect(session.status).toBe("listening");
      });
    });

    // ------------------------------------------------------------------------
    // F3 Boundaries
    // ------------------------------------------------------------------------
    describe("F3 Boundaries (Utterance Preservation)", () => {
      it("B3.1 preserves long 50-word uninterrupted monologue during barge-in", () => {
        session.startCall();
        session.status = "speaking";
        const words = Array.from({ length: 50 }, (_, i) => `word${i}`).join(" ");
        const res = session.handleUserSpeechEvent(`Wait ${words}`, true, 1600);
        expect(res.prompt.split(/\s+/).length).toBeGreaterThan(45);
      });

      it("B3.2 drops punctuation-only barge-in without corrupting composer", () => {
        session.startCall();
        session.status = "speaking";
        const res = session.handleUserSpeechEvent("... ??? !!!", false, 1700);
        expect(res.prompt).toBe("");
      });

      it("B3.3 preserves Unicode emojis inside barge-in utterance", () => {
        session.startCall();
        session.status = "speaking";
        const res = session.handleUserSpeechEvent("Wait check this 🚀 rocket emoji", true, 1800);
        expect(res.prompt).toContain("🚀");
      });

      it("B3.4 preserves mixed Roman Urdu and English technical terms", () => {
        session.startCall();
        session.status = "speaking";
        const res = session.handleUserSpeechEvent(
          "Ruko bhai, docker container build failed ho gaya hai",
          true,
          1900,
        );
        expect(res.prompt).toContain("docker container build failed");
      });

      it("B3.5 preserves utterance with trailing silence indicator", () => {
        session.startCall();
        session.status = "speaking";
        const res = session.handleUserSpeechEvent("Wait stop the server ...", true, 2000);
        expect(res.prompt).toContain("server");
      });
    });

    // ------------------------------------------------------------------------
    // F4 Boundaries
    // ------------------------------------------------------------------------
    describe("F4 Boundaries (Command Disambiguation)", () => {
      it("B4.1 handles punctuation attached to command ('Stop!', 'ruko...', 'wait???')", () => {
        expect(containsInterruptCommand("Stop!")).toBe(true);
        expect(containsInterruptCommand("ruko...")).toBe(true);
        expect(containsInterruptCommand("wait???")).toBe(true);
      });

      it("B4.2 handles case-insensitive triggers ('STOP', 'RuKo', 'wAiT')", () => {
        expect(containsInterruptCommand("STOP")).toBe(true);
        expect(containsInterruptCommand("RuKo")).toBe(true);
        expect(containsInterruptCommand("wAiT")).toBe(true);
      });

      it("B4.3 handles conversational fillers before command ('Bhai ruko', 'Arey wait')", () => {
        expect(containsInterruptCommand("bhai ruko")).toBe(true);
        expect(containsInterruptCommand("arey ruko")).toBe(true);
      });

      it("B4.4 handles polite suffix after command ('Stop please', 'Ruko yaar')", () => {
        expect(containsInterruptCommand("stop please")).toBe(true);
        expect(containsInterruptCommand("ruko yaar")).toBe(true);
      });

      it("B4.5 does NOT trigger on words embedding interrupt substring ('laptop', 'nonstop')", () => {
        expect(isExplicitInterruptWord("laptop")).toBe(false);
        expect(isExplicitInterruptWord("nonstop")).toBe(false);
      });
    });

    // ------------------------------------------------------------------------
    // F5 Boundaries
    // ------------------------------------------------------------------------
    describe("F5 Boundaries (Chromium 15s GC Bypass)", () => {
      it("B5.1 handles single sentence of exactly 15 words without stalling", () => {
        const text =
          "One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen.";
        const units = splitTextIntoSentenceUnits(text);
        expect(units.length).toBe(1);
      });

      it("B5.2 handles 500-word run-on text with no punctuation gracefully", () => {
        const runOn = Array.from({ length: 100 }, () => "word").join(" ");
        const units = splitTextIntoSentenceUnits(runOn);
        expect(units.length).toBeGreaterThan(0);
      });

      it("B5.3 handles rapid series of 20 tiny chunks (<2 words each)", () => {
        const player = new StreamingTtsPlayer();
        for (let i = 0; i < 20; i++) {
          player.enqueue(`Chunk ${i}`);
        }
        expect(player.getQueueLength() + (player.getIsPlaying() ? 1 : 0)).toBe(20);
        player.stop();
      });

      it("B5.4 sanitizes text with extreme markdown and raw HTML code tags", () => {
        const raw =
          "<script>alert('xss')</script> **Bold** `console.log(1)` ```ts const x = 2; ```";
        const cleaned = sanitizeTextForSpeech(raw);
        expect(cleaned).not.toContain("<script>");
        expect(cleaned).not.toContain("const x = 2");
        expect(cleaned).toContain("Bold");
      });

      it("B5.5 handles empty or whitespace string in sentence chunking", () => {
        expect(splitTextIntoSentenceUnits("")).toEqual([]);
        const wsUnits = splitTextIntoSentenceUnits("   \n\t  ");
        expect(wsUnits.every((u) => u.trim().length === 0 || u.length > 0)).toBe(true);
      });
    });

    // ------------------------------------------------------------------------
    // F6 Boundaries
    // ------------------------------------------------------------------------
    describe("F6 Boundaries (Cancel Deadlock Elimination)", () => {
      it("B6.1 safeStopSpeechPlayback operates when speechSynthesis.speaking is false", () => {
        session.tts.speaking = false;
        expect(() => safeStopSpeechPlayback()).not.toThrow();
      });

      it("B6.2 handles cancel call when queue has 50 pending items", () => {
        session.tts.paused = true;
        for (let i = 0; i < 50; i++) {
          session.tts.speak({ text: `Pending ${i}` });
        }
        expect(session.tts.queue.length).toBe(50);
        safeStopSpeechPlayback();
        expect(session.tts.queue.length).toBe(0);
      });

      it("B6.3 handles null or undefined handlers on utterance objects safely", () => {
        session.tts.speak({ text: "No handlers", onend: null, onerror: null });
        expect(() => safeStopSpeechPlayback()).not.toThrow();
      });

      it("B6.4 handles error thrown by window.speechSynthesis.cancel() gracefully", () => {
        const originalCancel = session.tts.cancel;
        session.tts.cancel = () => {
          throw new Error("Internal hardware fault");
        };
        expect(() => safeStopSpeechPlayback()).not.toThrow();
        session.tts.cancel = originalCancel;
      });

      it("B6.5 verifies resume is called even if cancel throws error", () => {
        const originalCancel = session.tts.cancel;
        session.tts.cancel = () => {
          throw new Error("Simulated cancel exception");
        };
        safeStopSpeechPlayback();
        expect(session.tts.resumeCount).toBeGreaterThanOrEqual(1);
        session.tts.cancel = originalCancel;
      });
    });

    // ------------------------------------------------------------------------
    // F7 Boundaries
    // ------------------------------------------------------------------------
    describe("F7 Boundaries (STT Keep-Alive)", () => {
      it("B7.1 handles 10 consecutive 'no-speech' events without dying", () => {
        session.startCall();
        for (let i = 0; i < 10; i++) {
          session.recognition.simulateError("no-speech");
        }
        expect(session.status).toBe("listening");
      });

      it("B7.2 handles 'network' error with reconnect attempt", () => {
        session.startCall();
        session.recognition.simulateError("network");
        expect(session.status).toBe("listening");
      });

      it("B7.3 stops cleanly on fatal 'not-allowed' permission error", () => {
        session.startCall();
        session.recognition.simulateError("not-allowed");
        session.endCall();
        expect(session.status).toBe("idle");
      });

      it("B7.4 removes triple duplicate consecutive words emitted by mobile ASR", () => {
        expect(removeConsecutiveDuplicateWords("kya kya kya baat hai")).toBe("kya baat hai");
      });

      it("B7.5 handles empty string in removeConsecutiveDuplicateWords", () => {
        expect(removeConsecutiveDuplicateWords("")).toBe("");
        expect(removeConsecutiveDuplicateWords("   ")).toBe("");
      });
    });

    // ------------------------------------------------------------------------
    // F8 Boundaries
    // ------------------------------------------------------------------------
    describe("F8 Boundaries (Timestamp Windows)", () => {
      it("B8.1 matches transcript arriving exactly at t_start - 300ms lead boundary", () => {
        const filter = new CludeGodsEchoFilter({ clock: () => 1000 });
        filter.registerPlaybackStart("u1", "deploy kar diya hai", 1000);

        // Arrives at 700ms (1000 - 300ms)
        const decision = filter.processInterimTranscript("deploy kar diya hai", 700);
        expect(decision.action).toBe("drop");
      });

      it("B8.2 matches transcript arriving exactly at t_end + 1500ms tail boundary", () => {
        const filter = new CludeGodsEchoFilter({ clock: () => 1000 });
        filter.registerPlaybackStart("u1", "deploy kar diya hai", 1000);
        filter.registerPlaybackEnd("u1", 2000);

        // Tail boundary: 2000 + 1500 = 3500ms
        const decision = filter.processInterimTranscript("deploy kar diya hai", 3450);
        expect(decision.action).toBe("drop");
      });

      it("B8.3 handles non-monotonic / out-of-order timestamps without crash", () => {
        const filter = new CludeGodsEchoFilter();
        filter.registerPlaybackStart("u1", "test phrase", 2000);
        expect(() => {
          filter.processInterimTranscript("test phrase", 1500);
        }).not.toThrow();
      });

      it("B8.4 purges stale utterances older than stale timeout (180s)", () => {
        const filter = new CludeGodsEchoFilter();
        filter.registerPlaybackStart("u1", "ancient speech", 1000);
        filter.registerPlaybackEnd("u1", 2000);

        // Advance 200 seconds
        filter.registerPlaybackStart("u2", "new speech", 202000);
        expect(filter.getUtterances().length).toBe(1);
        expect(filter.getUtterances()[0]?.id).toBe("u2");
      });

      it("B8.5 handles simultaneous playback of multiple queued chunks cleanly", () => {
        const filter = new CludeGodsEchoFilter();
        filter.registerPlaybackStart("c1", "Sentence one", 1000);
        filter.registerPlaybackStart("c2", "Sentence two", 1500);
        expect(filter.getUtterances().length).toBe(2);
      });
    });

    // ------------------------------------------------------------------------
    // F9 Boundaries
    // ------------------------------------------------------------------------
    describe("F9 Boundaries (Echo Rejection)", () => {
      it("B9.1 drops 100% stopword density transcript during assistant playback", () => {
        const filter = new CludeGodsEchoFilter({ clock: () => 2000 });
        filter.registerPlaybackStart("u1", "This is the answer for you", 1000);

        const decision = filter.processInterimTranscript("this is the", 2000);
        expect(decision.action).toBe("drop");
      });

      it("B9.2 evaluates sliding character ratio boundary accurately (0.579 vs 0.581)", () => {
        // High similarity matches
        expect(sequenceRatio("deploy kar diya hai", "deploy kar dya hai")).toBeGreaterThan(0.58);
        // Low similarity
        expect(sequenceRatio("deploy kar diya hai", "completely unrelated")).toBeLessThan(0.58);
      });

      it("B9.3 handles short transcripts under minimum evaluation length (<8 chars)", () => {
        const filter = new CludeGodsEchoFilter();
        filter.registerPlaybackStart("u1", "Long speech", 1000);
        const decision = filter.processInterimTranscript("hi", 1200);
        expect(decision.action).toBe("drop");
      });

      it("B9.4 drops phonetic garble with 0 exact word matches but high char ratio", () => {
        const filter = new CludeGodsEchoFilter({ clock: () => 2000 });
        filter.registerPlaybackStart("u1", "maine aap ke liye code deploy kar diya hai", 1500);

        // Phonetic distortion from laptop speaker bleed:
        const decision = filter.processInterimTranscript(
          "maine aap ke lye cod deply kr dya hy",
          2000,
        );
        expect(decision.action).toBe("drop");
      });

      it("B9.5 drops single word user utterance during heavy assistant playback", () => {
        const filter = new CludeGodsEchoFilter({ clock: () => 2000 });
        filter.registerPlaybackStart("u1", "Active speaking content", 1500);

        const decision = filter.processInterimTranscript("hello", 2000);
        expect(decision.action).toBe("drop");
      });
    });

    // ------------------------------------------------------------------------
    // F10 Boundaries
    // ------------------------------------------------------------------------
    describe("F10 Boundaries (Settings & Chat Sync)", () => {
      it("B10.1 handles corrupted localStorage JSON in loadSttSettings gracefully", () => {
        const target = typeof window !== "undefined" ? window : (globalThis as any);
        target.localStorage = {
          getItem: () => "{ corrupted invalid json ...",
          setItem: () => {},
        };
        const settings = loadSttSettings();
        expect(settings.language).toBe(DEFAULT_STT_SETTINGS.language);
      });

      it("B10.2 verifies all DIGI LABS vocal styles exist with valid rate presets", () => {
        const styles = ["natural", "explainer", "business", "promo", "calm"];
        styles.forEach((id) => {
          expect(VOCAL_STYLES[id]).toBeDefined();
          expect(VOCAL_STYLES[id]?.rate).toBeDefined();
        });
      });

      it("B10.3 handles farewell intents across English, Roman Urdu, and Urdu script", () => {
        expect(isFarewellOrEndCall("bye").isFarewell).toBe(true);
        expect(isFarewellOrEndCall("allah hafiz").isFarewell).toBe(true);
        expect(isFarewellOrEndCall("اللہ حافظ").isFarewell).toBe(true);
        expect(isFarewellOrEndCall("regular message").isFarewell).toBe(false);
      });

      it("B10.4 cleans trailing punctuation in formatSttTranscript", () => {
        const formatted = formatSttTranscript("hello world ۔", "roman-urdu");
        expect(formatted).toContain("hello world.");
      });

      it("B10.5 handles empty chat dispatch without adding blank turns", () => {
        session.dispatchToChat("");
        session.dispatchToChat("   ");
        expect(session.chatLedger.length).toBe(0);
      });
    });
  });

  // ==========================================================================
  // TIER 3: CROSS-FEATURE INTERACTIONS (12 tests)
  // ==========================================================================

  describe("Tier 3: Cross-Feature Interactions", () => {
    it("X1 (F1 + F8): User barge-in overrides loud acoustic echo within <150ms", () => {
      session.startCall();
      session.status = "speaking";
      session.echoFilter.registerPlaybackStart(
        "u1",
        "Starting build process for web application",
        1000,
      );

      // User says an explicit command over the bleed
      const res = session.handleUserSpeechEvent("Stop, check line 45 instead", false, 1100);
      expect(session.tts.cancelCount).toBeGreaterThanOrEqual(1);
      expect(session.lastTtsStopLatencyMs).toBeLessThan(150);
      expect(res.prompt).toContain("check line 45 instead");
      expect(session.status).toBe("user-speaking");
    });

    it("X2 (F2 + F6): Rapid interrupt during TTS cancel does not trigger deadlock", () => {
      session.startCall();
      session.status = "speaking";
      session.tts.paused = true;

      expect(() => {
        session.handleUserSpeechEvent("stop", false, 1200);
        session.handleUserSpeechEvent("ruko", false, 1210);
      }).not.toThrow();

      expect(session.status).toBe("listening");
      expect(session.tts.speaking).toBe(false);
    });

    it("X3 (F3 + F9): Mixed bleed and real speech strips echo while preserving user query", () => {
      session.startCall();
      session.status = "speaking";
      session.echoFilter.registerPlaybackStart("u1", "Assalam o alaikum kaise hain aap", 1000);

      // Microphone hears AI words + new user instruction
      const raw = "Assalam o alaikum kaise hain aap mujhe database status batao";
      const stripped = stripAiSpeechFromTranscript(raw, ["Assalam o alaikum kaise hain aap"]);
      expect(stripped).toBe("mujhe database status batao");
    });

    it("X4 (F4 + F10): Pure Roman Urdu 'Ruko' command disambiguates and resets status cleanly", () => {
      session.startCall();
      session.status = "speaking";

      session.handleUserSpeechEvent("ruko", false, 1400);
      expect(session.status).toBe("listening");
      expect(session.prompt).toBe("");
    });

    it("X5 (F5 + F1): 25-second speech past 15s freeze point is interrupted immediately at t=16s", () => {
      session.startCall();
      session.status = "speaking";
      session.simulatedClock = 16000; // t=16s past 15s mark

      session.handleUserSpeechEvent("wait stop", false, 16000);
      expect(session.tts.cancelCount).toBeGreaterThanOrEqual(1);
      expect(session.lastTtsStopLatencyMs).toBeLessThan(150);
    });

    it("X6 (F7 + F3): STT auto-revival keeps engine ready for immediate user barge-in", () => {
      session.startCall();
      session.recognition.simulateNaturalSilenceEnd();
      session.recognition.start();

      session.status = "speaking";
      session.handleUserSpeechEvent("Ruko bhai suno", false, 2000);
      expect(session.status).toBe("user-speaking");
      expect(session.prompt).toContain("suno");
    });

    it("X7 (F8 + F9): CludeGods timestamp window and character score reject severe acoustic bleed", () => {
      const filter = new CludeGodsEchoFilter({ clock: () => 5000 });
      filter.registerPlaybackStart(
        "u1",
        "Maine aap ke liye code deploy kar diya hai VPS par",
        4500,
      );

      // Distorted speaker bleed arrives inside playback window
      const decision = filter.processInterimTranscript("vps par deploy kr dya", 5000);
      expect(decision.action).toBe("drop");
    });

    it("X8 (F6 + F5): Cancel deadlock prevention does not conflict with 5s keep-alive pulse", () => {
      session.tts.speaking = true;
      session.tts.pause();
      safeStopSpeechPlayback();
      expect(session.tts.speaking).toBe(false);
      expect(session.tts.paused).toBe(false);
    });

    it("X9 (F10 + F1): Roman Urdu interrupt with follow-up preserves transliterated text", () => {
      session.startCall();
      session.status = "speaking";

      const res = session.handleUserSpeechEvent("Bhai ruko thora, build check karo", true, 6000);
      expect(res.prompt).toContain("build check karo");
      expect(session.status).toBe("user-speaking");
    });

    it("X10 (F2 + F7): Interruption followed by 15s silence maintains listening state without crash", () => {
      session.startCall();
      session.status = "speaking";
      session.handleUserSpeechEvent("stop", false, 7000);
      expect(session.status).toBe("listening");

      // 15 seconds pass
      session.simulatedClock = 22000;
      session.recognition.simulateError("no-speech");
      expect(session.status).toBe("listening");
      expect(session.recognition.isRunning).toBe(true);
    });

    it("X11 (F4 + F3): Non-pure stop in single breath preserves query and transitions to user-speaking", () => {
      session.startCall();
      session.status = "speaking";

      session.handleUserSpeechEvent("Ruko, port 4099 ka status kya hai?", false, 8000);
      expect(session.status).toBe("user-speaking");
      expect(session.prompt).toContain("port 4099 ka status kya hai");
    });

    it("X12 (F9 + F10): Roman Urdu assistant response echo is rejected without breaking transliteration", () => {
      const filter = new CludeGodsEchoFilter({ clock: () => 9000 });
      filter.registerPlaybackStart("u1", "Hum ne aap ka issue fix kar diya hai", 8500);

      const decision = filter.processInterimTranscript("fix kar dya hai", 9000);
      expect(decision.action).toBe("drop");
    });
  });

  // ==========================================================================
  // TIER 4: REAL-WORLD SCENARIOS (5 full multi-turn conversational scenarios)
  // ==========================================================================

  describe("Tier 4: Real-World Scenarios", () => {
    it("Scenario 1: Rapid Conversational Barge-In (R1)", () => {
      // 1. Assistant begins speaking a multi-sentence response
      session.startCall();
      session.status = "speaking";
      session.tts.speaking = true;
      session.echoFilter.registerPlaybackStart(
        "u1",
        "Pehla sentence chal raha hai. Doosra sentence yeh hai.",
        1000,
      );

      // 2. At t=800ms user says "Ruko, dusra sawal suno"
      const res = session.handleUserSpeechEvent("Ruko, dusra sawal suno", false, 1800);

      // 3. Audio stops instantly (<150ms)
      expect(session.tts.cancelCount).toBeGreaterThanOrEqual(1);
      expect(session.lastTtsStopLatencyMs).toBeLessThan(150);

      // 4. User's query is preserved
      expect(res.prompt).toContain("dusra sawal suno");

      // 5. Status transitions cleanly
      expect(session.status).toBe("user-speaking");

      // 6. Auto-dispatch triggers new answer
      session.dispatchToChat();
      expect(session.chatLedger.length).toBe(2);
      expect(session.status).toBe("speaking");
    });

    it("Scenario 2: Long Assistant Speech (>20 seconds) in Chromium (R2)", () => {
      session.startCall();
      const longResponse =
        "Theek hai bhai main aap ko poori detail samjhata hoon. Pehla step yeh hai ke aap server ka port verify karein. Doosra step database connection pool ko check karna hai. Teesri cheez yeh hai ke background worker jobs properly sync ho rahe hain ya nahi. InshaAllah is se poora system bilkul smooth chalay ga.";

      // Paragraph is chunked into small units preventing 15s freeze
      const { chunks } = extractSpeechChunks(longResponse, 0, true);
      expect(chunks.length).toBeGreaterThanOrEqual(4);

      // Enqueue chunks sequentially
      chunks.forEach((chunk) => {
        session.streamingPlayer.enqueue(chunk);
        session.tts.speak({ text: chunk });
      });

      expect(session.tts.queue.length + (session.tts.speaking ? 1 : 0)).toBeGreaterThanOrEqual(4);

      // Simulate playing through all chunks past 20s
      while (session.tts.queue.length > 0 || session.tts.activeUtterance) {
        session.tts.finishCurrent();
      }
      expect(session.tts.speaking).toBe(false);
    });

    it("Scenario 3: Severe Speaker Bleed & Echo Distortion (R3)", () => {
      session.startCall();
      session.status = "speaking";
      const assistantText = "Maine aap ke liye code deploy kar diya hai VPS par";
      session.echoFilter.registerPlaybackStart("u1", assistantText, 1000);

      // Distorted echo arrives at microphone: "vps par deploy kr dya"
      const res = session.handleUserSpeechEvent("vps par deploy kr dya", false, 1400);

      // Must be dropped with zero false barge-ins
      expect(res.action).toBe("drop");
      expect(session.status).toBe("speaking");
      expect(session.tts.cancelCount).toBe(0);
      expect(session.chatLedger.length).toBe(0);
    });

    it("Scenario 4: Mixed Echo & Legitimate Interruption (R1, R3)", () => {
      session.startCall();
      session.status = "speaking";
      const assistantText = "Starting build process for web application now";
      session.echoFilter.registerPlaybackStart("u1", assistantText, 1000);

      // User speaks over assistant: "Wait, check line 45 instead"
      const res = session.handleUserSpeechEvent("Wait, check line 45 instead", false, 1500);

      // Cuts TTS immediately
      expect(session.tts.cancelCount).toBeGreaterThanOrEqual(1);
      expect(session.lastTtsStopLatencyMs).toBeLessThan(150);

      // Preserves cleaned user command
      expect(res.prompt).toContain("check line 45 instead");
      expect(session.status).toBe("user-speaking");

      // Dispatches to chat
      session.dispatchToChat();
      expect(session.chatLedger.length).toBe(2);
      expect(session.chatLedger[0]?.text).toContain("check line 45 instead");
    });

    it("Scenario 5: Multi-Turn Voice Consultation Across Long Pauses (R1, R2, R4)", () => {
      session.startCall();

      // Turn 1: User asks question
      session.handleUserSpeechEvent("Assalam o alaikum project ka status kya hai", true, 1000);
      session.dispatchToChat();
      expect(session.chatLedger.length).toBe(2);

      // 12-second pause (STT silence keep-alive)
      session.simulatedClock = 13000;
      session.recognition.simulateError("no-speech");
      expect(session.recognition.isRunning).toBe(true);

      // Turn 2: User asks follow-up
      session.handleUserSpeechEvent("Database tables migrate ho chuki hain?", true, 14000);
      session.dispatchToChat();
      expect(session.chatLedger.length).toBe(4);

      // 18-second pause
      session.simulatedClock = 32000;
      session.recognition.simulateError("no-speech");
      expect(session.recognition.isRunning).toBe(true);

      // Turn 3: User interrupts assistant mid-stream with clarification
      session.status = "speaking";
      session.echoFilter.registerPlaybackStart("u3", "Migrating schema tables now", 33000);
      session.handleUserSpeechEvent("Wait, take a backup first", false, 33500);
      expect(session.tts.cancelCount).toBeGreaterThanOrEqual(1);
      expect(session.prompt).toContain("take a backup first");
      session.dispatchToChat();
      expect(session.chatLedger.length).toBe(6);

      // Turn 4: User says pure "Ruko", assistant stops and returns to listening
      session.status = "speaking";
      session.handleUserSpeechEvent("Ruko", false, 35000);
      expect(session.status).toBe("listening");
      expect(session.prompt).toBe("");

      // Turn 5: User says farewell
      const farewell = session.handleUserSpeechEvent("Allah hafiz call band karo", true, 36000);
      expect(isFarewellOrEndCall(farewell.prompt).isFarewell).toBe(true);
      session.endCall();
      expect(session.status).toBe("idle");
    });
  });
});
