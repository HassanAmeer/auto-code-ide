import paramiko
import os
import tarfile
import time

VPS_IP = "201.18.218.29"
VPS_PORT = 22
VPS_USER = "root"
VPS_PASS = "Devbest309@gmail.com"

LOCAL_BASE = "/home/hasan/Documents/reactjs/t3forweb"
REMOTE_BASE = "/root/autojobs"

SOURCE_FILES = [
    # Server sources
    "apps/server/src/preview/ServerBrowser.ts",
    "apps/server/src/preview/ServerBrowserStream.ts",
    "packages/client-runtime/src/preview/serverBrowserStream.ts",
    # Web sources
    "apps/web/src/browser/browserLogsStore.ts",
    "apps/web/src/browser/ServerBrowserSurface.tsx",
    "apps/web/src/components/preview/BrowserLogsSection.tsx",
    "apps/web/src/components/preview/PreviewChromeRow.tsx",
    "apps/web/src/components/preview/PreviewView.tsx",
]

def main():
    print("Preparing archives...")
    
    # 1. Archive web dist
    local_web_dist = os.path.join(LOCAL_BASE, "apps/web/dist")
    web_tar = "/tmp/web_dist.tar.gz"
    with tarfile.open(web_tar, "w:gz") as tar:
        tar.add(local_web_dist, arcname="dist")
    print(f"Created {web_tar} ({os.path.getsize(web_tar):,} bytes)")

    # 2. Archive server dist (bin.mjs and chunks, omitting client if present)
    local_server_dist = os.path.join(LOCAL_BASE, "apps/server/dist")
    server_tar = "/tmp/server_dist.tar.gz"
    with tarfile.open(server_tar, "w:gz") as tar:
        for f in os.listdir(local_server_dist):
            if f == "client":
                continue
            tar.add(os.path.join(local_server_dist, f), arcname=f)
    print(f"Created {server_tar} ({os.path.getsize(server_tar):,} bytes)")

    print(f"Connecting to VPS {VPS_IP}...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(VPS_IP, port=VPS_PORT, username=VPS_USER, password=VPS_PASS, timeout=30)
    print("Connected to VPS!")

    # Ensure remote dirs
    ssh.exec_command("mkdir -p /root/autojobs/apps/web/src/browser /root/autojobs/apps/web/src/components/preview /root/autojobs/apps/server/src/preview /root/autojobs/packages/client-runtime/src/preview")

    sftp = ssh.open_sftp()

    # Upload source files
    for rel in SOURCE_FILES:
        loc = os.path.join(LOCAL_BASE, rel)
        rem = os.path.join(REMOTE_BASE, rel)
        print(f"Uploading source: {rel}...")
        sftp.put(loc, rem)

    # Upload dist archives
    print("Uploading archives...")
    sftp.put(web_tar, "/tmp/web_dist.tar.gz")
    sftp.put(server_tar, "/tmp/server_dist.tar.gz")
    sftp.close()

    print("Extracting on VPS...")
    cmds = """
# Extract web dist
rm -rf /root/autojobs/apps/web/dist
tar -xzf /tmp/web_dist.tar.gz -C /root/autojobs/apps/web/

# Extract server dist
mkdir -p /root/autojobs/apps/server/dist
tar -xzf /tmp/server_dist.tar.gz -C /root/autojobs/apps/server/dist/

# Copy web dist to server dist client
mkdir -p /root/autojobs/apps/server/dist/client
rm -rf /root/autojobs/apps/server/dist/client/*
cp -r /root/autojobs/apps/web/dist/* /root/autojobs/apps/server/dist/client/

# Restart service
systemctl restart autojobs
"""
    stdin, stdout, stderr = ssh.exec_command(cmds)
    stdout.channel.recv_exit_status()

    time.sleep(2)
    print("Checking autojobs service status...")
    stdin, stdout, stderr = ssh.exec_command("curl -I -s http://127.0.0.1:13773/ && systemctl is-active autojobs")
    out = stdout.read().decode()
    print("Service response:\n", out)

    ssh.close()
    print("Deployment completed successfully!")

if __name__ == "__main__":
    main()
