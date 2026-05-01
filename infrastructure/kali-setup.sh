#!/usr/bin/env bash
# Run once after provisioning: sudo bash kali-setup.sh
set -euo pipefail

echo "[kali-setup] Updating package lists..."
apt-get update -y

echo "[kali-setup] Installing pentest tools..."
apt-get install -y \
    nmap \
    nikto \
    metasploit-framework \
    gobuster \
    curl \
    wget \
    hydra \
    sqlmap

echo "[kali-setup] Installing Python 3.10+ for MCP server..."
apt-get install -y python3.10 python3.10-pip python3.10-venv || true

echo "[kali-setup] Installing uv..."
curl -LsSf https://astral.sh/uv/install.sh | sh || pip3 install uv

echo "[kali-setup] Done."
echo "[kali-setup] To start MCP server: uv run mcp-server/server.py"
