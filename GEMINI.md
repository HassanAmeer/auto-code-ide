# Global Project Rules & Agent Instructions (GEMINI.md)

## 1. Communication & Language (زبان و بات چیت)

- **HAMESHA Roman Urdu mein jawab dein** (Always respond and converse with the user in Roman Urdu, e.g. "Maine yeh tabdeeli kar di hai", "VPS par deploy ho chuka hai").
- Keep replies direct, friendly, and concise.

## 2. Multi-Session Code Preservation & Zero Reversion (تمام سیشنز کے کوڈ کی مکمل حفاظت)

- User aksar aik waqt mein multiple chat sessions / IDE windows mein mukhtalif features par kaam karwate hain.
- **KISI BHI DOOSRE CHAT SESSION YA FILE KA CODE KABHI BHI REVERT, DISCARD YA OVERWRITE NA KAREIN.**
- Commit ya deploy karne se pehle hamesha `git status` check karein aur workspace mein maujood tamaam nayi changes ko include karein.
- Deployment script (`./deploy/deploy-vps.sh`) har session ke changes ko `git add .` ke zariye stage karta hai aur `git pull --rebase` se parallel sessions ke commits ko merge karta hai taake **TAMAAM** chat sections ka kaam mehfooz rahe aur sath upload ho.

## 3. OpenCode Core Engine Architecture & Connectivity Rules (اوپن کوڈ انجن کنیکٹیویٹی کے لازمی اصول)

- **Database / App Settings (`app-settings.json` / SQLite)** se `active_core_engine` check karna lazmi hai:
  1. **Jab `active_core_engine === "opencode-full-engine"` (Standalone Embedded Engine) muntakhab ho:**
     - Yeh 100% in-process standalone runtime hai (`engine/runtimes/opencode-full-engine`).
     - **KISI BHI PORT (4099, 45991, 36347 wagera), background daemon (`opencode serve`), ya external HTTP fetch ki bilkul zaroorat nahi hai.**
     - Bridge code (`apps/server/src/dsh/opencodeBridge.ts`) mein direct internal standalone tools (`executeWriteTool`, `executeEditTool`, `executePatchTool`, `executeShellTool`, `executeGlobTool`) use honge.
     - KABHI BHI bina engine check kiye port 4099 par depend na karein aur na hi dummy/mock code create karein.
  2. **Jab `active_core_engine === "opencode-adapter"` (External CLI) muntakhab ho:**
     - External CLI aur port auto-discovery **SIRF AUR SIRF TAB** chalegi jab setting mein explicitly `opencode-adapter` select ho.
     - External CLI daemon ke sath communicate karte waqt standard `/session/${sessionId}/prompt` endpoint use karna hai (non-standard `/turn` nahi).
  3. **HTTP Route Check (`apps/server/src/http.ts`):**
     - `layerSuperAgentChatRoute` ke andar check lazmi rehna chahiye: Agar `opencode-full-engine` active hai to woh port 4099 ke rate limit ya daemon error par crash na kare balki internal engine / standard provider aur Gemini key rotator failover se smooth chale.
  4. **Strict No-Tampering Policy:**
     - Is engine switching logic ko kisi bhi haal mein revert ya bypass na karein taake internal engine select hone par port ya external CLI ka koi jhanjhat na rahe.

## 4. Auto Git Push & VPS Auto-Deployment

- Jab bhi user kahe ke "deploy karo", "vps par upload karo", ya "git push karo":
  - Full Deploy: `./deploy/deploy-vps.sh "commit message"` ya `pnpm run deploy "commit message"`
  - Quick Deploy (bina web bundle rebuild ke): `./deploy/deploy-vps.sh --skip-build "commit message"`
- Yeh pipeline local git commit karti hai, GitHub origin/main par push karti hai, web aur server bundles build karti hai, VPS (`root@201.18.218.29:/root/autojobs`) par sync karti hai, `autojobs.service` ko restart karti hai, aur `HTTP 200 OK` health status verify karti hai.
