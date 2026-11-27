#!/usr/bin/env bash
# Pause WARP tunnel; keep the Privoxy daemon up (standalone lab).
set -u
warp-cli --accept-tos disconnect >/dev/null 2>&1 || true
warp-cli --accept-tos status 2>/dev/null || true
