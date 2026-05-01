# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "mcp>=1.0.0",
#   "paramiko>=3.0.0",
#   "python-dotenv>=1.0.0",
# ]
# ///
"""
MCP server: run commands on Kali Linux via SSH.
Standalone — works with Claude Desktop (stdio transport).

Environment variables (loaded from .env or process env):
  KALI_HOST         — public IP of the Kali EC2 instance
  KALI_SSH_USER     — SSH username (default: ubuntu)
  KALI_SSH_KEY_PATH — path to the .pem private key file
"""

import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP
import paramiko

# Load .env from the project root (two levels up from mcp-server/)
_root = Path(__file__).parent.parent
load_dotenv(_root / ".env")

KALI_HOST     = os.environ.get("KALI_HOST", "")
KALI_SSH_USER = os.environ.get("KALI_SSH_USER", "ubuntu")
KALI_SSH_KEY  = os.path.expanduser(os.environ.get("KALI_SSH_KEY_PATH", ""))

if not KALI_HOST:
    print("[mcp-server] ERROR: KALI_HOST is not set. Check your .env file.", file=sys.stderr)
    sys.exit(1)

if not KALI_SSH_KEY or not Path(KALI_SSH_KEY).exists():
    print(f"[mcp-server] ERROR: KALI_SSH_KEY_PATH '{KALI_SSH_KEY}' not found.", file=sys.stderr)
    sys.exit(1)

mcp = FastMCP("kali-pentest")


def _ssh_exec(command: str, timeout: int = 120) -> str:
    ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    print(f"[mcp-server] [{ts}] CMD: {command}", file=sys.stderr)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(
            hostname=KALI_HOST,
            username=KALI_SSH_USER,
            key_filename=KALI_SSH_KEY,
            timeout=15,
            banner_timeout=15,
        )
        _stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        exit_code = stdout.channel.recv_exit_status()
    finally:
        client.close()

    result = out
    if exit_code != 0 and err:
        result += f"\n[stderr]\n{err}"
    return result or "(no output)"


@mcp.tool()
def run_command(command: str) -> str:
    """
    Run a shell command on the Kali Linux attacker VM and return its output.

    Args:
        command: The shell command to execute (e.g. "nmap -sV 10.0.2.100")

    Returns:
        Combined stdout of the command. stderr is appended if exit code != 0.
    """
    return _ssh_exec(command)


@mcp.tool()
def upload_file(local_path: str, remote_path: str) -> str:
    """
    Upload a local file to the Kali VM via SCP (SFTP).

    Args:
        local_path:  Absolute path on the machine running this MCP server.
        remote_path: Destination path on the Kali VM (e.g. /tmp/payload.py).

    Returns:
        Success or error message.
    """
    ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    print(f"[mcp-server] [{ts}] UPLOAD: {local_path} -> {remote_path}", file=sys.stderr)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(
            hostname=KALI_HOST,
            username=KALI_SSH_USER,
            key_filename=KALI_SSH_KEY,
            timeout=15,
            banner_timeout=15,
        )
        with client.open_sftp() as sftp:
            sftp.put(local_path, remote_path)
        return f"Uploaded {local_path} → {KALI_SSH_USER}@{KALI_HOST}:{remote_path}"
    except Exception as exc:
        return f"Upload failed: {exc}"
    finally:
        client.close()


if __name__ == "__main__":
    mcp.run(transport="stdio")
