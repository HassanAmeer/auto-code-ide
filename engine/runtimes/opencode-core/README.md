# OpenCode Full Engine Core (`opencode-core`)

> **[STANDALONE ENGINE]**
> Yeh folder OpenCode ka **Original Full TypeScript Engine** hai jo seedha upstream open-source repo (`sst/opencode/packages/core`) se extract kiya gaya hai.
> Iske liye kisi bahar ki CLI ya external binary download karne ki zaroorat nahi hai.

---

### Core Engine Capabilities:

1. **Tool Execution (`tool/`, `tool.ts`):**
   - Surgical file edits & replacements.
   - Project file read & write.
   - Ripgrep file searching & pattern matching.
   - PTY / Terminal bash command executions.
2. **Session & Agent Loop (`session/`, `session.ts`):**
   - Multi-turn conversation prompt orchestration.
   - Token limit compaction (`compaction.ts`).
   - Project history & context memory (`history.ts`, `context.ts`).
   - Diff generation & staging (`diff.ts`).
3. **Filesystem & Git (`filesystem/`, `git.ts`):**
   - Live location watcher & mutation ledger.
   - Git status, branch tracking, and worktrees.
