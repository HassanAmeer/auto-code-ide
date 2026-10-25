# AutoCode Multi-Engine Architecture (`/engine/`)

```text
/engine/
├── adapters/
│   ├── opencode-adapter.ts     <-- (Agar kabhi bahar ki CLI se connect karna ho)
│   └── external-acp-adapter.ts <-- (Third-party Claude/Cursor CLI ke liye)
└── runtimes/
    ├── opencode-core/          <-- (OpenCode ka original full TS engine: Tools + Session)
    └── native-engine/          <-- (Hamara apna direct Node.js tool runner)
```

---

### Folder Overview & Roles:

1. **`adapters/`**:
   - **`opencode-adapter.ts`**: Agar kal ko bahar ki OpenCode CLI (`opencode serve`) ke sath connect karna ho, to yeh adapter kaam karega.
   - **`external-acp-adapter.ts`**: Third-party CLIs (Claude Code, Cursor ACP) ke sath connect karne ke liye.

2. **`runtimes/`**:
   - **`opencode-core/`**: OpenCode ka original open-source TypeScript core engine (`sst/opencode/packages/core`). Isme tool calling, AST file mutation, session compaction, diff engine, aur context memory sab shamil hai. Iske liye bahar ki CLI ki need nahi hoti.
   - **`native-engine/`**: Hamara apna pure Node.js runtime (`fileTools.ts`, `diffEngine.ts`, `bashTool.ts`) jo zero-dependency ke sath seedha project files modify aur diff karta hai.

3. **`index.ts`**:
   - Unified Engine Switcher & Registry jahan se application runtime par engine switch kar sakti hai.
