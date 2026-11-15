#!/usr/bin/env bash
# Add a 2 GB swap file (idempotent) and report memory. No personal data printed.
set -eu
if ! swapon --show | grep -q /swapfile; then
  [ -f /swapfile ] || { sudo fallocate -l 2G /swapfile; sudo chmod 600 /swapfile; sudo mkswap /swapfile >/dev/null; }
  sudo swapon /swapfile
fi
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
echo 'vm.swappiness=20' | sudo tee /etc/sysctl.d/99-muktasabat-swap.conf >/dev/null
sudo sysctl -q -p /etc/sysctl.d/99-muktasabat-swap.conf
echo "== memory"; free -m
echo "== containers"; docker ps --format '{{.Names}} {{.Image}} {{.Status}}'
echo "== site"; curl -sk -o /dev/null -w "login %{http_code} %{time_total}s\n" https://muktasabat.com/ar/login
