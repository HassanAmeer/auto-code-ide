import { describe, expect, it } from "vite-plus/test";
import { translatePromptToBashCommand, generateAiExplanation } from "./terminalClient";

describe("translatePromptToBashCommand", () => {
  it("passes raw shell commands through unchanged", () => {
    expect(translatePromptToBashCommand("ls -la /var/log")).toBe("ls -la /var/log");
    expect(translatePromptToBashCommand("df -h")).toBe("df -h");
    expect(translatePromptToBashCommand("docker ps")).toBe("docker ps");
  });

  it("translates disk space intent to df -h", () => {
    expect(translatePromptToBashCommand("check disk space")).toBe("df -h");
    expect(translatePromptToBashCommand("storage check karo")).toBe("df -h");
  });

  it("translates memory intent to free -h", () => {
    expect(translatePromptToBashCommand("check ram")).toMatch(/free -h/);
  });

  it("translates port kill intent with extracted port number", () => {
    expect(translatePromptToBashCommand("kill port 3000")).toContain("3000");
  });
});

describe("generateAiExplanation", () => {
  it("provides helpful explanation on success", () => {
    const explanation = generateAiExplanation("df -h", {
      ok: true,
      command: "df -h",
      cwd: "/",
      stdout: "Filesystem Size Used Avail Use% Mounted on",
      stderr: "",
      exitCode: 0,
      durationMs: 12,
    });
    expect(explanation.explanation).toContain("Disk filesystem usage checked");
    expect(explanation.nextSteps.length).toBeGreaterThan(0);
  });
});
