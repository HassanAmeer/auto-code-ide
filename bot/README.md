# Super Bot (Autonomous Agentic AI)

Yeh folder poore workspace ke **Super Bot (Senior AI Architect & Autonomous Supervisor)** ka markazi (central) setup hai.

---

## 1. User Ki Requirements Aur Purani Kharabiyan (Background & Problems)

### Purana Masla (Why It Was Broken):

1. **Har Baat Par Project Ki Rataai:**
   Jab bhi user "Hello", "Hi", "Salam", ya "Chalo theek hai baad mein baat karenge" bolta tha, bot har baar lambi chori project files aur status report phenk deta tha ke _"Yeh kar doon, woh kar doon"_.
2. **Hardcoded Wajohat:**
   - Server route (`apps/server/src/http.ts`) mein zabardasti har message ke sath poore VPS ka disk snapshot chipkaya ja raha tha.
   - Purane prompt mein sakht command thi: _"Headers use karo: ### 🎮 Project Status, ### 📁 Files Breakdown..."_ jis se model har halat mein project ka rona rota tha.
   - Purane worker agent mein koi real AI nahi thi, balkay sirf hardcoded `room3.html` aur `</html>` dhoondne ka ek chhota sa script tha.
   - Prompt mein bot ke haath baandhay hue thay: _"Do not run external tools or shell commands"_.
   - 3800 characters par prompt truncate ho kar cut jata tha jis se memory loss hoti thi.

### User Ko Kya Features Chahiye Thay (New Agentic Vision):

1. **Natural Baat-Cheet (Intent Awareness):**
   - Normal chitchat ("Hello", "Kaisay ho") par normal 1-line insaan jaisa jawab.
   - Goodbye ("Baad me baat karenge") par polite alvida, koi project report nahi.
2. **Senior Tech Lead / Brainstorming Mode (Mashwara):**
   - Agar user kahe _"Mujhe Restaurant website banani hai"_, to bot mashwara de: _"Menu, Table Booking, Cart, aur WhatsApp alerts hone chahiye. Kya hum online delivery tracking bhi shamil karein?"_
3. **Auto-Healer System (Self-Healing on Errors):**
   - Agar code mein koi error aaye, syntax issue ho ya build fail ho, to bot khud error diagnose karke file ko repair aur patch kare aur re-verify kare.
4. **Side Wishlist & Feature Backlog Store:**
   - User jab bhi baat baat mein kahe: _"Mujhe yeh feature bhi chahiye"_ ya _"Speed improve karni hai"_, bot foran usay ek persistent wishlist / backlog mein save kare aur poochne par poori list dikhaye.
5. **Persistent Project Memory (Specs Store):**
   - User ke mashwaray aur features ko yaad rakhay aur save kare taake baad mein bhoolay na.
6. **Pura Ikhtiyar (Real Tool Calling & Autonomous Loop):**
   - Terminal chalana, files parhna/likhna, live preview inspect karna.
7. **Away / Autonomous Supervisor Mode (Aapki Ghair-Mojoodgi Mein Kaam):**
   - Jab user bahar ya busy ho to bot background mein watchdog ban kar errors aur preview monitor karta rahay aur khud code theek kare.
8. **Auto Model Switching (Self-Healing):**
   - Rate limit ya quota error par khud backup model switch kar le.

---

## 2. Hum Ne Kya Kya Banaya Hai (Architecture & Structure)

Tamam setup ko is ek safe aur modular `bot/` folder mein organize kiya gaya hai:

```text
bot/
├── cline/                    <-- Cline Autonomous Engine & Tools
│   ├── auto-healer.ts        <-- Auto-Healer Routine (Diagnoses logs, patches syntax, verifies fixes)
│   ├── engine.ts             <-- Autonomous loop (Plan ➔ Tool ➔ Inspect ➔ Self-Heal)
│   └── tools.ts              <-- Real tools (Bash Terminal, Read/Write Files, Preview Check)
│
├── memory/                   <-- Persistent Memory & Backlog Store
│   ├── featureBacklog.ts     <-- Side Wishlist Store (User ke features aur improvements ka persistent backlog)
│   └── projectSpecs.ts       <-- Restaurant ya kisi bhi app ke core specs ka JSON store
│
├── supervisor/               <-- Bot Ka Dimagh (Supervisor Brain)
│   ├── intentClassifier.ts   <-- Pehchanta hai ke user baat kar raha hai, alvida keh raha hai, ya wishlist mein add kar raha hai
│   └── prompt.ts             <-- Naya dynamic system prompt (Roman Urdu + English) jo har baat par project nahi bolta
│
├── watchdog/                 <-- Away-Mode Watchdog
│   └── watchdog.ts           <-- Background interval jo user ke peeche errors aur preview health check karta hai
│
├── SUPERVISOR_WORKFLOW.md    <-- Core Agentic Supervisor Workflow (Kaam karwane wala AI)
├── index.ts                  <-- Master Controller (Single Bridge for UI and Server)
├── tsconfig.json             <-- TypeScript config (0 compilation errors)
└── README.md                 <-- Yeh documentation file
```

---

## 3. Har Module Ka Tafseeli Kaam

### A. `bot/cline/auto-healer.ts` (Auto-Healer System)

- **Diagnose:** Build logs ya runtime errors ko scan karta hai, file aur line number pakadta hai.
- **Auto-Patch:** Missing tags (`</html>`, `</div>`), missing `type="module"`, ya unclosed brackets ko khud patch karta hai.
- **Verify:** Re-test command chala kar tasdeeq karta hai ke code clean ho gaya.

### B. `bot/memory/featureBacklog.ts` (Side Wishlist & Improvement Store)

- Jab aap kahein: _"Mujhe dark mode feature bhi chahiye"_ ya _"Speed optimize karni hai"_, bot foran feature ko `userdata/bot-memory/[project]-backlog.json` mein `Pending` status ke sath save kar leta hai.
- Jab aap kahein: _"Wishlist dikhao"_, to yeh poora formatted backlog status ke sath screen par render karta hai.

### C. `bot/supervisor/intentClassifier.ts`

User ke har jumlay ko categorize karta hai:

- `GREETING_OR_CHITCHAT`: "Salam", "Hello", "Kaisay ho" ➔ Direct natural insani jawab.
- `FAREWELL_OR_EXIT`: "Baad mein baat karenge", "Theek hai bye" ➔ Warm acknowledgment.
- `WISHLIST_ADD`: "Mujhe ye feature bhi chahiye" ➔ Side wishlist mein save.
- `WISHLIST_LIST`: "Wishlist dikhao" ➔ Backlog list display.
- `AUTO_HEAL_REQUEST`: "Auto heal karo, errors fix karo" ➔ Auto-healer repair loop.
- `BRAINSTORM_OR_CONSULT`: "Restaurant app banani hai" ➔ Ideas & features mashwara.
- `STATUS_INQUIRY`: "Kya status hai" ➔ Sirf tab project summary.
- `CONFIRM_AND_BUILD`: "Bana do", "Shuru karo" ➔ Worker loop dispatch.
- `AWAY_SUPERVISION`: "Main ja raha hoon, khud dekhna" ➔ Watchdog start.

### D. `bot/watchdog/watchdog.ts`

Jab aap bahar hotay hain, yeh background mein har 25 second baad project aur preview ko ping karta hai aur status report update karta hai.

---

## 4. Kaise Connect Hai?

Aapka Web Chat UI (`/bot`) aur Server Routes (`/api/super-agent/chat`) is `bot/index.ts` ke zariye connect hotay hain. Tamam logic is ek folder ke andar mefooz hai aur koi aadhi-adhoori file idhar udhar bikhri hui nahi hai.

---

## 5. Server Integration (v2 — Wired ✅)

### `apps/server/src/http.ts` → `/api/super-agent/chat` Route

Is session mein `bot/index.ts` ko directly `/api/super-agent/chat` route ke sath **wire** kar diya gaya hai:

**Flow:**

```
User Message
    ↓
processSuperBotTurn() — intentClassifier chalata hai
    ↓ (agar GREETING / FAREWELL / WISHLIST / HEAL / WATCHDOG)
Direct Reply (OpenCode bypass) ← fast, no API call
    ↓ (baaki sab intents: BRAINSTORM / WORK / STATUS)
botResult.systemPrompt → OpenCode / Custom Provider
    ↓
LLM response → User
```

**Faida:**

- Greeting / Farewell par **OpenCode API call nahi hogi** — instant reply.
- Wishlist add/list bhi instantly respond hoga bina kisi model call ke.
- Baaki sab (brainstorm, build, status) ke liye `buildSmartBotSystemPrompt()` se generate hone wala intelligent system prompt model ko diya jata hai.

**Files Changed:**

- `apps/server/src/http.ts` — `processSuperBotTurn` import + short-circuit before OpenCode block
- `bot/supervisor/intentClassifier.ts` — Wishlist Add regex improved: "wishlist me X add karo" ab correctly detect hota hai

---

## 6. Intent Classifier Regex Coverage (Updated)

| Pattern Example                                | Intent Detected         |
| ---------------------------------------------- | ----------------------- |
| "Assalam o Alaikum", "Hello", "Kaisay ho"      | `GREETING_OR_CHITCHAT`  |
| "Allah hafiz", "Bye", "Baad mein baat karenge" | `FAREWELL_OR_EXIT`      |
| "meri wishlist me dark mode add karo"          | `WISHLIST_ADD` ✅       |
| "ye feature bhi chahiye, save karo"            | `WISHLIST_ADD`          |
| "wishlist dikhao", "backlog dikhao"            | `WISHLIST_LIST`         |
| "kya features pending hain"                    | `WISHLIST_LIST`         |
| "auto heal karo", "errors fix karo"            | `AUTO_HEAL_REQUEST`     |
| "main ja raha hoon, project dekh lena"         | `AWAY_SUPERVISION`      |
| "restaurant app banani hai, mashwara do"       | `BRAINSTORM_OR_CONSULT` |
| "bana do", "shuru karo", "proceed"             | `CONFIRM_AND_BUILD`     |
| (everything else)                              | `GENERAL_WORK` → LLM    |

---

## 7. Wishlist Auto-Approve Toggle (Enabled / Disabled Button ✅)

Wishlist items ke sath UI aur backend level par **Auto Approve** feature shamil kiya gaya hai:

### Features:

1. **Interactive Toggle Switch:** Har pending feature ke samne ek modern toggle switch button (ON/OFF) bana diya gaya hai jo instant state update karta hai.
   - **Enabled (ON):** Emerald glow toggle button indicator.
   - **Disabled (OFF):** Muted neutral toggle switch.
2. **Persistent Storage:** `autoApprove: boolean` flag `userdata/bot-memory/[project]-backlog.json` mein save hota hai.
3. **Dedicated Endpoints:**
   - `GET /api/bot/wishlist?project=<projectName>`: Wishlist items list karta hai.
   - `POST /api/bot/wishlist/toggle-approve`: `{ projectName, itemId }` bhej kar auto-approve status toggle karta hai.
4. **Rich Card UI:** Wishlist card mein title, type badge (⚡ Improve / ✨ Feature), priority tag (HIGH/MED/LOW), aur toggle button real-time sync rehta hai.
