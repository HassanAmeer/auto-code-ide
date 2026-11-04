import {
  speakText,
  stopSpeaking,
  safeStopSpeechPlayback,
  sanitizeTextForSpeech,
  stripCodeBlocks,
  loadTtsSettings,
  type TtsSettings,
} from "~/lib/speech/tts";

/**
 * Metadata for an individual speech sentence chunk.
 */
export interface SpeechChunk {
  id: string;
  text: string;
  index: number;
  timestamp?: number;
}

/**
 * Splits streaming text incrementally into complete sentence chunks for low-latency TTS.
 * Automatically strips code blocks so code is NEVER read aloud.
 */
export function extractSpeechChunks(
  text: string,
  processedOffset: number,
  isStreamComplete: boolean,
): { chunks: string[]; newOffset: number } {
  // Strip code blocks and reasoning/thinking tags first so they are NEVER extracted as speech chunks
  const cleanSourceText = stripCodeBlocks(text);
  const safeOffset = Math.min(processedOffset, cleanSourceText.length);
  const unprocessed = cleanSourceText.slice(safeOffset);
  if (!unprocessed) {
    return { chunks: [], newOffset: safeOffset };
  }

  const chunks: string[] = [];
  let currentStart = 0;

  // Match sentence terminators: ., !, ?, ।, ;, :, newline, and Urdu full stop (۔) / Urdu question mark (؟)
  const sentenceEndRegex = /([.!?।;:\n\u06D4\u061F]+(?:\s+|$))/g;
  let match: RegExpExecArray | null;

  while ((match = sentenceEndRegex.exec(unprocessed)) !== null) {
    const endIndex = match.index + match[0].length;
    const chunkCandidate = unprocessed.slice(currentStart, endIndex).trim();
    if (chunkCandidate.length > 0) {
      const sanitized = sanitizeTextForSpeech(chunkCandidate);
      if (sanitized.length > 0) {
        chunks.push(sanitized);
      }
    }
    currentStart = endIndex;
  }

  if (isStreamComplete) {
    // If the stream has finished, any remaining non-empty tail is spoken as the final chunk
    const remainder = unprocessed.slice(currentStart).trim();
    if (remainder.length > 0) {
      const sanitized = sanitizeTextForSpeech(remainder);
      if (sanitized.length > 0) {
        chunks.push(sanitized);
      }
    }
    return { chunks, newOffset: safeOffset + unprocessed.length };
  }

  return { chunks, newOffset: safeOffset + currentStart };
}

export interface StreamingTtsPlayerOptions {
  maxChunks?: number | undefined;
  onStartSpeaking?: (() => void) | undefined;
  onFinished?: (() => void) | undefined;
  onChunkStarted?: ((chunk: string) => void) | undefined;
  onChunkStart?: ((chunk: SpeechChunk) => void) | undefined;
  onChunkEnd?: ((chunk: SpeechChunk) => void) | undefined;
  ttsOptions?: Partial<TtsSettings> | undefined;
}

/**
 * Sequential queue player that streams sentence chunks seamlessly into browser SpeechSynthesis.
 * Includes built-in sentence-level deduplication to prevent repetitive speech output,
 * playhead callbacks for echo cancellation / sequence matching, and zero-deadlock instant stop.
 */
export class StreamingTtsPlayer {
  private queue: SpeechChunk[] = [];
  private isPlaying = false;
  private isStreamFinished = false;
  private hasStartedSpeaking = false;
  private onStartSpeakingCallback?: (() => void) | undefined;
  private onFinishedCallback?: (() => void) | undefined;
  private onChunkStartedCallback?: ((chunk: string) => void) | undefined;
  private onChunkStartCallback?: ((chunk: SpeechChunk) => void) | undefined;
  private onChunkEndCallback?: ((chunk: SpeechChunk) => void) | undefined;
  private ttsOptions?: Partial<TtsSettings> | undefined;
  private stopped = false;
  private maxChunks?: number | undefined;
  private enqueuedChunksCount = 0;
  private chunkCounter = 0;
  private currentChunk: SpeechChunk | null = null;
  private enqueuedSignatures = new Set<string>();

  constructor(options?: StreamingTtsPlayerOptions) {
    this.maxChunks = options?.maxChunks;
    this.onStartSpeakingCallback = options?.onStartSpeaking;
    this.onFinishedCallback = options?.onFinished;
    this.onChunkStartedCallback = options?.onChunkStarted;
    this.onChunkStartCallback = options?.onChunkStart;
    this.onChunkEndCallback = options?.onChunkEnd;
    this.ttsOptions = options?.ttsOptions;
  }

  updateTtsOptions(options: Partial<TtsSettings>): void {
    this.ttsOptions = { ...this.ttsOptions, ...options };
  }

  getCurrentChunk(): SpeechChunk | null {
    return this.currentChunk;
  }

  getIsPlaying(): boolean {
    return !this.stopped && this.isPlaying;
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  hasEnqueuedChunks(): boolean {
    return this.enqueuedChunksCount > 0;
  }

  isStopped(): boolean {
    return this.stopped;
  }

  isActive(): boolean {
    return (
      !this.stopped &&
      (this.isPlaying ||
        this.queue.length > 0 ||
        (!this.isStreamFinished && this.enqueuedChunksCount > 0))
    );
  }

  private normalizeChunkSignature(text: string): string {
    return text
      .toLowerCase()
      .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'۔،؟]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  enqueue(chunk: string) {
    if (this.stopped) return;
    if (this.maxChunks !== undefined && this.enqueuedChunksCount >= this.maxChunks) {
      return;
    }
    const clean = sanitizeTextForSpeech(chunk);
    if (!clean) return;

    // Deduplication check: prevent identical sentence/chunk from being queued twice
    const signature = this.normalizeChunkSignature(clean);
    if (!signature || signature.length < 3) return;

    if (this.enqueuedSignatures.has(signature)) {
      return;
    }

    this.enqueuedSignatures.add(signature);
    this.enqueuedChunksCount += 1;

    const chunkIndex = this.chunkCounter++;
    const speechChunk: SpeechChunk = {
      id: `chunk_${Date.now()}_${chunkIndex}`,
      text: clean,
      index: chunkIndex,
      timestamp: Date.now(),
    };

    this.queue.push(speechChunk);
    this.processNext();
  }

  markStreamFinished() {
    if (this.stopped) return;
    this.isStreamFinished = true;
    if (!this.isPlaying && this.queue.length === 0) {
      this.onFinishedCallback?.();
    }
  }

  private processNext() {
    if (this.stopped) return;

    if (this.queue.length === 0) {
      // Queue is empty: now it's safe to mark isPlaying = false
      this.isPlaying = false;
      if (this.isStreamFinished) {
        this.onFinishedCallback?.();
      }
      return;
    }

    // Guard: if already actively playing a chunk (currentChunk set), don't double-start
    if (this.isPlaying && this.currentChunk !== null) return;

    const nextChunk = this.queue.shift();
    if (!nextChunk) {
      this.processNext();
      return;
    }

    this.isPlaying = true;
    this.currentChunk = nextChunk;

    if (!this.hasStartedSpeaking) {
      this.hasStartedSpeaking = true;
      this.onStartSpeakingCallback?.();
    }

    // Trigger both legacy string callback and new SpeechChunk callback
    this.onChunkStartedCallback?.(nextChunk.text);
    this.onChunkStartCallback?.(nextChunk);

    const mergedOptions: Partial<TtsSettings> = {
      ...loadTtsSettings(),
      ...(this.ttsOptions
        ? Object.fromEntries(Object.entries(this.ttsOptions).filter(([_, v]) => v !== undefined))
        : {}),
    };

    speakText(nextChunk.text, mergedOptions, () => {
      if (this.stopped) return;

      const finishedChunk = this.currentChunk;
      this.currentChunk = null;
      if (finishedChunk) {
        try {
          this.onChunkEndCallback?.(finishedChunk);
        } catch (err) {
          console.warn("[StreamingTtsPlayer] onChunkEnd callback error:", err);
        }
      }

      // NOTE: Do NOT set isPlaying = false here.
      // processNext() will set isPlaying = false only if the queue is empty.
      // This prevents the brief inter-chunk gap from triggering false "speech ended" detection
      // in useVoiceCallAssistant's subscribeSpeechState (isStreamingPlayerBusy check).
      this.processNext();
    });
  }

  stop() {
    this.stopped = true;
    this.queue = [];
    this.enqueuedSignatures.clear();
    this.isPlaying = false;
    this.isStreamFinished = false;
    this.hasStartedSpeaking = false;

    if (this.currentChunk) {
      const activeChunk = this.currentChunk;
      this.currentChunk = null;
      try {
        this.onChunkEndCallback?.(activeChunk);
      } catch (err) {
        console.warn("[StreamingTtsPlayer] onChunkEnd callback error during stop:", err);
      }
    }

    // Zero-deadlock instant cancel of underlying SpeechSynthesis
    safeStopSpeechPlayback();
  }
}
