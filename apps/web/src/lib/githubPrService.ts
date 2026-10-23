/**
 * Direct GitHub PR Reviewer Service (opencode pr)
 *
 * Inspects GitHub Pull Requests, analyzes diffs, audits security/performance,
 * and generates actionable code reviews.
 */

export function isGithubPrCommand(text: string): boolean {
  return /^\/pr(?:\s|$)/i.test(text.trim());
}

export function parseGithubPrCommand(text: string): { isPr: boolean; target?: string | undefined } {
  const trimmed = text.trim();
  const match = /^\/pr(?:\s+(.+))?$/i.exec(trimmed);
  if (!match) {
    return { isPr: false };
  }
  return {
    isPr: true,
    target: match[1]?.trim() || undefined,
  };
}

export function buildGithubPrReviewPrompt(target?: string): string {
  const prIdentifier = target && target.trim() ? target.trim() : "the latest pull request";

  return `[Direct GitHub PR Reviewer Agent (opencode pr)]
🎯 Target PR: ${prIdentifier}

Review Instructions:
1. If GitHub CLI \`gh\` is configured:
   - Run \`gh pr view ${prIdentifier} --json number,title,body,author,headRefName,baseRefName,files\` to get metadata.
   - Run \`gh pr diff ${prIdentifier}\` to inspect all code changes.
   If \`gh\` is not available, check the branch or git log with \`git log -n 5\` and \`git diff origin/main...HEAD\`.
2. Conduct a deep, professional code review focusing on:
   - 🎯 **Summary & Objectives:** What does this PR accomplish?
   - 🛡️ **Security Audit:** Vulnerabilities (SQL injection, XSS, credential leakage, authorization gaps).
   - ⚡ **Performance & Architecture:** Memory leaks, quadratic loops, unhandled edge cases, anti-patterns.
   - 🧪 **Testing & Regressions:** Missing unit tests, potential breaking changes to existing contracts.
   - 💡 **Actionable Improvements:** Specific line-level recommendations and constructive diff snippets.
3. Structure your review clearly in GitHub Markdown, using alerts for critical issues, KaTeX for formulas, and provide an executive summary in Roman Urdu.`;
}
