// @effect-diagnostics globalDateInEffect:off globalRandomInEffect:off nodeBuiltinImport:off globalTimers:off globalTimersInEffect:off preferSchemaOverJson:off globalDate:off globalFetchInEffect:off globalFetch:off globalConsoleInEffect:off globalConsole:off
import { describe, it, expect } from "vitest";

import { parseRequestedWorkerCount } from "./http.ts";

describe("requested worker count", () => {
  it("reads an explicit count from the command", () => {
    expect(parseRequestedWorkerCount("/parallel-subagents 5 build a CRM")).toBe(5);
    expect(parseRequestedWorkerCount("/parallel-subagents 3")).toBe(3);
  });

  it("returns undefined when no count is pinned", () => {
    expect(parseRequestedWorkerCount("/parallel-subagents build a CRM")).toBeUndefined();
    expect(parseRequestedWorkerCount("/parallel-subagents")).toBeUndefined();
    expect(parseRequestedWorkerCount("hello there")).toBeUndefined();
  });

  it("ignores numbers that are part of the task text", () => {
    expect(parseRequestedWorkerCount("/parallel-subagents add 12 tests")).toBeUndefined();
  });

  it("clamps the count into the supported range", () => {
    expect(parseRequestedWorkerCount("/parallel-subagents 0")).toBe(1);
    expect(parseRequestedWorkerCount("/parallel-subagents 99")).toBe(12);
  });
});
