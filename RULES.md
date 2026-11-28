# OpenCode Limit Reset Bypass — Strict Project Rules

1. **Sirf OpenCode AI Models & Provider:**
   - Yeh repository aur `opencode-limit-reset-bypass` branch **sirf aur sirf OpenCode ke AI models aur OpenCode Inference provider (`https://opencode.ai/inference/...`)** ke liye hai.
   - Koi bhi doosra AI provider (OpenAI direct, Anthropic, Gemini, custom third-party routes, ya multi-provider failover) is branch mein add nahi kiya jayega.

2. **No Heavy External CLI Daemon (No Port 4099):**
   - 200 MB RAM wala external `opencode` CLI daemon (`opencode serve` / `port 4099`) use **nahi** karna.
   - Standalone lightweight inference client (`server.mjs`) hi official OpenCode CLI fingerprint headers (`User-Agent: opencode/latest/2.1.4/cli`, `x-opencode-client: cli`, `x-opencode-session*`, `x-opencode-project: global`) aur required tool schemas (`read`, `shell`) ke sath direct `https://opencode.ai/inference/openai/v1/chat/completions` aur `/inference/v1/models` ko call karega.

3. **Limit Reset Flow (Cloudflare WARP + Session Rotation):**
   - Har request canonical `ses_...` session ID ke sath jayegi.
   - Jab bhi `429` ya `usage_limit` error mile (HTTP status ya SSE stream ke andar), `server.mjs` automatically:
     1. Cloudflare WARP (`scripts/warp-rotate.sh`) se egress IP rotate karega,
     2. Naya canonical `ses_...` session ID mint karega,
     3. Request ko naye IP aur naye session ke sath auto-retry karega.

4. **Minimal Scope:**
   - Is branch par sirf Chat Screen (`public/`), OpenCode Inference + Limit Reset server (`server.mjs`), WARP control scripts (`scripts/`), aur zaroori docs/config hi rahenge.
