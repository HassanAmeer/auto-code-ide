#!/usr/bin/env bash
# ==============================================================================
# OpenCode Residential Proxy Tunnel Keep-Alive Daemon
# ==============================================================================
# Yeh script local machine par chalti hai aur VPS (201.18.218.29) ke sath
# reverse SOCKS5 proxy tunnel (port 10808) ko permanently active rakhti hai.
# Agar connection drop ho jaye to automatically reconnect karti hai.
# ==============================================================================

VPS_HOST="201.18.218.29"
VPS_USER="root"
REMOTE_PORT="10808"

echo "[tunnel-keepalive] Starting persistent residential reverse proxy to ${VPS_HOST}..."

while true; do
  # Check if port 10808 on VPS is alive
  if ssh -o BatchMode=yes -o ConnectTimeout=5 "${VPS_USER}@${VPS_HOST}" "nc -z 127.0.0.1 ${REMOTE_PORT}" >/dev/null 2>&1; then
    sleep 10
  else
    echo "[tunnel-keepalive] Tunnel not active or disconnected. Spawning reverse tunnel..."
    ssh -o BatchMode=yes \
        -o ServerAliveInterval=15 \
        -o ServerAliveCountMax=3 \
        -o ExitOnForwardFailure=yes \
        -f -N -R "${REMOTE_PORT}" "${VPS_USER}@${VPS_HOST}" 2>/dev/null || true
    sleep 5
  fi
done
