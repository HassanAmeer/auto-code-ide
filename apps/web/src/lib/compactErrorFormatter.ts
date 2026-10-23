/**
 * Utility to parse and format model errors into concise Cupertino-style summaries.
 */

export interface FormattedCompactError {
  readonly statusCode: string | null;
  readonly shortModel: string | null;
  readonly fullModel: string | null;
  readonly shortReason: string;
  readonly errorCategory: string;
  readonly recommendation: string;
  readonly singleLineDetail: string;
  readonly fullDetails: string;
  readonly isRetryOrModelError: boolean;
}

/**
 * Extract a concise, single-line error summary suitable for subtitles.
 */
export function extractSingleLineDetail(rawText: string | null | undefined): string {
  if (!rawText) return "An unexpected error occurred.";
  const firstNonEmpty =
    rawText
      .split("\n")
      .map((s) => s.trim())
      .find((s) => s.length > 0 && !s.startsWith("```")) || rawText;

  let clean = firstNonEmpty.trim();

  // If there's a repeated "provider — Bad gateway..." or colon-chain pattern, extract the most specific part
  const parts = clean.split(/(?::\s*|—\s*)/);
  if (parts.length > 2) {
    const lastPart = parts[parts.length - 1]?.trim();
    if (lastPart && lastPart.length > 8 && !/^(run|error|failed)$/i.test(lastPart)) {
      return lastPart;
    }
  }

  clean = clean.replace(/^(error:\s*)+/i, "");
  return clean;
}

/**
 * Truncate long model names to 1-2 words + "..." (e.g., "claude-3.7...", "gpt-4o...").
 */
export function truncateModelName(modelName: string | null | undefined): string | null {
  if (!modelName) return null;
  let clean = modelName.trim().replace(/^['"`]+|['"`]+$/g, "");
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
  const statusMatch = text.match(/\b(400|401|402|403|404|408|409|413|422|429|500|502|503|504)\b/);
  if (statusMatch && statusMatch[1]) {
    statusCode = statusMatch[1];
  } else if (
    /user not found|unauthorized|invalid (?:api\s*)?key|bad credentials|authentication failed/i.test(
      text,
    )
  ) {
    statusCode = "401";
  } else if (/out of (?:antseed\s*)?credits|insufficient funds|payment required/i.test(text)) {
    statusCode = "402";
  } else if (/access forbidden|permission denied|forbidden/i.test(text)) {
    statusCode = "403";
  } else if (/model not found|resource not found|no such model/i.test(text)) {
    statusCode = "404";
  } else if (/timeout|timed out|stalled|took too long/i.test(text)) {
    statusCode = "408";
  } else if (/rate limit|too many requests|quota (?:exhausted|exceeded)/i.test(text)) {
    statusCode = "429";
  } else if (
    /circuit breaker|upstream unavailable|temporarily unavailable|overloaded/i.test(text)
  ) {
    statusCode = "503";
  } else if (/bad gateway/i.test(text)) {
    statusCode = "502";
  } else if (/gateway timeout/i.test(text)) {
    statusCode = "504";
  } else if (
    /protocol error|internal server error|unexpected server error|failed to start run/i.test(text)
  ) {
    statusCode = "500";
  }

  // 2. Detect / truncate model name
  let detectedModel = explicitModel || null;
  if (!detectedModel) {
    const quotedMatch = text.match(/(?:model|on model)\s+['"`]([^'"`]+)['"`]/i);
    if (quotedMatch && quotedMatch[1]) {
      detectedModel = quotedMatch[1].trim();
    } else {
      const modelMatch = text.match(/(?:model|start|switched to)\s+([a-zA-Z0-9_\-\.\/]+)/i);
      if (
        modelMatch &&
        modelMatch[1] &&
        !/^(response|timed|stream|turn|a|the|failed|error|run)$/i.test(modelMatch[1])
      ) {
        detectedModel = modelMatch[1];
      }
    }
  }
  const shortModel = truncateModelName(detectedModel);

  // 3. Detect category & short reason
  let errorCategory = "Provider Error";
  let shortReason = "Failed";
  let recommendation =
    "Verify your endpoint URL, model slug, and ensure the selected model is active.";

  if (statusCode === "401" || /401|unauthorized|user not found|invalid api key/i.test(text)) {
    errorCategory = "Authentication Error";
    shortReason = "Auth error";
    recommendation =
      "Provider rejected API key ('User not found' or unauthorized). Check that you are using a standard Chat API key rather than a Management key.";
  } else if (statusCode === "402" || /402|out of credits|insufficient/i.test(text)) {
    errorCategory = "Payment Required";
    shortReason = "Out of credits";
    recommendation =
      "You have exhausted your credits on this provider. Add funds or switch to a free model.";
  } else if (statusCode === "403" || /403|forbidden|permission/i.test(text)) {
    errorCategory = "Access Forbidden";
    shortReason = "Forbidden";
    recommendation =
      "Access was denied by the provider. Verify account permissions and region restrictions.";
  } else if (statusCode === "404" || /404|not found/i.test(text)) {
    errorCategory = "Model Not Found";
    shortReason = "Model not found";
    recommendation =
      "The selected model ID was not found on the upstream server. Verify the model slug in settings.";
  } else if (statusCode === "408" || /timeout|timed out|stalled/i.test(text)) {
    errorCategory = "Request Timeout";
    shortReason = "Timeout";
    recommendation =
      "Upstream server took too long to begin streaming. Retry or choose a faster model.";
  } else if (statusCode === "429" || /429|rate limit|too many requests/i.test(text)) {
    errorCategory = "Rate Limit Exceeded";
    shortReason = "Rate limited";
    recommendation =
      "Rate limit reached on this model. Please wait a few seconds or switch to another free model.";
  } else if (statusCode === "503" || /503|overloaded|circuit breaker|unavailable/i.test(text)) {
    errorCategory = "Service Unavailable";
    shortReason = "Provider busy";
    recommendation =
      "Upstream service is currently overloaded or circuit breaker tripped. Switch to 'auto' or retry shortly.";
  } else if (
    statusCode === "500" ||
    statusCode === "502" ||
    statusCode === "504" ||
    /protocol error|server error/i.test(text)
  ) {
    errorCategory = "Server Protocol Error";
    shortReason = "Server error";
    recommendation =
      "Internal protocol or provider communication error. Verify endpoint connection and model format.";
  } else if (/network|failed to fetch|connection/i.test(text)) {
    errorCategory = "Network Error";
    shortReason = "Network error";
    recommendation =
      "Could not connect to the remote host. Check internet connectivity and host IP reachability.";
  }

  const isRetryOrModelError = Boolean(
    statusCode || shortModel || /retry|rate limit|timeout|provider/i.test(text),
  );

  const singleLineDetail = extractSingleLineDetail(text);

  return {
    statusCode,
    shortModel,
    fullModel: detectedModel,
    shortReason,
    errorCategory,
    recommendation,
    singleLineDetail,
    fullDetails: text,
    isRetryOrModelError,
  };
}
