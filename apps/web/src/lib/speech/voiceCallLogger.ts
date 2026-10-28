/**
 * Voice Call Real-Time Trace & Diagnostics Logger
 * Tracks STT recognition, noise gating, AI model dispatch, TTS output, and user interrupts.
 */

export type VoiceLogCategory = "STT" | "AI" | "TTS" | "SYSTEM" | "INTERRUPT" | "NOISE_GATE";

export interface VoiceCallLogEntry {
  id: string;
  timestamp: number;
  category: VoiceLogCategory;
  title: string;
  detail?: string;
  metadata?: Record<string, any>;
}

type LogListener = (logs: VoiceCallLogEntry[]) => void;

const MAX_LOGS = 300;
let logsMemory: VoiceCallLogEntry[] = [];
const listeners: Set<LogListener> = new Set();

export function addVoiceCallLog(
  entry: Omit<VoiceCallLogEntry, "id" | "timestamp">,
): VoiceCallLogEntry {
  const log: VoiceCallLogEntry = {
    id: `vlog-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    ...entry,
  };

  logsMemory = [log, ...logsMemory].slice(0, MAX_LOGS);
  listeners.forEach((fn) => {
    try {
      fn(logsMemory);
    } catch {}
  });

  return log;
}

export function getVoiceCallLogs(): VoiceCallLogEntry[] {
  return logsMemory;
}

export function clearVoiceCallLogs(): void {
  logsMemory = [];
  listeners.forEach((fn) => {
    try {
      fn(logsMemory);
    } catch {}
  });
}

export function subscribeVoiceCallLogs(listener: LogListener): () => void {
  listeners.add(listener);
  listener(logsMemory);
  return () => {
    listeners.delete(listener);
  };
}
