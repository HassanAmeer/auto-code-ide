#!/bin/bash
warp-cli --accept-tos disconnect
sleep 1
warp-cli --accept-tos connect
if [ -f /etc/privoxy/config ]; then
  sed -i "s/forward-socks5 \/ 127.0.0.1:[0-9]* ./forward-socks5 \/ 127.0.0.1:40000 ./" /etc/privoxy/config 2>/dev/null || true
fi
systemctl restart privoxy >/dev/null 2>&1 || true
sleep 2
warp-cli --accept-tos status
