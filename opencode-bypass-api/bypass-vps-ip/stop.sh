#!/bin/bash
warp-cli --accept-tos disconnect >/dev/null 2>&1
systemctl stop privoxy >/dev/null 2>&1
echo "Stopped"
