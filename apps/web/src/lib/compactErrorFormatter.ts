/**
 * Utility to parse and format model errors into concise Cupertino-style summaries.
 */

export interface FormattedCompactError {
  readonly statusCode: string | null;
  readonly shortModel: string | null;
  readonly fullModel: string | null;
  readonly shortReason: string;
  readonly fullDetails: string;
  readonly isRetryOrModelError: boolean;
}

/**
 * Truncate long model names to 1-2 words + "..." (e.g., "claude-3.7...", "gpt-4o...").
 */
export function truncateModelName(modelName: string | null | undefined): string | null {
  if (!modelName) return null;
  let clean = modelName.trim();
  // Strip provider prefixes like "anthropic/", "openai/", "google/"
  if (clean.includes("/")) {
    clean = clean.split("/").pop() || clean;
  }
  // Strip common date/version stamps like "-20250219", "-20241022", "-preview"
  clean = clean.replace(/-\d{8}$/i, "");
  clean = clean.replace(/-preview$/i, "");
  clean = clean.replace(/-latest$/i, "");

  // Clean up version numbers like 3-7 to 3.7 or 3-5 to 3.5
  clean = clean.replace(/(\d+)-(\d+)/g, "$1.$2");

  // If still long, take first 1-2 words or truncate with ...
  const parts = clean.split(/[-_ ]+/).filter(Boolean);
  if (parts.length > 2) {
    const candidate = `${parts[0]}-${parts[1]}...`;
    return candidate.length > 15 ? `${candidate.slice(0, 13)}...` : candidate;
  }
  if (clean.length > 14) {
    return `${clean.slice(0, 12)}...`;
  }
  return clean;
}

/**
 * Parse any error string and extract status code, shortened model, and concise reason.
 */
export function parseErrorDetails(
  rawError: string | null | undefined,
  explicitModel?: string | null,
): FormattedCompactError {
  const text = (rawError || "").trim();

  // 1. Detect status code
  let statusCode: string | null = null;
  const statusMatch = text.match(/\b(400|401|402|403|404|408|409|422|429|500|502|503|504)\b/);
  if (statusMatch && statusMatch[1]) {
    statusCode = statusMatch[1];
  } else if (/timeout|timed out|stalled/i.test(text)) {
    statusCode = "Timeout";
  } else if (/rate limit/i.test(text)) {
    statusCode = "429";
  }

  // 2. Detect / truncate model name
  let detectedModel = explicitModel || null;
  if (!detectedModel) {
    const modelMatch = text.match(/(?:model|start|switched to)\s+([a-zA-Z0-9_\-\.\/]+)/i);
    if (
      modelMatch &&
      modelMatch[1] &&
      !/^(response|timed|stream|turn|a|the|failed|error)$/i.test(modelMatch[1])
    ) {
      detectedModel = modelMatch[1];
    }
  }
  const shortModel = truncateModelName(detectedModel);

  // 3. Detect short reason
  let shortReason = "Failed";
  if (/rate limit|too many requests/i.test(text) || statusCode === "429") {
    shortReason = "Rate limit";
  } else if (/timeout|timed out|stalled/i.test(text) || statusCode === "Timeout") {
    shortReason = "Stream timeout";
  } else if (/overloaded|503|service unavailable/i.test(text) || statusCode === "503") {
    shortReason = "Unavailable";
  } else if (/500|502|server error/i.test(text)) {
    shortReason = "Server error";
  } else if (/401|unauthorized|invalid api key/i.test(text)) {
    shortReason = "Auth error";
  } else if (/404|not found/i.test(text)) {
    shortReason = "Not found";
  } else if (/aborted|cancelled/i.test(text)) {
    shortReason = "Cancelled";
  } else if (/network|failed to fetch|connection/i.test(text)) {
    shortReason = "Network error";
  } else if (text) {
    // Take first 3-4 words (up to 24 chars)
    const words = text.split(/\s+/).slice(0, 4).join(" ");
    shortReason = words.length > 25 ? `${words.slice(0, 22)}...` : words;
  }

  const isRetryOrModelError = Boolean(
    statusCode || shortModel || /retry|rate limit|timeout|provider/i.test(text),
  );

  return {
    statusCode,
    shortModel,
    fullModel: detectedModel,
    shortReason,
    fullDetails: text,
    isRetryOrModelError,
  };
}
