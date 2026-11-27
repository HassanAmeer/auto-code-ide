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
| `GET /api/status` | enabled/disabled, WARP connected/background, egress IP, session ID + validity, last reset/test, limit state, activity log |
| `POST /api/reset` | WARP IP rotate + naya canonical session; pehle/bad ka IP aur session, changed flags, duration |
| `POST /api/toggle` | `{ "enabled": false }` se reset mechanism disable/enable |
| `GET /api/models` | upstream se live model list (free models pehle), fallback list agar upstream na mile |
| `POST /api/chat` | Chat screen ka endpoint. `{ "model": "...", "messages": [{role,content}...], "autoReset": true }`. 429 milte hi IP + session rotate karke ek dafa auto-retry karta hai; real HTTP status, usage, `resetPerformed` aur response deta hai |

## UI

Sahi daftar (right sheet) me: status pills (limit state, session, IP, WARP, enabled/disabled), **Limit Reset** button, Refresh, model dropdown (live), message input aur response + usage + activity log.

## Notes

- Bypass client official CLI ke fingerprint headers bhejta hai, lekin external CLI binary ya port 4099 use nahi karta.
- WARP/Privoxy system-level services hain — reset unhe rotate karta hai; baaki sessions ke code/files par asar nahi.
- State `data/state.json` me atomic write ke sath save hoti hai.
