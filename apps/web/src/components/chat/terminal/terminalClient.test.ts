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

  it("translates file count queries in Roman Urdu and English", () => {
    const cmd1 = translatePromptToBashCommand("mujhy total fiels bataen kitni hen");
    expect(cmd1).toContain("find .");
    expect(cmd1).toContain("wc -l");

    const cmd2 = translatePromptToBashCommand("total files kitni hain");
    expect(cmd2).toContain("wc -l");

    const cmd3 = translatePromptToBashCommand("fiels bataen");
    expect(cmd3).toContain("ls -lah");
  });

  it("translates port kill intent with extracted port number", () => {
    expect(translatePromptToBashCommand("kill port 3000")).toContain("3000");
  });

  it("utilizes active SSH keys when asked to connect or run remote commands", () => {
    const activeKeys = [
      {
        id: "key-1",
        name: "Remote VPS",
        type: "ssh" as const,
        host: "192.168.1.50",
        user: "ubuntu",
        port: 2222,
        enabled: true,
      },
    ];
    const cmd = translatePromptToBashCommand("connect to server and check uptime", "/", activeKeys);
    expect(cmd).toContain("ssh -o StrictHostKeyChecking=no -p 2222 ubuntu@192.168.1.50");
    expect(cmd).toContain("uptime");
  });

  it("utilizes active API token for API requests", () => {
    const activeKeys = [
      {
        id: "key-api",
        name: "OpenAI Token",
        type: "api" as const,
        secret: "sk-test-token-123",
        enabled: true,
      },
    ];
    const cmd = translatePromptToBashCommand(
      "call api endpoint https://example.com/api",
      "/",
      activeKeys,
    );
    expect(cmd).toContain("Authorization: Bearer sk-test-token-123");
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
