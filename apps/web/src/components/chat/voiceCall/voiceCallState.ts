/**
 * Global Voice Call State Coordinator
 * Tracks whether a voice call assistant is currently active to suppress
 * completion notification chimes, toast alerts, and manage acoustic isolation.
 */

let activeVoiceCallThreadId: string | null = null;
let isVoiceCallActiveGlobally = false;

export function setVoiceCallActiveState(active: boolean, threadId?: string | null): void {
  isVoiceCallActiveGlobally = active;
  activeVoiceCallThreadId = active ? (threadId ?? null) : null;
}

export function isVoiceCallActive(threadId?: string | null): boolean {
  if (!isVoiceCallActiveGlobally) return false;
  if (!threadId || !activeVoiceCallThreadId) return isVoiceCallActiveGlobally;
  return activeVoiceCallThreadId === threadId;
}
