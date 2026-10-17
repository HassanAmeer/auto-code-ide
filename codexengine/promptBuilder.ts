import { scanWorkspace } from "./workspaceScanner.ts";
import { inspectRelevantFiles } from "./fileInspector.ts";
import { getThreadHistory, type ChatMessage } from "./contextMemory.ts";

export interface PreparedTurnContext {
  readonly systemPrompt: string;
  readonly fullUserPrompt: string;
  readonly conversationMessages: ChatMessage[];
  readonly scannedFiles: string[];
  readonly defaultTargetFile?: string | undefined;
}

/**
 * Builds the complete prompt package for an LLM turn:
 * 1. Scans project workspace directory.
 * 2. Reads relevant existing files to prevent hallucination.
 * 3. Pulls token-pruned persistent history to prevent forgetting.
 * 4. Provides clear instructions on targeted diffs and full file generation.
 */
export function buildTurnContext(params: {
  workspaceRoot: string;
  userPrompt: string;
  threadKey: string;
}): PreparedTurnContext {
  const { workspaceRoot, userPrompt, threadKey } = params;

  // 1. Scan workspace
  const scan = scanWorkspace(workspaceRoot, { maxDepth: 4, maxFiles: 100 });

  // 2. Inspect relevant files
  const inspection = inspectRelevantFiles(workspaceRoot, userPrompt, scan.fileList, {
    maxFilesToRead: 3,
    maxLinesPerFile: 250,
  });

  const defaultTargetFile = inspection.files[0]?.path;

  // 3. Build System Instructions
  const systemPrompt = `You are AutoCode (AC) AI Developer — an expert autonomous coding assistant.
Project Workspace Directory: ${workspaceRoot}
Detected Project Type: ${scan.projectType}

[CURRENT PROJECT WORKSPACE TREE]
${scan.treeText}

${inspection.contextText ? `${inspection.contextText}\n\n` : ""}[FILE MODIFICATION RULES - READ CAREFULLY]
1. PREFER SEARCH/REPLACE BLOCKS for updating existing files instead of rewriting the entire file:
<<<<<<< SEARCH [relative/path/to/file.ext]
// exact original lines to replace
=======
// new replacement lines
>>>>>>> REPLACE

2. FOR NEW FILES OR FULL REWRITES, always specify the relative filepath in the code block header or first line:
\`\`\`<language> filepath=<relative/path/to/file.ext>
...content...
\`\`\`
or for HTML:
\`\`\`html
<!-- filepath: index.html -->
...content...
\`\`\`

3. CRITICAL:
- Never hallucinate non-existent files when editing an existing feature; check the workspace tree above.
- Always provide production-ready code with no placeholders or ellipses (...).
- All changes are automatically parsed and saved directly into the project directory on disk.`;

  // 4. Retrieve pruned, persistent conversation history
  const history = getThreadHistory(threadKey, { maxTurns: 10 });

  // Free/open models on OpenRouter often reject the "system" role (returning HTTP 400).
  // Embed system prompt into user message to guarantee 100% compatibility across all models.
  const fullUserPrompt = `${systemPrompt}\n\n[User Request]:\n${userPrompt.trim() || "Hello"}`;

  const candidateMessages: ChatMessage[] = [
    ...history,
    { role: "user" as const, content: fullUserPrompt },
  ];

  // Sanitize for OpenAI compatibility:
  // - filter empty content
  // - collapse contiguous same-role messages
  const conversationMessages: ChatMessage[] = [];
  for (const msg of candidateMessages) {
    const content = msg.content?.trim();
    if (!content) continue;

    const prev = conversationMessages[conversationMessages.length - 1];
    if (prev && prev.role === msg.role) {
      prev.content += `\n\n${content}`;
    } else {
      conversationMessages.push({ role: msg.role, content });
    }
  }

  if (conversationMessages.length === 0 || conversationMessages[0]!.role === "assistant") {
    conversationMessages.unshift({ role: "user", content: "Hello" });
  }

  return {
    systemPrompt,
    fullUserPrompt,
    conversationMessages,
    scannedFiles: scan.fileList,
    defaultTargetFile,
  };
}
