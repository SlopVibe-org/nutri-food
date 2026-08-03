#!/usr/bin/env bash
# NutriFood local CI — runs pytest in Docker on ai-docker-01
# Usage: ./scripts/ci-local.sh
set -euo pipefail

REMOTE_HOST="ai-docker"
REMOTE_DIR="/tmp/nutrifood-ci"

echo "📦 Syncing code to ${REMOTE_HOST}:${REMOTE_DIR}..."

# tar over ssh — include .git, exclude heavy build artifacts
tar --exclude='__pycache__' \
    --exclude='.venv' \
    --exclude='node_modules' \
    --exclude='*.pyc' \
    --exclude='.pytest_cache' \
    -cf - . | ssh "$REMOTE_HOST" "rm -rf ${REMOTE_DIR} && mkdir -p ${REMOTE_DIR} && tar -xf - -C ${REMOTE_DIR}"

echo "🐳 Running pytest in Docker on ${REMOTE_HOST}..."

ssh "$REMOTE_HOST" "cd ${REMOTE_DIR} && sudo docker run --rm \
  -v \$(pwd):/app -w /app \
  -e JWT_SECRET=ci-test-secret-key-32bytes-long \
  -e DB_PATH=/tmp/test_nf.db \
  -e NF_DB_PATH=/tmp/test_nf.db \
  python:3.13-slim bash -c '
    pip install -q -r backend/requirements.txt pytest 2>/dev/null
    cd backend && python -m pytest tests/ -v --tb=short
  '" 2>&1

echo "✅ CI passed locally"
