import { saveServerSetting } from "./serverSettingsSync";
import { useState, useEffect } from "react";

export interface ScheduledTaskItem {
  id: string;
  title: string;
  prompt: string;
  projectId: string;
  projectName?: string;
  enabled: boolean;
  scheduleType: "fixed_time" | "interval";
  timeOfDay?: string; // e.g. "02:00" (24-hour)
  intervalMinutes?: number;
  weekdays?: number[]; // [0..6]
  createdAt: number;
  updatedAt: number;
  nextRunAt?: string;
  lastRunAt?: string;
  lastRunStatus?: "idle" | "running" | "succeeded" | "failed";
}

const STORAGE_KEY = "t3code:scheduled-tasks:v1";

export function loadScheduledTasks(): ScheduledTaskItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (err) {
    console.warn("Failed to load scheduled tasks:", err);
    return [];
  }
}

export function saveScheduledTasks(tasks: ScheduledTaskItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    void saveServerSetting(STORAGE_KEY, tasks);
    window.dispatchEvent(new CustomEvent("t3-scheduled-tasks-changed", { detail: tasks }));
  } catch (err) {
    console.warn("Failed to save scheduled tasks:", err);
  }
}

export function addScheduledTask(input: {
  title: string;
  prompt: string;
  projectId?: string;
  projectName?: string;
  scheduleType?: "fixed_time" | "interval";
  timeOfDay?: string;
  intervalMinutes?: number;
}): ScheduledTaskItem {
  const current = loadScheduledTasks();
  const now = Date.now();
  const scheduleType = input.scheduleType || (input.timeOfDay ? "fixed_time" : "interval");

  // Calculate next run time
  let nextRunAt = "";
  if (scheduleType === "fixed_time" && input.timeOfDay) {
    const [hours, minutes] = input.timeOfDay.split(":").map(Number);
    const targetDate = new Date();
    targetDate.setHours(hours ?? 0, minutes ?? 0, 0, 0);
    if (targetDate.getTime() <= now) {
      // scheduled for next day
      targetDate.setDate(targetDate.getDate() + 1);
    }
    nextRunAt = targetDate.toISOString();
  } else if (scheduleType === "interval" && input.intervalMinutes) {
    nextRunAt = new Date(now + input.intervalMinutes * 60 * 1000).toISOString();
  }

  const newTask: ScheduledTaskItem = {
    id: "task-" + now + "-" + Math.random().toString(36).slice(2, 7),
    title: input.title.trim(),
    prompt: input.prompt.trim(),
    projectId: input.projectId || "default",
    projectName: input.projectName || "Default Workspace",
    enabled: true,
    scheduleType,
    timeOfDay: input.timeOfDay,
    intervalMinutes: input.intervalMinutes,
    createdAt: now,
    updatedAt: now,
    nextRunAt,
    lastRunStatus: "idle",
  };

  const updated = [newTask, ...current];
  saveScheduledTasks(updated);
  return newTask;
}

export function toggleScheduledTask(id: string): ScheduledTaskItem | null {
  const current = loadScheduledTasks();
  let modified: ScheduledTaskItem | null = null;
  const updated = current.map((t) => {
    if (t.id === id) {
      modified = { ...t, enabled: !t.enabled, updatedAt: Date.now() };
      return modified;
    }
    return t;
  });
  if (modified) {
    saveScheduledTasks(updated);
  }
  return modified;
}

export function deleteScheduledTask(id: string): boolean {
  const current = loadScheduledTasks();
  const filtered = current.filter((t) => t.id !== id);
  if (filtered.length !== current.length) {
    saveScheduledTasks(filtered);
    return true;
  }
  return false;
}

export function useScheduledTasks(): {
  tasks: ScheduledTaskItem[];
  add: typeof addScheduledTask;
  toggle: typeof toggleScheduledTask;
  remove: typeof deleteScheduledTask;
} {
  const [tasks, setTasks] = useState<ScheduledTaskItem[]>(() => loadScheduledTasks());

  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const custom = e as CustomEvent<ScheduledTaskItem[]>;
      if (custom.detail) {
        setTasks(custom.detail);
      } else {
        setTasks(loadScheduledTasks());
      }
    };
    window.addEventListener("t3-scheduled-tasks-changed", handleUpdate);
    return () => window.removeEventListener("t3-scheduled-tasks-changed", handleUpdate);
  }, []);

  return {
    tasks,
    add: addScheduledTask,
    toggle: toggleScheduledTask,
    remove: deleteScheduledTask,
  };
}
