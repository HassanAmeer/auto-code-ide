import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import { getWorktreeDiff } from "./worktreeRunner.ts";

it("includes committed worker changes relative to the run baseline", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "baseline-test-"));
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  try {
    git("init");
    git("config", "user.name", "Test");
    git("config", "user.email", "test@example.com");
    fs.writeFileSync(path.join(root, "feature.ts"), "old\n");
    git("add", ".");
    git("commit", "-m", "base");
    const baseline = git("rev-parse", "HEAD");
    fs.writeFileSync(path.join(root, "feature.ts"), "implemented\n");
    git("add", ".");
    git("commit", "-m", "worker");
    expect(getWorktreeDiff(root, baseline)).toContain("+implemented");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
