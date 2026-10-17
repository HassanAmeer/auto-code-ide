import { type OrchestrationV2Actor, ScheduledTaskId } from "@t3tools/contracts";

const LEGACY_AUTOMATION_PREFIX = /^\[Triggered by schedule task: [^\r\n]+\]\r?\n\r?\n/;
const LEGACY_AUTOMATION_MESSAGE_ID = /^scheduled-task-message:(.+):\d+:(?:scheduled|manual)$/;
const VOICE_CALL_DIRECTIVE_SUFFIX = /\r?\n\r?\n\[Voice Call Mode:[^\]]+\]\s*$/;
const VOICE_CALL_DIRECTIVE_PREFIX = /^\[Voice Call Mode:[^\]]+\]\r?\n\r?\n/;

/** Older scheduled messages stored their attribution in the prompt itself. */
export function resolveUserMessagePresentation(message: {
  readonly id?: string;
  readonly role: string;
  readonly text: string;
  readonly createdBy?: OrchestrationV2Actor;
  readonly scheduledTaskId?: ScheduledTaskId;
}) {
  if (message.role !== "user") {
    return { text: message.text, isAutomation: false, scheduledTaskId: undefined };
  }
  const cleanVoiceText = (message.text ?? "")
    .replace(VOICE_CALL_DIRECTIVE_SUFFIX, "")
    .replace(VOICE_CALL_DIRECTIVE_PREFIX, "");

  if (message.scheduledTaskId !== undefined) {
    return { text: cleanVoiceText, isAutomation: true, scheduledTaskId: message.scheduledTaskId };
  }
  const legacyPrefix = LEGACY_AUTOMATION_PREFIX.exec(cleanVoiceText);
  const legacyTaskId = legacyPrefix
    ? LEGACY_AUTOMATION_MESSAGE_ID.exec(message.id ?? "")?.[1]
    : undefined;
  const isAutomation =
    legacyPrefix !== null && (legacyTaskId !== undefined || message.createdBy === "agent");
  return {
    text: isAutomation ? cleanVoiceText.slice(legacyPrefix[0].length) : cleanVoiceText,
    isAutomation,
    scheduledTaskId: legacyTaskId === undefined ? undefined : ScheduledTaskId.make(legacyTaskId),
  };
}
