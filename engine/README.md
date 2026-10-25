# AutoCode Engine Architecture (`/engine/`)

```text
/engine/
├── adapters/
│   ├── opencode-adapter/       <-- (Bahar ki OpenCode CLI ke sath connect karne ke liye)
│   └── others.ts               <-- (Cursor, Claude Code, aur third-party CLIs ke liye)
├── runtimes/
│   └── opencode-full-engine/   <-- (OpenCode Full Engine: Tools + Diffs + Session + Git)
├── index.ts                    <-- (Unified Registry & Switcher)
└── README.md
```

---

### Folder Overview & Roles:

1. **`adapters/`**:
   - **`opencode-adapter/`**: OpenCode CLI (`opencode serve`) ke sath connect karne wala adapter folder.
   - **`others.ts`**: Cursor, Claude Code, aur external ACP agents ke sath connect karne ke liye.

2. **`runtimes/`**:
   - **`opencode-full-engine/`**: OpenCode ka **original standalone full engine** (`sst/opencode/packages/core`). Isme tool execution, AST file edits, unified diffs, session compaction, aur git operations sab shamil hain. Iske liye bahar ki kisi CLI ya binary ki zaroorat nahi hai.

3. **`index.ts`**:
   - Unified Engine Registry jahan se application runtime par `opencode-full-engine`, `opencode-adapter`, ya `others` ke darmiyan switch kar sakti hai.
