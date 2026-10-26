import { useState, useEffect } from "react";
import { saveServerSetting } from "./serverSettingsSync";

export interface ProjectActivityItem {
  id: string;
  projectId?: string;
  projectName: string;
  taskTitle: string;
  description: string;
  status: "pending" | "running" | "completed" | "error";
  actionType: "bug_fix" | "feature_dispatch" | "scheduled_shift" | "audit";
  createdAt: number;
  completedAt?: number;
  resultSummary?: string;
}

const STORAGE_KEY = "t3code:project-activity-ledger:v1";

export function loadProjectActivities(): ProjectActivityItem[] {
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
    console.warn("Failed to load project activity ledger:", err);
    return [];
  }
}

export function saveProjectActivities(activities: ProjectActivityItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(activities));
    void saveServerSetting(STORAGE_KEY, activities);
    window.dispatchEvent(new CustomEvent("t3-project-activity-changed", { detail: activities }));
  } catch (err) {
    console.warn("Failed to save project activity ledger:", err);
  }
}

export function recordProjectActivity(
  item: Omit<ProjectActivityItem, "id" | "createdAt">,
): ProjectActivityItem {
  const current = loadProjectActivities();
  const now = Date.now();
  const newActivity: ProjectActivityItem = {
    ...item,
    id: "act-" + now + "-" + Math.random().toString(36).slice(2, 7),
    createdAt: now,
  };
  const updated = [newActivity, ...current];
  saveProjectActivities(updated);
  return newActivity;
}

export function updateProjectActivityStatus(
  id: string,
  status: ProjectActivityItem["status"],
  resultSummary?: string,
): void {
  const current = loadProjectActivities();
  const idx = current.findIndex((a) => a.id === id);
  if (idx === -1) return;
  const updatedItem: ProjectActivityItem = {
    ...current[idx]!,
    status,
    resultSummary: resultSummary || current[idx]!.resultSummary,
    completedAt:
      status === "completed" || status === "error" ? Date.now() : current[idx]!.completedAt,
  };
  const updated = [...current];
  updated[idx] = updatedItem;
  saveProjectActivities(updated);
}

export function deleteProjectActivity(id: string): void {
  const current = loadProjectActivities();
  const filtered = current.filter((a) => a.id !== id);
  saveProjectActivities(filtered);
}

export function getActivitiesForProject(projectNameOrId: string): ProjectActivityItem[] {
  const current = loadProjectActivities();
  const lower = projectNameOrId.toLowerCase().trim();
  return current.filter(
    (a) =>
      a.projectName.toLowerCase().includes(lower) ||
      (a.projectId && a.projectId.toLowerCase().includes(lower)),
  );
}

export function useProjectActivities() {
  const [activities, setActivities] = useState<ProjectActivityItem[]>(loadProjectActivities);

  useEffect(() => {
    setActivities(loadProjectActivities());

    const handler = (e: Event) => {
      const custom = e as CustomEvent<ProjectActivityItem[]>;
      if (Array.isArray(custom.detail)) {
        setActivities(custom.detail);
      } else {
        setActivities(loadProjectActivities());
      }
    };

    window.addEventListener("t3-project-activity-changed", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("t3-project-activity-changed", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const pendingCount = activities.filter(
    (a) => a.status === "pending" || a.status === "running",
  ).length;
  const completedCount = activities.filter((a) => a.status === "completed").length;

  return {
    activities,
    pendingCount,
    completedCount,
    recordActivity: recordProjectActivity,
    updateStatus: updateProjectActivityStatus,
    deleteActivity: deleteProjectActivity,
  };
}
