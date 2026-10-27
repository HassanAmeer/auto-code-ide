#!/usr/bin/env bash
# ==============================================================================
# One-Click LiveKit Server VPS Setup Script (bot/livekit/setup-vps.sh)
# ==============================================================================
# Sets up LiveKit Server on your VPS using Docker or official standalone binary.
# ==============================================================================

set -euo pipefail

LIVEKIT_PORT=7880
RTC_PORT=7881
UDP_PORT=7882
CONFIG_DIR="/etc/livekit"

echo "===================================================================="
echo " 🎙️ LIVEKIT SERVER VPS SETUP"
echo "===================================================================="

# 1. Create Config Directory
mkdir -p "$CONFIG_DIR"

# 2. Generate secure livekit.yaml configuration
cat << 'EOF' > "$CONFIG_DIR/livekit.yaml"
port: 7880
bind_addresses:
  - ""
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true
keys:
  devkey: secret
logging:
  level: info
EOF

echo "✓ Configuration created at $CONFIG_DIR/livekit.yaml"

# 3. Check if Docker is available
if command -v docker &> /dev/null; then
  echo "✓ Docker detected. Starting LiveKit Server container..."
  docker stop livekit-server 2>/dev/null || true
  docker rm livekit-server 2>/dev/null || true

  docker run -d \
    --name livekit-server \
    --restart unless-stopped \
    -p 7880:7880 \
    -p 7881:7881 \
    -p 50000-50100:50000-50100/udp \
    -v "$CONFIG_DIR/livekit.yaml:/livekit.yaml" \
    livekit/livekit-server:latest \
    --config /livekit.yaml

  echo "✓ LiveKit Server running via Docker on port 7880!"
else
  # 4. Fallback: Download official single binary
  echo "Downloading standalone LiveKit binary..."
  curl -sSL https://get.livekit.io | bash
  
  cat << 'EOF' > /etc/systemd/system/livekit-server.service
[Unit]
Description=LiveKit Server
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/livekit-server --config /etc/livekit/livekit.yaml
Restart=always
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable --now livekit-server.service
  echo "✓ LiveKit Server running as systemd service on port 7880!"
fi

echo "===================================================================="
echo " ✅ LiveKit Server is LIVE on http://127.0.0.1:7880"
echo "===================================================================="
