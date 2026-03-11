#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE="${WI_SYNC_ENV_FILE:-$SCRIPT_DIR/health_connect_sync.env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

SYNC_COMMAND="${WI_SYNC_COMMAND:-go run ./cmd/health-connect-sync}"
exec /bin/bash -lc "$SYNC_COMMAND"
