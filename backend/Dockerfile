# 1. Build Stage
FROM golang:1.21-alpine AS builder

# Install required build tools (SQLite requires cgo)
RUN apk add --no-cache gcc musl-dev

WORKDIR /app

# Copy Go modules
COPY go.mod go.sum ./
RUN go mod download

# Copy source files
COPY data_exporter.go ./
COPY cmd/ ./cmd/

# Build all binaries with CGO enabled (needed for SQLite driver)
RUN CGO_ENABLED=1 GOOS=linux go build -o /app/data-exporter ./data_exporter.go
RUN CGO_ENABLED=1 GOOS=linux go build -o /app/health-sync ./cmd/health-connect-sync
RUN CGO_ENABLED=1 GOOS=linux go build -o /app/sync-server ./cmd/sync-server

# 2. Runtime Stage
FROM alpine:latest

# Install sqlite, ca-certificates, bash and curl
RUN apk add --no-cache sqlite ca-certificates tzdata bash curl

WORKDIR /app

# Copy the compiled binaries
COPY --from=builder /app/data-exporter /app/data-exporter
COPY --from=builder /app/health-sync /app/health-sync
COPY --from=builder /app/sync-server /app/sync-server

# Copy wrapper script & entrypoint
COPY run_health_connect_sync.sh entrypoint.sh /app/

# Setup volume directories
RUN mkdir -p /var/log /data /app/secrets /app/.sync-cache

ENV CRON_SCHEDULE="10 5 * * *"
ENV WI_SYNC_COMMAND="/app/health-sync"
ENV WI_EXPORTER_COMMAND="/app/data-exporter"
ENV WI_FRONTEND_DATA_JSON="/data/data.json"
ENV WI_DIST_DATA_JSON="/data/data.json"
ENV WI_SYNC_SCRIPT="/app/health-sync"
ENV PORT="8085"

RUN chmod +x /app/data-exporter /app/health-sync /app/sync-server /app/run_health_connect_sync.sh /app/entrypoint.sh

EXPOSE 8085

CMD ["/app/entrypoint.sh"]
