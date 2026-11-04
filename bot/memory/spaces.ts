import * as fs from "node:fs";
import * as path from "node:path";

export interface SpaceDocumentItem {
  id: string;
  title: string;
  spaceName: string;
  category: "spec" | "architecture" | "schema" | "backlog" | "plan" | "notes";
  status: "draft" | "review_pending" | "approved" | "rejected" | "archived";
  summaryItems: string[];
  content: string;
  projectName: string;
  replyChips?: string[] | undefined;
  createdAt: number;
  updatedAt: number;
  approvedAt?: number | undefined;
}

const MEMORY_DIR = path.resolve(process.cwd(), "userdata", "bot-memory", "spaces");

function ensureDir() {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

function getSpaceFilePath(projectName: string): string {
  const safeName = projectName.replace(/[^a-zA-Z0-9_\-]/g, "_").toLowerCase();
  return path.join(MEMORY_DIR, `${safeName}-spaces.json`);
}

export function loadSpacesDocuments(projectName: string): SpaceDocumentItem[] {
  ensureDir();
  const filePath = getSpaceFilePath(projectName);
  if (fs.existsSync(filePath)) {
    try {
      const data = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(data) as SpaceDocumentItem[];
    } catch {
      return [];
    }
  }
  return [];
}

export function saveSpacesDocuments(projectName: string, documents: SpaceDocumentItem[]): void {
  ensureDir();
  const filePath = getSpaceFilePath(projectName);
  fs.writeFileSync(filePath, JSON.stringify(documents, null, 2), "utf-8");
}

export function upsertSpacesDocument(
  projectName: string,
  doc: SpaceDocumentItem,
): SpaceDocumentItem {
  const docs = loadSpacesDocuments(projectName);
  const now = Date.now();
  const updatedDoc: SpaceDocumentItem = {
    ...doc,
    projectName,
    updatedAt: now,
  };

  const existingIdx = docs.findIndex((d) => d.id === doc.id);
  if (existingIdx >= 0) {
    docs[existingIdx] = updatedDoc;
  } else {
    docs.unshift(updatedDoc);
  }

  saveSpacesDocuments(projectName, docs);
  return updatedDoc;
}
