// @effect-diagnostics globalDate:off globalConsole:off
/**
 * Smart Multi-Key Auto-Rotation with Quota-Only Failover (Inspired by Digi-Labs)
 *
 * Supports GEMINI_API_KEY_1 through GEMINI_API_KEY_5 (or array/comma-separated keys).
 *
 * GOLDEN RULE:
 * 1. Only HTTP 429 / RESOURCE_EXHAUSTED / Rate Limit / Quota Exceeded rotates to the next key.
 * 2. 400 Bad Request, syntax errors, 401, or general errors DO NOT rotate keys (prevents burning healthy keys).
 * 3. Expands daily free quota by 5x with zero call disruption.
 */

export interface GeminiKeyStatus {
  key: string;
  maskedKey: string;
  index: number;
  exhaustedUntil: number | null; // Cooldown timestamp
  failureCount: number;
  successCount: number;
}

export class SmartGeminiKeyRotator {
  private keys: string[] = [];
  private currentIndex = 0;
  private keyStatuses: Map<string, GeminiKeyStatus> = new Map();
  private cooldownMs = 60 * 1000; // 1-minute cooldown before retrying an exhausted key

  constructor(customKeys?: string[]) {
    if (customKeys && customKeys.length > 0) {
      this.setKeys(customKeys);
    } else {
      this.refreshKeys();
    }
  }

  public setKeys(newKeys: string[]): void {
    const unique = newKeys.map((k) => k.trim()).filter(Boolean);
    this.keys = Array.from(new Set(unique));
    this.initStatuses();
  }

  public refreshKeys(): void {
    const gathered: string[] = [];

    // 1. Explicit numbered keys GEMINI_API_KEY_1 to GEMINI_API_KEY_5
    for (let i = 1; i <= 5; i++) {
      const val = process.env[`GEMINI_API_KEY_${i}`];
      if (val && val.trim() && !gathered.includes(val.trim())) {
        gathered.push(val.trim());
      }
    }

    // 2. Comma or space separated keys GEMINI_API_KEYS
    if (process.env.GEMINI_API_KEYS) {
      const parts = process.env.GEMINI_API_KEYS.split(/[,;\s]+/)
        .map((k) => k.trim())
        .filter(Boolean);
      for (const p of parts) {
        if (!gathered.includes(p)) gathered.push(p);
      }
    }

    // 3. Standard fallback environment variables
    if (process.env.GEMINI_API_KEY && !gathered.includes(process.env.GEMINI_API_KEY.trim())) {
      gathered.push(process.env.GEMINI_API_KEY.trim());
    }
    if (process.env.GOOGLE_API_KEY && !gathered.includes(process.env.GOOGLE_API_KEY.trim())) {
      gathered.push(process.env.GOOGLE_API_KEY.trim());
    }

    this.keys = gathered;
    this.initStatuses();
  }

  private initStatuses(): void {
    for (let i = 0; i < this.keys.length; i++) {
      const k = this.keys[i]!;
      if (!this.keyStatuses.has(k)) {
        this.keyStatuses.set(k, {
          key: k,
          maskedKey: k.length > 8 ? `${k.slice(0, 4)}...${k.slice(-4)}` : "***",
          index: i + 1,
          exhaustedUntil: null,
          failureCount: 0,
          successCount: 0,
        });
      }
    }
  }

  public getKeysCount(): number {
    return this.keys.length;
  }

  public getAllKeys(): string[] {
    return [...this.keys];
  }

  public getActiveKey(): string | null {
    if (this.keys.length === 0) {
      this.refreshKeys();
    }
    if (this.keys.length === 0) return null;

    const now = Date.now();
    // Search for the next available, non-exhausted key starting at currentIndex
    for (let i = 0; i < this.keys.length; i++) {
      const idx = (this.currentIndex + i) % this.keys.length;
      const candidate = this.keys[idx]!;
      const status = this.keyStatuses.get(candidate);
      if (!status || !status.exhaustedUntil || status.exhaustedUntil <= now) {
        this.currentIndex = idx;
        return candidate;
      }
    }

    // Fallback if all keys are currently cooling down
    return this.keys[this.currentIndex] || null;
  }

  /**
   * GOLDEN RULE CHECK:
   * Only returns true if the error is genuinely a 429 quota/rate limit issue.
   * 400 Bad Request, syntax errors, 401, or 500 do NOT rotate keys.
   */
  public isQuotaExhausted(status: number, errorBody?: string | any): boolean {
    if (status === 429) return true;
    const text = typeof errorBody === "string" ? errorBody : JSON.stringify(errorBody || "");
    const lower = text.toLowerCase();
    return (
      lower.includes("resource_exhausted") ||
      lower.includes("quota exceeded") ||
      lower.includes("rate limit") ||
      lower.includes("rate_limit") ||
      lower.includes("free_tier_exceeded") ||
      lower.includes("quota_exceeded")
    );
  }

  /**
   * Advance to the next key when a 429 occurs
   */
  public markQuotaExhausted(key: string): string | null {
    const status = this.keyStatuses.get(key);
    if (status) {
      status.exhaustedUntil = Date.now() + this.cooldownMs;
      status.failureCount++;
      console.warn(
        `[GeminiKeyRotator] Key #${status.index} (${status.maskedKey}) exhausted quota (429). Rotating to next key...`,
      );
    }

    if (this.keys.length <= 1) return null;

    this.currentIndex = (this.currentIndex + 1) % this.keys.length;
    return this.getActiveKey();
  }

  public markSuccess(key: string): void {
    const status = this.keyStatuses.get(key);
    if (status) {
      status.exhaustedUntil = null;
      status.successCount++;
    }
  }

  public getStatusSummary(): {
    total: number;
    activeIndex: number;
    keys: Array<{ index: number; masked: string; active: boolean; available: boolean }>;
  } {
    const now = Date.now();
    return {
      total: this.keys.length,
      activeIndex: this.currentIndex + 1,
      keys: this.keys.map((k, idx) => {
        const s = this.keyStatuses.get(k);
        const isCooling = Boolean(s?.exhaustedUntil && s.exhaustedUntil > now);
        return {
          index: idx + 1,
          masked: s?.maskedKey || "***",
          active: idx === this.currentIndex,
          available: !isCooling,
        };
      }),
    };
  }

  /**
   * High-level execution wrapper with automatic Quota-Only Failover:
   * Executes a request callback with the active key.
   * If a 429/RESOURCE_EXHAUSTED occurs, it automatically advances to the next key and retries.
   * If any other error occurs (e.g. 400 Bad Request), it fails immediately without wasting keys.
   */
  public async executeWithRotation<T>(
    operation: (
      key: string,
      keyIndex: number,
    ) => Promise<{ status: number; data?: T; error?: any }>,
  ): Promise<{ ok: boolean; data?: T; error?: any; status: number; keysAttempted: number }> {
    if (this.keys.length === 0) {
      this.refreshKeys();
    }

    const availableCount = Math.max(1, this.keys.length);
    let attempts = 0;

    while (attempts < availableCount) {
      const activeKey = this.getActiveKey();
      if (!activeKey) {
        return {
          ok: false,
          status: 401,
          error: "No Gemini API keys configured. Set GEMINI_API_KEY_1 to GEMINI_API_KEY_5.",
          keysAttempted: attempts,
        };
      }

      attempts++;
      const currentIdx = this.currentIndex + 1;
      const res = await operation(activeKey, currentIdx);

      // Check Golden Rule:
      if (this.isQuotaExhausted(res.status, res.error)) {
        this.markQuotaExhausted(activeKey);
        // If there are more keys to try, loop continues to next key!
        if (attempts < availableCount) {
          continue;
        }
        return {
          ok: false,
          status: 429,
          error: "All configured Gemini API keys have exhausted their free rate quota.",
          keysAttempted: attempts,
        };
      }

      // Non-429 error (e.g. 400, 401, 500): Fail immediately WITHOUT rotating to other keys
      if (res.status >= 400 || !res.data) {
        return {
          ok: false,
          status: res.status,
          error: res.error || `HTTP ${res.status}`,
          keysAttempted: attempts,
        };
      }

      // Success!
      this.markSuccess(activeKey);
      return {
        ok: true,
        status: res.status,
        data: res.data,
        keysAttempted: attempts,
      };
    }

    return {
      ok: false,
      status: 429,
      error: "All Gemini API keys exhausted.",
      keysAttempted: attempts,
    };
  }
}

export const geminiKeyRotator = new SmartGeminiKeyRotator();
