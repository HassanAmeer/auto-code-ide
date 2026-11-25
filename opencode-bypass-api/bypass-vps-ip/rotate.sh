#!/bin/bash
# ==============================================================================
# Cloudflare WARP IP Rotation & Privoxy Bridge
# ==============================================================================

# 1. Capture current IP before rotation
OLD_IP=$(curl -x http://127.0.0.1:8118 -s --max-time 3 https://cloudflare.com/cdn-cgi/trace 2>/dev/null | grep '^ip=' | cut -d= -f2 | tr -d ' \n\r')

# 2. Try tunnel key rotation first (fast path)
warp-cli --accept-tos tunnel rotate-keys >/dev/null 2>&1
warp-cli --accept-tos mode proxy >/dev/null 2>&1
warp-cli --accept-tos proxy port 40000 >/dev/null 2>&1
warp-cli --accept-tos connect >/dev/null 2>&1

# 3. Ensure Privoxy explicitly bridges to WARP SOCKS5 (port 40000)
if [ -f /etc/privoxy/config ]; then
  sed -i "s/forward-socks5 \/ 127.0.0.1:[0-9]* ./forward-socks5 \/ 127.0.0.1:40000 ./" /etc/privoxy/config 2>/dev/null || true
  systemctl restart privoxy >/dev/null 2>&1 || true
fi

# 4. Wait until healthy egress is established (up to 8 seconds)
NEW_IP=""
for i in {1..16}; do
  NEW_IP=$(curl -x http://127.0.0.1:8118 -s --max-time 3 https://cloudflare.com/cdn-cgi/trace 2>/dev/null | grep '^ip=' | cut -d= -f2 | tr -d ' \n\r')
  if [ -n "$NEW_IP" ] && [ ${#NEW_IP} -ge 7 ] && [ ${#NEW_IP} -le 45 ]; then
    break
  fi
  sleep 0.5
done

# 5. If IP didn't change after rotate-keys, force full re-registration (guaranteed new IP)
if [ -z "$NEW_IP" ] || [ "$NEW_IP" = "$OLD_IP" ]; then
  echo "[rotate.sh] IP same ($OLD_IP), falling back to registration delete+new..." >&2
  warp-cli --accept-tos disconnect >/dev/null 2>&1
  warp-cli --accept-tos registration delete >/dev/null 2>&1
  warp-cli --accept-tos registration new >/dev/null 2>&1
  warp-cli --accept-tos mode proxy >/dev/null 2>&1
  warp-cli --accept-tos proxy port 40000 >/dev/null 2>&1
  warp-cli --accept-tos connect >/dev/null 2>&1
  systemctl restart privoxy >/dev/null 2>&1 || true
  # Wait again for new IP
  for i in {1..20}; do
    NEW_IP=$(curl -x http://127.0.0.1:8118 -s --max-time 3 https://cloudflare.com/cdn-cgi/trace 2>/dev/null | grep '^ip=' | cut -d= -f2 | tr -d ' \n\r')
    if [ -n "$NEW_IP" ] && [ ${#NEW_IP} -ge 7 ] && [ ${#NEW_IP} -le 45 ] && [ "$NEW_IP" != "$OLD_IP" ]; then
      break
    fi
    sleep 0.5
  done
fi

# Fallbacks if cdn-cgi/trace had delay
if [ -z "$NEW_IP" ] || [ ${#NEW_IP} -gt 45 ]; then
  NEW_IP=$(curl -x http://127.0.0.1:8118 -s --max-time 3 https://api.ipify.org 2>/dev/null | tr -d ' \n\r')
fi
if [ -z "$NEW_IP" ] || [ ${#NEW_IP} -gt 45 ]; then
  NEW_IP=$(curl -x http://127.0.0.1:8118 -s --max-time 3 https://checkip.amazonaws.com 2>/dev/null | tr -d ' \n\r')
fi
if [ -z "$NEW_IP" ] || [ ${#NEW_IP} -gt 45 ]; then
  NEW_IP=$(curl -x socks5h://127.0.0.1:40000 -s --max-time 3 https://cloudflare.com/cdn-cgi/trace 2>/dev/null | grep '^ip=' | cut -d= -f2 | tr -d ' \n\r')
fi

echo "$NEW_IP"
