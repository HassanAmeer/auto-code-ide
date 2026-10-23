import { describe, it, expect } from "vite-plus/test";
import { generateSmartCommitMessage } from "./gitOperations";

describe("generateSmartCommitMessage", () => {
  it("generates chore message for empty status", () => {
    expect(generateSmartCommitMessage("")).toBe("chore: update project files");
  });

  it("generates feat message for single component file", () => {
    const status = " M src/components/AppHeader.tsx";
    expect(generateSmartCommitMessage(status)).toBe("feat: update AppHeader.tsx");
  });

  it("generates fix message when file contains bug or fix keyword", () => {
    const status = " M src/lib/auth-fix.ts";
    expect(generateSmartCommitMessage(status)).toBe("fix: update auth-fix.ts");
  });

  it("generates docs message when only markdown or doc files changed", () => {
    const status = " M README.md\n M docs/guide.txt";
    expect(generateSmartCommitMessage(status)).toBe("docs: update README.md, guide.txt");
  });

  it("generates style message when only CSS files changed", () => {
    const status = " M src/index.css";
    expect(generateSmartCommitMessage(status)).toBe("style: update index.css");
  });

  it("generates summary message when many files changed", () => {
    const status = [
      " M src/App.tsx",
      " M src/lib/utils.ts",
      " M src/components/Sidebar.tsx",
      " M src/components/ChatView.tsx",
      " M src/state/git.ts",
    ].join("\n");
    expect(generateSmartCommitMessage(status)).toBe("feat: update App.tsx and 4 other files");
  });
});
