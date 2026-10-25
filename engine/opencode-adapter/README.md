# OpenCode CLI Adapter (`opencode-adapter`)

> **[IMPORTANT] - External CLI Requirement**
> Yeh folder **OpenCode External Adapter** hai. Yeh khud standalone engine nahi hai balki ek bridge/controller hai.
> Isko chalane ke liye system me **OpenCode CLI** (`opencode serve`) ka installed aur setup hona zaroori hai.

---

### Key Details & Architecture:

- **Role:** Protocol Adapter & Driver for OpenCode CLI.
- **Dependency:** Requires external binary `opencode` (e.g. `/usr/local/bin/opencode` or `npm install -g opencode-ai`).
- **Connection:** AutoCode connects to local `opencode serve` process over HTTP REST & Server-Sent Events (SSE).
- **Functions Handled:**
  - Session creation & directory binding.
  - Project instruction and rules injection (`.autocode/rules.md`).
  - Model switching and request serialization.
  - Parsing streaming event chunks back to AutoCode UI.

Agar external OpenCode CLI server par installed na ho ya use na karni ho, to direct **`engine/opencode-full-engine`** use karein jo self-contained engine hai.
