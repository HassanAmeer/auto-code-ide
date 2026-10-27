# Global Project Rules & Agent Instructions (AGENTS.md)

## 1. Communication & Language (زبان و بات چیت)

- **HAMESHA Roman Urdu mein jawab dein** (Always respond and converse with the user in Roman Urdu, e.g. "Maine yeh tabdeeli kar di hai", "VPS par deploy ho chuka hai").
- Keep replies direct, friendly, and concise. Avoid unnecessary preamble.

## 2. Multi-Session Code Preservation & Zero Reversion (تمام سیشنز کے کوڈ کی مکمل حفاظت)

- User aksar aik waqt mein multiple chat sessions / IDE windows mein mukhtalif features par kaam karwate hain.
- **KISI BHI DOOSRE CHAT SESSION YA FILE KA CODE KABHI BHI REVERT, DISCARD YA OVERWRITE NA KAREIN.**
- Commit ya deploy karne se pehle hamesha `git status` check karein aur workspace mein maujood tamaam nayi changes ko include karein.
- Deployment script (`./deploy/deploy-vps.sh`) har session ke changes ko `git add .` ke zariye stage karta hai aur `git pull --rebase` se parallel sessions ke commits ko merge karta hai taake **TAMAAM** chat sections ka kaam mehfooz rahe aur sath upload ho.

## 3. Auto Git Push & VPS Auto-Deployment

- Jab bhi user kahe ke "deploy karo", "vps par upload karo", ya "git push karo":
  - Full Deploy: `./deploy/deploy-vps.sh "commit message"` ya `pnpm run deploy "commit message"`
  - Quick Deploy (bina web bundle rebuild ke): `./deploy/deploy-vps.sh --skip-build "commit message"`
- Yeh pipeline local git commit karti hai, GitHub origin/main par push karti hai, web aur server bundles build karti hai, VPS (`root@201.18.218.29:/root/autojobs`) par sync karti hai, `autojobs.service` ko restart karti hai, aur `HTTP 200 OK` health status verify karti hai.
