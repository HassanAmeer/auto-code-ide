#!/usr/bin/env bash
# Stop WARP tunnel + Privoxy completely (standalone lab).
set -u
warp-cli --accept-tos disconnect >/dev/null 2>&1 || true
systemctl stop privoxy >/dev/null 2>&1 || true
echo "Stopped"
