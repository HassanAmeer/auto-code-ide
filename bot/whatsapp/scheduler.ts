import * as fs from "node:fs";
import * as path from "node:path";
import { sendTextMessage, sendMediaMessage } from "./client.ts";
import { logWhatsAppEvent } from "./logger.ts";

export interface ScheduledWhatsAppTask {
  id: string;
  recipient: string;
  recipientName?: string | undefined;
  isGroup: boolean;
  messageType: "text" | "image" | "voice" | "document";
  messageText: string;
  mediaUrl?: string | undefined;
  scheduledTime: string; // Human-readable or formatted
  scheduledTimestamp: number; // Unix timestamp in ms
  status: "scheduled" | "delivered" | "failed" | "cancelled";
  sessionId?: string | undefined;
  deliveredAt?: string | undefined;
  error?: string | undefined;
  createdAt: string;
}

const SCHEDULE_FILE = path.resolve(process.cwd(), "userdata", "whatsapp_scheduled_tasks.json");
const MAX_TASKS = 200;

let memoryTasks: ScheduledWhatsAppTask[] = [];
let loaded = false;

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  try {
    if (fs.existsSync(SCHEDULE_FILE)) {
      const data = fs.readFileSync(SCHEDULE_FILE, "utf-8");
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        memoryTasks = parsed.slice(0, MAX_TASKS);
      }
    }
  } catch {
    memoryTasks = [];
  }
}

function persistTasks(): void {
  try {
    const dir = path.dirname(SCHEDULE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(
      SCHEDULE_FILE,
      JSON.stringify(memoryTasks.slice(0, MAX_TASKS), null, 2),
      "utf-8",
    );
  } catch {
    // ignore persistence errors
  }
}

export function listScheduledWhatsAppTasks(): ScheduledWhatsAppTask[] {
  ensureLoaded();
  return [...memoryTasks];
}

export function createScheduledWhatsAppTask(
  params: Omit<ScheduledWhatsAppTask, "id" | "status" | "createdAt">,
): ScheduledWhatsAppTask {
  ensureLoaded();
  const task: ScheduledWhatsAppTask = {
    id: `sched_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    ...params,
    status: "scheduled",
    createdAt: new Date().toISOString(),
  };

  memoryTasks.unshift(task);
  persistTasks();

  logWhatsAppEvent({
    type: "system",
    sessionId: params.sessionId || "default",
    to: params.recipient,
    body: `Scheduled message created for ${params.scheduledTime}: "${params.messageText}"`,
  });

  return task;
}

export function cancelScheduledWhatsAppTask(taskId: string): boolean {
  ensureLoaded();
  const task = memoryTasks.find((t) => t.id === taskId);
  if (!task) return false;

  task.status = "cancelled";
  persistTasks();

  logWhatsAppEvent({
    type: "system",
    sessionId: task.sessionId || "default",
    to: task.recipient,
    body: `Scheduled message ${taskId} cancelled.`,
  });

  return true;
}

export async function runScheduledWhatsAppTaskNow(
  taskId: string,
): Promise<{ ok: boolean; error?: string }> {
  ensureLoaded();
  const task = memoryTasks.find((t) => t.id === taskId);
  if (!task) return { ok: false, error: "Task not found" };

  try {
    let result: { ok: boolean; messageId?: string; error?: string };

    if (task.messageType === "image" && task.mediaUrl) {
      result = await sendMediaMessage({
        to: task.recipient,
        mediaUrl: task.mediaUrl,
        caption: task.messageText,
        sessionId: task.sessionId,
      });
    } else {
      result = await sendTextMessage({
        to: task.recipient,
        text: task.messageText,
        sessionId: task.sessionId,
      });
    }

    if (result.ok) {
      task.status = "delivered";
      task.deliveredAt = new Date().toISOString();
      persistTasks();
      return { ok: true };
    } else {
      task.status = "failed";
      task.error = result.error;
      persistTasks();
      return { ok: false, error: result.error };
    }
  } catch (err: any) {
    const error = err?.message || String(err);
    task.status = "failed";
    task.error = error;
    persistTasks();
    return { ok: false, error };
  }
}

let schedulerTimer: NodeJS.Timeout | null = null;

export function startWhatsAppSchedulerDaemon(): void {
  if (schedulerTimer) return;

  // Check every 20 seconds for due tasks
  schedulerTimer = setInterval(async () => {
    ensureLoaded();
    const now = Date.now();
    const dueTasks = memoryTasks.filter(
      (t) => t.status === "scheduled" && t.scheduledTimestamp <= now,
    );

    for (const task of dueTasks) {
      try {
        await runScheduledWhatsAppTaskNow(task.id);
      } catch (e) {
        console.warn(`[WhatsAppScheduler] Failed to deliver task ${task.id}:`, e);
      }
    }
  }, 20000);
}
