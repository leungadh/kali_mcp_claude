#!/usr/bin/env bash
# Run once after provisioning: sudo bash target-setup.sh
set -euo pipefail

echo "[target-setup] Updating package lists..."
apt-get update -y

echo "[target-setup] Installing Docker..."
apt-get install -y ca-certificates curl gnupg lsb-release

mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io

echo "[target-setup] Pulling and starting DVWA..."
docker pull ghcr.io/digininja/dvwa:latest
docker run -d \
    --name dvwa \
    --restart always \
    -p 80:80 \
    ghcr.io/digininja/dvwa:latest

echo "[target-setup] DVWA running. Default credentials: admin / password"
