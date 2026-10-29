// @effect-diagnostics globalDate:off globalConsole:off globalRandom:off
/**
 * Multi-Turn Session Ledger (Server-Side Memory for Long Consultations) 🧠
 *
 * Maintains structured decision summaries (Point 1, Point 2, Point 3...) across
 * multi-turn voice sessions and consultations.
 */

export interface ServerDecisionPoint {
  id: string;
  pointNumber: number;
  text: string;
  category?: "architecture" | "decision" | "action_item" | "preference" | "general";
  turnIndex: number;
  timestamp: number;
}

export interface ServerSessionLedgerData {
  sessionId: string;
  turnCount: number;
  lastExtractedTurn: number;
  decisions: ServerDecisionPoint[];
  lastSummary?: string;
  updatedAt: number;
}

const serverLedgers = new Map<string, ServerSessionLedgerData>();

export function createEmptyServerLedger(sessionId: string): ServerSessionLedgerData {
  return {
    sessionId: sessionId || "default",
    turnCount: 0,
    lastExtractedTurn: 0,
    decisions: [],
    updatedAt: Date.now(),
  };
}

export function getServerSessionLedger(sessionId: string): ServerSessionLedgerData {
  const targetId = sessionId || "default";
  let ledger = serverLedgers.get(targetId);
  if (!ledger) {
    ledger = createEmptyServerLedger(targetId);
    serverLedgers.set(targetId, ledger);
  }
  return ledger;
}

export function saveServerSessionLedger(sessionId: string, data: ServerSessionLedgerData): void {
  const targetId = sessionId || "default";
  serverLedgers.set(targetId, {
    ...data,
    sessionId: targetId,
    updatedAt: Date.now(),
  });
}

export function addServerDecisionPoint(
  sessionId: string,
  text: string,
  options?: {
    category?: ServerDecisionPoint["category"];
    turnIndex?: number;
  },
): ServerDecisionPoint {
  const ledger = getServerSessionLedger(sessionId);
  const cleanText = text.replace(/^(Point\s*\d+\s*[:\-]\s*|\*|\-|\d+\.\s*)/i, "").trim();

  // Deduplicate
  const existing = ledger.decisions.find(
    (d) => d.text.toLowerCase().trim() === cleanText.toLowerCase(),
  );
  if (existing) {
    return existing;
  }

  const nextNumber = ledger.decisions.length + 1;
  const newPoint: ServerDecisionPoint = {
    id: `dec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    pointNumber: nextNumber,
    text: cleanText,
    category: options?.category || "decision",
    turnIndex: options?.turnIndex ?? ledger.turnCount,
    timestamp: Date.now(),
  };

  const updatedDecisions = [...ledger.decisions, newPoint];
  const updatedLedger: ServerSessionLedgerData = {
    ...ledger,
    decisions: updatedDecisions,
    lastSummary: formatServerLedgerBulletSummary({ ...ledger, decisions: updatedDecisions }),
    updatedAt: Date.now(),
  };

  saveServerSessionLedger(sessionId, updatedLedger);
  return newPoint;
}

export function clearServerSessionLedger(sessionId: string): void {
  const targetId = sessionId || "default";
  serverLedgers.set(targetId, createEmptyServerLedger(targetId));
}

export function formatServerLedgerBulletSummary(ledger: ServerSessionLedgerData): string {
  if (!ledger.decisions || ledger.decisions.length === 0) {
    return "Abhi tak is session mein koi specific faisla ya decision record nahi hua.";
  }
  return ledger.decisions.map((d, index) => `Point ${index + 1}: ${d.text}`).join("\n");
}

export function isServerLedgerRecallQuery(text: string): boolean {
  if (!text || !text.trim()) return false;
  const t = text.trim().toLowerCase();

  return (
    /(?:humne|humnay|hum\s*ne)\s+(?:shuru|start|pehle|initially)?\s*(?:mein|me)?\s*(?:kya|kaun\s*se?)\s*(?:decide|faisla|tay|final)\s*(?:kiya|kiye)\s*(?:tha|the)?/i.test(
      t,
    ) ||
    /(?:kya\s*(?:faisla|decide|tay)\s*(?:hua|kiye\s*the|kiya\s*tha))/i.test(t) ||
    /(?:shuru\s*(?:mein|me)?\s*kya\s*(?:decide|tay)\s*(?:hua|tha))/i.test(t) ||
    /(?:session\s*(?:ledger|summary|decisions)|faislay\s*kya\s*the|bullet\s*points?\s*batao)/i.test(
      t,
    ) ||
    /(?:what\s*did\s*we\s*decide|what\s*was\s*decided|session\s*summary|recall\s*decisions)/i.test(
      t,
    ) ||
    /(?:pichhli|purani|pehle\s*ki)\s*(?:baatein|baaton|decisions|points)\s*(?:batao|yaad\s*hai)/i.test(
      t,
    )
  );
}

export function extractServerDecisionsFromTurns(
  turns: Array<{ role: string; content: string }>,
  startIndex: number = 0,
): Array<{ text: string; category?: ServerDecisionPoint["category"] }> {
  const extracted: Array<{ text: string; category?: ServerDecisionPoint["category"] }> = [];
  const decisionRegex =
    /(?:(?:Point\s*\d+\s*[:\-]\s*)|(?:faisla\s*hua|decide\s*kiya|final\s*hua|tay\s*paya|hogi|hoga|karein\s*ge|rakhna\s*hai|complete\s*ho\s*chuka|fix\s*kar\s*diya|setup\s*barkarar|use\s*hogi|implement\s*karna\s*hai|rule\s*set))\s*[:\-]?\s*([^.!\n]{12,120})/gi;

  for (let i = startIndex; i < turns.length; i++) {
    const turn = turns[i];
    if (!turn || !turn.content) continue;

    // Check for explicit bullet point outputs first
    const lines = turn.content.split("\n");
    let hasExplicitPoint = false;
    for (const line of lines) {
      const pointMatch = line.match(/(?:^|.*?\b)Point\s*\d+\s*[:\-]\s*(.+)/i);
      if (pointMatch && pointMatch[1]) {
        const cleaned = pointMatch[1].trim();
        if (
          cleaned.length >= 8 &&
          !extracted.some((e) => e.text.toLowerCase() === cleaned.toLowerCase())
        ) {
          extracted.push({ text: cleaned, category: "decision" });
          hasExplicitPoint = true;
        }
      }
    }

    if (hasExplicitPoint) {
      continue;
    }

    // Pattern match decisions mentioned in conversation
    let match: RegExpExecArray | null;
    while ((match = decisionRegex.exec(turn.content)) !== null) {
      const snippet = match[1]?.trim();
      if (
        snippet &&
        snippet.length >= 12 &&
        snippet.length <= 140 &&
        !extracted.some((e) => e.text.toLowerCase().includes(snippet.toLowerCase()))
      ) {
        const cleaned = snippet.replace(/^["'\s]+|["'\s]+$/g, "");
        extracted.push({ text: cleaned, category: "decision" });
      }
    }
  }

  return extracted;
}

export function recordServerTurnAndExtract(
  sessionId: string,
  turn: { role: string; content: string },
  allHistory: Array<{ role: string; content: string }>,
  interval: number = 5,
): { ledger: ServerSessionLedgerData; extractedPoints: ServerDecisionPoint[] } {
  const ledger = getServerSessionLedger(sessionId);
  const newTurnCount = ledger.turnCount + 1;
  const newExtractedPoints: ServerDecisionPoint[] = [];

  const shouldExtract = newTurnCount - ledger.lastExtractedTurn >= interval;

  if (shouldExtract) {
    const candidates = extractServerDecisionsFromTurns(
      allHistory,
      Math.max(0, ledger.lastExtractedTurn),
    );
    for (const cand of candidates) {
      const added = addServerDecisionPoint(sessionId, cand.text, {
        category: cand.category,
        turnIndex: newTurnCount,
      });
      newExtractedPoints.push(added);
    }

    const updatedLedger = getServerSessionLedger(sessionId);
    updatedLedger.turnCount = newTurnCount;
    updatedLedger.lastExtractedTurn = newTurnCount;
    saveServerSessionLedger(sessionId, updatedLedger);

    return { ledger: updatedLedger, extractedPoints: newExtractedPoints };
  }

  ledger.turnCount = newTurnCount;
  saveServerSessionLedger(sessionId, ledger);
  return { ledger, extractedPoints: [] };
}
