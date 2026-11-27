#!/usr/bin/env bash
# Cloudflare WARP egress rotation for the standalone limit-reset lab.
# Prints the new outbound IP on stdout (one line).
set -u

warp-cli --accept-tos tunnel rotate-keys >/dev/null 2>&1 || true
warp-cli --accept-tos mode proxy >/dev/null 2>&1 || true
warp-cli --accept-tos proxy port 40000 >/dev/null 2>&1 || true
warp-cli --accept-tos connect >/dev/null 2>&1 || true

if [ -f /etc/privoxy/config ]; then
  sed -i "s/forward-socks5 \/ 127.0.0.1:[0-9]* ./forward-socks5 \/ 127.0.0.1:40000 ./" /etc/privoxy/config 2>/dev/null || true
  systemctl restart privoxy >/dev/null 2>&1 || true
fi

NEW_IP=""
for _ in $(seq 1 16); do
  NEW_IP=$(curl -x http://127.0.0.1:8118 -s --max-time 3 https://cloudflare.com/cdn-cgi/trace 2>/dev/null | grep '^ip=' | cut -d= -f2 | tr -d ' \n\r')
  if [ -n "$NEW_IP" ] && [ ${#NEW_IP} -ge 7 ] && [ ${#NEW_IP} -le 45 ]; then
    break
  fi
  sleep 0.5
done

if [ -z "$NEW_IP" ] || [ ${#NEW_IP} -gt 45 ]; then
  NEW_IP=$(curl -x http://127.0.0.1:8118 -s --max-time 3 https://api.ipify.org 2>/dev/null | tr -d ' \n\r')
fi
if [ -z "$NEW_IP" ] || [ ${#NEW_IP} -gt 45 ]; then
  NEW_IP=$(curl -x socks5h://127.0.0.1:40000 -s --max-time 3 https://api.ipify.org 2>/dev/null | tr -d ' \n\r')
fi

echo "$NEW_IP"
