#!/bin/bash
echo "=== WARP Status ==="
warp-cli --accept-tos status
echo "=== Outgoing Proxy IP ==="
curl -x socks5h://127.0.0.1:40000 -s https://api.ipify.org
echo ""
curl -x socks5h://127.0.0.1:40000 -s https://www.cloudflare.com/cdn-cgi/trace | grep -iE 'warp=|loc='
echo "=== Privoxy HTTP Bridge Status ==="
curl -x http://127.0.0.1:8118 -s https://api.ipify.org
echo ""
