import * as fs from "node:fs";
import * as path from "node:path";

export interface ProjectFeature {
  id: string;
  title: string;
  description?: string | undefined;
  category: "core" | "ui" | "backend" | "extra";
  status: "idea" | "confirmed" | "in_progress" | "completed";
  suggestedBy: "user" | "bot";
  createdAt: number;
  completedAt?: number | undefined;
}

export interface ProjectSpec {
  projectName: string;
  concept: string; // e.g. "Modern Restaurant Web App"
  notes: string[];
  features: ProjectFeature[];
  lastUpdated: number;
}

const MEMORY_DIR = path.resolve(process.cwd(), "userdata", "bot-memory");

function ensureDir() {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

function getSpecFilePath(projectName: string): string {
  const safeName = projectName.replace(/[^a-zA-Z0-9_\-]/g, "_").toLowerCase();
  return path.join(MEMORY_DIR, `${safeName}-spec.json`);
}

export function loadProjectSpec(projectName: string): ProjectSpec {
  ensureDir();
  const filePath = getSpecFilePath(projectName);
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
    concept: "",
    notes: [],
    features: [],
    lastUpdated: Date.now(),
  };
}

export function saveProjectSpec(spec: ProjectSpec): void {
  ensureDir();
  spec.lastUpdated = Date.now();
  const filePath = getSpecFilePath(spec.projectName);
  fs.writeFileSync(filePath, JSON.stringify(spec, null, 2), "utf-8");
}

export function addOrUpdateFeature(
  projectName: string,
  feature: Omit<ProjectFeature, "id" | "createdAt">,
): ProjectSpec {
  const spec = loadProjectSpec(projectName);
  const existing = spec.features.find(
    (f) => f.title.toLowerCase().trim() === feature.title.toLowerCase().trim(),
  );

  if (existing) {
    existing.title = feature.title;
    existing.category = feature.category;
    existing.status = feature.status;
    existing.suggestedBy = feature.suggestedBy;
    if (feature.description !== undefined) existing.description = feature.description;
    if (feature.completedAt !== undefined) existing.completedAt = feature.completedAt;
  } else {
    const newFeature: ProjectFeature = {
      id: `feat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: Date.now(),
      title: feature.title,
      category: feature.category,
      status: feature.status,
      suggestedBy: feature.suggestedBy,
      ...(feature.description !== undefined ? { description: feature.description } : {}),
      ...(feature.completedAt !== undefined ? { completedAt: feature.completedAt } : {}),
    };
    spec.features.push(newFeature);
  }

  saveProjectSpec(spec);
  return spec;
}

export function formatSpecForPrompt(projectName: string): string {
  const spec = loadProjectSpec(projectName);
  if (spec.features.length === 0 && !spec.concept) {
    return "";
  }

  let text = `[PROJECT MEMORY & SPEC FOR "${spec.projectName}"]:\n`;
  if (spec.concept) {
    text += `• Concept / Vision: ${spec.concept}\n`;
  }

  const confirmed = spec.features.filter(
    (f) => f.status === "confirmed" || f.status === "in_progress",
  );
  const ideas = spec.features.filter((f) => f.status === "idea");
  const completed = spec.features.filter((f) => f.status === "completed");

  if (confirmed.length > 0) {
    text += `• Confirmed To Build: ${confirmed.map((f) => f.title).join(", ")}\n`;
  }
  if (ideas.length > 0) {
    text += `• Brainstormed Ideas / Suggestions: ${ideas.map((f) => f.title).join(", ")}\n`;
  }
  if (completed.length > 0) {
    text += `• Completed Features: ${completed.map((f) => f.title).join(", ")}\n`;
  }

  return text;
}
