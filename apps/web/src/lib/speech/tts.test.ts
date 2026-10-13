import { describe, expect, it } from "vitest";
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
});

describe("sanitizeTextForSpeech", () => {
  it("does not pronounce code blocks or say 'Code block omitted'", () => {
    const input = "All tests passed.\n```bash\nnpm test\n```\nReady to deploy.";
    const result = sanitizeTextForSpeech(input);
    expect(result).not.toContain("npm test");
    expect(result).not.toContain("Code block omitted");
    expect(result).toBe("All tests passed. Ready to deploy.");
  });

  it("cleans markdown headers, bold, and list formatting", () => {
    const input = "# Overview\n\n**Important:**\n- Item 1\n- Item 2";
    const result = sanitizeTextForSpeech(input);
    expect(result).toBe("Overview Important: Item 1 Item 2");
  });
});
