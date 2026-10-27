import * as fs from "node:fs";
import * as path from "node:path";

export interface ProjectBookmark {
  id: string;
  title: string;
  url: string;
  category?: "figma" | "github" | "docs" | "production" | "other" | undefined;
  createdAt: number;
}

export interface ProjectKnowledge {
  projectName: string;
  rules: string[];
  bookmarks: ProjectBookmark[];
  lastUpdated: number;
}

const MEMORY_DIR = path.resolve(process.cwd(), "userdata", "bot-memory");

function ensureDir() {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

function getKnowledgeFilePath(projectName: string): string {
  const safeName = projectName.replace(/[^a-zA-Z0-9_\-]/g, "_").toLowerCase();
  return path.join(MEMORY_DIR, `${safeName}-knowledge.json`);
}

export function loadProjectKnowledge(projectName: string): ProjectKnowledge {
  ensureDir();
  const filePath = getKnowledgeFilePath(projectName);
  if (fs.existsSync(filePath)) {
    try {
      const data = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(data);
      return {
        projectName,
        rules: Array.isArray(parsed.rules) ? parsed.rules : [],
        bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [],
        lastUpdated: parsed.lastUpdated || Date.now(),
      };
    } catch {
      // Fallback on corrupt file
    }
  }

  // Default initial rules for a new project
  return {
    projectName,
    rules: [
      "Hamesha Clean Code aur standard design patterns follow karein.",
      "Urdu conversation mein natural Roman Urdu priority rakhein.",
    ],
    bookmarks: [],
    lastUpdated: Date.now(),
  };
}

export function saveProjectKnowledge(knowledge: ProjectKnowledge): void {
  ensureDir();
  knowledge.lastUpdated = Date.now();
  const filePath = getKnowledgeFilePath(knowledge.projectName);
  fs.writeFileSync(filePath, JSON.stringify(knowledge, null, 2), "utf-8");
}

export function addProjectRule(projectName: string, ruleText: string): string[] {
  const knowledge = loadProjectKnowledge(projectName);
  const trimmed = ruleText.trim();
  if (trimmed && !knowledge.rules.includes(trimmed)) {
    knowledge.rules.push(trimmed);
    saveProjectKnowledge(knowledge);
  }
  return knowledge.rules;
}

export function removeProjectRule(projectName: string, ruleIndex: number): string[] {
  const knowledge = loadProjectKnowledge(projectName);
  if (ruleIndex >= 0 && ruleIndex < knowledge.rules.length) {
    knowledge.rules.splice(ruleIndex, 1);
    saveProjectKnowledge(knowledge);
  }
  return knowledge.rules;
}

export function addProjectBookmark(
  projectName: string,
  bookmark: { title: string; url: string; category?: ProjectBookmark["category"] },
): ProjectBookmark {
  const knowledge = loadProjectKnowledge(projectName);
  const newBm: ProjectBookmark = {
    id: `bm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: bookmark.title.trim(),
    url: bookmark.url.trim(),
    category: bookmark.category || "other",
    createdAt: Date.now(),
  };
  knowledge.bookmarks.push(newBm);
  saveProjectKnowledge(knowledge);
  return newBm;
}

export function removeProjectBookmark(projectName: string, bookmarkId: string): boolean {
  const knowledge = loadProjectKnowledge(projectName);
  const initialLen = knowledge.bookmarks.length;
  knowledge.bookmarks = knowledge.bookmarks.filter((b) => b.id !== bookmarkId);
  if (knowledge.bookmarks.length !== initialLen) {
    saveProjectKnowledge(knowledge);
    return true;
  }
  return false;
}
