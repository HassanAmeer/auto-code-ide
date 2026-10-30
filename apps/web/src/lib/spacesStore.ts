/**
 * Spaces & Living Document Store (OpenDots Inspired)
 *
 * Manages persistent Notion-like living document pages, review drafts,
 * and project spaces across both localStorage and VPS backend.
 */

export interface SpacePage {
  id: string;
  title: string;
  spaceName: string; // e.g. "Main", "Specs", "Architecture"
  category: "spec" | "architecture" | "schema" | "backlog" | "plan" | "notes";
  status: "draft" | "review_pending" | "approved" | "rejected" | "archived";
  summaryItems: string[];
  content: string; // Markdown formatted living document
  projectName: string;
  replyChips?: string[] | undefined;
  createdAt: number;
  updatedAt: number;
  approvedAt?: number | undefined;
}

const STORAGE_KEY_PREFIX = "t3_spaces_pages_v1_";
const subscribers = new Set<(pages: SpacePage[]) => void>();

function getStorageKey(projectName: string): string {
  const safe = (projectName || "default").replace(/[^a-zA-Z0-9_\-]/g, "_").toLowerCase();
  return `${STORAGE_KEY_PREFIX}${safe}`;
}

/**
 * Load all space pages for a project from localStorage.
 */
export function loadSpacePages(projectName = "default"): SpacePage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(getStorageKey(projectName));
    if (!raw) return [];
    return JSON.parse(raw) as SpacePage[];
  } catch {
    return [];
  }
}

/**
 * Save all space pages for a project to localStorage and notify listeners.
 */
export function saveSpacePages(projectName: string, pages: SpacePage[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getStorageKey(projectName), JSON.stringify(pages));
    notifySubscribers(pages);

    // Sync in background to server /api/bot/spaces if available
    void fetch("/api/bot/spaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectName, pages }),
    }).catch(() => {
      // Background sync fail is safe (localStorage is source of truth on client)
    });
  } catch (err) {
    console.error("[SpacesStore] Failed to save space pages:", err);
  }
}

/**
 * Add or update a single page in a project's space.
 */
export function upsertSpacePage(page: SpacePage): SpacePage {
  const pages = loadSpacePages(page.projectName);
  const now = Date.now();
  const existingIdx = pages.findIndex((p) => p.id === page.id);

  const updatedPage: SpacePage = {
    ...page,
    updatedAt: now,
  };

  let newPages: SpacePage[];
  if (existingIdx >= 0) {
    newPages = [...pages];
    newPages[existingIdx] = updatedPage;
  } else {
    newPages = [updatedPage, ...pages];
  }

  saveSpacePages(page.projectName, newPages);
  return updatedPage;
}

/**
 * Approve a pending draft page.
 */
export function approveSpacePage(projectName: string, pageId: string): SpacePage | null {
  const pages = loadSpacePages(projectName);
  const page = pages.find((p) => p.id === pageId);
  if (!page) return null;

  const approved: SpacePage = {
    ...page,
    status: "approved",
    approvedAt: Date.now(),
    updatedAt: Date.now(),
  };

  upsertSpacePage(approved);
  return approved;
}

/**
 * Reject a draft page.
 */
export function rejectSpacePage(projectName: string, pageId: string): SpacePage | null {
  const pages = loadSpacePages(projectName);
  const page = pages.find((p) => p.id === pageId);
  if (!page) return null;

  const rejected: SpacePage = {
    ...page,
    status: "rejected",
    updatedAt: Date.now(),
  };

  upsertSpacePage(rejected);
  return rejected;
}

/**
 * Delete a page from space.
 */
export function deleteSpacePage(projectName: string, pageId: string): void {
  const pages = loadSpacePages(projectName);
  const filtered = pages.filter((p) => p.id !== pageId);
  saveSpacePages(projectName, filtered);
}

/**
 * Subscribe to changes in space pages.
 */
export function subscribeSpacePages(listener: (pages: SpacePage[]) => void): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

function notifySubscribers(pages: SpacePage[]): void {
  for (const listener of subscribers) {
    try {
      listener(pages);
    } catch (err) {
      console.error("[SpacesStore] Subscriber error:", err);
    }
  }
}
