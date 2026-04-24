# FlowForge Backend

NestJS gateway and local development infrastructure for FlowForge.

## Current Backend Status

Completed backend issues:

- `BE-01`: database schema, TypeORM entities, migrations, `pgvector`, seed data for agent definitions and process patterns, and immutable audit trigger.
- `BE-05`: organization user invites, role updates, access revocation, same-org guard, last-admin protection, invite token storage, and audit logging.
- `BE-09`: session lifecycle API, FSM enforcement, workflow-scoped org isolation, mode switching, manual finalization, workflow state/progress endpoints, admin status override, soft archive cascade, audit logging, and `session.events.finalized` NATS publishing.
- `BE-21`: Docker Compose local infrastructure for NestJS, FastAPI placeholder, Next.js placeholder, app Postgres, Elsa Postgres, NATS JetStream, MinIO, Ollama, and initialization scripts.
- `BE-22`: NestJS bootstrap with global config validation, Pino logging, correlation IDs, global filters/interceptors/guards, Swagger, Terminus health, and `DEV_BYPASS_AUTH` for backend development before full auth lands.

Current implemented API groups:

- `GET /api/health/ping`
- `POST /api/org/invite`
- `PATCH /api/org/users/:id/role`
- `DELETE /api/org/users/:id`
- `POST /api/sessions`
- `GET /api/sessions/:id`
- `PATCH /api/sessions/:id/mode`
- `POST /api/sessions/:id/finalize`
- `GET /api/sessions/:id/workflow-state`
- `GET /api/sessions/:id/progress`
- `DELETE /api/sessions/:id`
- `PATCH /api/sessions/:id/status`

Important implementation notes:

- Auth issues `BE-02`, `BE-03`, and `BE-04` are intentionally skipped for now. Use `DEV_BYPASS_AUTH=true` for local backend route smoke tests.
- `session` rows do not have a direct `org_id`; BE-09 enforces org isolation through the linked `workflow.org_id`.
- BE-09 includes a minimal NATS publisher only for `session.events.finalized`. The full NATS gateway/contracts work continues in `BE-10`.
- The WebSocket event for `session.needs_reconciliation` is queued through a placeholder service until `BE-17` adds the real gateway.

Verification baseline used so far:

- `pnpm build`
- `pnpm lint`
- `pnpm test`
- Runtime smoke tests against Dockerized `app-db`; BE-09 additionally verified against Dockerized NATS JetStream.

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
