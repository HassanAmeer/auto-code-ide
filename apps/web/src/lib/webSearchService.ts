/**
 * Web Search & TinyFish Engine Service
 *
 * Provides real-time internet search and stealth Chromium web URL content
 * extraction for AI models running in T3 Code.
 */

export interface TinyFishConfig {
  enabled: boolean;
  apiKey: string;
  searchEndpoint: string;
  fetchEndpoint: string;
  searchRpm: number;
  searchRph: number;
  fetchRpm: number;
  fetchRpd: number;
}

export const DEFAULT_TINYFISH_CONFIG: TinyFishConfig = {
  enabled: true, // Default ON as requested
  apiKey: "",
  searchEndpoint: "https://api.search.tinyfish.ai",
  fetchEndpoint: "https://api.fetch.tinyfish.ai",
  searchRpm: 30,
  searchRph: 500,
  fetchRpm: 150,
  fetchRpd: 1000,
};

import { saveServerSetting } from "./serverSettingsSync";

const TINYFISH_STORAGE_KEY = "t3_tinyfish_config_v1";
const COMPOSER_WEB_SEARCH_KEY = "t3_composer_web_search_enabled";

export function getTinyFishConfig(): TinyFishConfig {
  if (typeof window === "undefined") return DEFAULT_TINYFISH_CONFIG;
  try {
    const raw = localStorage.getItem(TINYFISH_STORAGE_KEY);
    if (!raw) return DEFAULT_TINYFISH_CONFIG;
    return { ...DEFAULT_TINYFISH_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_TINYFISH_CONFIG;
  }
}

export function saveTinyFishConfig(config: TinyFishConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TINYFISH_STORAGE_KEY, JSON.stringify(config));
    window.dispatchEvent(new CustomEvent("t3_tinyfish_config_updated", { detail: config }));
    void saveServerSetting(TINYFISH_STORAGE_KEY, config);
  } catch (error) {
    console.error("Failed to save TinyFish config:", error);
  }
}

export function isComposerWebSearchEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(COMPOSER_WEB_SEARCH_KEY);
    if (raw === null) return false; // Default OFF so web search does not intercept regular chat or continue
    return raw === "true";
  } catch {
    return false;
  }
}

export function setComposerWebSearchEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(COMPOSER_WEB_SEARCH_KEY, String(enabled));
    void saveServerSetting(COMPOSER_WEB_SEARCH_KEY, enabled);
  } catch (error) {
    console.error("Failed to save composer web search state:", error);
  }
}

export interface WebSearchResultItem {
  title: string;
  snippet: string;
  url: string;
}

/**
 * Execute TinyFish live search query
 */
export async function searchTinyFish(
  query: string,
  apiKey?: string,
): Promise<{ success: boolean; results: WebSearchResultItem[]; error?: string }> {
  const key = apiKey || getTinyFishConfig().apiKey;
  const endpoint = getTinyFishConfig().searchEndpoint || "https://api.search.tinyfish.ai";

  if (!key) {
    return {
      success: false,
      results: [],
      error: "TinyFish API key is missing. Add your free key in Settings → Integrations.",
    };
  }

  try {
    const url = new URL(endpoint);
    url.searchParams.set("query", query);

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "X-API-Key": key,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        success: false,
        results: [],
        error: `TinyFish Search HTTP ${res.status}: ${errText || res.statusText}`,
      };
    }

    const data = await res.json();
    const rawList = Array.isArray(data) ? data : data.results || data.items || [];
    const results: WebSearchResultItem[] = rawList.slice(0, 5).map((item: any) => ({
      title: item.title || item.name || query,
      snippet: item.snippet || item.description || item.text || "",
      url: item.url || item.link || "",
    }));

    return { success: true, results };
  } catch (err: unknown) {
    return {
      success: false,
      results: [],
      error: err instanceof Error ? err.message : "TinyFish search network error",
    };
  }
}

/**
 * Extract web URL content using TinyFish Fetch API (Stealth Chromium browser)
 */
export async function fetchTinyFishUrl(
  targetUrl: string,
  apiKey?: string,
): Promise<{ success: boolean; title?: string; text?: string; error?: string }> {
  const key = apiKey || getTinyFishConfig().apiKey;
  const endpoint = getTinyFishConfig().fetchEndpoint || "https://api.fetch.tinyfish.ai";

  if (!key) {
    // Graceful fallback to Jina reader if no TinyFish key
    try {
      const jinaRes = await fetch(`https://r.jina.ai/${targetUrl}`, {
        headers: { Accept: "text/markdown, text/plain" },
      });
      if (jinaRes.ok) {
        const text = await jinaRes.text();
        return {
          success: true,
          title: targetUrl,
          text: text.slice(0, 10000),
        };
      }
    } catch {
      // Fall through
    }

    return {
      success: false,
      error: "TinyFish API key required for full stealth Chromium extraction.",
    };
  }

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": key,
      },
      body: JSON.stringify({
        urls: [targetUrl],
        format: "markdown",
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        success: false,
        error: `TinyFish Fetch HTTP ${res.status}: ${errText || res.statusText}`,
      };
    }

    const data = await res.json();
    const firstResult = data.results?.[0];
    if (firstResult) {
      return {
        success: true,
        title: firstResult.title || targetUrl,
        text: (firstResult.text || firstResult.markdown || "").slice(0, 12000),
      };
    }

    return { success: false, error: "No content returned from URL." };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "TinyFish fetch network error",
    };
  }
}

/**
 * Universal live search / extraction runner
 * Resolves live data based on TinyFish and Web Research configs.
 */
export async function performLiveWebSearchOrFetch(promptText: string): Promise<string | null> {
  if (!promptText || !promptText.trim()) return null;

  const trimmed = promptText.trim();
  const lower = trimmed.toLowerCase();

  // Guard against conversational, workflow, control, or continuation commands
  const NON_SEARCH_COMMANDS = new Set([
    "continue",
    "next",
    "go on",
    "proceed",
    "more",
    "retry",
    "ok",
    "okay",
    "yes",
    "no",
    "y",
    "n",
    "run",
    "start",
    "stop",
    "done",
    "thanks",
    "thank you",
    "shukriya",
    "help",
    "hi",
    "hello",
    "hey",
  ]);

  if (NON_SEARCH_COMMANDS.has(lower)) {
    return null;
  }

  // If prompt is very short (<= 2 words) without question mark or url, do not trigger web search
  if (trimmed.split(/\s+/).length <= 2 && !trimmed.includes("?") && !trimmed.startsWith("http")) {
    return null;
  }

  const tinyfish = getTinyFishConfig();

  // 1. Detect if the prompt contains a direct web URL
  const urlMatch = promptText.match(/https?:\/\/[^\s]+/i);
  if (urlMatch) {
    const targetUrl = urlMatch[0];
    const fetchResult = await fetchTinyFishUrl(targetUrl, tinyfish.apiKey);
    if (fetchResult.success && fetchResult.text) {
      return `[Live Webpage Content via TinyFish: ${targetUrl}]\nTitle: ${fetchResult.title || targetUrl}\n\n${fetchResult.text}`;
    }
  }

  // 2. Query TinyFish Search if enabled and API key is present
  if (tinyfish.enabled && tinyfish.apiKey) {
    const searchRes = await searchTinyFish(promptText.trim(), tinyfish.apiKey);
    if (searchRes.success && searchRes.results.length > 0) {
      const items = searchRes.results
        .map((r, i) => `${i + 1}. **${r.title}**\n   URL: ${r.url}\n   Summary: ${r.snippet}`)
        .join("\n\n");
      return `[Live Web Search Results via TinyFish]\nQuery: "${promptText.trim()}"\n\n${items}`;
    }
  }

  // 3. Fallback live market & knowledge grounders (Crypto, USD/PKR, Wikipedia, DuckDuckGo)
  const q = promptText.toLowerCase();

  // Crypto / Coin rates
  if (
    q.includes("bitcoin") ||
    q.includes("btc") ||
    q.includes("crypto") ||
    q.includes("ethereum") ||
    q.includes("solana")
  ) {
    try {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd,pkr,eur",
      );
      if (res.ok) {
        const data = await res.json();
        return `[Live Market Intelligence via CoinGecko]\nTimestamp: ${new Date().toISOString()}\n- Bitcoin (BTC): $${data.bitcoin?.usd?.toLocaleString() ?? "N/A"} USD (PKR ${data.bitcoin?.pkr?.toLocaleString() ?? "N/A"})\n- Ethereum (ETH): $${data.ethereum?.usd?.toLocaleString() ?? "N/A"} USD\n- Solana (SOL): $${data.solana?.usd?.toLocaleString() ?? "N/A"} USD`;
      }
    } catch {
      // Fall through
    }
  }

  // DuckDuckGo instant answer
  try {
    const ddgRes = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(promptText.trim())}&format=json`,
    );
    if (ddgRes.ok) {
      const data = await ddgRes.json();
      if (data.AbstractText) {
        return `[Live Web Knowledge via DuckDuckGo]\nQuery: "${promptText.trim()}"\n\n**${data.Heading || "Answer"}**\n${data.AbstractText}\nSource: ${data.AbstractURL || "DuckDuckGo"}`;
      }
    }
  } catch {
    // Fall through
  }

  // Wikipedia search
  try {
    const wikiRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(
        promptText.trim(),
      )}&limit=3&namespace=0&format=json&origin=*`,
    );
    if (wikiRes.ok) {
      const wikiData = await wikiRes.json();
      const titles = wikiData[1] as string[];
      const snippets = wikiData[2] as string[];
      const urls = wikiData[3] as string[];

      if (titles && titles.length > 0 && snippets[0]) {
        const list = titles
          .slice(0, 3)
          .map((title, i) => `${i + 1}. **${title}**: ${snippets[i]} (${urls[i]})`)
          .join("\n");
        return `[Live Web Knowledge via Wikipedia]\nQuery: "${promptText.trim()}"\n\n${list}`;
      }
    }
  } catch {
    // Fall through
  }

  return null;
}
