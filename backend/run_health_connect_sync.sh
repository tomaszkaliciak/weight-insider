#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE="${WI_SYNC_ENV_FILE:-$SCRIPT_DIR/health_connect_sync.env}"
if [[ -f "$ENV_FILE" ]]; then
  while IFS='=' read -r key value || [[ -n "$key" ]]; do
    key=$(echo "$key" | tr -d '\r' | xargs)
    [[ -z "$key" || "$key" =~ ^# ]] && continue
    value=$(echo "$value" | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
    if [[ -z "${!key+x}" ]]; then
      export "$key"="$value"
    fi
  done < "$ENV_FILE"
fi

SYNC_COMMAND="${WI_SYNC_COMMAND:-go run ./cmd/health-connect-sync}"
exec /bin/bash -lc "$SYNC_COMMAND"
