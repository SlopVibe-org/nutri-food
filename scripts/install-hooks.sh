#!/usr/bin/env bash
# Installs the pre-push hook for NutriFood local CI
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOK="${REPO_ROOT}/.git/hooks/pre-push"

cp "${REPO_ROOT}/scripts/pre-push" "$HOOK"
chmod +x "$HOOK"

echo "✅ Pre-push hook installed → ${HOOK}"
echo "   CI will run via act on ai-docker-01 before each push."
echo "   Bypass with: git push --no-verify"
