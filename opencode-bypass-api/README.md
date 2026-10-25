# 🚀 OpenCode Bypass API (`@t3tools/provider-opencodebypasssetup`)

> **AutoCode OpenCode Free Lane Bypass Driver & Provider**
>
> Yeh package AutoCode IDE ke andar OpenCode ke official free AI models (`deepseek-v4.1-flash-free`, `beam-free`, `glm-5.3-flash-free`, `kimi-k3`, etc.) ko bina kisi API key, subscription, ya paid token ke directly invoke karta hai.

---

## 🏗️ Architecture & How It Works

AutoCode ka OpenCode Bypass provider seedha OpenCode ke v2 upstream free gate ko hit karta hai:

```
[User Message in AutoCode Chat]
             │
             ▼
[OpenCodeBypassSetupDriver] (src/server/driver.ts)
             │
             ▼
[bypassChatStream / client.ts]
   ├── 1. Canonical Bitwise Session ID (ses_<12hex><14b62>)
   ├── 2. Fingerprint Headers (User-Agent: opencode/latest/2.1.4/cli)
   ├── 3. 7 Verbatim CLI Tool Definitions (read, write, edit, etc.)
   └── 4. Outgoing Proxy Dispatcher (undici ProxyAgent ➔ Privoxy 8118)
             │
             ▼
[Privoxy HTTP Proxy (127.0.0.1:8118)]
             │
             ▼
[Residential SOCKS5 Proxy / WARP] ➔ [Clean Egress IP: 163.223.93.16]
             │
             ▼
[OpenCode Upstream (https://opencode.ai/inference/openai/v1/chat/completions)]
             │
             ▼
       ✅ 200 OK SSE Stream
```

---

## ⚡ Rate Limit Reset Kaise Kiya Jata Hai? (How to Reset Limits)

Agar upstream server se **HTTP 429 `FreeUsageLimitError`** aaye, to bypass engine automatically aur manually is tarah reset hota hai:

### 1. Automatic In-Memory Reset (Zero Downtime)

`src/server/bypass/client.ts` mein built-in 429 auto-retry handler mojood hai:

1. Jab bhi upstream se `HTTP 429` aata hai:
2. Driver foran `rotateAllIpRotation()` ko call karta hai.
3. Purana session discard karke foran naya bitwise canonical session ID mint karta hai.
4. Agar WARP active ho to `rotateWarpIp()` call karke fresh egress IP allocate karta hai.
5. Request ko automatically 1 martaba naye session aur IP ke sath retry karta hai.

---

### 2. Dedicated Reset System (`opencode-limit-reset`)

Bypass folder ke sath humne standalone reset engine create kiya hai:
👉 **Folder Path:** `opencode-limit-reset/`

VPS par manual ya scheduled reset ke liye:

```bash
# 1-Click Complete Reset Script:
bash opencode-limit-reset/reset.sh

# All Models Verification Test:
bash opencode-limit-reset/test-models.sh
```

Is script ke steps:

1. **IP Egress Switch:** Privoxy ko residential tunnel (`127.0.0.1:10808`) ya rotated WARP registration par set karta hai.
2. **Session Flush:** Naya session ID `ses_...` generate karta hai.
3. **Daemon Reload:** OpenCode headless server (`port 4099`) ko restart karta hai.
4. **Smoke Test:** DeepSeek aur Beam models ko prompt bhej kar verify karta hai.

---

## 📂 Source Code Structure

- `src/server/driver.ts`: AutoCode provider implementation (models registration, settings, Effect runtime).
- `src/server/bypass/client.ts`: Low-level streaming fetch client with timeout, auto-retry on 429, and proxy dispatcher.
- `src/server/bypass/session.ts`: Canonical descending bitwise session generator.
- `src/server/bypass/fingerprint.ts`: Official v2 headers (`User-Agent`, `x-opencode-client`, `x-opencode-project`, 7 tool schemas).
- `src/server/bypass/proxy.ts`: Detection of Privoxy port 8118, dynamic egress IP resolution, and Undici `ProxyAgent`.
- `bypass-vps-ip/`: Cloudflare WARP control scripts (`rotate.sh`, `start.sh`, `stop.sh`, `status.sh`).
