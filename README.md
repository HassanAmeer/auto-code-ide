# AutoCode IDE (T3ForWeb)

A high-performance agentic web IDE and workspace orchestrator designed for multi-project development, background LLM task execution, live terminals, and Git worktree management.

---

## 🚀 Swap Memory & Performance Tuning Guide

T3ForWeb is engineered to handle multiple concurrent workspaces, AI agent runs, terminal instances, and Vite/Rollup builds simultaneously. To maintain stability under heavy multi-task workloads, an automated NVMe Swap configuration script is provided in `./deploy/configure-swap.sh`.

### 📌 Default vs Heavy Workload Swap Sizes

- **Default Size (2 GB):** By default, running `./deploy/configure-swap.sh` allocates a **2 GB** swapfile. This is sufficient for lightweight or standard single-user sessions.
- **Recommended Heavy Workload (10 GB):** If you run **5 to 6 simultaneous tasks**, parallel builds, or multiple concurrent AI subagents, scale the swap up to **10 GB** (`sudo ./deploy/configure-swap.sh 10G`).

---

### 💡 Why Swap Memory is Essential for Multi-Tasking

When multiple background agents or tasks run together:

1. **Prevents Linux OOM Killer Disasters:** If physical RAM (e.g., 8 GB) gets saturated during heavy Vite/Rust/TypeScript builds or large context LLM queries, the Linux kernel Out-Of-Memory (OOM) killer would otherwise terminate critical services like `node`, `sqlite`, or `autojobs.service`. Swap acts as an emergency safety buffer.
2. **Smooth Multi-Tasking (5–6 Tasks at Once):** Inactive memory pages from idle browser tabs, dormant terminals, or background workers are paged out to the fast NVMe swap, keeping physical RAM completely free for active code generation and real-time execution.
3. **RAM Prioritization (`vm.swappiness = 10`):** By reducing swappiness from Linux's aggressive default of `60` down to `10`, the system only swaps when physical RAM usage exceeds ~90%. This ensures native memory execution speeds with zero performance degradation.
4. **VFS Inode Optimization (`vm.vfs_cache_pressure = 50`):** Keeps file and directory dentries cached in memory longer, significantly speeding up file browsing and Git worktree lookups across large repositories.

---

### 🛠️ Automated Setup (One-Click)

Run the script with `sudo` or as `root`:

```bash
# 1. Default Setup (2 GB Swap):
sudo ./deploy/configure-swap.sh

# 2. Scaled Setup for Heavy Multi-Tasking (10 GB Swap):
sudo ./deploy/configure-swap.sh 10G
```

---

### ⚙️ Manual Step-by-Step Configuration

If you prefer to configure the swap manually without the script, follow these steps:

#### 1. Allocate the Swapfile

```bash
# Allocate 2 GB (Default):
sudo fallocate -l 2G /swapfile

# OR Allocate 10 GB (Recommended for Heavy Multi-Tasking):
sudo fallocate -l 10G /swapfile
```

#### 2. Set Secure Permissions (chmod 600)

```bash
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

#### 3. Enable Persistent Auto-Mount (`/etc/fstab`)

Ensure the swap file persists across system reboots without creating duplicates:

```bash
if ! grep -qs "^/swapfile " /etc/fstab; then
    echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab
fi
```

#### 4. Configure Kernel Memory Parameters

```bash
cat << 'EOF' | sudo tee /etc/sysctl.d/99-t3forweb-swap.conf
# Prioritize physical 8GB RAM; use NVMe swap strictly as an emergency buffer
vm.swappiness = 10
vm.vfs_cache_pressure = 50
EOF

sudo sysctl --system
```

---

### 🔍 Verification Commands

Check your active swap and memory distribution at any time:

```bash
# Verify active swap partition and size:
swapon --show

# Check RAM and Swap usage in human-readable format:
free -h

# Verify kernel prioritization settings:
sysctl vm.swappiness vm.vfs_cache_pressure
```

Expected output:

```text
NAME      TYPE SIZE USED PRIO
/swapfile file  10G   0B   -1

vm.swappiness = 10
vm.vfs_cache_pressure = 50
```

---

## 📦 Service Architecture & Deployment

- **Web Frontend:** React + Vite (`apps/web`)
- **Orchestration Server:** Effect-TS + Fastify/Node (`apps/server`)
- **Systemd Service:** `autojobs.service` on port `13773`
