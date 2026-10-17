import { describe, expect, it } from "vite-plus/test";
import { stripCodeBlocks, sanitizeTextForSpeech } from "./tts";

describe("stripCodeBlocks", () => {
  it("removes closed triple-backtick code blocks completely", () => {
    const input =
      "Here is the code:\n```python\ndef hello():\n    print('world')\n```\nHope that helps!";
    const result = stripCodeBlocks(input);
    expect(result).not.toContain("def hello");
    expect(result).not.toContain("print('world')");
    expect(result).toContain("Here is the code:");
    expect(result).toContain("Hope that helps!");
  });

  it("removes closed tilde code blocks completely", () => {
    const input = "Check this out:\n~~~javascript\nconst x = 42;\n~~~\nDone.";
    const result = stripCodeBlocks(input);
    expect(result).not.toContain("const x = 42;");
    expect(result).toContain("Check this out:");
    expect(result).toContain("Done.");
  });

  it("removes unclosed trailing code blocks during streaming", () => {
    const input = "Writing file now:\n```typescript\nexport const value = 123;";
    const result = stripCodeBlocks(input);
    expect(result).not.toContain("export const value");
    expect(result).toContain("Writing file now:");
  });

  it("removes closed and unclosed thinking/reasoning blocks completely", () => {
    const closed =
      "<think>I need to analyze this request first.</think>Here is your answer: all good.";
    expect(stripCodeBlocks(closed)).not.toContain("analyze this request");
    expect(stripCodeBlocks(closed)).toContain("Here is your answer: all good.");

    const unclosed = "<think>Let me reason about the logic...";
    expect(stripCodeBlocks(unclosed).trim()).toBe("");
  });

  it("removes HTML code and pre blocks completely", () => {
    const input =
      "Check this output:\n<pre><code>const a = 100;\nconsole.log(a);</code></pre>\nAll done.";
    const result = stripCodeBlocks(input);
    expect(result).not.toContain("const a = 100");
    expect(result).not.toContain("console.log");
    expect(result).toContain("Check this output:");
    expect(result).toContain("All done.");
  });

  it("removes git diff blocks completely", () => {
    const input =
      "Here is the fix:\ndiff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,3 @@\n-const old = 1;\n+const fixed = 2;\nEverything is updated.";
    const result = stripCodeBlocks(input);
    expect(result).not.toContain("diff --git");
    expect(result).not.toContain("const fixed = 2");
    expect(result).toContain("Here is the fix:");
    expect(result).toContain("Everything is updated.");
  });
});

describe("sanitizeTextForSpeech", () => {
  it("does not pronounce code blocks or say 'Code block omitted'", () => {
    const input = "All tests passed.\n```bash\nnpm test\n```\nReady to deploy.";
    const result = sanitizeTextForSpeech(input);
    expect(result).not.toContain("npm test");
    expect(result).not.toContain("Code block omitted");
    expect(result).toBe("All tests passed. Ready to deploy.");
  });

  it("completely strips thinking content so it is never spoken", () => {
    const input =
      "<think>Thinking process: checking files and database...</think>The task is finished.";
    const result = sanitizeTextForSpeech(input);
    expect(result).not.toContain("Thinking process");
    expect(result).toBe("The task is finished.");
  });

  it("cleans markdown headers, bold, list formatting, and tables", () => {
    const input = "# Overview\n\n**Important:**\n- Item 1\n- Item 2";
    const result = sanitizeTextForSpeech(input);
    expect(result).toBe("Overview Important: Item 1 Item 2");
  });

  it("cleans function parentheses in inline identifiers", () => {
    const input = "Call `getUserData()` to retrieve details.";
    const result = sanitizeTextForSpeech(input);
    expect(result).toBe("Call getUserData to retrieve details.");
  });
});
