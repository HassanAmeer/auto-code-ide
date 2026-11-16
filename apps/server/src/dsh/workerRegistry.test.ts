import { describe, expect, it } from "vitest";
import { deriveSpecialistRole } from "./workerRegistry.ts";

describe("worker specialist roles", () => {
  it("derives the role from the task instead of the worker order", () => {
    expect(deriveSpecialistRole("Add the API route", "core_logic_api", 1)).toBe(
      "Worker #1: Server & Deployment Specialist",
    );
    expect(deriveSpecialistRole("Create the database schema", "architecture_schema", 2)).toBe(
      "Worker #2: Database & Storage Specialist",
    );
  });
});
