#!/usr/bin/env bash
# Runs both agents as separate OS processes against the real EchoValue API.
# Usage: cp .env.example .env && edit it, then ./demo.sh "your topic"
set -euo pipefail

cd "$(dirname "$0")"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

if [ -z "${ECHOVALUE_TOKEN:-}" ]; then
  echo "ECHOVALUE_TOKEN is not set. Copy .env.example to .env first." >&2
  exit 2
fi

echo "== process 1: producer =="
node agent-a.ts "${1:-edge caching}"

echo
echo "== process 2: consumer =="
node agent-b.ts
