# OpenCode Full Engine (`opencode-full-engine`)

> **[STANDALONE FULL ENGINE]**
> Yeh folder OpenCode ka **Original OpenCode Full Engine** hai jo seedha upstream open-source repo (`sst/opencode/packages/core`) se extract kiya gaya hai.
> Iske liye kisi bahar ki CLI ya external binary download karne ki zaroorat nahi hai.

---

### Core Full Engine Capabilities:

1. **Tool Execution (`tool/`, `tool.ts`):**
   - Surgical file edits & replacements (`tool/plugin/edit.ts`).
   - Project file read & write (`read.ts`, `write.ts`).
   - Ripgrep file searching & pattern matching (`grep.ts`, `glob.ts`).
   - PTY / Terminal bash command executions (`shell.ts`).
2. **Session & Agent Loop (`session/`, `session.ts`):**
   - Multi-turn conversation prompt orchestration.
   - Token limit compaction (`compaction.ts`).
   - Project history & context memory (`history.ts`, `context.ts`).
   - Diff generation & staging (`diff.ts`, `tool/plugin/file-diff.ts`).
3. **Filesystem & Git (`filesystem/`, `git.ts`):**
   - Live location watcher & mutation ledger.
   - Git status, branch tracking, and worktrees.
