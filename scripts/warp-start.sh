#!/usr/bin/env bash
# Start Cloudflare WARP proxy mode + Privoxy bridge (lab copy of bot flow).
set -u
warp-cli --accept-tos mode proxy >/dev/null 2>&1 || true
warp-cli --accept-tos proxy port 40000 >/dev/null 2>&1 || true
warp-cli --accept-tos connect >/dev/null 2>&1 || true
if [ -f /etc/privoxy/config ]; then
  sed -i "s/forward-socks5 \/ 127.0.0.1:[0-9]* ./forward-socks5 \/ 127.0.0.1:40000 ./" /etc/privoxy/config 2>/dev/null || true
fi
systemctl start privoxy >/dev/null 2>&1 || true
warp-cli --accept-tos status 2>/dev/null || true
