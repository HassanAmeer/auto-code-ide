import { useState, useEffect } from "react";

/**
 * Voice Call & Super Bot Real-Time Diagnostics Logger
 * Tracks Bot requests, AI model dispatch, status codes, LiveKit events, STT, noise gating, and interrupts.
 */

export type VoiceLogCategory =
  | "BOT"
  | "AI"
  | "LIVEKIT"
  | "STT"
  | "INTERRUPT"
  | "NOISE_GATE"
  | "TTS"
  | "SYSTEM";

export interface VoiceCallLogEntry {
  id: string;
  timestamp: number;
  category: VoiceLogCategory;
  title: string;
  detail?: string;
  model?: string;
  statusCode?: number | string;
  durationMs?: number;
  payload?: any;
  response?: any;
  level?: "info" | "warn" | "error" | "success";
  metadata?: Record<string, any>;
}

type LogListener = (logs: VoiceCallLogEntry[]) => void;

const MAX_LOGS = 500;
let logsMemory: VoiceCallLogEntry[] = [];
const listeners: Set<LogListener> = new Set();

export function addVoiceCallLog(
  entry: Omit<VoiceCallLogEntry, "id" | "timestamp">,
): VoiceCallLogEntry {
  const log: VoiceCallLogEntry = {
    id: `vlog-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    level: entry.level || (entry.category === "INTERRUPT" ? "warn" : "info"),
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

export function useVoiceCallLogs(): VoiceCallLogEntry[] {
  const [logs, setLogs] = useState<VoiceCallLogEntry[]>(() => getVoiceCallLogs());
  useEffect(() => {
    return subscribeVoiceCallLogs(setLogs);
  }, []);
  return logs;
}
