// @effect-diagnostics globalDateInEffect:off globalRandomInEffect:off nodeBuiltinImport:off globalTimers:off globalTimersInEffect:off preferSchemaOverJson:off globalDate:off globalFetchInEffect:off globalFetch:off globalConsoleInEffect:off globalConsole:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  auditRequirementChecklist,
  detectPackageManager,
  requiresBuild,
  reviewWorkerOutput,
  listChangedFiles,
  getWatchdogSnapshot,
  stopWatchdog,
  resolveFallbackModel,
  resolveWorkerLaneModels,
  WATCHDOG_FALLBACK_MODELS,
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

describe("watchdog self-healing ladder", () => {
  it("falls back to the next model in the ladder", () => {
    expect(resolveFallbackModel(WATCHDOG_FALLBACK_MODELS[0]!)).toBe(WATCHDOG_FALLBACK_MODELS[1]!);
  });

  it("uses the first model when the current one is unknown", () => {
    expect(resolveFallbackModel("some-unknown-model")).toBe(WATCHDOG_FALLBACK_MODELS[0]);
  });

  it("returns undefined at the end of the ladder", () => {
    const last = WATCHDOG_FALLBACK_MODELS[WATCHDOG_FALLBACK_MODELS.length - 1]!;
    expect(resolveFallbackModel(last)).toBeUndefined();
  });
});

describe("watchdog model lanes", () => {
  it("gives the first worker the requested model", () => {
    const lanes = resolveWorkerLaneModels("my-model", 3);
    expect(lanes[0]).toBe("my-model");
    expect(lanes.length).toBe(3);
  });

  it("spreads the remaining workers over different models", () => {
    const lanes = resolveWorkerLaneModels("my-model", 3);
    expect(new Set(lanes).size).toBeGreaterThan(1);
  });

  it("always returns at least one lane", () => {
    expect(resolveWorkerLaneModels("my-model", 0).length).toBe(1);
  });
});

describe("requirement checklist audit", () => {
  it("marks a requirement as passed when the diff mentions it", () => {
    const checklist = [
      { id: "req-1", requirement: "build the table booking form", status: "pending" as const },
    ];
    const result = auditRequirementChecklist(
      checklist,
      "diff --git a/BookingForm.tsx\n+export function BookingForm() {}",
    );
    expect(result.passed).toBe(1);
    expect(result.missing).toEqual([]);
    expect(checklist[0]?.status).toBe("passed");
  });

  it("flags a requirement that never appears in the diff", () => {
    const checklist = [
      { id: "req-1", requirement: "implement the payment gateway", status: "pending" as const },
    ];
    const result = auditRequirementChecklist(
      checklist,
      "diff --git a/menu.tsx\n+export const menu = [];",
    );
    expect(result.passed).toBe(0);
    expect(result.missing.length).toBe(1);
    expect(checklist[0]?.status).toBe("missing");
  });
});

describe("watchdog snapshot", () => {
  it("returns an empty snapshot when nothing is running", () => {
    const snapshot = getWatchdogSnapshot();
    expect(snapshot.ok).toBe(true);
    expect(Array.isArray(snapshot.watchdogs)).toBe(true);
    expect(snapshot.active).toBe(0);
  });

  it("does not stop an unknown watchdog", () => {
    expect(stopWatchdog("watchdog-does-not-exist")).toBe(false);
  });
});
