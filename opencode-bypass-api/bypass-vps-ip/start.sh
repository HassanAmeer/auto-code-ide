#!/bin/bash
warp-cli --accept-tos mode proxy >/dev/null 2>&1
warp-cli --accept-tos proxy port 40000 >/dev/null 2>&1
warp-cli --accept-tos connect >/dev/null 2>&1
systemctl start privoxy >/dev/null 2>&1
warp-cli --accept-tos status
