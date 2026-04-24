#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

cleanup() {
  docker compose down
}

trap cleanup EXIT

docker compose up -d app-db nats minio ollama
docker compose up --abort-on-container-exit --exit-code-from nats-init nats-init
docker compose up --abort-on-container-exit --exit-code-from minio-init minio-init

if [ "${SMOKE_PULL_MODELS:-0}" = "1" ]; then
  docker compose up --abort-on-container-exit --exit-code-from ollama-init ollama-init
fi

DATABASE_URL="${MIGRATION_DATABASE_URL:-postgres://${APP_DB_USER:-app}:${APP_DB_PASSWORD:-change-me-app-db-password}@localhost:${APP_DB_PORT:-5432}/${APP_DB_NAME:-appdb}}" pnpm migration:run

docker compose up -d --build nestjs

for _ in $(seq 1 60); do
  if curl -fsS http://localhost:${NESTJS_PORT:-3000}/api/health/ping >/dev/null; then
    echo "Smoke passed"
    exit 0
  fi
  sleep 2
done

echo "NestJS health check failed" >&2
docker compose logs nestjs >&2
exit 1
