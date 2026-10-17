import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

export interface WorkspaceScanResult {
  readonly workspaceRoot: string;
  readonly fileList: string[];
  readonly treeText: string;
  readonly totalFiles: number;
  readonly projectType: string;
}

const DEFAULT_IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".vscode",
  ".idea",
  "dist",
  "build",
  ".next",
  ".vite",
  ".cache",
  "coverage",
  ".output",
  "target",
  "bin",
  "obj",
  ".t3",
  ".autocode",
  ".autojobs",
  "__pycache__",
]);

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".webp",
  ".svg",
  ".mp3",
  ".mp4",
  ".wav",
  ".ogg",
  ".zip",
  ".tar",
  ".gz",
  ".7z",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".pdf",
  ".db",
  ".sqlite",
  ".sqlite3",
  ".pyc",
]);

/**
 * Scans the workspace directory up to a max depth and file cap to build
 * a compact, clean ASCII file tree and a list of relative file paths.
 */
export function scanWorkspace(
  workspaceRoot: string,
  options: { maxDepth?: number; maxFiles?: number } = {},
): WorkspaceScanResult {
  const maxDepth = options.maxDepth ?? 4;
  const maxFiles = options.maxFiles ?? 120;
  const fileList: string[] = [];

  if (!workspaceRoot || !NodeFS.existsSync(workspaceRoot)) {
    return {
      workspaceRoot,
      fileList: [],
      treeText: "(Empty or non-existent workspace)",
      totalFiles: 0,
      projectType: "unknown",
    };
  }

  interface TreeNode {
    name: string;
    isDir: boolean;
    children?: TreeNode[];
  }

  function walk(currentDir: string, currentDepth: number): TreeNode[] {
    if (currentDepth > maxDepth || fileList.length >= maxFiles) {
      return [];
    }

    let entries: NodeFS.Dirent[] = [];
    try {
      entries = NodeFS.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return [];
    }

    // Sort: directories first, then files alphabetically
    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    const nodes: TreeNode[] = [];

    for (const entry of entries) {
      if (fileList.length >= maxFiles) break;

      const name = entry.name;
      if (name.startsWith(".") && name !== ".env.example" && name !== ".env") {
        if (name === ".git" || name === ".vscode" || name === ".idea") continue;
      }
      if (DEFAULT_IGNORED_DIRS.has(name)) continue;

      const fullPath = NodePath.join(currentDir, name);
      const relPath = NodePath.relative(workspaceRoot, fullPath);

      if (entry.isDirectory()) {
        const subChildren = walk(fullPath, currentDepth + 1);
        if (subChildren.length > 0) {
          nodes.push({ name, isDir: true, children: subChildren });
        }
      } else if (entry.isFile()) {
        const ext = NodePath.extname(name).toLowerCase();
        if (BINARY_EXTENSIONS.has(ext)) continue;

        fileList.push(relPath);
        nodes.push({ name, isDir: false });
      }
    }

    return nodes;
  }

  const rootNodes = walk(workspaceRoot, 1);

  // Format as tree text
  const lines: string[] = [];
  function renderTree(nodes: TreeNode[], prefix = "") {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]!;
      const isLast = i === nodes.length - 1;
      const marker = isLast ? "└── " : "├── ";
      const childPrefix = prefix + (isLast ? "    " : "│   ");

      if (node.isDir) {
        lines.push(`${prefix}${marker}${node.name}/`);
        if (node.children) {
          renderTree(node.children, childPrefix);
        }
      } else {
        lines.push(`${prefix}${marker}${node.name}`);
      }
    }
  }

  renderTree(rootNodes);
  let treeText = lines.join("\n");
  if (!treeText.trim()) {
    treeText = "(No files yet in project workspace)";
  }

  // Detect project type
  let projectType = "general";
  if (fileList.some((f) => f === "package.json")) {
    projectType = "node/javascript";
    if (fileList.some((f) => f.includes("next.config") || f.includes(".next"))) {
      projectType = "next.js";
    } else if (fileList.some((f) => f.includes("vite.config"))) {
      projectType = "vite/react";
    }
  } else if (fileList.some((f) => f.endsWith(".py") || f === "requirements.txt")) {
    projectType = "python";
  } else if (fileList.some((f) => f === "index.html")) {
    projectType = "html/web";
  }

  return {
    workspaceRoot,
    fileList,
    treeText,
    totalFiles: fileList.length,
    projectType,
  };
}
