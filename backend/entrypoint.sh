#!/bin/bash
set -e

# Load environment file if present
if [ -f "/app/health_connect_sync.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source /app/health_connect_sync.env
    set +a
fi

# Ensure directories exist
mkdir -p /data /var/log /app/.sync-cache

# If /data/data.json does not exist yet and initial data exists, copy it
if [ ! -f "/data/data.json" ] && [ -f "/app/data.json" ]; then
    cp /app/data.json /data/data.json
fi

# Configure cron schedule
CRON_SCHEDULE="${CRON_SCHEDULE:-10 5 * * *}"
SYNC_CMD="${WI_SYNC_COMMAND:-/app/health-sync}"

echo "${CRON_SCHEDULE} cd /app && ${SYNC_CMD} >> /var/log/weight-insider-sync.log 2>&1" > /var/spool/cron/crontabs/root

# Start cron daemon in background
crond -b -l 2
echo "[Backend] Crond started with schedule: ${CRON_SCHEDULE}"
echo "[Backend] Starting Weight Insider Sync API server on port ${PORT:-8085}..."

# Start sync-server in foreground
exec /app/sync-server
