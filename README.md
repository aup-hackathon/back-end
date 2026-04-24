# FlowForge Backend

NestJS gateway and local development infrastructure for FlowForge.

## Quick Start

```bash
pnpm install
cp .env.example .env
docker compose up -d app-db elsa-db nats minio ollama
docker compose up --abort-on-container-exit --exit-code-from nats-init nats-init
docker compose up --abort-on-container-exit --exit-code-from minio-init minio-init
pnpm migration:run
pnpm start:dev
```

The backend health endpoint is available at `http://localhost:3000/api/health/ping`.

## Docker Compose

The compose stack defines:

- `app-db`: PostgreSQL 16 with `pgvector`, `pgcrypto`, and `citext`
- `elsa-db`: PostgreSQL 16 for Elsa
- `nats`: NATS 2.10 with JetStream and monitor port `8222`
- `nats-init`: creates the `FLOWFORGE` stream
- `minio`: private object storage
- `minio-init`: creates private `documents` and `exports` buckets
- `ollama`: local model server with persistent model volume
- `ollama-init`: pulls `mistral:7b-instruct` and `nomic-embed-text`
- `nestjs`: this backend Dockerfile
- `fastapi` and `nextjs`: lightweight placeholders by default

This backend repo is not currently a monorepo. The compose file therefore defaults `FASTAPI_CONTEXT` and `NEXTJS_CONTEXT` to placeholders under `infra/placeholders`. When the real services are present, override these in `.env`:

```bash
NESTJS_CONTEXT=./backend
FASTAPI_CONTEXT=./ai-service
NEXTJS_CONTEXT=./frontend
```

## Reset Data

Stop containers but keep data:

```bash
docker compose down
```

Remove containers and all persistent volumes:

```bash
docker compose down -v
```

## Ollama Models

Pull models before demo day:

```bash
./scripts/pre-pull-models.sh
```

This fills the named `ollama-models` volume so the demo does not depend on downloading `mistral:7b-instruct` on event Wi-Fi.

## Smoke Test

```bash
./scripts/smoke.sh
```

By default the smoke test does not pull Ollama models. To include model pulling:

```bash
SMOKE_PULL_MODELS=1 ./scripts/smoke.sh
```

NATS runs without auth inside the compose network for hackathon scope. Production should enable NKeys or another authenticated NATS setup.
