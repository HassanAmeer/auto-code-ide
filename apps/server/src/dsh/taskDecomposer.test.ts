import { describe, expect, it } from "vitest";
import { decomposeTask } from "./taskDecomposer.ts";

describe("explicit task decomposition", () => {
  it("preserves every user-listed task instead of dropping items after four", () => {
    const result = decomposeTask(
      "Build a multi-part feature",
      [
        "- create the schema",
        "- add the API route",
        "- implement the page",
        "- write automated tests",
        "- add deployment documentation",
      ].join("\n"),
    );

    expect(result).toHaveLength(5);
    expect(result.map((item) => item.description)).toEqual([
      "create the schema",
      "add the API route",
      "implement the page",
      "write automated tests",
      "add deployment documentation",
    ]);
  });
});
