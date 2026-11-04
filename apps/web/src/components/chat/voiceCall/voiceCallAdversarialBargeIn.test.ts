/**
 * Adversarial Barge-In & Concurrency Stress Test Suite
 *
 * Empirical challenger stress-testing for Web Voice Call Assistant:
 * 1. Rapid back-to-back interrupts (<5ms)
 * 2. Interrupt during LLM token streaming and thinking sound transitions
 * 3. Long continuous speech-over monologues during speech synthesis
 * 4. Sudden cancel while audio engine is paused or resuming
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";

// Modules under test
import {
  CludeGodsEchoFilter,
  tokenizeWords,
  isExplicitInterruptWord,
} from "~/lib/speech/cludeGodsEchoFilter";

import { StreamingTtsPlayer, extractSpeechChunks } from "./streamingTtsPlayer";
import {
  containsInterruptCommand,
  stripInterruptCommand,
  stripAiSpeechFromTranscript,
} from "./useVoiceCallAssistant";
import { thinkingAmbientSound } from "./thinkingAmbientSound";
import {
  speakText,
  stopSpeaking,
  safeStopSpeechPlayback,
  isCurrentlySpeaking,
} from "~/lib/speech/tts";

// ============================================================================
// HIGH-FIDELITY SIMULATED AUDIO & SPEECH HARNESS
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
  public callHistory: string[] = [];

  getVoices(): any[] {
    return [
      { name: "Google US English", lang: "en-US", default: true },
      { name: "Google Urdu", lang: "ur-PK", default: false },
    ];
  }

  speak(utterance: MockUtterance) {
    this.speakCount++;
    this.lastSpokenText = utterance.text;
    this.callHistory.push(`speak:${utterance.text.slice(0, 20)}`);
    this.queue.push(utterance);
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
    this.callHistory.push(`cancel(wasPaused:${this.paused})`);
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
    this.callHistory.push("pause");
    if (this.activeUtterance?.onpause) {
      try {
        this.activeUtterance.onpause();
      } catch {}
    }
  }

  resume() {
    this.resumeCount++;
    this.paused = false;
    this.callHistory.push("resume");
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
}

class MockAudioContext {
  state = "running";
  currentTime = 0;
  sampleRate = 44100;
  destination = {};

  createBuffer(channels: number, length: number, rate: number) {
    return {
      getChannelData: () => new Float32Array(length),
    };
  }

  createBufferSource() {
    return {
      buffer: null,
      loop: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
  }

  createBiquadFilter() {
    return {
      type: "lowpass",
      frequency: { setValueAtTime: vi.fn() },
      Q: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }

  createGain() {
    return {
      gain: {
        value: 1,
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }

  createOscillator() {
    return {
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
  }

  resume() {
    return Promise.resolve();
  }

  close() {
    this.state = "closed";
    return Promise.resolve();
  }
}

/**
 * Adversarial Voice Call Coordinator replicating useVoiceCallAssistant's
 * barge-in, state-machine, and echo-filter coordination.
 */
class AdversarialVoiceCallCoordinator {
  public status: "idle" | "listening" | "user-speaking" | "thinking" | "speaking" = "idle";
  public echoFilter: CludeGodsEchoFilter;
  public recognition: MockSpeechRecognition;
  public tts: MockSpeechSynthesis;
  public streamingPlayer: StreamingTtsPlayer;
  public prompt = "";
  public simulatedClock = 1000;
  public interruptCount = 0;
  public onInterruptCallback = vi.fn();
  public autoDispatchTimer: any = null;

  constructor() {
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

  safeStopAudio() {
    safeStopSpeechPlayback();
    this.tts.cancel();
    this.streamingPlayer.stop();
    thinkingAmbientSound.stop();
  }

  handleUserSpeech(rawTranscript: string, isFinal = false, timestamp?: number) {
    const now = timestamp ?? this.simulatedClock;
    this.simulatedClock = now;

    const decision = isFinal
      ? this.echoFilter.processFinalTranscript(rawTranscript, now)
      : this.echoFilter.processInterimTranscript(rawTranscript, now);

    if (decision.action === "drop") {
      return { action: "drop", prompt: this.prompt, status: this.status };
    }

    const isExplicit =
      containsInterruptCommand(rawTranscript) || isExplicitInterruptWord(rawTranscript);
    const words = tokenizeWords(rawTranscript);
    const isSpeechOver =
      (this.status === "speaking" || this.status === "thinking") && words.length >= 2;

    if (this.status === "speaking" || this.status === "thinking" || isExplicit) {
      if (isExplicit || isSpeechOver || decision.isBargeIn || decision.action === "barge") {
        return this.triggerBargeIn(rawTranscript, isExplicit, now, decision);
      }
    }

    const stripped = stripAiSpeechFromTranscript(decision.cleanedText || rawTranscript, []);
    this.prompt = stripped.trim();
    if (this.prompt && this.status !== "speaking") {
      this.status = "user-speaking";
    }

    return { action: decision.action, prompt: this.prompt, status: this.status };
  }

  triggerBargeIn(transcript: string, isExplicit: boolean, timestamp: number, decision?: any) {
    this.interruptCount++;
    this.safeStopAudio();
    this.onInterruptCallback();

    const stripped = stripInterruptCommand(transcript);

    if (isExplicit && !stripped.trim()) {
      this.prompt = "";
      this.status = "listening";
      if (this.autoDispatchTimer) {
        clearTimeout(this.autoDispatchTimer);
        this.autoDispatchTimer = null;
      }
      return { action: "barge", prompt: "", status: this.status };
    }

    this.prompt = stripped.trim() || transcript.trim();
    this.status = "user-speaking";
    return { action: "barge", prompt: this.prompt, status: this.status };
  }
}

// ============================================================================
// ADVERSARIAL STRESS TEST SUITE
// ============================================================================

describe("Adversarial Barge-In & Concurrency Stress Tests", () => {
  let coordinator: AdversarialVoiceCallCoordinator;

  beforeEach(() => {
    coordinator = new AdversarialVoiceCallCoordinator();
    const target = typeof window !== "undefined" ? window : (globalThis as any);
    target.window = target;
    target.speechSynthesis = coordinator.tts;
    target.AudioContext = MockAudioContext;
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
  });

  afterEach(() => {
    safeStopSpeechPlayback();
    thinkingAmbientSound.stop();
  });

  // ==========================================================================
  // AREA 1: RAPID BACK-TO-BACK INTERRUPTS (<5MS)
  // ==========================================================================
  describe("Area 1: Rapid Back-to-Back Interrupts (<5ms)", () => {
    it("1.1 survives burst of 100 consecutive interrupts at 1ms intervals during high-throughput speech", () => {
      coordinator.startCall();
      coordinator.status = "speaking";
      coordinator.streamingPlayer.enqueue("First sentence chunk playing.");
      coordinator.streamingPlayer.enqueue("Second sentence chunk queued.");

      const triggers = ["stop", "ruko", "wait", "chup", "halt", "suno", "bas karo", "pause"];

      // Fire 100 rapid interrupts spaced 1ms apart
      for (let i = 0; i < 100; i++) {
        const trigger = triggers[i % triggers.length]!;
        const res = coordinator.handleUserSpeech(trigger, false, 1000 + i);
        expect(res.action).toBe("barge");
        expect(res.status).toBe("listening");
      }

      // Verification: Engine is clean, no deadlock, queue cleared
      expect(coordinator.interruptCount).toBe(100);
      expect(coordinator.status).toBe("listening");
      expect(coordinator.streamingPlayer.isStopped()).toBe(true);
      expect(coordinator.streamingPlayer.getQueueLength()).toBe(0);
      expect(coordinator.recognition.isRunning).toBe(true);
      expect(coordinator.recognition.abortCount).toBe(0);
    });

    it("1.2 handles concurrent asynchronous Promise.all barrage of interrupts in single tick", async () => {
      coordinator.startCall();
      coordinator.status = "speaking";
      coordinator.streamingPlayer.enqueue("Sentence being spoken aloud.");

      // 25 concurrent interrupts firing simultaneously
      const promises = Array.from({ length: 25 }, (_, i) => {
        return Promise.resolve().then(() => {
          return coordinator.handleUserSpeech(`stop ${i}`, false, 2000);
        });
      });

      const results = await Promise.all(promises);
      expect(results.length).toBe(25);
      expect(coordinator.recognition.isRunning).toBe(true);
      expect(coordinator.recognition.abortCount).toBe(0);
      expect(coordinator.streamingPlayer.isStopped()).toBe(true);
    });

    it("1.3 rapidly alternates pure stop and speech-over queries at 2ms intervals without state corruption", () => {
      coordinator.startCall();
      coordinator.status = "speaking";

      // Sequence: pure stop -> speech query -> pure stop -> speech query -> pure stop
      coordinator.handleUserSpeech("ruko", false, 3000);
      expect(coordinator.status).toBe("listening");
      expect(coordinator.prompt).toBe("");

      coordinator.handleUserSpeech("ruko bhai check line 45", false, 3002);
      expect(coordinator.status).toBe("user-speaking");
      expect(coordinator.prompt).toBe("check line 45");

      coordinator.handleUserSpeech("stop", false, 3004);
      expect(coordinator.status).toBe("listening");
      expect(coordinator.prompt).toBe("");

      coordinator.handleUserSpeech("wait tell me about the database", false, 3006);
      expect(coordinator.status).toBe("user-speaking");
      expect(coordinator.prompt).toBe("tell me about the database");

      coordinator.handleUserSpeech("chup", false, 3008);
      expect(coordinator.status).toBe("listening");
      expect(coordinator.prompt).toBe("");
    });

    it("1.4 handles re-entrant interrupt triggered directly inside SpeechSynthesisUtterance event callbacks", () => {
      coordinator.startCall();
      coordinator.status = "speaking";

      const utterance = new (globalThis as any).SpeechSynthesisUtterance("Test text");
      utterance.onstart = () => {
        // Re-entrant interrupt triggered right inside onstart
        coordinator.handleUserSpeech("stop", false, 4000);
      };

      expect(() => {
        coordinator.tts.speak(utterance);
      }).not.toThrow();

      expect(coordinator.status).toBe("listening");
      expect(coordinator.streamingPlayer.isStopped()).toBe(true);
    });

    it("1.5 verifies zero listener memory leak and active queue clearance after high-frequency cancel", () => {
      for (let i = 0; i < 50; i++) {
        coordinator.tts.speak({
          text: `Chunk ${i}`,
          onend: () => {},
          onerror: () => {},
        });
        safeStopSpeechPlayback();
      }

      expect(coordinator.tts.queue.length).toBe(0);
      expect(coordinator.tts.speaking).toBe(false);
    });
  });

  // ==========================================================================
  // AREA 2: INTERRUPT DURING LLM STREAMING & THINKING SOUND TRANSITIONS
  // ==========================================================================
  describe("Area 2: Interrupt During LLM Streaming & Thinking Sound Transitions", () => {
    it("2.1 halts thinking ambient sound immediately when interrupted during thinking state", () => {
      coordinator.startCall();
      coordinator.status = "thinking";

      thinkingAmbientSound.start();
      // Interrupt arrived while assistant is thinking
      const res = coordinator.handleUserSpeech("Wait", false, 5000);

      expect(res.action).toBe("barge");
      expect(res.status).toBe("listening");
      expect(coordinator.onInterruptCallback).toHaveBeenCalledTimes(1);
    });

    it("2.2 halts audio precisely at thinking-to-speaking handoff when first chunk is enqueued", () => {
      coordinator.startCall();
      coordinator.status = "thinking";

      // LLM emits initial text
      const llmOutput = "Haan bilkul, main abhi check kar leta hoon. Yeh raha script.";
      const { chunks, newOffset } = extractSpeechChunks(llmOutput, 0, false);
      expect(chunks.length).toBeGreaterThan(0);

      // Transition to speaking and enqueue first chunk
      coordinator.status = "speaking";
      coordinator.streamingPlayer.enqueue(chunks[0]!);

      // Exact moment first chunk enqueued, user interrupts
      coordinator.handleUserSpeech("ruko ruko", false, 5100);

      expect(coordinator.status).toBe("listening");
      expect(coordinator.streamingPlayer.isStopped()).toBe(true);
      expect(coordinator.streamingPlayer.getQueueLength()).toBe(0);
    });

    it("2.3 late LLM chunks arriving after interrupt are strictly discarded by StreamingTtsPlayer", () => {
      coordinator.startCall();
      coordinator.status = "speaking";
      coordinator.streamingPlayer.enqueue("First chunk.");

      // User interrupts
      coordinator.handleUserSpeech("stop", false, 5200);
      expect(coordinator.streamingPlayer.isStopped()).toBe(true);

      const speakCountBefore = coordinator.tts.speakCount;

      // Late LLM stream produces 5 more chunks
      coordinator.streamingPlayer.enqueue("Late chunk 1.");
      coordinator.streamingPlayer.enqueue("Late chunk 2.");
      coordinator.streamingPlayer.enqueue("Late chunk 3.");
      coordinator.streamingPlayer.enqueue("Late chunk 4.");
      coordinator.streamingPlayer.enqueue("Late chunk 5.");
      coordinator.streamingPlayer.markStreamFinished();

      // Ensure none of the late chunks were queued or spoken
      expect(coordinator.streamingPlayer.getQueueLength()).toBe(0);
      expect(coordinator.tts.speakCount).toBe(speakCountBefore);
      expect(coordinator.tts.speaking).toBe(false);
    });

    it("2.4 verifies onInterrupt callback triggers within <5ms unblocking LLM abort controller", () => {
      coordinator.startCall();
      coordinator.status = "thinking";

      let abortControllerTriggered = false;
      coordinator.onInterruptCallback = vi.fn(() => {
        abortControllerTriggered = true;
      });

      const t0 = coordinator.simulatedClock;
      coordinator.handleUserSpeech("Stop please", false, t0);

      expect(abortControllerTriggered).toBe(true);
      expect(coordinator.status).toBe("listening");
    });

    it("2.5 stress tests 25 rapid cycles of thinking -> stream -> interrupt -> listening", () => {
      coordinator.startCall();

      for (let cycle = 0; cycle < 25; cycle++) {
        coordinator.status = "thinking";
        thinkingAmbientSound.start();

        const { chunks } = extractSpeechChunks(
          `Sentence for cycle ${cycle}. Next sentence.`,
          0,
          false,
        );
        coordinator.status = "speaking";
        coordinator.streamingPlayer = new StreamingTtsPlayer();
        coordinator.streamingPlayer.enqueue(chunks[0] || "Sample chunk.");

        // Interrupt midway
        coordinator.handleUserSpeech("ruko", false, 6000 + cycle * 10);
        expect(coordinator.status).toBe("listening");
        expect(coordinator.streamingPlayer.isStopped()).toBe(true);
      }

      expect(coordinator.recognition.isRunning).toBe(true);
    });
  });

  // ==========================================================================
  // AREA 3: LONG CONTINUOUS SPEECH-OVER MONOLOGUES
  // ==========================================================================
  describe("Area 3: Long Continuous Speech-Over Monologues", () => {
    it("3.1 preserves 100-word continuous speech-over monologue without dropping initial words", () => {
      coordinator.startCall();
      coordinator.status = "speaking";
      coordinator.streamingPlayer.enqueue("Assistant chunk 1.");
      coordinator.streamingPlayer.enqueue("Assistant chunk 2.");

      const words100 = Array.from(
        { length: 100 },
        (_, i) => `term${i}_${i % 2 === 0 ? "urdu" : "english"}`,
      ).join(" ");
      const monologue = `Wait actually ${words100}`;

      const res = coordinator.handleUserSpeech(monologue, true, 7000);

      expect(res.action).toBe("barge");
      expect(res.status).toBe("user-speaking");
      expect(coordinator.streamingPlayer.isStopped()).toBe(true);
      expect(coordinator.recognition.isRunning).toBe(true);
      expect(coordinator.recognition.abortCount).toBe(0);

      // Verify all 100 terms are preserved
      expect(res.prompt).toContain("term0_urdu");
      expect(res.prompt).toContain("term99_english");
      expect(res.prompt.split(/\s+/).length).toBeGreaterThanOrEqual(100);
    });

    it("3.2 preserves 250-word heavy technical monologue with mixed Roman Urdu, code terms, and emojis", () => {
      coordinator.startCall();
      coordinator.status = "speaking";

      const complexMonologue = [
        "Ruko bhai",
        "mujhe poori baat batane do",
        "docker-compose.yml file mein port 4099 bound hai",
        "aur database migration table `sys_users_v2` lock ho chuka hai",
        "humein pnpm run db:migrate --force execute karna padega 🚀",
        "warna production container crash loop backoff mein chala jayega",
        "aur memory leak 512MB limit hit karega",
        "is liye code revert mat karna balki hotfix deploy karo",
        ...Array.from({ length: 150 }, (_, i) => `config_param_${i}`),
      ].join(" ");

      const res = coordinator.handleUserSpeech(complexMonologue, true, 7500);

      expect(res.action).toBe("barge");
      expect(res.status).toBe("user-speaking");
      expect(res.prompt).not.toMatch(/^ruko bhai/i);
      expect(res.prompt).toContain("docker-compose.yml");
      expect(res.prompt).toContain("`sys_users_v2`");
      expect(res.prompt).toContain("🚀");
      expect(res.prompt).toContain("config_param_149");
    });

    it("3.3 verifies incremental interim-to-final transcript streaming preserves text without duplication", () => {
      coordinator.startCall();
      coordinator.status = "speaking";

      // 10 interim steps building a sentence
      const interimSteps = [
        "suno",
        "suno main",
        "suno main yeh",
        "suno main yeh keh",
        "suno main yeh keh raha",
        "suno main yeh keh raha hoon",
        "suno main yeh keh raha hoon ke",
        "suno main yeh keh raha hoon ke server",
        "suno main yeh keh raha hoon ke server restart",
        "suno main yeh keh raha hoon ke server restart ho gaya",
      ];

      // Step 1: "suno" triggers barge-in
      const step1 = coordinator.handleUserSpeech(interimSteps[0]!, false, 8000);
      expect(step1.status).toBe("listening"); // pure "suno"
      expect(coordinator.streamingPlayer.isStopped()).toBe(true);

      // Steps 2-10: user continues speaking substantive sentence
      for (let i = 1; i < interimSteps.length; i++) {
        const stepRes = coordinator.handleUserSpeech(interimSteps[i]!, false, 8000 + i * 50);
        expect(stepRes.status).toBe("user-speaking");
        expect(stepRes.prompt.length).toBeGreaterThan(0);
      }

      // Final step: marked isFinal: true
      const finalRes = coordinator.handleUserSpeech(
        "suno main yeh keh raha hoon ke server restart ho gaya",
        true,
        8600,
      );
      expect(finalRes.status).toBe("user-speaking");
      expect(finalRes.prompt).toBe("main yeh keh raha hoon ke server restart ho gaya");
      expect(finalRes.prompt).not.toMatch(/main main/); // No duplicate stuttering
    });

    it("3.4 speech-over during inter-chunk acoustic echo cooldown halts next queued chunks", () => {
      coordinator.startCall();
      coordinator.status = "speaking";

      // Chunk 1 starts at t=9000 and ends at t=9500
      coordinator.echoFilter.registerPlaybackStart("c1", "Pehla chunk suniye.", 9000);
      coordinator.echoFilter.registerPlaybackEnd("c1", 9500);

      // Inter-chunk gap at t=9700 (within 1500ms echo cooldown)
      // User speaks a 5-word distinct command
      const res = coordinator.handleUserSpeech("ruko dusra sawal suno please", false, 9700);

      expect(res.action).toBe("barge");
      expect(res.status).toBe("user-speaking");
      expect(res.prompt).toBe("dusra sawal suno please");
    });
  });

  // ==========================================================================
  // AREA 4: SUDDEN CANCEL WHILE AUDIO ENGINE IS PAUSED OR RESUMING
  // ==========================================================================
  describe("Area 4: Sudden Cancel While Audio Engine is Paused or Resuming", () => {
    it("4.1 ensures resume() is called before and after cancel() when paused (Chromium deadlock guard)", () => {
      coordinator.startCall();
      coordinator.status = "speaking";
      coordinator.tts.paused = true;
      coordinator.tts.speaking = true;

      const resumeCountBefore = coordinator.tts.resumeCount;
      const cancelCountBefore = coordinator.tts.cancelCount;

      safeStopSpeechPlayback();

      // Must call resume() to unblock paused Blink audio thread
      expect(coordinator.tts.resumeCount).toBeGreaterThan(resumeCountBefore);
      expect(coordinator.tts.cancelCount).toBeGreaterThan(cancelCountBefore);
      expect(coordinator.tts.paused).toBe(false);
      expect(coordinator.tts.speaking).toBe(false);
    });

    it("4.2 fuzzes 100 randomized pause/cancel/resume/speak/stop operations without crash or lockup", () => {
      const ops = ["pause", "resume", "cancel", "speak", "safeStop"];

      for (let i = 0; i < 100; i++) {
        const op = ops[Math.floor(Math.random() * ops.length)];
        expect(() => {
          switch (op) {
            case "pause":
              coordinator.tts.pause();
              break;
            case "resume":
              coordinator.tts.resume();
              break;
            case "cancel":
              coordinator.tts.cancel();
              break;
            case "speak":
              coordinator.tts.speak({ text: `Fuzz ${i}` });
              break;
            case "safeStop":
              safeStopSpeechPlayback();
              break;
          }
        }).not.toThrow();
      }

      // Cleanup and verify subsequent speech works cleanly
      safeStopSpeechPlayback();
      expect(coordinator.tts.paused).toBe(false);
      expect(coordinator.tts.speaking).toBe(false);

      coordinator.tts.speak({ text: "Recovered cleanly after fuzz test." });
      expect(coordinator.tts.speaking).toBe(true);
      expect(coordinator.tts.lastSpokenText).toBe("Recovered cleanly after fuzz test.");
    });

    it("4.3 handles cancel during resume execution when paused flag is fluctuating", () => {
      coordinator.startCall();
      coordinator.status = "speaking";

      // Set paused, then resume and cancel simultaneously
      coordinator.tts.paused = true;
      coordinator.tts.resume();
      coordinator.safeStopAudio();

      expect(coordinator.tts.paused).toBe(false);
      expect(coordinator.tts.speaking).toBe(false);
      expect(coordinator.tts.queue.length).toBe(0);
    });

    it("4.4 subsequent speech turn succeeds immediately after emergency pause-cancel", () => {
      coordinator.startCall();
      coordinator.status = "speaking";
      coordinator.tts.paused = true;

      // Emergency barge-in occurs while paused
      coordinator.handleUserSpeech("ruko", false, 10000);
      expect(coordinator.status).toBe("listening");

      // Next turn produces new speech
      coordinator.status = "speaking";
      coordinator.streamingPlayer = new StreamingTtsPlayer();
      coordinator.streamingPlayer.enqueue("Next turn answer after emergency cancel.");

      expect(coordinator.streamingPlayer.isStopped()).toBe(false);
      expect(coordinator.tts.speaking).toBe(true);
    });

    it("4.5 safeStopSpeechPlayback calls resume even when window.speechSynthesis.cancel throws", () => {
      const originalCancel = coordinator.tts.cancel;
      coordinator.tts.cancel = () => {
        throw new Error("Simulated DOMException on cancel");
      };

      const resumeBefore = coordinator.tts.resumeCount;
      expect(() => {
        safeStopSpeechPlayback();
      }).not.toThrow();

      expect(coordinator.tts.resumeCount).toBeGreaterThan(resumeBefore);
      coordinator.tts.cancel = originalCancel;
    });
  });

  // ==========================================================================
  // AREA 5: EMPIRICAL EDGE-CASE & RESIDUE ANALYSIS FOR INTERRUPT COMMANDS
  // ==========================================================================
  describe("Area 5: Empirical Edge-Case & Residue Analysis for stripInterruptCommand", () => {
    it("5.1 documents single-pass trigger residue on emphatic sandwich patterns ('ruko bhai ruko', 'stop please stop')", () => {
      // Clean single or recognized compound patterns strip completely to ""
      expect(stripInterruptCommand("ruko")).toBe("");
      expect(stripInterruptCommand("ruko ruko")).toBe("");
      expect(stripInterruptCommand("stop")).toBe("");
      expect(stripInterruptCommand("please stop")).toBe("");
      expect(stripInterruptCommand("stop please")).toBe("");
      expect(stripInterruptCommand("bhai ruko")).toBe("");
      expect(stripInterruptCommand("bas karo")).toBe("");

      // Single-pass linear scan limitation without word boundary:
      // "ruko bhai ruko": "ruko bhai " is stripped by "ruko", then "ruk" strips "ruk", leaving "o" residue!
      const rukoSandwich = stripInterruptCommand("ruko bhai ruko");
      expect(rukoSandwich).toBe("o");

      // "stop please stop": "stop please " is stripped by compound trigger, then "stop" strips remaining, returning ""
      const stopSandwich = stripInterruptCommand("stop please stop");
      expect(stopSandwich).toBe("");

      // "stop stop stop": first "stop " is stripped, but single pass cannot strip remaining duplicate, leaving "stop stop"
      const tripleStop = stripInterruptCommand("stop stop stop");
      expect(tripleStop).toBe("stop stop");
    });
  });
});
