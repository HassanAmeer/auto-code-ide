import { speakText, stopSpeaking, sanitizeTextForSpeech, stripCodeBlocks } from "~/lib/speech/tts";

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

  // Match sentence terminators: ., !, ?, ।, ;, or newline followed by space or end of string
  const sentenceEndRegex = /([.!?।;:\n]+(?:\s+|$))/g;
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
}

/**
 * Sequential queue player that streams sentence chunks seamlessly into browser SpeechSynthesis.
 */
export class StreamingTtsPlayer {
  private queue: string[] = [];
  private isPlaying = false;
  private isStreamFinished = false;
  private hasStartedSpeaking = false;
  private onStartSpeakingCallback?: (() => void) | undefined;
  private onFinishedCallback?: (() => void) | undefined;
  private stopped = false;
  private maxChunks?: number | undefined;
  private enqueuedChunksCount = 0;

  constructor(options?: StreamingTtsPlayerOptions) {
    this.maxChunks = options?.maxChunks;
    this.onStartSpeakingCallback = options?.onStartSpeaking;
    this.onFinishedCallback = options?.onFinished;
  }

  enqueue(chunk: string) {
    if (this.stopped) return;
    if (this.maxChunks !== undefined && this.enqueuedChunksCount >= this.maxChunks) {
      return;
    }
    const clean = sanitizeTextForSpeech(chunk);
    if (!clean) return;
    this.enqueuedChunksCount += 1;
    this.queue.push(clean);
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
    if (this.stopped || this.isPlaying) return;

    if (this.queue.length === 0) {
      if (this.isStreamFinished) {
        this.onFinishedCallback?.();
      }
      return;
    }

    const nextChunk = this.queue.shift();
    if (!nextChunk) {
      this.processNext();
      return;
    }

    this.isPlaying = true;

    if (!this.hasStartedSpeaking) {
      this.hasStartedSpeaking = true;
      this.onStartSpeakingCallback?.();
    }

    speakText(nextChunk, undefined, () => {
      this.isPlaying = false;
      this.processNext();
    });
  }

  stop() {
    this.stopped = true;
    this.queue = [];
    this.isPlaying = false;
    this.isStreamFinished = false;
    this.hasStartedSpeaking = false;
    stopSpeaking();
  }
}
