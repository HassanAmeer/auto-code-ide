#!/bin/bash
warp-cli --accept-tos mode proxy
warp-cli --accept-tos proxy port 40000
warp-cli --accept-tos connect
warp-cli --accept-tos status
