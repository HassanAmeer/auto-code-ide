export interface QuickCommandItem {
  id: string;
  category: "deploy" | "specs" | "network" | "files" | "docker";
  title: string;
  cmd: string;
  subtitle: string;
  badge?: string;
  isDangerous?: boolean;
}

export const QUICK_COMMAND_CATEGORIES = [
  { id: "all", label: "All Commands" },
  { id: "deploy", label: "🚀 Deploy & Services" },
  { id: "specs", label: "💾 CPU, RAM & Storage" },
  { id: "network", label: "🌐 Network & Ports" },
  { id: "files", label: "📁 Files & Archives" },
  { id: "docker", label: "🐳 Docker & Containers" },
] as const;

export const QUICK_COMMANDS_LIST: QuickCommandItem[] = [
  // 1. Deploy & Services
  {
    id: "deploy_git_pull",
    category: "deploy",
    title: "Git Pull Latest Code",
    cmd: "git pull",
    subtitle: "Remote GitHub repository se latest code fetch aur pull karein",
    badge: "Git",
  },
  {
    id: "deploy_git_push",
    category: "deploy",
    title: "Git Push (Stage, Commit & Push)",
    cmd: 'git add . && (git commit -m "chore: update project files" || true) && git push',
    subtitle: "Local changes ko automatically add, commit aur remote par push karein",
    badge: "Git",
  },
  {
    id: "deploy_git_fetch",
    category: "deploy",
    title: "Git Fetch All Branches",
    cmd: "git fetch --all --prune",
    subtitle: "Remote branches aur references ko synchronize karein",
    badge: "Git",
  },
  {
    id: "deploy_git_status",
    category: "deploy",
    title: "Git Repository Status",
    cmd: "git status && git log -n 3 --oneline",
    subtitle: "Current modified files, branches aur last 3 commits check karein",
    badge: "Git",
  },
  {
    id: "deploy_pm2_restart",
    category: "deploy",
    title: "PM2 Restart All",
    cmd: "pm2 restart all",
    subtitle: "Tamam background Node.js services aur daemons ko restart karein",
    badge: "PM2",
  },
  {
    id: "deploy_pm2_status",
    category: "deploy",
    title: "PM2 Services Status",
    cmd: "pm2 status",
    subtitle: "Dekhein kaunse Node.js applications online hain aur memory usage",
    badge: "PM2",
  },
  {
    id: "deploy_pm2_logs",
    category: "deploy",
    title: "PM2 Recent Logs",
    cmd: "pm2 logs --lines 40 --nostream",
    subtitle: "Running services ke aakhri 40 error aur output logs dekhein",
    badge: "Logs",
  },
  {
    id: "deploy_service_restart",
    category: "deploy",
    title: "Restart IDE Service (Autojobs)",
    cmd: "systemctl restart autojobs",
    subtitle: "Auto Code IDE server service ko safely restart karein",
    badge: "Systemd",
  },
  {
    id: "deploy_service_status",
    category: "deploy",
    title: "Check IDE Service Status",
    cmd: "systemctl status autojobs --no-pager",
    subtitle: "Service ka live status, uptime aur recent errors check karein",
    badge: "Systemd",
  },

  // 2. CPU, RAM & Storage
  {
    id: "specs_ram_free",
    category: "specs",
    title: "Check RAM & Memory",
    cmd: "free -h",
    subtitle: "Server ki Total, Used, Free aur Available RAM memory dekhein",
    badge: "RAM",
  },
  {
    id: "specs_disk_df",
    category: "specs",
    title: "Check Disk Space (ROM / Storage)",
    cmd: "df -h /",
    subtitle: "Primary root filesystem me kitni storage free aur used hai",
    badge: "Disk",
  },
  {
    id: "specs_cpu_uptime",
    category: "specs",
    title: "Check CPU & Uptime",
    cmd: "uptime && lscpu | head -n 12",
    subtitle: "Server uptime, load average aur processor cores ki details",
    badge: "CPU",
  },
  {
    id: "specs_heavy_processes",
    category: "specs",
    title: "Top Heavy RAM Processes",
    cmd: "ps aux --sort=-%mem | head -n 12",
    subtitle: "Sab se zyada memory / RAM lene wale processes ki list",
    badge: "Processes",
  },
  {
    id: "specs_clean_cache",
    category: "specs",
    title: "Clean Memory Cache",
    cmd: "sync && echo 3 > /proc/sys/vm/drop_caches 2>/dev/null && free -h",
    subtitle: "Linux OS buffers aur cache memory ko foran free karein",
    badge: "RAM",
  },

  // 3. Network & Ports
  {
    id: "net_ports_listening",
    category: "network",
    title: "Listening Ports & Services",
    cmd: "ss -tulpn 2>/dev/null || netstat -tulpn",
    subtitle: "Dekhein kaunse ports (Web, SSH, Node, DB) open aur listen kar rahe hain",
    badge: "Ports",
  },
  {
    id: "net_kill_port",
    category: "network",
    title: "Kill Process on Port (3000)",
    cmd: "fuser -k 3000/tcp 2>/dev/null || echo 'Port 3000 freed'",
    subtitle: "Agar port 3000 busy ho to uske process ko foran terminate karein",
    badge: "Kill Port",
  },
  {
    id: "net_public_ip",
    category: "network",
    title: "Get Server Public IP",
    cmd: "curl -s ifconfig.me && echo ''",
    subtitle: "VPS / Server ka bahir ka Public IPv4 address check karein",
    badge: "IP",
  },
  {
    id: "net_ping_test",
    category: "network",
    title: "Test Internet Ping (Google)",
    cmd: "ping -c 4 8.8.8.8",
    subtitle: "Server ki internet speed aur ping latency verify karein",
    badge: "Ping",
  },
  {
    id: "net_download_file",
    category: "network",
    title: "Download Remote File (cURL)",
    cmd: "curl -O https://example.com/file.zip",
    subtitle: "Kisi bhi URL se file direct current folder me download karein",
    badge: "Download",
  },

  // 4. Files & Archives
  {
    id: "files_ls_la",
    category: "files",
    title: "List All Files & Folders",
    cmd: "ls -la --group-directories-first",
    subtitle: "Hidden files aur folders permissions aur sizes ke sath dekhein",
    badge: "Files",
  },
  {
    id: "files_largest_items",
    category: "files",
    title: "Largest Files in Directory",
    cmd: "du -ah . 2>/dev/null | sort -rh | head -n 12",
    subtitle: "Folder ke andar sab se bari aur heavy files find karein",
    badge: "Storage",
  },
  {
    id: "files_compress_tar",
    category: "files",
    title: "Compress Folder to .tar.gz",
    cmd: "tar -czf backup_$(date +%Y%m%d).tar.gz .",
    subtitle: "Current directory ka timestamped compressed archive banayein",
    badge: "Archive",
  },
  {
    id: "files_extract_tar",
    category: "files",
    title: "Extract .tar.gz Archive",
    cmd: "tar -xzf archive.tar.gz",
    subtitle: "Compressed archive ko current directory me extract karein",
    badge: "Extract",
  },
  {
    id: "files_clean_logs",
    category: "files",
    title: "Vacuum System Journal Logs",
    cmd: "journalctl --vacuum-time=2d",
    subtitle: "Purani systemd logs delete karke GBs storage free karein",
    badge: "Disk",
  },

  // 5. Docker & Containers
  {
    id: "docker_ps",
    category: "docker",
    title: "Docker Running Containers",
    cmd: "docker ps -a",
    subtitle: "Active aur stopped tamam Docker containers ki list dekhein",
    badge: "Docker",
  },
  {
    id: "docker_stats",
    category: "docker",
    title: "Docker Container Stats",
    cmd: "docker stats --no-stream",
    subtitle: "Har container ka real-time CPU aur RAM usage dekhein",
    badge: "Docker",
  },
  {
    id: "docker_prune",
    category: "docker",
    title: "Prune Unused Docker Cache",
    cmd: "docker system prune -f",
    subtitle: "Dangling images aur build cache delete karke disk free karein",
    badge: "Docker",
  },
];
