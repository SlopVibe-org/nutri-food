#!/usr/bin/env bash
# Deploy NutriFood on ai-docker-01 — pull latest images and restart
# Usage: ./scripts/deploy.sh
set -euo pipefail

REMOTE_HOST="ai-docker"
COMPOSE_DIR="/opt/nutrifood"

echo "📦 Pulling latest images on ${REMOTE_HOST}..."
ssh "$REMOTE_HOST" "cd ${COMPOSE_DIR} && sudo docker compose pull"

echo "🔄 Restarting containers..."
ssh "$REMOTE_HOST" "cd ${COMPOSE_DIR} && sudo docker compose up -d"

echo "🧹 Cleaning old images..."
ssh "$REMOTE_HOST" "sudo docker image prune -f 2>/dev/null" || true

echo "✅ Deploy complete"
ssh "$REMOTE_HOST" "sudo docker ps --filter name=nutrifood --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'"
