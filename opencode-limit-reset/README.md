# 🔄 OpenCode Limit Reset & Network Engine

> **Dedicated OpenCode Free Tier Quota & Rate-Limit Reset System**
>
> Yeh module OpenCode ke free AI models (`deepseek-v4.1-flash-free`, `beam-free`, `glm-5.3-flash-free`, etc.) par aane wale **HTTP 429 FreeUsageLimitError** aur rate limits ko reset aur bypass karne ke liye banaya gaya hai.

---

## 📌 Rate Limit Kyon Aata Hai? (Underlying Architecture)

OpenCode ka upstream free gate (`https://opencode.ai/inference/openai/v1`) Cloudflare KV aur Upstash Redis par rate-limiting enforce karta hai. Is gate par 3 main checks hote hain:

1. **Client IP ASN (Primary Rate Limiter):**
   - Cloudflare Datacenter IPs aur VPS hosting IPs (e.g. `201.18.218.29` ya Cloudflare WARP egress `104.28.x.x`) par anonymous free quota restricted hota hai. Agar request datacenter IP se aati hai to gate `FreeUsageLimitError (Reset after: 7200s)` return karta hai.
   - **Residential / Clean Home ISP IPs** (jese `163.223.93.16`) par anonymous free models open hote hain.
2. **Session ID Ka Bitwise Descending Layout:**
   - Session ID ek specific bitwise NOT algorithm se banti hai:
     $$\text{Pattern: } \texttt{ses\_<12\_hex\_timestamp><14\_base62>}$$
   - Pehle 12 hex digits: `~((Date.now() << 12) | counter) & 0xffffffffffff`
   - Agar session format canonical na ho to gate `403 FreeTierError` deta hai.
3. **Identity Headers & 7 Tool Definitions:**
   - `User-Agent: opencode/latest/2.1.4/cli`
   - `x-opencode-client: cli`
   - `x-opencode-project: global`
   - OpenCode CLI ke official 7 agentic tools (`read`, `write`, `edit`, `bash`, `glob`, `grep`, `patch`) ke schemas request me include hona lazmi hain.

---

## 🛠️ Limit Reset Kaise Kiya Jata Hai? (Step-by-Step)

Jab bhi OpenCode free models ka limit hit ho ya error aaye, to limit reset karne ka 4-tier process yeh hai:

```
┌────────────────────────────────────────────────────────┐
│  STEP 1: Residential Tunnel / SOCKS5 Check (10808)     │
│  Local PC se reverse SSH proxy verify karta hai.      │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│  STEP 2: Privoxy Proxy Forwarding (Port 8118)          │
│  Privoxy ko Clean Residential IP par switch karta hai. │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│  STEP 3: Canonical Bitwise Session ID Minting          │
│  Naya ses_<12hex><14b62> ID generate karta hai.       │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│  STEP 4: OpenCode Daemon Cache Flush & Smoke Test      │
│  DeepSeek & Beam models ko prompt bhej kar verify      │
│  karta hai ke 200 OK mil raha hai.                    │
└────────────────────────────────────────────────────────┘
```

---

## 🚀 1-Click Quick Commands

### 1. Automated Reset Script Chalana:

VPS par ja kar sirf yeh command run karein:

```bash
bash /root/autojobs/opencode-limit-reset/reset.sh
```

Yeh script automatically:

1. Network IP aur proxies check karegi.
2. Privoxy ko clean residential tunnel par route karegi.
3. Naya canonical session mint karegi.
4. DeepSeek, Beam aur GLM models ko live test karegi.

---

### 2. Models Validation Suite Chalana:

Tamam free models ka response time aur output check karne ke liye:

```bash
bash /root/autojobs/opencode-limit-reset/test-models.sh
```

---

### 3. Persistent Residential Tunnel Ko Always-On Rakhna:

Local machine par background keep-alive script start karne ke liye:

```bash
nohup bash opencode-limit-reset/tunnel-keepalive.sh >/dev/null 2>&1 &
```

Ya direct SSH tunnel open karne ke liye:

```bash
ssh -o BatchMode=yes -o ServerAliveInterval=15 -f -N -R 10808 root@201.18.218.29
```

---

## ⚙️ Manual Reset Steps (Agar Manually Reset Karna Ho)

Agar aap step-by-step manually reset karna chahein:

### Step 1: Reverse SOCKS Tunnel Check

VPS par check karein ke residential tunnel active hai:

```bash
curl -s -x socks5h://127.0.0.1:10808 https://api.ipify.org
# Output aapka clean local IP hona chahiye (e.g. 163.223.93.16)
```

### Step 2: Privoxy Ko Tunnel Se Connect Karein

File `/etc/privoxy/config` me check karein:

```text
forward-socks5 / 127.0.0.1:10808 .
```

Privoxy restart karein:

```bash
systemctl restart privoxy
curl -x http://127.0.0.1:8118 -s https://api.ipify.org
```

### Step 3: OpenCode Daemon Restart

```bash
systemctl restart opencode-server
```

### Step 4: Live Verification

```bash
curl -s -u opencode:autocode123 -X POST "http://127.0.0.1:4099/api/session" \
  -H "Content-Type: application/json" \
  -d '{"model":{"id":"deepseek-v4.1-flash-free","providerID":"opencode"}}'
```

---

## 📁 Files Overview

| File                  | Maqsad                                                                    |
| --------------------- | ------------------------------------------------------------------------- |
| `reset.sh`            | Main 1-click limit reset aur model verification script.                   |
| `tunnel-keepalive.sh` | Reverse SSH residential proxy ko disconnect hone se bachane wala daemon.  |
| `test-models.sh`      | Free models (`deepseek`, `beam`, `glm`) ka latency aur output test suite. |
| `README.md`           | Yeh guide aur complete documentation.                                     |
