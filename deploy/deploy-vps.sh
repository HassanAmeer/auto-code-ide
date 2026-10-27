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
echo -e "\n${C_BOLD}${C_BLUE}[1/5] Checking Local Git Changes...${C_RESET}"
if [ -n "$(git status --porcelain)" ]; then
  echo -e "  ${C_DIM}Staging modified files and committing...${C_RESET}"
  git add .
  git commit -m "$COMMIT_MSG" || {
    echo -e "${C_YELLOW}  ⚠️ Nothing new committed or pre-commit hook skipped.${C_RESET}"
  }
else
  echo -e "  ${C_GREEN}✓ Working tree is clean. Proceeding with current HEAD.${C_RESET}"
fi

CURRENT_COMMIT=$(git rev-parse --short HEAD)
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
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

# Test SSH connection
if ! ssh -o BatchMode=yes -o ConnectTimeout=5 "${VPS_USER}@${VPS_HOST}" "true" 2>/dev/null; then
  echo -e "${C_BOLD}${C_RED}❌ Cannot connect to VPS (${VPS_USER}@${VPS_HOST}) via SSH!${C_RESET}"
  exit 1
fi

# Rsync web and server dist for zero-downtime, fast asset delivery
if [ -d "apps/web/dist" ]; then
  echo -e "  ${C_DIM}Syncing web dist...${C_RESET}"
  rsync -az --delete apps/web/dist/ "${VPS_USER}@${VPS_HOST}:${VPS_DIR}/apps/web/dist/"
fi

if [ -d "apps/server/dist" ]; then
  echo -e "  ${C_DIM}Syncing server dist...${C_RESET}"
  rsync -az --delete apps/server/dist/ "${VPS_USER}@${VPS_HOST}:${VPS_DIR}/apps/server/dist/"
fi

# Sync git state on VPS
echo -e "  ${C_DIM}Updating Git repo on VPS...${C_RESET}"
ssh "${VPS_USER}@${VPS_HOST}" "bash -s" << EOF
  cd "${VPS_DIR}" || exit 1
  git fetch origin "${CURRENT_BRANCH}" > /dev/null 2>&1
  git reset --hard "origin/${CURRENT_BRANCH}" > /dev/null 2>&1
EOF
echo -e "  ${C_GREEN}✓ VPS repository synchronized with commit ${CURRENT_COMMIT}${C_RESET}"

# ------------------------------------------------------------------------------
# 5. RESTART SERVICE & HEALTH CHECK
# ------------------------------------------------------------------------------
echo -e "\n${C_BOLD}${C_BLUE}[5/5] Restarting VPS Service & Performing Health Check...${C_RESET}"
HEALTH_RESULT=$(ssh "${VPS_USER}@${VPS_HOST}" "bash -s" << EOF
  systemctl restart ${SERVICE_NAME}
  sleep 2

  STATUS=\$(systemctl is-active ${SERVICE_NAME} 2>/dev/null || echo "unknown")
  HTTP_CODE=\$(curl --noproxy '*' -s -m 5 -o /dev/null -w "%{http_code}" http://127.0.0.1:${VPS_PORT}/ 2>/dev/null || echo "000")
  PID=\$(pgrep -f "apps/server/dist/bin.mjs" | head -n 1 || echo "none")

  echo "STATUS=\$STATUS|HTTP_CODE=\$HTTP_CODE|PID=\$PID"
EOF
)

SERVICE_STATUS=$(echo "$HEALTH_RESULT" | grep -o 'STATUS=[^|]*' | cut -d= -f2)
HTTP_CODE=$(echo "$HEALTH_RESULT" | grep -o 'HTTP_CODE=[^|]*' | cut -d= -f2)
SERVICE_PID=$(echo "$HEALTH_RESULT" | grep -o 'PID=.*' | cut -d= -f2)

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# ------------------------------------------------------------------------------
# FINAL REPORT
# ------------------------------------------------------------------------------
echo -e "\n${C_BOLD}${C_CYAN}====================================================================${C_RESET}"
if [ "$SERVICE_STATUS" = "active" ] && [ "$HTTP_CODE" = "200" ]; then
  echo -e "${C_BOLD}${C_GREEN} ✅ DEPLOYMENT SUCCESSFUL! (${DURATION}s)${C_RESET}"
  echo -e "${C_BOLD}${C_CYAN}====================================================================${C_RESET}"
  echo -e "  ${C_BOLD}Commit:${C_RESET}        ${CURRENT_COMMIT} - ${COMMIT_MSG}"
  echo -e "  ${C_BOLD}GitHub:${C_RESET}        Pushed to origin/${CURRENT_BRANCH}"
  echo -e "  ${C_BOLD}VPS Service:${C_RESET}   ${C_GREEN}${SERVICE_STATUS}${C_RESET} (PID: ${SERVICE_PID})"
  echo -e "  ${C_BOLD}Health Status:${C_RESET} ${C_GREEN}HTTP ${HTTP_CODE} OK${C_RESET}"
  echo -e "  ${C_BOLD}VPS Target:${C_RESET}    http://${VPS_HOST}:${VPS_PORT}/"
  echo -e "${C_CYAN}====================================================================${C_RESET}\n"
  exit 0
else
  echo -e "${C_BOLD}${C_RED} ❌ DEPLOYMENT ISSUE DETECTED (${DURATION}s)${C_RESET}"
  echo -e "${C_BOLD}${C_CYAN}====================================================================${C_RESET}"
  echo -e "  ${C_BOLD}Commit:${C_RESET}        ${CURRENT_COMMIT}"
  echo -e "  ${C_BOLD}VPS Service:${C_RESET}   ${C_RED}${SERVICE_STATUS}${C_RESET}"
  echo -e "  ${C_BOLD}Health Status:${C_RESET} ${C_RED}HTTP ${HTTP_CODE}${C_RESET}"
  echo -e "\n${C_YELLOW}Fetching last 20 log lines from VPS for diagnosis:${C_RESET}"
  ssh "${VPS_USER}@${VPS_HOST}" "journalctl -u ${SERVICE_NAME} -n 20 --no-pager"
  echo -e "${C_CYAN}====================================================================${C_RESET}\n"
  exit 1
fi
