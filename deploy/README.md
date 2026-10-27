# Automated Git Push & VPS Auto-Deployment

This pipeline allows one-command automated staging, committing, pushing to GitHub, building, rsyncing, pulling to VPS, restarting the production service, and performing live health verification.

## 🚀 Quick Usage

### 1. Full Deploy (Commit, Push, Build, Sync to VPS & Restart Service)

```bash
# Using npm/pnpm script:
pnpm run deploy "Your commit message here"

# Or directly running the script:
./deploy/deploy-vps.sh "Your commit message here"
```

### 2. Fast Deploy (Skip local build if you only changed server logic or docs)

```bash
pnpm run deploy:quick "Quick fix message"
# or
./deploy/deploy-vps.sh --skip-build "Quick fix message"
```

---

## ⚙️ Architecture & Pipeline Flow

```
[Local Code Changes]
       │
       ▼
[1/5] git add . & git commit -m "..."
       │
       ▼
[2/5] git push origin main
       │
       ▼
[3/5] Build Production Bundles (Web + Server)
       │
       ▼
[4/5] Sync to VPS (root@201.18.218.29):
       • Rsync apps/web/dist/
       • Rsync apps/server/dist/
       • git reset --hard origin/main on VPS
       │
       ▼
[5/5] Restart VPS systemd service (autojobs.service)
       • Health Check: curl http://127.0.0.1:13773/
       • Service Status: systemctl is-active
       │
       ▼
[Report]: ✅ SUCCESS (HTTP 200 OK) or ❌ DETAILED ERROR LOG
```

---

## 📋 Server Details

- **Host IP**: `201.18.218.29`
- **SSH User**: `root`
- **Project Directory**: `/root/autojobs`
- **Systemd Service**: `autojobs.service`
- **Port**: `13773`
- **Live URL**: `http://201.18.218.29:13773/`
