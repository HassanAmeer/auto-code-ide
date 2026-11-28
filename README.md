# OpenCode Limit Reset Bypass — Standalone Testing Lab

Alag, self-contained setup: OpenCode free-lane bypass + limit reset + WARP/IP rotation + session rotation + live model test. Kisi doosre provider/session se imported nahi hai.

---

## ⚠️ Testing vs Production Architecture (اہم نوٹ: ٹیسٹنگ بمقابلہ پروڈکشن)

> [!IMPORTANT]
> **Yeh Split Log Drawer, UI Dashboard aur Verbose In-Memory Logging sirf aur sirf Testing & Inspection ke liye hain.**
> Jab aap is setup ko kisi production application (e.g. AutoJobs, Cursor, Continue, ya third-party app) ke sath integrate karein, to **Frontend UI, CSS/HTML assets, aur Split Inspection Drawer ko sath le jaane ki bilkul zaroorat nahi hai.**

### Production mein kya shamil karna hai (Core Engine Only):
1. **Core Inference Handler:** `POST /v1/chat/completions` (OpenAI-compatible endpoint jo native lightweight CLI subprocess ko call karta hai).
2. **WARP Subnet Rotation:** `scripts/warp-rotate.sh` (jo 429 error aane par 2.5s mein fresh IP allocate karta hai).
3. **Canonical Session Minting:** `ses_<timestamp><random>` generation function.
4. **Auto-Reset on 429:** Upstream 429 detect hone par silently IP + session rotate karke auto-retry karna.

### Production mein kya HATA dena hai (To Save RAM & Disk):
- ❌ **Web UI Files:** `public/index.html`, `public/styles.css`, `public/app.js` (Web UI ki production backend me zaroorat nahi).
- ❌ **Split Log Drawer & Modal:** UI inspector ko bundle na karein.
- ❌ **Verbose In-Memory History:** Server state mein bade arrays (`state.history`) save karne ki zaroorat nahi, sirf standard app logs use karein.

**Fayda:** Production backend par RAM footprint sirf **15MB se 25MB** rahega aur disk space par koi faltu bojh nahi padega.

---

## Chalane ka tareeqa

```bash
cd opencode-limit-reset-bypass
chmod +x scripts/*.sh
node server.mjs            # ya: npm start
# default: http://127.0.0.1:8791
```

Env overrides: `OLRB_PORT`, `OLRB_HOST`, `OLRB_PROXY`, `OLRB_UPSTREAM`.

---

## Endpoints

| Endpoint | Method | Kya karta hai |
| --- | --- | --- |
| `/v1/chat/completions` | POST | **Standard OpenAI format endpoint** (Streaming & Non-Streaming). Third-party apps ke liye direct integration. |
| `/v1/models` | GET | OpenAI standard model list (`hy4-flash-free`, `beam-free`, `glm-5.3-flash-free`, etc.). |
| `/api/chat` | POST | Testing lab chat endpoint with auto-reset and token metrics. |
| `/api/logs` | GET | **(Testing Only)** Structured JSON logs array with latency, prompt, response, and token breakdown. |
| `/api/reset` | POST | **Core Reset:** WARP IP rotate + naya canonical session. Purana/naya IP aur session, `ipChanged`/`sessionChanged`, duration (~2.5s). |
| `/api/status` | GET | Live system status: egress IP, limit state, proxy health, active session, last reset metrics. |
| `/api/check` | GET | 13-point diagnostic check (nginx, cert, Privoxy, WARP status, SOCKS 40000, upstream connectivity). |
| `/api/toggle` | POST | Reset mechanism enable/disable toggle. |
| `/api/warp/{start\|pause\|stop}` | POST | Cloudflare WARP background service controls. |

---

## UI Features (Testing Lab View)

1. **💬 Chat Interface:** Live AI testing with model selector (`hy4-flash-free`, `beam-free`, etc.).
2. **🌓 Split Logs (50/50) View:** Ek click se screen 2 hisson me divide ho jati hai: **Adhi Chat (Left)** aur **Aadhe Live Logs (Right)**.
3. **📊 Token Metrics & Inspector:** Har response ke input, output, reasoning aur total tokens live dikhte hain. Click karke raw prompt aur response inspect kiya ja sakta hai.
4. **⚙️ Settings Sheet:** Egress IP, session copy, manual reset trigger, aur Cloudflare WARP controls.

---

## Notes & Safeguards

- **Native CLI Subprocess:** Heavy 200MB background daemon (`opencode serve`) ke bajaye lightweight native binary ko per-request call kiya jata hai jo Bun runtime par fast execute hoti hai.
- **Bot Parity:** WARP SOCKS5 (`127.0.0.1:40000`) aur Privoxy HTTP bridge (`127.0.0.1:8118`) ke zariye upstream rate-limits bypass rehti hain.
- **Atomic State:** System state `data/state.json` me atomic write ke sath mehfooz hoti hai.
