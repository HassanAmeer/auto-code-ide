// @effect-diagnostics globalDateInEffect:off globalRandomInEffect:off nodeBuiltinImport:off globalTimers:off globalTimersInEffect:off preferSchemaOverJson:off globalDate:off globalFetchInEffect:off globalFetch:off globalConsoleInEffect:off globalConsole:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  detectPackageManager,
  requiresBuild,
  reviewWorkerOutput,
  listChangedFiles,
  getWatchdogSnapshot,
  stopWatchdog,
} from "./watchdogSupervisor.ts";

function makeProject(files: Record<string, string>): string {
  const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "watchdog-test-"));
  for (const [name, content] of Object.entries(files)) {
    const full = NodePath.join(dir, name);
    NodeFS.mkdirSync(NodePath.dirname(full), { recursive: true });
    NodeFS.writeFileSync(full, content, "utf8");
  }
  return dir;
}

describe("watchdog build/test decision", () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = makeProject({
      "package.json": JSON.stringify({
        name: "demo",
        scripts: { build: "echo build", test: "echo test" },
      }),
    });
  });

  afterEach(() => {
    NodeFS.rmSync(projectRoot, { recursive: true, force: true });
  });

  it("detects the package manager from the lockfile", () => {
    expect(detectPackageManager(projectRoot)).toBe("npm");
    NodeFS.writeFileSync(NodePath.join(projectRoot, "pnpm-lock.yaml"), "lockfileVersion: 9\n");
    expect(detectPackageManager(projectRoot)).toBe("pnpm");
  });

  it("requires a build when source or build config changed", () => {
    expect(requiresBuild(["src/app.tsx"], projectRoot)).toBe(true);
    expect(requiresBuild(["package.json"], projectRoot)).toBe(true);
    expect(requiresBuild(["vite.config.ts"], projectRoot)).toBe(true);
  });

  it("skips the build for docs and css-only changes", () => {
    expect(requiresBuild(["README.md"], projectRoot)).toBe(false);
    expect(requiresBuild(["styles/theme.css"], projectRoot)).toBe(false);
    expect(requiresBuild([], projectRoot)).toBe(false);
  });

  it("never builds a project without a build script", () => {
    const noBuild = makeProject({ "package.json": JSON.stringify({ name: "x" }) });
    expect(requiresBuild(["src/app.tsx"], noBuild)).toBe(false);
    NodeFS.rmSync(noBuild, { recursive: true, force: true });
  });
});

describe("watchdog worker review", () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = makeProject({
      "index.html": "<!DOCTYPE html>\n<html><body><h1>ok</h1></body></html>",
      "empty.ts": "",
      "todo.ts": "// TODO: finish this\n",
      "broken.html": "<html><body>no doctype",
    });
  });

  afterEach(() => {
    NodeFS.rmSync(projectRoot, { recursive: true, force: true });
  });

  it("flags empty files, placeholders and missing doctype", () => {
    const issues = reviewWorkerOutput(
      ["index.html", "empty.ts", "todo.ts", "broken.html"],
      projectRoot,
    );
    expect(issues.some((i) => i.includes("empty.ts") && i.includes("empty"))).toBe(true);
    expect(issues.some((i) => i.includes("todo.ts") && i.includes("TODO"))).toBe(true);
    expect(issues.some((i) => i.includes("broken.html") && i.includes("DOCTYPE"))).toBe(true);
    expect(issues.some((i) => i.includes("index.html"))).toBe(false);
  });

  it("reports no issues for a clean file", () => {
    expect(reviewWorkerOutput(["index.html"], projectRoot)).toEqual([]);
  });

  it("lists changed files only inside a git repo", () => {
    // Not a git repo — the helper must not throw, it returns an empty list.
    expect(listChangedFiles(projectRoot)).toEqual([]);
  });
});

describe("watchdog snapshot", () => {
  it("returns an empty snapshot when nothing is running", () => {
    const snapshot = getWatchdogSnapshot();
    expect(snapshot.ok).toBe(true);
    expect(Array.isArray(snapshot.watchdogs)).toBe(true);
  });

  it("does not stop an unknown watchdog", () => {
    expect(stopWatchdog("watchdog-does-not-exist")).toBe(false);
  });
});
