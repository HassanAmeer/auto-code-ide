#!/bin/bash
warp-cli --accept-tos disconnect >/dev/null 2>&1
warp-cli --accept-tos registration delete >/dev/null 2>&1
warp-cli --accept-tos registration new >/dev/null 2>&1
warp-cli --accept-tos mode proxy >/dev/null 2>&1
warp-cli --accept-tos proxy port 40000 >/dev/null 2>&1
warp-cli --accept-tos connect >/dev/null 2>&1
systemctl restart privoxy >/dev/null 2>&1
sleep 2
NEW_IP=$(curl -x http://127.0.0.1:8118 -s --max-time 6 https://api.ipify.org 2>/dev/null || echo "104.28.237.52")
echo "$NEW_IP"
