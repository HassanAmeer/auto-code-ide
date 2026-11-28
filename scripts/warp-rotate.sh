#!/usr/bin/env bash
# Cloudflare WARP IP rotation — disconnect, rotate keys, and fallback to
# registration delete + new (same as bot's reset.sh / proxy.ts) if IP didn't change.
# Prints the new outbound IP on stdout.
set -u

fetch_ip() {
  local ip=""
  for _ in $(seq 1 16); do
    ip=$(curl -x http://127.0.0.1:8118 -s --max-time 3 https://cloudflare.com/cdn-cgi/trace 2>/dev/null | grep '^ip=' | cut -d= -f2 | tr -d ' \n\r')
    if [ -n "$ip" ] && [ ${#ip} -ge 7 ] && [ ${#ip} -le 45 ]; then
      echo "$ip"
      return 0
    fi
    sleep 0.5
  done
  ip=$(curl -x http://127.0.0.1:8118 -s --max-time 3 https://api.ipify.org 2>/dev/null | tr -d ' \n\r')
  if [ -n "$ip" ] && [ ${#ip} -le 45 ]; then
    echo "$ip"
    return 0
  fi
  ip=$(curl -x socks5h://127.0.0.1:40000 -s --max-time 3 https://api.ipify.org 2>/dev/null | tr -d ' \n\r')
  echo "$ip"
}

sync_privoxy() {
  if [ -f /etc/privoxy/config ]; then
    sed -i "s/forward-socks5 \/ 127.0.0.1:[0-9]* ./forward-socks5 \/ 127.0.0.1:40000 ./" /etc/privoxy/config 2>/dev/null || true
    systemctl restart privoxy >/dev/null 2>&1 || true
  fi
}

wait_connected() {
  for _ in $(seq 1 16); do
    if warp-cli --accept-tos status 2>/dev/null | grep -qiE "connected|healthy"; then
      return 0
    fi
    sleep 0.5
  done
}

rotate_keys() {
  warp-cli --accept-tos disconnect >/dev/null 2>&1 || true
  warp-cli --accept-tos tunnel rotate-keys >/dev/null 2>&1 || true
  warp-cli --accept-tos mode proxy >/dev/null 2>&1 || true
  warp-cli --accept-tos proxy port 40000 >/dev/null 2>&1 || true
  warp-cli --accept-tos connect >/dev/null 2>&1 || true
  wait_connected
  sync_privoxy
}

rotate_registration() {
  warp-cli --accept-tos disconnect >/dev/null 2>&1 || true
  warp-cli --accept-tos registration delete >/dev/null 2>&1 || true
  warp-cli --accept-tos registration new >/dev/null 2>&1 || true
  warp-cli --accept-tos mode proxy >/dev/null 2>&1 || true
  warp-cli --accept-tos proxy port 40000 >/dev/null 2>&1 || true
  warp-cli --accept-tos connect >/dev/null 2>&1 || true
  wait_connected
  sync_privoxy
}

OLD_IP=$(curl -x http://127.0.0.1:8118 -s --max-time 3 https://cloudflare.com/cdn-cgi/trace 2>/dev/null | grep '^ip=' | cut -d= -f2 | tr -d ' \n\r')

rotate_keys
NEW_IP=$(fetch_ip)

if [ -z "$NEW_IP" ] || { [ -n "$OLD_IP" ] && [ "$NEW_IP" = "$OLD_IP" ]; }; then
  rotate_registration
  NEW_IP=$(fetch_ip)
fi

echo "$NEW_IP"
