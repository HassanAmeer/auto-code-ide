---
name: ai-terminal-deployer
description: Autonomous VPS and server deployment manager. Executes remote SSH and local project deployments, environment setups, dependency verification, service restarts, and telemetry audits based on active project and SSH key selections.
---

# AI Terminal Deployer Skill

Autonomous server management, project packaging, and continuous deployment bridge between T3 Code / AutoCode and target VPS environments.

## Core Capabilities

1. **Active Context Detection**:
   - Understands the currently selected Project workspace root (`store.selectedProjectId`, `activeCwd`).
   - Understands active SSH Keys and Server profiles (`store.selectedKeyId`, host, user, port, password/key).
   - Automatically utilizes target host credentials when the user requests deployment, updates, or audits (_"Ye mera project hai, ye SSH key hai, VPS par upload kar do"_).

2. **Automated Deployment Workflow**:
   - **Pre-flight Check**: Verifies Git branch status, clean working tree, and build readiness.
   - **Remote Server Connect**: Connects via SSH or local bash runner to target host (e.g. `201.18.218.29` root).
   - **Dependency & Env Verification**: Checks runtime dependencies (`node`, `bun`, `pnpm`, `python3-paramiko`), port availability, and `.env` credentials.
   - **Upload & Sync**: Synchronizes code bundles or uses clean archive packaging, avoiding bloat (`node_modules`, `.git`, `.t3` cache).
   - **Build & Service Restart**: Builds the production bundle, restarts the systemd daemon (e.g. `systemctl restart autojobs.service`), and audits health status.
   - **Transparent Progress Reporting**: Communicates every milestone clearly in Roman Urdu / English so the user knows exactly what is being installed, built, and executed.

3. **Remote Automation Commands**:
   - `git pull` / `git fetch` with non-interactive flags (`GIT_TERMINAL_PROMPT=0`).
   - Process manager controls: `pm2 status`, `pm2 reload all`, `systemctl status <service>`.
   - Port verification: `ss -tulpn | grep :<port>`.
   - File inspections: view, peek, and text edits via `/api/fs/*` endpoints.

4. **Safety & Reliability**:
   - Destructive operations (`rm -rf /`, `kill -9`) require explicit user verification.
   - Never leave hanging interactive prompts during remote SSH sessions.
