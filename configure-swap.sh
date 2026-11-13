#!/usr/bin/env bash
# ==============================================================================
# T3ForWeb - Automated NVMe Swap Configuration Script
# Usage:
#   sudo ./configure-swap.sh [SIZE]
# Example:
#   sudo ./configure-swap.sh        # Default: 2G
#   sudo ./configure-swap.sh 10G    # Heavy workload / Multi-tasking: 10G
# ==============================================================================

set -euo pipefail

SWAP_SIZE="${1:-2G}"
SWAP_FILE="/swapfile"
NEW_SWAP_FILE="/swapfile.new"

echo "=========================================================="
echo "  T3ForWeb: Configuring NVMe Swap (${SWAP_SIZE})"
echo "=========================================================="

if [[ $EUID -ne 0 ]]; then
   echo "Error: This script must be run as root (use sudo)." >&2
   exit 1
fi

# 1. Allocate swap file safely
echo "[1/5] Allocating ${SWAP_SIZE} swapfile at ${NEW_SWAP_FILE}..."
rm -f "${NEW_SWAP_FILE}"
fallocate -l "${SWAP_SIZE}" "${NEW_SWAP_FILE}" || dd if=/dev/zero of="${NEW_SWAP_FILE}" bs=1M count=$(( ${SWAP_SIZE%G} * 1024 )) status=progress

# 2. Strict secure permissions
echo "[2/5] Setting secure permissions (chmod 600)..."
chmod 600 "${NEW_SWAP_FILE}"
mkswap "${NEW_SWAP_FILE}"

# 3. Safe zero-downtime transition if an existing swap is active
echo "[3/5] Activating new swap file..."
swapon "${NEW_SWAP_FILE}"

if swapon --show | grep -q "${SWAP_FILE}"; then
    echo "  -> Safely deactivating old ${SWAP_FILE}..."
    swapoff "${SWAP_FILE}" || true
    rm -f "${SWAP_FILE}"
fi

swapoff "${NEW_SWAP_FILE}"
mv "${NEW_SWAP_FILE}" "${SWAP_FILE}"
chmod 600 "${SWAP_FILE}"
swapon "${SWAP_FILE}"

# 4. Ensure persistent mount in /etc/fstab without duplicates
echo "[4/5] Ensuring persistent mount in /etc/fstab..."
if ! grep -qs "^${SWAP_FILE} " /etc/fstab; then
    echo "${SWAP_FILE} none swap sw 0 0" >> /etc/fstab
    echo "  -> Added ${SWAP_FILE} to /etc/fstab"
else
    echo "  -> ${SWAP_FILE} already present in /etc/fstab (no duplicates created)"
fi

# 5. Optimize kernel sysctl settings
echo "[5/5] Configuring kernel RAM prioritization (swappiness=10, vfs_cache_pressure=50)..."
cat << 'EOF' > /etc/sysctl.d/99-t3forweb-swap.conf
# Prioritize 8GB physical RAM and use NVMe swap as safety net
vm.swappiness = 10
vm.vfs_cache_pressure = 50
EOF

if [[ -f /etc/sysctl.conf ]] && ! grep -qs "vm.swappiness" /etc/sysctl.conf; then
cat << 'EOF' >> /etc/sysctl.conf
# Prioritize 8GB physical RAM and use NVMe swap as safety net
vm.swappiness = 10
vm.vfs_cache_pressure = 50
EOF
fi

sysctl --system >/dev/null 2>&1 || sysctl -p /etc/sysctl.d/99-t3forweb-swap.conf >/dev/null 2>&1 || true

echo ""
echo "=========================================================="
echo "  Swap Configuration Complete!"
echo "=========================================================="
swapon --show
echo ""
free -h
echo ""
echo "Kernel parameters:"
sysctl vm.swappiness vm.vfs_cache_pressure
