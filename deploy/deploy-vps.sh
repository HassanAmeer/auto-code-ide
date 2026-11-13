#!/usr/bin/env bash
# ==============================================================================
# Auto Git Push & VPS Auto-Deploy Pipeline (Jobi Code / Auto Code IDE)
# ==============================================================================
# Usage:
#   ./deploy/deploy-vps.sh "Your commit message"
#   ./deploy/deploy-vps.sh --skip-build "Fast sync without rebuilding web"
#   pnpm run deploy "Your commit message"
# ==============================================================================

set -uo pipefail

START_TIME=$(date +%s)
VPS_USER="root"
VPS_HOST="201.18.218.29"
VPS_DIR="/root/autojobs"
VPS_PORT="13773"
SERVICE_NAME="autojobs.service"

# Terminal Colors
C_RESET="\033[0m"
C_BOLD="\033[1m"
C_GREEN="\033[32m"
C_BLUE="\033[34m"
C_CYAN="\033[36m"
C_YELLOW="\033[33m"
C_RED="\033[31m"
C_DIM="\033[2m"

echo -e "\n${C_BOLD}${C_CYAN}====================================================================${C_RESET}"
echo -e "${C_BOLD}${C_CYAN} 🚀 AUTO GIT PUSH & VPS DEPLOY PIPELINE${C_RESET}"
echo -e "${C_BOLD}${C_CYAN}====================================================================${C_RESET}"

SKIP_BUILD=false
COMMIT_MSG=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build|--no-build|-s)
      SKIP_BUILD=true
      shift
      ;;
    *)
      if [ -z "$COMMIT_MSG" ]; then
        COMMIT_MSG="$1"
      else
        COMMIT_MSG="$COMMIT_MSG $1"
      fi
      shift
      ;;
  esac
done

if [ -z "$COMMIT_MSG" ]; then
  COMMIT_MSG="feat(auto-deploy): updates applied at $(date '+%Y-%m-%d %H:%M:%S')"
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR" || exit 1

# ------------------------------------------------------------------------------
# 1. LOCAL GIT STAGE & COMMIT
# ------------------------------------------------------------------------------
echo -e "\n${C_BOLD}${C_BLUE}[1/5] Checking Local Git Changes & Syncing Across Sessions...${C_RESET}"

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Pull any remote changes from other chat sessions/machines first
echo -e "  ${C_DIM}Checking for remote commits from parallel sessions...${C_RESET}"
git pull --rebase origin "${CURRENT_BRANCH}" 2>/dev/null || true

if [ -n "$(git status --porcelain)" ]; then
  echo -e "  ${C_DIM}Staging all modified files across workspace...${C_RESET}"
  git add .
  git commit -m "$COMMIT_MSG" || {
    echo -e "${C_YELLOW}  ⚠️ Nothing new committed or pre-commit hook skipped.${C_RESET}"
  }
else
  echo -e "  ${C_GREEN}✓ Working tree is clean. Proceeding with current HEAD.${C_RESET}"
fi

CURRENT_COMMIT=$(git rev-parse --short HEAD)
echo -e "  ${C_DIM}Active Branch:${C_RESET} ${C_BOLD}${CURRENT_BRANCH}${C_RESET} (${CURRENT_COMMIT})"

# ------------------------------------------------------------------------------
# 2. PUSH TO GITHUB
# ------------------------------------------------------------------------------
echo -e "\n${C_BOLD}${C_BLUE}[2/5] Pushing to GitHub (${CURRENT_BRANCH})...${C_RESET}"
if git push origin "${CURRENT_BRANCH}"; then
  echo -e "  ${C_GREEN}✓ Successfully pushed to GitHub origin/${CURRENT_BRANCH}${C_RESET}"
else
  echo -e "\n${C_BOLD}${C_RED}❌ Git push failed! Please check your network or credentials.${C_RESET}"
  exit 1
fi

# ------------------------------------------------------------------------------
# 3. BUILD ARTIFACTS (WEB & SERVER)
# ------------------------------------------------------------------------------
if [ "$SKIP_BUILD" = false ]; then
  echo -e "\n${C_BOLD}${C_BLUE}[3/5] Building Web & Server Bundles...${C_RESET}"
  echo -e "  ${C_DIM}Running: pnpm --filter @t3tools/web build...${C_RESET}"
  if pnpm --filter @t3tools/web build > /dev/null 2>&1; then
    echo -e "  ${C_GREEN}✓ Web production bundle built successfully (apps/web/dist)${C_RESET}"
  else
    echo -e "${C_YELLOW}  ⚠️ Web build returned warning/error, attempting pack fallback...${C_RESET}"
    pnpm --filter @t3tools/web build || true
  fi

  echo -e "  ${C_DIM}Running: pnpm --filter t3 run build:bundle...${C_RESET}"
  if pnpm --filter t3 run build:bundle > /dev/null 2>&1; then
    echo -e "  ${C_GREEN}✓ Server bundle built successfully (apps/server/dist)${C_RESET}"
  else
    echo -e "${C_YELLOW}  ⚠️ Server build returned warning/error, continuing...${C_RESET}"
    pnpm --filter t3 run build:bundle || true
  fi
else
  echo -e "\n${C_BOLD}${C_YELLOW}[3/5] Build skipped (--skip-build flag provided)${C_RESET}"
fi

# ------------------------------------------------------------------------------
# 4. SYNC TO VPS (CODE + BUILT ARTIFACTS)
# ------------------------------------------------------------------------------
echo -e "\n${C_BOLD}${C_BLUE}[4/5] Syncing to VPS (${VPS_HOST})...${C_RESET}"

# Test SSH connection; when this machine IS the VPS itself, SSH to the public
# host would fail (no self publickey) — fall back to local sync instead of
# bailing out. The SSH path is unchanged when it works (e.g. from a dev box).
LOCAL_MODE=false
if ! ssh -o BatchMode=yes -o ConnectTimeout=5 "${VPS_USER}@${VPS_HOST}" "true" 2>/dev/null; then
  if hostname -I 2>/dev/null | tr ' ' '\n' | grep -q "^${VPS_HOST}$"; then
    echo -e "${C_YELLOW}  ⚠️ SSH to ${VPS_HOST} failed, but this IS the VPS — using local sync mode.${C_RESET}"
    LOCAL_MODE=true
  else
    echo -e "${C_BOLD}${C_RED}❌ Cannot connect to VPS (${VPS_USER}@${VPS_HOST}) via SSH!${C_RESET}"
    exit 1
  fi
fi

# Rsync web and server dist for zero-downtime, fast asset delivery
RSYNC_SSH="ssh -o ConnectTimeout=15 -o ServerAliveInterval=5"
for TARGET_DIR in "${VPS_DIR}" "/root/bot-autojobs"; do
  echo -e "  ${C_DIM}Syncing to ${TARGET_DIR}...${C_RESET}"
  # Runtime config (opencode.json on the servers holds the live provider
  # catalog + keys and is intentionally NOT what origin/main carries). Back it
  # up across the reset so the deployed instances keep their working setup.
  OPENCODE_BACKUP=""
  if [ -f "${TARGET_DIR}/opencode.json" ] && [ -n "$(cd "${TARGET_DIR}" && git status --porcelain -- opencode.json)" ]; then
    OPENCODE_BACKUP=$(mktemp /tmp/deploy-opencode-json.XXXXXX)
    cp "${TARGET_DIR}/opencode.json" "$OPENCODE_BACKUP"
  fi

  if [ "$LOCAL_MODE" = true ]; then
    if [ -d "apps/web/dist" ]; then
      rsync -az --exclude="*.map" apps/web/dist/ "${TARGET_DIR}/apps/web/dist/"
    fi

    if [ -d "apps/server/dist" ]; then
      rsync -az --exclude="*.map" apps/server/dist/ "${TARGET_DIR}/apps/server/dist/"
    fi

    if [ -d "bot" ]; then
      rsync -az bot/ "${TARGET_DIR}/bot/"
    fi

    ( cd "${TARGET_DIR}" && git fetch origin "${CURRENT_BRANCH}" > /dev/null 2>&1 \
      && git reset --hard "origin/${CURRENT_BRANCH}" > /dev/null 2>&1 )
    if [ -n "$OPENCODE_BACKUP" ]; then cp "$OPENCODE_BACKUP" "${TARGET_DIR}/opencode.json"; fi
    [ -n "$OPENCODE_BACKUP" ] && rm -f "$OPENCODE_BACKUP"
    continue
  fi
  if [ -d "apps/web/dist" ]; then
    rsync -az --exclude="*.map" -e "${RSYNC_SSH}" apps/web/dist/ "${VPS_USER}@${VPS_HOST}:${TARGET_DIR}/apps/web/dist/"
  fi

  if [ -d "apps/server/dist" ]; then
    rsync -az --exclude="*.map" -e "${RSYNC_SSH}" apps/server/dist/ "${VPS_USER}@${VPS_HOST}:${TARGET_DIR}/apps/server/dist/"
  fi

  if [ -d "bot" ]; then
    rsync -az -e "${RSYNC_SSH}" bot/ "${VPS_USER}@${VPS_HOST}:${TARGET_DIR}/bot/"
  fi

  # Sync git state on VPS target
  ssh "${VPS_USER}@${VPS_HOST}" "bash -s" << EOF
    cd "${TARGET_DIR}" || exit 1
    git fetch origin "${CURRENT_BRANCH}" > /dev/null 2>&1
    git reset --hard "origin/${CURRENT_BRANCH}" > /dev/null 2>&1
EOF
  if [ -n "$OPENCODE_BACKUP" ]; then
    rsync -az -e "${RSYNC_SSH}" "$OPENCODE_BACKUP" "${VPS_USER}@${VPS_HOST}:${TARGET_DIR}/opencode.json"
    rm -f "$OPENCODE_BACKUP"
  fi
done
echo -e "  ${C_GREEN}✓ VPS repositories synchronized with commit ${CURRENT_COMMIT}${C_RESET}"

# ------------------------------------------------------------------------------
# 5. RESTART SERVICE & HEALTH CHECK
# ------------------------------------------------------------------------------
echo -e "\n${C_BOLD}${C_BLUE}[5/5] Restarting VPS Services (autojobs + bot) & Performing Health Checks...${C_RESET}"
if [ "$LOCAL_MODE" = true ]; then
  HEALTH_RESULT=$(bash -s << 'HEALTH_EOF'
  systemctl restart autojobs.service bot-autojobs.service

  STATUS="unknown"
  HTTP_CODE="000"
  BOT_STATUS="unknown"
  BOT_HTTP_CODE="000"

  sleep 3
  for i in {1..15}; do
    STATUS=$(systemctl is-active autojobs.service 2>/dev/null || echo "unknown")
    HTTP_CODE=$(curl --noproxy '*' -s -m 3 -o /dev/null -w "%{http_code}" http://127.0.0.1:13773/ 2>/dev/null || echo "000")
    BOT_STATUS=$(systemctl is-active bot-autojobs.service 2>/dev/null || echo "unknown")
    BOT_HTTP_CODE=$(curl --noproxy '*' -s -m 3 -o /dev/null -w "%{http_code}" http://127.0.0.1:13774/ 2>/dev/null || echo "000")
    if [ "$STATUS" = "active" ] && [ "$HTTP_CODE" = "200" ] && [ "$BOT_STATUS" = "active" ] && [ "$BOT_HTTP_CODE" = "200" ]; then
      break
    fi
    sleep 1
  done

  PID=$(pgrep -f "apps/server/dist/bin.mjs" | head -n 1 || echo "none")
  echo "STATUS=$STATUS|HTTP_CODE=$HTTP_CODE|BOT_STATUS=$BOT_STATUS|BOT_HTTP_CODE=$BOT_HTTP_CODE|PID=$PID"
HEALTH_EOF
)
else
HEALTH_RESULT=$(ssh "${VPS_USER}@${VPS_HOST}" "bash -s" << EOF
  systemctl restart autojobs.service bot-autojobs.service

  STATUS="unknown"
  HTTP_CODE="000"
  BOT_STATUS="unknown"
  BOT_HTTP_CODE="000"

  sleep 3
  for i in {1..15}; do
    STATUS=\$(systemctl is-active autojobs.service 2>/dev/null || echo "unknown")
    HTTP_CODE=\$(curl --noproxy '*' -s -m 3 -o /dev/null -w "%{http_code}" http://127.0.0.1:13773/ 2>/dev/null || echo "000")
    BOT_STATUS=\$(systemctl is-active bot-autojobs.service 2>/dev/null || echo "unknown")
    BOT_HTTP_CODE=\$(curl --noproxy '*' -s -m 3 -o /dev/null -w "%{http_code}" http://127.0.0.1:13774/ 2>/dev/null || echo "000")
    if [ "\$STATUS" = "active" ] && [ "\$HTTP_CODE" = "200" ] && [ "\$BOT_STATUS" = "active" ] && [ "\$BOT_HTTP_CODE" = "200" ]; then
      break
    fi
    sleep 1
  done

  PID=\$(pgrep -f "apps/server/dist/bin.mjs" | head -n 1 || echo "none")
  echo "STATUS=\$STATUS|HTTP_CODE=\$HTTP_CODE|BOT_STATUS=\$BOT_STATUS|BOT_HTTP_CODE=\$BOT_HTTP_CODE|PID=\$PID"
EOF
)
fi

SERVICE_STATUS=$(echo "$HEALTH_RESULT" | grep -o 'STATUS=[^|]*' | cut -d= -f2)
HTTP_CODE=$(echo "$HEALTH_RESULT" | grep -o 'HTTP_CODE=[^|]*' | cut -d= -f2)
BOT_STATUS=$(echo "$HEALTH_RESULT" | grep -o 'BOT_STATUS=[^|]*' | cut -d= -f2)
BOT_HTTP_CODE=$(echo "$HEALTH_RESULT" | grep -o 'BOT_HTTP_CODE=[^|]*' | cut -d= -f2)
SERVICE_PID=$(echo "$HEALTH_RESULT" | grep -o 'PID=.*' | cut -d= -f2)

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# ------------------------------------------------------------------------------
# FINAL REPORT
# ------------------------------------------------------------------------------
echo -e "\n${C_BOLD}${C_CYAN}====================================================================${C_RESET}"
if [ "$SERVICE_STATUS" = "active" ] && [ "$HTTP_CODE" = "200" ] && [ "$BOT_STATUS" = "active" ] && [ "$BOT_HTTP_CODE" = "200" ]; then
  echo -e "${C_BOLD}${C_GREEN} ✅ ALL SERVICES DEPLOYED SUCCESSFULLY! (${DURATION}s)${C_RESET}"
  echo -e "${C_BOLD}${C_CYAN}====================================================================${C_RESET}"
  echo -e "  ${C_BOLD}Commit:${C_RESET}        ${CURRENT_COMMIT} - ${COMMIT_MSG}"
  echo -e "  ${C_BOLD}GitHub:${C_RESET}        Pushed to origin/${CURRENT_BRANCH}"
  echo -e "  ${C_BOLD}AutoJobs (13773):${C_RESET} ${C_GREEN}${SERVICE_STATUS}${C_RESET} (HTTP ${HTTP_CODE} OK)"
  echo -e "  ${C_BOLD}Bot Code (13774):${C_RESET} ${C_GREEN}${BOT_STATUS}${C_RESET} (HTTP ${BOT_HTTP_CODE} OK)"
  echo -e "  ${C_BOLD}Domains:${C_RESET}       https://autojobs.tokendeal.cloud & https://bot.tokendeal.cloud"
  echo -e "${C_CYAN}====================================================================${C_RESET}\n"
  exit 0
else
  echo -e "${C_BOLD}${C_RED} ❌ DEPLOYMENT ISSUE DETECTED (${DURATION}s)${C_RESET}"
  echo -e "  AutoJobs: ${SERVICE_STATUS} (HTTP ${HTTP_CODE})"
  echo -e "  Bot Code: ${BOT_STATUS} (HTTP ${BOT_HTTP_CODE})"
  exit 1
fi
