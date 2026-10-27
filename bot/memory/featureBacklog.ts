import * as fs from "node:fs";
import * as path from "node:path";

export type BacklogItemType = "feature" | "improvement" | "ui_tweak" | "bug_report";
export type BacklogItemStatus = "pending" | "in_progress" | "completed" | "discarded";

export interface BacklogItem {
  id: string;
  title: string;
  description?: string | undefined;
  type: BacklogItemType;
  priority: "high" | "medium" | "low";
  status: BacklogItemStatus;
  requestedBy: "user" | "bot_suggestion";
  createdAt: number;
  completedAt?: number | undefined;
}

export interface ProjectBacklog {
  projectName: string;
  items: BacklogItem[];
  lastUpdated: number;
}

const MEMORY_DIR = path.resolve(process.cwd(), "userdata", "bot-memory");

function ensureDir() {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

function getBacklogFilePath(projectName: string): string {
  const safeName = projectName.replace(/[^a-zA-Z0-9_\-]/g, "_").toLowerCase();
  return path.join(MEMORY_DIR, `${safeName}-backlog.json`);
}

export function loadProjectBacklog(projectName: string): ProjectBacklog {
  ensureDir();
  const filePath = getBacklogFilePath(projectName);
  if (fs.existsSync(filePath)) {
    try {
      const data = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(data);
    } catch {
      // Fallback on corrupt file
    }
  }
  return {
    projectName,
    items: [],
    lastUpdated: Date.now(),
  };
}

export function saveProjectBacklog(backlog: ProjectBacklog): void {
  ensureDir();
  backlog.lastUpdated = Date.now();
  const filePath = getBacklogFilePath(backlog.projectName);
  fs.writeFileSync(filePath, JSON.stringify(backlog, null, 2), "utf-8");
}

export function addBacklogItem(
  projectName: string,
  input: {
    title: string;
    description?: string | undefined;
    type?: BacklogItemType | undefined;
    priority?: "high" | "medium" | "low" | undefined;
  },
): BacklogItem {
  const backlog = loadProjectBacklog(projectName);
  const newItem: BacklogItem = {
    id: `backlog-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: input.title.trim(),
    type: input.type || "feature",
    priority: input.priority || "medium",
    status: "pending",
    requestedBy: "user",
    createdAt: Date.now(),
  };

  if (input.description !== undefined) {
    newItem.description = input.description;
  }

  backlog.items.push(newItem);
  saveProjectBacklog(backlog);
  return newItem;
}

export function updateBacklogStatus(
  projectName: string,
  itemIdOrTitle: string,
  newStatus: BacklogItemStatus,
): boolean {
  const backlog = loadProjectBacklog(projectName);
  const target = backlog.items.find(
    (item) =>
      item.id === itemIdOrTitle ||
      item.title.toLowerCase().trim() === itemIdOrTitle.toLowerCase().trim(),
  );

  if (!target) return false;

  target.status = newStatus;
  if (newStatus === "completed") {
    target.completedAt = Date.now();
  }
  saveProjectBacklog(backlog);
  return true;
}

export function formatBacklogForDisplay(projectName: string): string {
  const backlog = loadProjectBacklog(projectName);
  if (backlog.items.length === 0) {
    return `Project "${projectName}" ki wishlist / backlog mein filhal koi pending feature nahi hai.`;
  }

  const pending = backlog.items.filter((i) => i.status === "pending" || i.status === "in_progress");
  const completed = backlog.items.filter((i) => i.status === "completed");

  let out = `### 📋 Wishlist & Feature Backlog (${projectName})\n\n`;

  if (pending.length > 0) {
    out += `**⏳ Pending Features / Improvements (${pending.length}):**\n`;
    for (const item of pending) {
      const typeBadge = item.type === "improvement" ? "⚡ Improvement" : "✨ Feature";
      out += `• **${item.title}** [${typeBadge} | Priority: ${item.priority.toUpperCase()}]\n`;
      if (item.description) {
        out += `  _${item.description}_\n`;
      }
    }
  } else {
    out += `*Tamam features mukammal ho chuke hain!*\n`;
  }

  if (completed.length > 0) {
    out += `\n**✅ Completed Features (${completed.length}):**\n`;
    for (const item of completed.slice(-5)) {
      out += `• ~~${item.title}~~\n`;
    }
  }

  return out.trim();
}
