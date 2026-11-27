# OpenCode Limit Reset Bypass — Standalone Testing Lab

Alag, self-contained setup: OpenCode free-lane bypass + limit reset + WARP/IP rotation + session rotation + live model test. Kisi doosre provider/session se imported nahi hai.

## Chalane ka tareeqa

```bash
cd opencode-limit-reset-bypass
chmod +x scripts/*.sh
node server.mjs            # ya: npm start
# default: http://127.0.0.1:8791
```

Env overrides: `OLRB_PORT`, `OLRB_HOST`, `OLRB_PROXY`, `OLRB_UPSTREAM`.

## Endpoints

| Endpoint | Kya karta hai |
| --- | --- |
| `GET /api/status` | enabled/disabled, WARP connected/background, egress IP, session ID + validity, last reset/test, limit state, activity log, `aiLogs` (model, HTTP status, `usage_limit`/`timeout`/`error` classification, tokens, response snippet) |
| `POST /api/reset` | Bot jaisa flow: WARP IP rotate + naya canonical session. Purana/naya IP aur session, `ipChanged`/`sessionChanged`, duration |
| `POST /api/toggle` | `{ "enabled": false }` se reset mechanism disable/enable |
| `GET /api/models` | upstream se live model list (free models pehle), fallback list agar upstream na mile |
| `POST /api/warp/{start\|pause\|stop}` | Cloudflare WARP controls (bot settings jaisa) |
| `GET /api/check` | 13-point system check (nginx, cert, proxy, WARP status + controls, upstream, session generator…) |
| `POST /api/chat` | Chat screen ka endpoint. `{ "model": "...", "messages": [{role,content}...], "autoReset": true }`. Bot ka exact flow: model configured custom upstream par route hota hai (modelRoute), warna opencode.ai free lane → 429 par WARP IP + session rotate + retry. Real HTTP status, usage, `route`, `resetPerformed` aur response deta hai |

## UI

Sahi daftar (right sheet) me: status pills (limit state, session, IP, WARP, enabled/disabled), **Limit Reset** button, Refresh, model dropdown (live), message input aur response + usage + activity log.

## Notes

- Bypass client official CLI ke fingerprint headers bhejta hai, lekin external CLI binary ya port 4099 use nahi karta.
- **Bot jaisa flow:** WARP/Privoxy system-level services hain, isliye IP rotation VPS ke dusre services ke egress ko bhi badal sakta hai. Session aur state isi oc folder me alag rehte hain.
- State `data/state.json` me atomic write ke sath save hoti hai.
