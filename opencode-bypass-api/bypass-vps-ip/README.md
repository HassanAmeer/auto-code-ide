# Bypass VPS IP via Cloudflare Tunnel / WARP Proxy

Yeh folder AutoCode ke OpenCode bypass ke liye outgoing IP routing manage karta hai.

- **Proxy Type:** Cloudflare WARP Proxy (SOCKS5)
- **Local Proxy Port:** `127.0.0.1:40000`
- **Outgoing IP Type:** Cloudflare Consumer Network (`warp=on`, e.g. `104.28.237.48`)
- **Direct VPS IP:** `201.18.218.29` (VPS ki normal services, SSH aur AutoCode port bilkul direct aur unchanged rehte hain).
- **Service:** `warp-svc.service` (Systemd auto-start on boot)

### Management Scripts:

- `status.sh` : Check proxy connection status and outgoing IP
- `start.sh` : Ensure proxy connection is active
- `restart.sh`: Reconnect proxy to obtain a fresh Cloudflare tunnel IP

### Privoxy HTTP-to-WARP Bridge

- **HTTP Proxy Port:** `http://127.0.0.1:8118` (Node / Bun native fetch proxy compatible)
- **Forwarded to:** `socks5://127.0.0.1:40000` (Cloudflare WARP)
- **Outgoing IP:** Cloudflare Residential/Anycast (`warp=on`)
