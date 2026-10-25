# AutoCode Engine Architecture (`/engine/`)

```text
/engine/
├── adapters/
│   ├── opencode-adapter.ts     <-- (Agar kabhi bahar ki CLI se connect karna ho)
│   └── external-acp-adapter.ts <-- (Third-party Claude/Cursor CLI ke liye)
└── runtimes/
    └── opencode-full-engine/   <-- (OpenCode ka original full engine: Tools + Diffs + Session)
```

---

### Folder Overview & Roles:

1. **`runtimes/opencode-full-engine/`**:
   - OpenCode ka **original full engine** (`sst/opencode/packages/core`).
   - Isme tool execution (`tool/`), file editing & diffs, session memory (`session/`), compaction, git tracking, aur ripgrep search sab built-in shamil hain.
   - Iske liye bahar ki kisi CLI ya binary ki zaroorat nahi hai.

2. **`adapters/`**:
   - **`opencode-adapter.ts`**: Agar kal ko bahar ki OpenCode CLI (`opencode serve`) ke sath connect karna ho.
   - **`external-acp-adapter.ts`**: Third-party CLIs (Claude Code, Cursor ACP) ke sath connect karne ke liye.

3. **`index.ts`**:
   - Unified Engine Registry jahan se application runtime par engines ko identify aur use karti hai.
