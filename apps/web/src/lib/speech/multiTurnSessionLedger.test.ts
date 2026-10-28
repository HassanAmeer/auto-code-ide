import { describe, it, expect, beforeEach, vi } from "vite-plus/test";
import {
  loadSessionLedger,
  saveSessionLedger,
  addDecisionPoint,
  clearSessionLedger,
  formatLedgerAsBulletSummary,
  isLedgerRecallQuery,
  shouldExtractDecisions,
  extractDecisionsFromTurns,
  recordTurnAndCheckLedger,
} from "./multiTurnSessionLedger";

describe("multiTurnSessionLedger", () => {
  const sessionId = "test-session-123";

  beforeEach(() => {
    clearSessionLedger(sessionId);
  });

  it("initializes with empty ledger", () => {
    const ledger = loadSessionLedger(sessionId);
    expect(ledger.sessionId).toBe(sessionId);
    expect(ledger.decisions).toEqual([]);
    expect(ledger.turnCount).toBe(0);
  });

  it("adds and formats decision points cleanly in Point 1, Point 2 style", () => {
    addDecisionPoint(sessionId, "LiveKit VPS setup barkarar rakhna hai.");
    addDecisionPoint(sessionId, "Edge-TTS Asad Neural voice use hogi.");
    addDecisionPoint(sessionId, "Codebase review complete ho chuka hai.");

    const ledger = loadSessionLedger(sessionId);
    expect(ledger.decisions).toHaveLength(3);
    expect(ledger.decisions[0]?.text).toBe("LiveKit VPS setup barkarar rakhna hai.");
    expect(ledger.decisions[1]?.text).toBe("Edge-TTS Asad Neural voice use hogi.");
    expect(ledger.decisions[2]?.text).toBe("Codebase review complete ho chuka hai.");

    const summary = formatLedgerAsBulletSummary(ledger);
    expect(summary).toContain("Point 1: LiveKit VPS setup barkarar rakhna hai.");
    expect(summary).toContain("Point 2: Edge-TTS Asad Neural voice use hogi.");
    expect(summary).toContain("Point 3: Codebase review complete ho chuka hai.");
  });

  it("deduplicates identical decision points", () => {
    addDecisionPoint(sessionId, "LiveKit VPS setup barkarar rakhna hai.");
    addDecisionPoint(sessionId, "LiveKit VPS setup barkarar rakhna hai.");

    const ledger = loadSessionLedger(sessionId);
    expect(ledger.decisions).toHaveLength(1);
  });

  it("accurately detects ledger recall queries in Roman Urdu and English", () => {
    expect(isLedgerRecallQuery("Acha humne shuru mein kya decide kiya tha?")).toBe(true);
    expect(isLedgerRecallQuery("humne shuru me kya decide kiya tha")).toBe(true);
    expect(isLedgerRecallQuery("pehle kya faisla hua tha")).toBe(true);
    expect(isLedgerRecallQuery("session summary kya hai")).toBe(true);
    expect(isLedgerRecallQuery("what did we decide earlier?")).toBe(true);
    expect(isLedgerRecallQuery("bullet points batao")).toBe(true);

    // Irrelevant queries
    expect(isLedgerRecallQuery("hello kaisa hai")).toBe(false);
    expect(isLedgerRecallQuery("index.html ka code dikhao")).toBe(false);
  });

  it("evaluates 5-8 turn extraction threshold", () => {
    expect(shouldExtractDecisions(4, 0, 5)).toBe(false);
    expect(shouldExtractDecisions(5, 0, 5)).toBe(true);
    expect(shouldExtractDecisions(8, 0, 5)).toBe(true);
    expect(shouldExtractDecisions(7, 5, 5)).toBe(false);
    expect(shouldExtractDecisions(10, 5, 5)).toBe(true);
  });

  it("extracts explicit Point X decisions from dialog turns", () => {
    const turns: Array<{ role: "user" | "assistant"; text: string }> = [
      { role: "user", text: "Voice assistant ke liye kya decide hua?" },
      {
        role: "assistant",
        text: "Ji boss!\nPoint 1: LiveKit VPS setup barkarar rakhna hai.\nPoint 2: Edge-TTS Asad Neural voice use hogi.",
      },
      { role: "user", text: "Code review ka kya bana?" },
      {
        role: "assistant",
        text: "Ji boss, Point 3: Codebase review complete ho chuka hai.",
      },
    ];

    const extracted = extractDecisionsFromTurns(turns, 0);
    expect(extracted).toHaveLength(3);
    expect(extracted[0]?.text).toBe("LiveKit VPS setup barkarar rakhna hai.");
    expect(extracted[1]?.text).toBe("Edge-TTS Asad Neural voice use hogi.");
    expect(extracted[2]?.text).toBe("Codebase review complete ho chuka hai.");
  });

  it("increments turn count and triggers auto-extraction after 5 turns", () => {
    const history: Array<{ role: "user" | "assistant"; text: string }> = [];

    // Turns 1 to 4: should not trigger extraction yet
    for (let i = 1; i <= 4; i++) {
      const turn = { role: "user" as const, text: `Hello turn ${i}` };
      history.push(turn);
      const res = recordTurnAndCheckLedger(sessionId, turn, history);
      expect(res.ledger.turnCount).toBe(i);
      expect(res.extractedPoints).toHaveLength(0);
    }

    // Turn 5: contains decisions, should trigger extraction
    const decisionTurn = {
      role: "assistant" as const,
      text: "Point 1: LiveKit VPS setup barkarar rakhna hai.\nPoint 2: Edge-TTS Asad Neural voice use hogi.",
    };
    history.push(decisionTurn);
    const res5 = recordTurnAndCheckLedger(sessionId, decisionTurn, history);
    expect(res5.ledger.turnCount).toBe(5);
    expect(res5.ledger.lastExtractedTurn).toBe(5);
    expect(res5.extractedPoints.length).toBeGreaterThanOrEqual(2);

    const finalLedger = loadSessionLedger(sessionId);
    expect(finalLedger.decisions.length).toBeGreaterThanOrEqual(2);
  });
});
