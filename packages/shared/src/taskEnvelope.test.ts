import { describe, expect, it } from "vite-plus/test";
import {
  createSupervisorWorkerEnvelope,
  formatSupervisorWorkerPrompt,
  DEFAULT_WORKER_RULES,
} from "./taskEnvelope.ts";

describe("Supervisor-to-Worker Task Envelope", () => {
  it("creates envelope with default rules and expected output", () => {
    const envelope = createSupervisorWorkerEnvelope({
      task: "Add login modal with email validation",
    });

    expect(envelope.task).toBe("Add login modal with email validation");
    expect(envelope.rules.length).toBeGreaterThanOrEqual(DEFAULT_WORKER_RULES.length);
    expect(envelope.expectedOutput).toContain("Complete, functional code");
  });

  it("merges custom requirements and constraints into rules list", () => {
    const envelope = createSupervisorWorkerEnvelope({
      task: "Refactor navbar",
      requirements: ["Use Lucide icons only", "Add responsive drawer for mobile"],
      constraints: ["Do not delete existing auth state"],
      projectName: "my-app",
      targetPath: "/workspaces/my-app",
      framework: "react-vite",
    });

    expect(envelope.context?.projectName).toBe("my-app");
    expect(envelope.context?.framework).toBe("react-vite");
    expect(envelope.rules).toContain("Use Lucide icons only");
    expect(envelope.rules).toContain("Add responsive drawer for mobile");
    expect(envelope.rules).toContain("Constraint: Do not delete existing auth state");
  });

  it("formats into high-authority prompt string with strict markers", () => {
    const envelope = createSupervisorWorkerEnvelope({
      task: "Build dark mode toggle",
      requirements: ["Persist choice in localStorage"],
      projectName: "op",
    });

    const formattedPrompt = formatSupervisorWorkerPrompt(envelope);

    expect(formattedPrompt).toContain("SUPERVISOR-TO-WORKER TASK ENVELOPE");
    expect(formattedPrompt).toContain("[TASK OBJECTIVE]:\nBuild dark mode toggle");
    expect(formattedPrompt).toContain("Persist choice in localStorage");
    expect(formattedPrompt).toContain("[STRICT RULES & BOUNDS]:");
    expect(formattedPrompt).toContain("[EXPECTED DELIVERABLES & VERIFICATION CRITERIA]:");
    expect(formattedPrompt).toContain("CRITICAL DIRECTIVE FOR WORKER AGENT:");
  });
});
