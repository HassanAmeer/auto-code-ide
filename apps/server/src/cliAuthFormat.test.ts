import { expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";

import { formatIssuedSession, formatSessionList } from "./cliAuthFormat.ts";

it("formats issued sessions with the bearer token but omits tokens from listings", () => {
  const issuedOutput = formatIssuedSession(
    {
      sessionId: "session-1" as never,
      token: "secret-session-token",
      method: "bearer-access-token",
      scopes: ["orchestration:read", "access:write"],
      subject: "cli-issued-session",
      client: {
        label: "deploy-bot",
        deviceType: "bot",
      },
      expiresAt: DateTime.makeUnsafe("2026-04-08T10:00:00.000Z"),
    },
    { json: false },
  );

  const listedOutput = formatSessionList(
    [
      {
        sessionId: "session-1" as never,
        method: "bearer-access-token",
        scopes: ["orchestration:read", "access:write"],
        subject: "cli-issued-session",
        client: {
          label: "deploy-bot",
          deviceType: "bot",
        },
        connected: false,
        current: false,
        issuedAt: DateTime.makeUnsafe("2026-04-08T09:00:00.000Z"),
        expiresAt: DateTime.makeUnsafe("2026-04-08T10:00:00.000Z"),
        lastConnectedAt: null,
      },
    ],
    { json: false },
  );

  expect(issuedOutput).toContain("secret-session-token");
  expect(listedOutput).not.toContain("secret-session-token");
});
