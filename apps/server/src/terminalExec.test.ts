import { describe, expect, it } from "vite-plus/test";
import { runBashCommandOnHost } from "./terminalExec.ts";

describe("runBashCommandOnHost", () => {
  it("executes basic shell command with stdout and exit 0", async () => {
    const result = await runBashCommandOnHost("echo 'Hello AI Terminal'", "/", 10_000);
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("Hello AI Terminal");
  });

  it("captures non-zero exit code and stderr", async () => {
    const result = await runBashCommandOnHost("ls /non_existent_folder_xyz_123 2>&1", "/", 10_000);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout + result.stderr).toMatch(/No such file or directory/i);
  });
});
