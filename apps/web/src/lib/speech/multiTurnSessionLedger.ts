/**
 * Multi-Turn Session Ledger (Lambay Mashwaray ke liye Memory) 🧠
 *
 * Maintains a live "Decision Summary" throughout long voice call consultations.
 * Every 5-8 turns, key agreements, architectural choices, and decisions are
 * preserved in a structured bullet-point ledger (Point 1, Point 2, Point 3).
 *
 * If the user asks 1 hour later: "Acha humne shuru mein kya decide kiya tha?"
 * the agent instantly recalls and consults the bullet-point ledger.
 */

export interface SessionDecisionPoint {
  id: string;
  pointNumber: number;
  text: string;
  category?: "architecture" | "decision" | "action_item" | "preference" | "general";
  turnIndex: number;
  timestamp: number;
}

export interface SessionLedgerData {
  sessionId: string;
  turnCount: number;
  lastExtractedTurn: number;
  decisions: SessionDecisionPoint[];
  lastSummary?: string;
  updatedAt: number;
}

const STORAGE_PREFIX = "t3code:session-ledger:v1:";
const memoryCache = new Map<string, SessionLedgerData>();

function getStorageKey(sessionId: string): string {
  return `${STORAGE_PREFIX}${sessionId || "default"}`;
}

export function createEmptyLedger(sessionId: string): SessionLedgerData {
  return {
    sessionId: sessionId || "default",
    turnCount: 0,
    lastExtractedTurn: 0,
    decisions: [],
    updatedAt: Date.now(),
  };
}

export function loadSessionLedger(sessionId: string): SessionLedgerData {
  const targetId = sessionId || "default";
  if (typeof window === "undefined") {
    return memoryCache.get(targetId) || createEmptyLedger(targetId);
  }
  try {
    const raw = localStorage.getItem(getStorageKey(targetId));
    if (!raw) {
      const fallback = memoryCache.get(targetId) || createEmptyLedger(targetId);
      return fallback;
    }
    const parsed = JSON.parse(raw) as SessionLedgerData;
    if (parsed && Array.isArray(parsed.decisions)) {
      memoryCache.set(targetId, parsed);
      return parsed;
    }
    return createEmptyLedger(targetId);
  } catch (err) {
    console.warn("Failed to load session ledger:", err);
    return memoryCache.get(targetId) || createEmptyLedger(targetId);
  }
}

export function saveSessionLedger(sessionId: string, data: SessionLedgerData): void {
  const targetId = sessionId || "default";
  const updatedData: SessionLedgerData = {
    ...data,
    sessionId: targetId,
    updatedAt: Date.now(),
  };
  memoryCache.set(targetId, updatedData);

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(getStorageKey(targetId), JSON.stringify(updatedData));
      window.dispatchEvent(new CustomEvent("t3-session-ledger-changed", { detail: updatedData }));
    } catch (err) {
      console.warn("Failed to save session ledger to localStorage:", err);
    }
  }
}

export function subscribeSessionLedger(
  sessionId: string,
  callback: (data: SessionLedgerData) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<SessionLedgerData>;
    if (customEvent.detail && customEvent.detail.sessionId === (sessionId || "default")) {
      callback(customEvent.detail);
    }
  };
  window.addEventListener("t3-session-ledger-changed", handler);
  return () => window.removeEventListener("t3-session-ledger-changed", handler);
}

/**
 * Add a new structured decision point to the ledger.
 */
export function addDecisionPoint(
  sessionId: string,
  text: string,
  options?: {
    category?: SessionDecisionPoint["category"];
    turnIndex?: number;
  },
): SessionDecisionPoint {
  const ledger = loadSessionLedger(sessionId);
  const cleanText = text.replace(/^(Point\s*\d+\s*[:\-]\s*|\*|\-|\d+\.\s*)/i, "").trim();

  // Deduplicate identical or very similar decision points
  const existing = ledger.decisions.find(
    (d) => d.text.toLowerCase().trim() === cleanText.toLowerCase(),
  );
  if (existing) {
    return existing;
  }

  const nextNumber = ledger.decisions.length + 1;
  const newPoint: SessionDecisionPoint = {
    id: `dec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    pointNumber: nextNumber,
    text: cleanText,
    category: options?.category || "decision",
    turnIndex: options?.turnIndex ?? ledger.turnCount,
    timestamp: Date.now(),
  };

  const updatedDecisions = [...ledger.decisions, newPoint];
  const updatedLedger: SessionLedgerData = {
    ...ledger,
    decisions: updatedDecisions,
    lastSummary: formatLedgerAsBulletSummary({ ...ledger, decisions: updatedDecisions }),
    updatedAt: Date.now(),
  };

  saveSessionLedger(sessionId, updatedLedger);
  return newPoint;
}

/**
 * Clear the entire session ledger.
 */
export function clearSessionLedger(sessionId: string): void {
  const targetId = sessionId || "default";
  const empty = createEmptyLedger(targetId);
  saveSessionLedger(targetId, empty);
}

/**
 * Format the decisions in the standard bullet-point style:
 * Point 1: LiveKit VPS setup barkarar rakhna hai.
 * Point 2: Edge-TTS Asad Neural voice use hogi.
 * Point 3: Codebase review complete ho chuka hai.
 */
export function formatLedgerAsBulletSummary(ledger: SessionLedgerData): string {
  if (!ledger.decisions || ledger.decisions.length === 0) {
    return "Abhi tak is session mein koi specific faisla ya decision record nahi hua.";
  }
  return ledger.decisions.map((d, index) => `Point ${index + 1}: ${d.text}`).join("\n");
}

/**
 * Detects if user is asking about previous decisions, initial agreements, or a session summary.
 * e.g., "Acha humne shuru mein kya decide kiya tha?", "kya faisla hua tha?"
 */
export function isLedgerRecallQuery(text: string): boolean {
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

/**
 * Check if 5-8 turns have elapsed since the last decision extraction.
 */
export function shouldExtractDecisions(
  currentTurnCount: number,
  lastExtractedTurn: number,
  interval: number = 5,
): boolean {
  return currentTurnCount - lastExtractedTurn >= interval;
}

/**
 * Heuristic extractor to parse decisions, architectural choices, and commitments from dialogue.
 * Can be enriched with LLM extraction or used standalone.
 */
export function extractDecisionsFromTurns(
  turns: Array<{ role: "user" | "assistant"; text: string }>,
  startIndex: number = 0,
): Array<{ text: string; category?: SessionDecisionPoint["category"] }> {
  const extracted: Array<{ text: string; category?: SessionDecisionPoint["category"] }> = [];
  const decisionRegex =
    /(?:(?:Point\s*\d+\s*[:\-]\s*)|(?:faisla\s*hua|decide\s*kiya|final\s*hua|tay\s*paya|hogi|hoga|karein\s*ge|rakhna\s*hai|complete\s*ho\s*chuka|fix\s*kar\s*diya|setup\s*barkarar|use\s*hogi|implement\s*karna\s*hai|rule\s*set))\s*[:\-]?\s*([^.!\n]{12,120})/gi;

  for (let i = startIndex; i < turns.length; i++) {
    const turn = turns[i];
    if (!turn || !turn.text) continue;

    // Check for explicit bullet point outputs first
    const lines = turn.text.split("\n");
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
    while ((match = decisionRegex.exec(turn.text)) !== null) {
      const snippet = match[1]?.trim();
      if (
        snippet &&
        snippet.length >= 12 &&
        snippet.length <= 140 &&
        !extracted.some((e) => e.text.toLowerCase().includes(snippet.toLowerCase()))
      ) {
        // Clean up leading trailing quotes or filler
        const cleaned = snippet.replace(/^["'\s]+|["'\s]+$/g, "");
        extracted.push({ text: cleaned, category: "decision" });
      }
    }
  }

  return extracted;
}

/**
 * Increment the turn count for the session, and if 5-8 turns have passed,
 * trigger extraction of decisions.
 */
export function recordTurnAndCheckLedger(
  sessionId: string,
  turn: { role: "user" | "assistant"; text: string },
  allHistory: Array<{ role: "user" | "assistant"; text: string }>,
): { ledger: SessionLedgerData; extractedPoints: SessionDecisionPoint[] } {
  const ledger = loadSessionLedger(sessionId);
  const newTurnCount = ledger.turnCount + 1;
  const newExtractedPoints: SessionDecisionPoint[] = [];

  const shouldExtract = shouldExtractDecisions(newTurnCount, ledger.lastExtractedTurn, 5);

  if (shouldExtract) {
    const rawCandidates = extractDecisionsFromTurns(
      allHistory,
      Math.max(0, ledger.lastExtractedTurn),
    );
    for (const cand of rawCandidates) {
      const added = addDecisionPoint(sessionId, cand.text, {
        category: cand.category,
        turnIndex: newTurnCount,
      });
      newExtractedPoints.push(added);
    }

    const updatedLedger = loadSessionLedger(sessionId);
    updatedLedger.turnCount = newTurnCount;
    updatedLedger.lastExtractedTurn = newTurnCount;
    saveSessionLedger(sessionId, updatedLedger);

    return { ledger: updatedLedger, extractedPoints: newExtractedPoints };
  }

  ledger.turnCount = newTurnCount;
  saveSessionLedger(sessionId, ledger);
  return { ledger, extractedPoints: [] };
}
