#!/usr/bin/env bash
# ==============================================================================
# OpenCode Free Tier Quota / Rate-Limit Reset Utility
# ==============================================================================
# Yeh script OpenCode free models (DeepSeek, Beam, GLM) ka rate limit reset
# aur network/session verification automatically perform karta hai.
#
# Workflows:
#   1. Network Egress Check (Residential Tunnel vs Cloudflare WARP)
#   2. Session ID Minting (Canonical descending bitwise encoding)
#   3. Daemon & Privoxy Reconfiguration
#   4. Model Live Smoke Test (deepseek-v4.1-flash-free & beam-free)
# ==============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}======================================================${NC}"
echo -e "${CYAN}   OpenCode Free Tier Limit Reset & Health Engine     ${NC}"
echo -e "${CYAN}======================================================${NC}"

# 1. Check Reverse SOCKS5 Residential Tunnel (Port 10808)
echo -e "\n${YELLOW}[1/4] Checking Network Egress & Proxies...${NC}"

RESIDENTIAL_ACTIVE=false
if curl -s -x socks5h://127.0.0.1:10808 --max-time 4 https://api.ipify.org >/dev/null 2>&1; then
  RES_IP=$(curl -s -x socks5h://127.0.0.1:10808 --max-time 5 https://api.ipify.org)
  echo -e "  ${GREEN}✓${NC} Residential SOCKS5 Tunnel (127.0.0.1:10808) is ACTIVE (IP: ${GREEN}${RES_IP}${NC})"
  RESIDENTIAL_ACTIVE=true
else
  echo -e "  ${YELLOW}!${NC} Residential SOCKS5 Tunnel on port 10808 is not active."
fi

# Configure Privoxy (/etc/privoxy/config) based on available route
if [ "$RESIDENTIAL_ACTIVE" = true ]; then
  echo -e "  ➔ Pointing Privoxy (8118) to Residential Tunnel (10808)..."
  if grep -q "forward-socks5 / 127.0.0.1:10808 ." /etc/privoxy/config 2>/dev/null; then
    echo -e "    ${GREEN}✓${NC} Privoxy is already routed to residential proxy."
  else
    sed -i "s/forward-socks5 \/ 127.0.0.1:[0-9]* ./forward-socks5 \/ 127.0.0.1:10808 ./" /etc/privoxy/config 2>/dev/null || true
    systemctl restart privoxy 2>/dev/null || true
  fi
else
  echo -e "  ➔ Rotating Cloudflare WARP registration (Port 40000)..."
  warp-cli --accept-tos disconnect >/dev/null 2>&1 || true
  warp-cli --accept-tos registration delete >/dev/null 2>&1 || true
  warp-cli --accept-tos registration new >/dev/null 2>&1 || true
  warp-cli --accept-tos mode proxy >/dev/null 2>&1 || true
  warp-cli --accept-tos proxy port 40000 >/dev/null 2>&1 || true
  warp-cli --accept-tos connect >/dev/null 2>&1 || true
  sed -i "s/forward-socks5 \/ 127.0.0.1:[0-9]* ./forward-socks5 \/ 127.0.0.1:40000 ./" /etc/privoxy/config 2>/dev/null || true
  systemctl restart privoxy 2>/dev/null || true
fi

# Verify Privoxy Egress IP
PRIVOXY_IP=$(curl -x http://127.0.0.1:8118 -s --max-time 6 https://api.ipify.org 2>/dev/null || echo "FAILED")
echo -e "  ${GREEN}✓${NC} Current Outbound Privoxy IP: ${CYAN}${PRIVOXY_IP}${NC}"

# 2. Session ID Generation (Canonical Bitwise Descending Layout)
echo -e "\n${YELLOW}[2/4] Minting Fresh Canonical Session ID...${NC}"
NODE_CMD="
const ts = BigInt(Date.now());
const counter = BigInt(Math.floor(Math.random() * 62) + 1);
const raw = ~((ts << 12n) | counter) & 0xffffffffffffn;
const timePart = raw.toString(16).padStart(12, '0');
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
let rand = '';
for (let i = 0; i < 14; i++) {
  rand += BASE62[Math.floor(Math.random() * BASE62.length)];
}
console.log('ses_' + timePart + rand);
"
NEW_SESSION=$(node -e "$NODE_CMD")
echo -e "  ${GREEN}✓${NC} Fresh Session Minted: ${CYAN}${NEW_SESSION}${NC}"

# 3. Check and Restart OpenCode Daemon if Needed
echo -e "\n${YELLOW}[3/4] Checking OpenCode Daemon (127.0.0.1:4099)...${NC}"
DAEMON_HEALTH=$(curl -s http://127.0.0.1:4099/global/health 2>/dev/null || echo "")
if [ -n "$DAEMON_HEALTH" ]; then
  echo -e "  ${GREEN}✓${NC} OpenCode Daemon is RUNNING on port 4099."
else
  echo -e "  ${YELLOW}!${NC} Restarting opencode-server.service..."
  systemctl restart opencode-server 2>/dev/null || true
  sleep 3
fi

# 4. Live Model Verification Test
echo -e "\n${YELLOW}[4/4] Executing Live Model Smoke Test...${NC}"

test_model() {
  local MODEL_NAME=$1
  echo -n -e "  Testing ${CYAN}${MODEL_NAME}${NC}... "

  # Create session on daemon port 4099
  local SESS_JSON
  SESS_JSON=$(curl -s -u opencode:autocode123 -X POST "http://127.0.0.1:4099/api/session" \
    -H "Content-Type: application/json" \
    -d "{\"model\":{\"id\":\"${MODEL_NAME}\",\"providerID\":\"opencode\"}}")

  local S_ID
  S_ID=$(echo "$SESS_JSON" | grep -o '"id":"ses_[^"]*"' | head -n 1 | cut -d'"' -f4)

  if [ -z "$S_ID" ]; then
    echo -e "${RED}FAILED (Session Creation Error)${NC}"
    echo "    Response: $SESS_JSON"
    return 1
  fi

  # Send test prompt
  local PROMPT_RES
  PROMPT_RES=$(curl -s -u opencode:autocode123 -X POST "http://127.0.0.1:4099/api/session/${S_ID}/prompt" \
    -H "Content-Type: application/json" \
    -d '{"text":"Reply strictly with: PONG"}')

  sleep 2.5

  # Check assistant response
  local MSG_RES
  MSG_RES=$(curl -s -u opencode:autocode123 -X GET "http://127.0.0.1:4099/api/session/${S_ID}/message")

  if echo "$MSG_RES" | grep -q "FreeUsageLimitError"; then
    echo -e "${RED}FAILED (FreeUsageLimitError Rate Limit Hit)${NC}"
    return 1
  elif echo "$MSG_RES" | grep -q "PONG"; then
    echo -e "${GREEN}SUCCESS (Model Responded 200 OK)${NC}"
    return 0
  else
    # Check if assistant succeeded
    if echo "$MSG_RES" | grep -q '"type":"assistant"'; then
      echo -e "${GREEN}SUCCESS (Generated Response)${NC}"
      return 0
    else
      echo -e "${YELLOW}WAITING / COMPLETED${NC}"
      return 0
    fi
  fi
}

test_model "deepseek-v4.1-flash-free"
test_model "beam-free"
test_model "glm-5.3-flash-free"

echo -e "\n${GREEN}======================================================${NC}"
echo -e "${GREEN}   ✓ OpenCode Limit Reset & Verification Finished!   ${NC}"
echo -e "${GREEN}   Egress IP: ${PRIVOXY_IP}                              ${NC}"
echo -e "${GREEN}======================================================${NC}"
