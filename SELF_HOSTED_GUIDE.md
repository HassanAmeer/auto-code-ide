# T3 Code Web: Self-Hosted VPS Deployment & Operational Guide

This document describes how `pingdotgg/t3code` has been decoupled from Electron into a standalone, production-ready Web Application and containerized for single-user self-hosting on a VPS or cloud instance.

---

## 1. Architectural Overview & Web Decoupling

T3 Code's React frontend (`apps/web`) and backend server (`apps/server`) are built on an event-sourced architecture using Effect, WebSockets, and SQLite.

### What Was Decoupled:
1. **Single-Origin Asset Serving**:
   - The Node.js server (`apps/server`) serves the compiled React/Vite web application bundle directly from `dist/client/` using its built-in static asset router with SPA fallback (`handleStaticAndDevRequest`).
   - Every API request (`/api/*`), WebSocket connection (`/ws`), and OAuth/discovery endpoint (`/.well-known/*`) is multiplexed on the exact same HTTP/WS port (e.g. `3000`).
   - Browsers dynamically connect to `window.location.origin`, completely avoiding baked-in URLs or CORS issues.
2. **Native Electron Dialog Fallbacks**:
   - Replaced Electron's desktop folder picker (`window.desktopBridge.pickFolder`) in `apps/web/src/localApi.ts` with browser-compatible server path prompts and full remote filesystem browsing via WebSocket RPC (`filesystemEnvironment.browse`).
3. **Responsive Mobile & Desktop Viewports**:
   - The interface layout, themes (dark/light/custom), and split-view panels are preserved with full touch and viewport adaptation for mobile Safari/Chrome (iOS & Android) and desktop browsers.

---

## 2. Single-User Security & Authentication (`APP_PASSWORD`)

When deploying on a public VPS, the server must never expose open terminal or agent access to unauthorized visitors.

### How Single-User Auth Works:
1. You define `APP_PASSWORD` in `docker-compose.yml` or `.env`.
2. On startup, the server recognizes `APP_PASSWORD` via `DevAuthTokenConfig` and `resolveReusableDevAuth`.
3. It seeds a persistent administrative session into SQLite (`statev2.sqlite`) with full standard client (`AuthStandardClientScopes`) and administrative scopes (`AuthAdministrativeScopes`).
4. **Login Flows**:
   - **Form Login**: Visiting `http://<your-vps-ip>:3000` redirects unauthenticated users to `/pair`. Enter your `APP_PASSWORD` into the **Pairing token** box and click **Pair**. The server sets an HTTP-only session cookie (`t3_dev_session_<token>`) valid for 30 days.
   - **One-Click Link**: Open `http://<your-vps-ip>:3000/pair#token=YOUR_PASSWORD`. The web client extracts the token, submits the credential exchange, strips the token from the URL, and completes login instantly.
5. **Endpoint Protection**:
   - All REST routes (`/api/*`) and WebSocket upgrades (`/ws`) validate the session cookie or authorization token before processing. Unauthorized requests are rejected with `401 Unauthorized`.

---

## 3. Multi-Project & Workspace Management

- **Designated Root Directory**:
  - The container mounts `./projects:/workspace` and sets `T3CODE_PROJECTS_DIR=/workspace`.
- **Creating Projects**:
  - Open the Command Palette (`Ctrl+K` or `Cmd+K` / click the search/action bar) and choose **New Project**.
  - Type a name. The server claims `/workspace/<name>`, runs `git init`, and creates initial commits.
- **Opening Existing Directories**:
  - Choose **Add Project** -> **Local Folder** to interactively browse `/workspace` on the VPS filesystem directly from the browser.
- **Session & State Isolation**:
  - Each project maintains its own isolated threads, checkpoints, git diffs, and task history in the server SQLite database.

---

## 4. Custom AI Providers & Model Flexibility

T3 Code natively supports flexible provider instances and custom models:

### A. Supported Built-In Providers:
- **Claude Code** (`claudeAgent`)
- **Codex / ChatGPT** (`codex`)
- **OpenCode** (`opencode`)
- **Grok** (`grok`)
- **Cursor** (`cursor`)
- **Pi** (`pi`)
- **Antigravity** (`antigravity`)
- **ACP Registry** (`acpRegistry` - Agent Client Protocol)

### B. Custom OpenAI-Compatible Endpoints (OpenRouter, Ollama, DeepSeek, LiteLLM):
1. In the Web UI, open **Settings** (`/settings`) -> **Providers**.
2. Click **Add Provider Instance** and choose your provider (e.g., OpenCode, Claude, Codex, or ACP).
3. In the instance configuration:
   - Provide your **API Key** or auth token.
   - Set custom environment variables:
     - `OPENAI_BASE_URL` or `OPENAI_API_BASE` (e.g., `http://host.docker.internal:11434/v1` for Ollama, `https://openrouter.ai/api/v1` for OpenRouter, or `https://api.deepseek.com/v1`).
     - `ANTHROPIC_BASE_URL` (e.g., `https://openrouter.ai/api`).
4. **Dynamic Custom Models**:
   - Under **Custom Models**, click **Add Model**.
   - Enter your model ID (e.g. `openrouter/deepseek/deepseek-v4-flash`, `ollama/qwen2.5-coder:32b`, `deepseek-coder`).
   - Configure capabilities (reasoning effort, tool use).
5. All credentials and custom model definitions are securely persisted in `/app/data/userdata/statev2.sqlite`.

---

## 5. Terminal, Progress, & Live Web Preview

1. **Token Streaming & Real-Time Thoughts**:
   - The Web UI streams agent thoughts, markdown messages, and file diffs in real-time over the active WebSocket channel (`orchestration.v2`).
2. **Interactive Terminal Stream**:
   - The built-in terminal runs server-side via `node-pty` and streams stdout, stderr, and user stdin bidirectionally over WebSockets (`terminal.attachStream`).
3. **Live Web Preview**:
   - T3 Code includes an integrated server-side browser powered by headless Chromium (`playwright-core`).
   - When an agent or user runs a local dev server on the VPS (e.g. Vite on `http://localhost:5173` or Next.js on `http://localhost:3000`), click the **Globe / Browser** icon in the right panel tabs.
   - The server browser renders the page directly on the VPS loopback and streams interactive frames (with mouse, touch, scroll, and keyboard support) to mobile and desktop browsers over WebSockets.

---

## 6. Persistent Background Execution

- All tasks and commands execute server-side in the Node process.
- The orchestrator commits all state changes to SQLite before triggering side effects.
- If you close the mobile browser, lock your phone, or disconnect your laptop:
  - The agent turn and terminal tasks continue executing uninterrupted on the VPS.
  - When you reopen the web app, the client reconnects, fetches the latest shell snapshot (`OrchestrationV2GetShellSnapshot`), and rehydrates the state.

---

## 7. VPS Deployment Instructions (Docker Compose)

### Prerequisites:
- A VPS running Linux (Ubuntu 22.04 / Debian 12 / AlmaLinux)
- Docker & Docker Compose installed

### Step 1: Clone or Copy the Repository
```bash
git clone <your-repo-url> /opt/t3code
cd /opt/t3code
```

### Step 2: Configure Environment Variables
Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```
Edit `.env` to set your secure password:
```env
APP_PASSWORD=MyVeryStrongPassword2026!
PORT=3000
```

### Step 3: Start T3 Code via Docker Compose
```bash
docker compose up -d --build
```

### Step 4: Access in Browser
1. Open `http://<your-vps-ip>:3000` on your desktop or mobile phone.
2. You will be greeted with the **Pair with this environment** screen.
3. Enter `MyVeryStrongPassword2026!` and click **Pair**.
4. You are now inside your self-hosted T3 Code web application!

---

## 8. Production Reverse Proxy with HTTPS (Recommended)

To enable secure HTTPS and camera/clipboard permissions in modern mobile browsers, place Caddy or Nginx in front of T3 Code:

### Using Caddy (Automatic HTTPS):
```caddy
code.yourdomain.com {
    reverse_proxy localhost:3000
}
```

### Using Nginx:
```nginx
server {
    server_name code.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    listen 443 ssl;
    # ssl_certificate ...
    # ssl_certificate_key ...
}
```
