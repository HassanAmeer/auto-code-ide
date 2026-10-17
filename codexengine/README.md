# ⚡ CodexEngine (Autonomous Coding Engine for AutoCode Web)

> **Lightweight, Zero-Login, Universal Autonomous Coding Engine** built directly into AutoCode (T3 Web).

---

## 📊 Size & Resource Footprint

| Metric                     | CodexEngine                                | External Codex CLI / Daemons           |
| :------------------------- | :----------------------------------------- | :------------------------------------- |
| **Disk Size (ROM)**        | **~64 KB (0.06 MB)**                       | 150 MB – 400 MB+                       |
| **RAM Usage**              | **0 MB Extra Daemon** (~2-5 MB in-process) | 300 MB – 800 MB+                       |
| **Execution Latency**      | **2 – 5 ms** (Instant)                     | 200 – 1,000 ms (IPC / Socket overhead) |
| **External Dependencies**  | **0** (Native Node.js built-ins)           | Python, Rust, or heavy binaries        |
| **Authentication / Login** | **Zero Login Required**                    | Mandatory OpenAI / Vendor login        |

---

## 🛠️ What CodexEngine Manages (Features & Capabilities)

### 1. 📁 Workspace Tree Scanner (`workspaceScanner.ts`)

- **Auto-Discovery**: Har turn par project ki directory ko scan karta hai aur project ka type pehchanta hai (Next.js, React, Vite, Python, HTML/JS).
- **Smart Filtering**: `node_modules`, `.git`, `.next`, `dist`, `.cache`, aur binary files ko automatically ignore karta hai.
- **Hallucination Prevention**: Model ko real ASCII project tree dikhata hai taake model andhay dhund galat ya farzi files na banaye.

### 2. 🔍 Relevant File Inspector (`fileInspector.ts`)

- **Smart Prompt Analysis**: User ke prompt me se file names ya feature keywords (maslan _"Navbar"_, _"Button"_, _"App.tsx"_, _"login page"_) detect karta hai.
- **On-Demand Code Loading**: Relevant files ka asli mojooda code prompt me load karta hai taake model ko edit karne se pehle real context pata ho.

### 3. 🎯 Targeted SEARCH / REPLACE Patch Engine (`patchEngine.ts`)

- **Diff-Based Editing**: Model ko `<<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE` format me sirf zaroori lines modify karne ki hidayat deta hai.
- **No Full Rewrites**: 500-1000 lines ki file ko dobara poora likhne ke bajaye sirf 5-10 targeted lines update hoti hain (tokens aur waqt dono bachtay hain).
- **Full File Generation**: Nayi files ke liye `filepath=...`, `// filepath: ...`, ya `<!-- filepath: ... -->` headers ko detect karke automatic disk par create karta hai.
- **Bug Fix**: Purana hardcoded hack jo har code ko `game.js` ya `index.html` bana deta tha, wo completely khatam kar diya gaya hai.

### 4. 🧠 Persistent Conversation Memory & Token Pruner (`contextMemory.ts`)

- **Disk Persistence**: Thread history RAM ke bajaye disk par save hoti hai (`~/.autocode/userdata/codexengine-thread-history.json`). VPS ya server restart hone par bhi chat history mehfooz rehti hai.
- **Smart Token Pruning**: Purane assistant turns me se baray code blocks ko compress/summarize kar deta hai jabke user instructions aur decisions ko 100% intact rakhta hai. Is se model **20-30 turns baad bhi context nahi bhoolta** aur API token window kabhi overflow nahi hoti.

### 5. 🌐 100% Model & Provider Agnostic (`promptBuilder.ts`)

- **Zero Login**: Kisi proprietary login ya vendor key ki pabandi nahi.
- **Supported Providers**:
  - OpenRouter (Free & Paid models)
  - CheapRouter / Antseed / Local Ollama / vLLM
  - OpenAI, Claude, DeepSeek, GLM, Qwen, Meta Llama
- **Role Sanitization**: Open-source models jo strict "system" role par HTTP 400 error dete hain, unke liye prompt ko auto-sanitize aur OpenAI format compatible banata hai.

### 6. 📋 Live Workspace Updates Summary

- Har turn ke aakhir me chat me clean visual summary dikhata hai:
  - ✏️ **Modified (Diff Patch)**: `src/App.tsx`
  - 📄 **Created / Saved**: `src/components/NewFeature.tsx`

---

## 📂 Directory Structure

```text
codexengine/
├── workspaceScanner.ts   # Project tree & directory explorer
├── fileInspector.ts      # Context analyzer & relevant file reader
├── patchEngine.ts        # SEARCH/REPLACE diff patcher & file writer
├── contextMemory.ts      # Persistent storage & token pruning engine
├── promptBuilder.ts      # Multi-turn prompt composer & sanitizer
├── index.ts              # Unified public API
├── codexengine.test.ts   # Vitest unit test suite (6/6 passing)
└── README.md             # Engine documentation & feature guide
```
