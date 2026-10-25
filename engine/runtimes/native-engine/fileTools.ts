import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface FileEditResult {
  readonly success: boolean;
  readonly path: string;
  readonly originalContent?: string;
  readonly newContent?: string;
  readonly error?: string;
}

export async function readProjectFile(projectDir: string, relativePath: string): Promise<string> {
  const fullPath = path.resolve(projectDir, relativePath);
  return await fs.readFile(fullPath, "utf-8");
}

export async function writeProjectFile(
  projectDir: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const fullPath = path.resolve(projectDir, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, "utf-8");
}

export async function editProjectFile(
  projectDir: string,
  relativePath: string,
  target: string,
  replacement: string,
): Promise<FileEditResult> {
  const fullPath = path.resolve(projectDir, relativePath);
  try {
    const original = await fs.readFile(fullPath, "utf-8");
    if (!original.includes(target)) {
      return {
        success: false,
        path: relativePath,
        error: `Target string not found in ${relativePath}`,
      };
    }
    const updated = original.replace(target, replacement);
    await fs.writeFile(fullPath, updated, "utf-8");
    return {
      success: true,
      path: relativePath,
      originalContent: original,
      newContent: updated,
    };
  } catch (err) {
    return {
      success: false,
      path: relativePath,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function listProjectFiles(
  dir: string,
  maxDepth = 4,
  currentDepth = 0,
): Promise<string[]> {
  if (currentDepth > maxDepth) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist") {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await listProjectFiles(full, maxDepth, currentDepth + 1);
      files.push(...sub);
    } else {
      files.push(full);
    }
  }
  return files;
}
