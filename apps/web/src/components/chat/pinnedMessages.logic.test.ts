import { describe, expect, it } from "vite-plus/test";
import {
  formatPinnedCount,
  resolvePinnedRowIndices,
  stepPinnedIndex,
  togglePinnedMessage,
  type PinnableRow,
} from "./pinnedMessages.logic";

describe("togglePinnedMessage", () => {
  it("adds a message that is not pinned yet", () => {
    expect(togglePinnedMessage([], "m1")).toEqual(["m1"]);
    expect(togglePinnedMessage(["m1"], "m2")).toEqual(["m1", "m2"]);
  });

  it("removes a message that is already pinned", () => {
    expect(togglePinnedMessage(["m1", "m2"], "m1")).toEqual(["m2"]);
    expect(togglePinnedMessage(["m1"], "m1")).toEqual([]);
  });

  it("collapses duplicates and ignores empty ids", () => {
    expect(togglePinnedMessage(["m1", "m1"], "m2")).toEqual(["m1", "m2"]);
    expect(togglePinnedMessage(["m1"], "   ")).toEqual(["m1"]);
  });
});

describe("stepPinnedIndex", () => {
  it("wraps in both directions", () => {
    expect(stepPinnedIndex(0, 3, -1)).toBe(2);
    expect(stepPinnedIndex(2, 3, 1)).toBe(0);
    expect(stepPinnedIndex(1, 3, 1)).toBe(2);
  });

  it("clamps invalid indices and handles an empty list", () => {
    expect(stepPinnedIndex(-5, 3, 1)).toBe(1);
    expect(stepPinnedIndex(99, 3, -1)).toBe(1);
    expect(stepPinnedIndex(0, 0, 1)).toBe(0);
  });
});

describe("formatPinnedCount", () => {
  it("renders active/total and a zero state", () => {
    expect(formatPinnedCount(0, 3)).toBe("1/3");
    expect(formatPinnedCount(2, 3)).toBe("3/3");
    expect(formatPinnedCount(0, 0)).toBe("0/0");
  });
});

describe("resolvePinnedRowIndices", () => {
  const rows: PinnableRow[] = [
    { messageId: "u1", isAssistant: false },
    { messageId: "a1", isAssistant: true },
    { messageId: "a2", isAssistant: true },
    { messageId: "u2", isAssistant: false },
    { messageId: "a3", isAssistant: true },
  ];

  it("returns timeline row indices for pinned assistant messages only", () => {
    expect(resolvePinnedRowIndices(rows, new Set(["a1", "a3"]))).toEqual([1, 4]);
  });

  it("ignores pinned ids on user rows and ids missing from the timeline", () => {
    expect(resolvePinnedRowIndices(rows, new Set(["u1", "missing"]))).toEqual([]);
  });

  it("returns nothing when nothing is pinned", () => {
    expect(resolvePinnedRowIndices(rows, new Set())).toEqual([]);
  });
});
