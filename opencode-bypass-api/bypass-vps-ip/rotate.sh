#!/bin/bash
warp-cli --accept-tos disconnect >/dev/null 2>&1
warp-cli --accept-tos registration delete >/dev/null 2>&1
warp-cli --accept-tos registration new >/dev/null 2>&1
warp-cli --accept-tos mode proxy >/dev/null 2>&1
warp-cli --accept-tos proxy port 40000 >/dev/null 2>&1
warp-cli --accept-tos connect >/dev/null 2>&1

# Ensure Privoxy explicitly bridges to WARP SOCKS5 (port 40000)
if [ -f /etc/privoxy/config ]; then
  sed -i "s/forward-socks5 \/ 127.0.0.1:[0-9]* ./forward-socks5 \/ 127.0.0.1:40000 ./" /etc/privoxy/config 2>/dev/null || true
  systemctl restart privoxy >/dev/null 2>&1 || true
fi

# Wait until connected (up to 5 seconds)
for i in {1..10}; do
  if warp-cli --accept-tos status 2>/dev/null | grep -q "Connected"; then
    break
  fi
  sleep 0.5
done
sleep 1

NEW_IP=$(curl -x http://127.0.0.1:8118 -s --max-time 6 https://checkip.amazonaws.com 2>/dev/null | tr -d ' \n\r')
if [ -z "$NEW_IP" ] || [ ${#NEW_IP} -gt 45 ]; then
  NEW_IP=$(curl -x http://127.0.0.1:8118 -s --max-time 6 https://cloudflare.com/cdn-cgi/trace 2>/dev/null | grep '^ip=' | cut -d= -f2 | tr -d ' \n\r')
fi
if [ -z "$NEW_IP" ] || [ ${#NEW_IP} -gt 45 ]; then
  NEW_IP=$(curl -x http://127.0.0.1:8118 -s --max-time 6 https://api.ipify.org 2>/dev/null | tr -d ' \n\r')
fi
# Direct SOCKS5 fallback
if [ -z "$NEW_IP" ] || [ ${#NEW_IP} -gt 45 ]; then
  NEW_IP=$(curl -x socks5h://127.0.0.1:40000 -s --max-time 6 https://checkip.amazonaws.com 2>/dev/null | tr -d ' \n\r')
fi
echo "$NEW_IP"
