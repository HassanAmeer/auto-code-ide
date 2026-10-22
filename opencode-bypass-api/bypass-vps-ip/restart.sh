#!/bin/bash
warp-cli --accept-tos disconnect
sleep 1
warp-cli --accept-tos connect
sleep 2
warp-cli --accept-tos status
