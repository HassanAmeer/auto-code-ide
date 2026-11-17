import { useCallback, useState } from "react";

export interface ModelTestResult {
  readonly ok: boolean;
  readonly statusCode: number;
  readonly text: string;
  readonly testedAt: string;
}

interface CachedTestResult extends ModelTestResult {
  readonly key: string;
}

const STORAGE_KEY = "t3code.modelTestResults.v1";
const MAX_ENTRIES = 200;

function readCache(): Record<string, CachedTestResult> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, CachedTestResult>): void {
  if (typeof localStorage === "undefined") return;
  try {
    const entries = Object.values(cache).sort(
      (a, b) => Date.parse(b.testedAt) - Date.parse(a.testedAt),
    );
    const trimmed: Record<string, CachedTestResult> = {};
    for (const entry of entries.slice(0, MAX_ENTRIES)) trimmed[entry.key] = entry;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // storage full / disabled — results simply won't persist
  }
}

export function useModelTest() {
  const [results, setResults] = useState<Record<string, CachedTestResult>>(() => readCache());
  const [testing, setTesting] = useState<Record<string, boolean>>({});

  const testModel = useCallback(async (key: string, instanceId: string, model: string) => {
    setTesting((prev) => ({ ...prev, [key]: true }));
    let result: ModelTestResult;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45_000);
      let res: Response;
      try {
        res = await fetch("/api/models/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instanceId, model, message: "hy" }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
      const data = await res.json().catch(() => ({}));
      result = {
        ok: Boolean(data?.ok),
        statusCode: Number(data?.statusCode || (data?.ok ? 200 : 500)),
        text: String(data?.response || data?.error || "No response").slice(0, 2000),
        testedAt: String(data?.testedAt || new Date().toISOString()),
      };
    } catch (error: any) {
      result = {
        ok: false,
        statusCode: 500,
        text: String(error?.message || error || "Test failed").slice(0, 2000),
        testedAt: new Date().toISOString(),
      };
    }
    setTesting((prev) => ({ ...prev, [key]: false }));
    setResults((prev) => {
      const next = { ...prev, [key]: { ...result, key } };
      writeCache(next);
      return next;
    });
    return result;
  }, []);

  const getResult = useCallback(
    (key: string): ModelTestResult | undefined => results[key],
    [results],
  );
  const isTesting = useCallback((key: string): boolean => Boolean(testing[key]), [testing]);

  return { testModel, getResult, isTesting, results };
}
