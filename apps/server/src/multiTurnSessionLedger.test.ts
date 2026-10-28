import { describe, it, expect, beforeEach } from "vitest";
import {
  getServerSessionLedger,
  addServerDecisionPoint,
  clearServerSessionLedger,
  formatServerLedgerBulletSummary,
  isServerLedgerRecallQuery,
  extractServerDecisionsFromTurns,
  recordServerTurnAndExtract,
} from "./multiTurnSessionLedger";

describe("server multiTurnSessionLedger", () => {
  const sessionId = "srv-session-test";

  beforeEach(() => {
    clearServerSessionLedger(sessionId);
  });

  it("adds and retrieves bullet decisions", () => {
    addServerDecisionPoint(sessionId, "LiveKit VPS setup barkarar rakhna hai.");
    addServerDecisionPoint(sessionId, "Edge-TTS Asad Neural voice use hogi.");
    addServerDecisionPoint(sessionId, "Codebase review complete ho chuka hai.");

    const ledger = getServerSessionLedger(sessionId);
    expect(ledger.decisions).toHaveLength(3);

    const summary = formatServerLedgerBulletSummary(ledger);
    expect(summary).toContain("Point 1: LiveKit VPS setup barkarar rakhna hai.");
    expect(summary).toContain("Point 2: Edge-TTS Asad Neural voice use hogi.");
    expect(summary).toContain("Point 3: Codebase review complete ho chuka hai.");
  });

  it("detects recall queries accurately", () => {
    expect(isServerLedgerRecallQuery("Acha humne shuru mein kya decide kiya tha?")).toBe(true);
    expect(isServerLedgerRecallQuery("kya faisla hua tha?")).toBe(true);
    expect(isServerLedgerRecallQuery("what did we decide earlier")).toBe(true);
    expect(isServerLedgerRecallQuery("random message")).toBe(false);
  });

  it("extracts decisions and auto-triggers after 5 turns", () => {
    const history: Array<{ role: string; content: string }> = [];

    for (let i = 1; i <= 4; i++) {
      const turn = { role: "user", content: `Turn ${i}` };
      history.push(turn);
      const res = recordServerTurnAndExtract(sessionId, turn, history);
      expect(res.ledger.turnCount).toBe(i);
      expect(res.extractedPoints).toHaveLength(0);
    }

    const decisionTurn = {
      role: "assistant",
      content:
        "Point 1: LiveKit VPS setup barkarar rakhna hai.\nPoint 2: Edge-TTS Asad Neural voice use hogi.",
    };
    history.push(decisionTurn);
    const res5 = recordServerTurnAndExtract(sessionId, decisionTurn, history);
    expect(res5.ledger.turnCount).toBe(5);
    expect(res5.extractedPoints.length).toBeGreaterThanOrEqual(2);

    const ledger = getServerSessionLedger(sessionId);
    expect(ledger.decisions.length).toBeGreaterThanOrEqual(2);
  });
});
