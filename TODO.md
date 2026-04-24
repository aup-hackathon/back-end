# FlowForge NestJS Backend — Execution TODO

> **Audience:** An AI agent executing the backend implementation start-to-finish.
> **Spec authority order:** (1) `specs.md` v2.1 = authoritative. (2) `ARCHITECTURE.md` = reference only, use only where `specs.md` is silent. (3) This file = the operational plan derived from both.
> **Working directory:** `/run/media/walidozich/Data2/AUP hackathon/backend/`
> **Scope:** NestJS gateway + root `docker-compose.yml`. FastAPI agent internals, Next.js UI, Elsa .NET server are out of scope — but the NATS + WebSocket + REST **contracts** defined here are authoritative for all three.

---

## 0. Global rules for the executor

1. **Do not invent API endpoints or DB fields.** Every endpoint comes from `specs.md §F1–F9`. Every table/column comes from `specs.md §8.1` + `§8.3`.
2. **Never use `synchronize: true`.** Always write a migration.
3. **Never skip Joi validation** in config — a missing env var must fail boot.
4. **Every mutating controller must have `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(...)`** unless explicitly `@Public()`.
5. **Every query that touches org-scoped tables MUST filter by `org_id`** — use the `OrgScopeInterceptor` (Phase 2) and `@OrgId()` decorator.
6. **All NATS payloads use the DTOs in `src/nats/contracts/`.** Never inline a payload.
7. **Every successful mutating request must produce an `AuditLog` row.** Handled by the global `AuditInterceptor` (Phase 9) — do not duplicate manually.
8. **When a phase's acceptance test fails, STOP and fix before moving to the next phase.**
9. **Commit at the end of every phase** with `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`. Commit message format: `phase N: <what was delivered>`.
10. **Package manager:** use `pnpm`. Lockfile is `pnpm-lock.yaml`.

---

## Phase 0 — Repo scaffold & tooling

**Time budget:** 0.5 day. **Parallelizable with Phase 1.**

### 0.1 Files to create

#### `backend/package.json`
```json
{
  "name": "flowforge-backend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "node dist/main.js",
    "start:dev": "nest start --watch",
    "start:debug": "nest start --debug --watch",
    "lint": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix",
    "format": "prettier --write \"src/**/*.ts\" \"test/**/*.ts\"",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:cov": "jest --coverage",
    "test:e2e": "jest --config ./test/jest-e2e.config.ts",
    "typeorm": "typeorm-ts-node-commonjs -d src/database/data-source.ts",
    "migration:generate": "pnpm typeorm migration:generate",
    "migration:run": "pnpm typeorm migration:run",
    "migration:revert": "pnpm typeorm migration:revert",
    "db:reset": "pnpm typeorm schema:drop && pnpm migration:run"
  },
  "dependencies": {
    "@nestjs/common": "^10.3.0",
    "@nestjs/core": "^10.3.0",
    "@nestjs/platform-express": "^10.3.0",
    "@nestjs/platform-socket.io": "^10.3.0",
    "@nestjs/websockets": "^10.3.0",
    "@nestjs/config": "^3.2.0",
    "@nestjs/typeorm": "^10.0.0",
    "@nestjs/jwt": "^10.2.0",
    "@nestjs/passport": "^10.0.0",
    "@nestjs/throttler": "^5.1.0",
    "@nestjs/terminus": "^10.2.0",
    "@nestjs/swagger": "^7.3.0",
    "typeorm": "^0.3.20",
    "typeorm-naming-strategies": "^4.1.0",
    "pg": "^8.11.0",
    "passport": "^0.7.0",
    "passport-jwt": "^4.0.1",
    "passport-local": "^1.0.0",
    "bcrypt": "^5.1.1",
    "class-validator": "^0.14.1",
    "class-transformer": "^0.5.1",
    "joi": "^17.12.0",
    "nats": "^2.19.0",
    "nestjs-pino": "^4.0.0",
    "pino": "^8.19.0",
    "pino-http": "^9.0.0",
    "pino-pretty": "^10.3.0",
    "minio": "^7.1.3",
    "multer": "^1.4.5-lts.1",
    "reflect-metadata": "^0.2.1",
    "rxjs": "^7.8.1",
    "helmet": "^7.1.0",
    "cookie-parser": "^1.4.6",
    "uuid": "^9.0.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.3.0",
    "@nestjs/schematics": "^10.1.0",
    "@nestjs/testing": "^10.3.0",
    "@types/bcrypt": "^5.0.2",
    "@types/cookie-parser": "^1.4.6",
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.12",
    "@types/multer": "^1.4.11",
    "@types/node": "^20.11.0",
    "@types/passport-jwt": "^4.0.1",
    "@types/passport-local": "^1.0.38",
    "@types/supertest": "^6.0.2",
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "eslint": "^8.57.0",
    "eslint-config-prettier": "^9.1.0",
    "eslint-plugin-prettier": "^5.1.3",
    "jest": "^29.7.0",
    "prettier": "^3.2.5",
    "source-map-support": "^0.5.21",
    "supertest": "^6.3.4",
    "ts-jest": "^29.1.2",
    "ts-loader": "^9.5.1",
    "ts-node": "^10.9.2",
    "tsconfig-paths": "^4.2.0",
    "typescript": "^5.3.3",
    "testcontainers": "^10.7.0"
  }
}
```

#### `backend/tsconfig.json`
Standard NestJS: `"target": "ES2022"`, `"module": "commonjs"`, `"emitDecoratorMetadata": true`, `"experimentalDecorators": true`, `"strict": true`, `"strictPropertyInitialization": false`, `"paths"` with `"@core/*": ["src/core/*"]`, `"@modules/*": ["src/modules/*"]`, `"@database/*": ["src/database/*"]`, `"@nats/*": ["src/nats/*"]`.

#### `backend/nest-cli.json`
```json
{ "$schema": "https://json.schemastore.org/nest-cli", "collection": "@nestjs/schematics", "sourceRoot": "src", "compilerOptions": { "deleteOutDir": true } }
```

#### `backend/.eslintrc.cjs`, `backend/.prettierrc`
Standard NestJS defaults, 2-space indent, single quotes, trailing commas.

#### `backend/Dockerfile`
Multi-stage:
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN pnpm build && pnpm prune --prod

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "dist/main.js"]
```

#### `backend/.dockerignore`
`node_modules`, `dist`, `.git`, `.env`, `*.log`, `coverage`, `test`, `.vscode`.

#### `backend/.env.example`
All env vars listed under **Phase 2 env schema** below.

#### `backend/jest.config.ts` and `backend/test/jest-e2e.config.ts`
Default NestJS configs; e2e runs against the running compose stack.

#### `backend/README.md`
One-page: `pnpm install → cp .env.example .env → docker compose up -d app-db nats → pnpm migration:run → pnpm start:dev`.

### 0.2 Acceptance

- `pnpm install` succeeds.
- `pnpm build` produces `dist/main.js`.
- `docker build ./backend` succeeds.
- Committed as `phase 0: scaffold NestJS backend`.

---

## Phase 1 — Infrastructure & docker-compose

**Time budget:** 0.5–1 day. **Parallelizable with Phase 0.**

### 1.1 Files to create OUTSIDE `backend/` (repo root `/run/media/walidozich/Data2/AUP hackathon/`)

#### `docker-compose.yml`

```yaml
name: flowforge
services:

  app-db:
    image: pgvector/pgvector:pg16
    container_name: flowforge-app-db
    environment:
      POSTGRES_DB: appdb
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${APP_DB_PASSWORD:-secret}
    ports: ["5432:5432"]
    volumes:
      - app-db-data:/var/lib/postgresql/data
      - ./infra/app-db-init.sql:/docker-entrypoint-initdb.d/01-init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d appdb"]
      interval: 5s
      timeout: 3s
      retries: 20

  elsa-db:
    image: postgres:16-alpine
    container_name: flowforge-elsa-db
    environment:
      POSTGRES_DB: elsadb
      POSTGRES_USER: elsa
      POSTGRES_PASSWORD: ${ELSA_DB_PASSWORD:-secret}
    ports: ["5433:5432"]
    volumes:
      - elsa-db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U elsa -d elsadb"]
      interval: 5s
      timeout: 3s
      retries: 20

  nats:
    image: nats:2.10-alpine
    container_name: flowforge-nats
    command: ["-c", "/etc/nats/nats.conf"]
    ports: ["4222:4222", "8222:8222"]
    volumes:
      - nats-data:/data
      - ./infra/nats.conf:/etc/nats/nats.conf:ro
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8222/healthz"]
      interval: 5s
      timeout: 3s
      retries: 20

  nats-init:
    image: natsio/nats-box:latest
    container_name: flowforge-nats-init
    depends_on:
      nats: { condition: service_healthy }
    volumes:
      - ./infra/nats-stream-bootstrap.sh:/bootstrap.sh:ro
    entrypoint: ["sh", "/bootstrap.sh"]
    restart: "no"

  minio:
    image: minio/minio:latest
    container_name: flowforge-minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-minio}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:-minio12345}
    ports: ["9000:9000", "9001:9001"]
    volumes: [minio-data:/data]
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 5s
      timeout: 3s
      retries: 20

  minio-init:
    image: minio/mc:latest
    container_name: flowforge-minio-init
    depends_on:
      minio: { condition: service_healthy }
    volumes:
      - ./infra/minio-bootstrap.sh:/bootstrap.sh:ro
    entrypoint: ["sh", "/bootstrap.sh"]
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-minio}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:-minio12345}
    restart: "no"

  ollama:
    image: ollama/ollama:latest
    container_name: flowforge-ollama
    ports: ["11434:11434"]
    volumes: [ollama-models:/root/.ollama]
    healthcheck:
      test: ["CMD-SHELL", "ollama list || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 20

  ollama-init:
    image: ollama/ollama:latest
    container_name: flowforge-ollama-init
    depends_on:
      ollama: { condition: service_healthy }
    volumes: [ollama-models:/root/.ollama]
    environment:
      OLLAMA_HOST: http://ollama:11434
    entrypoint: ["sh", "-c"]
    command: ["ollama pull mistral:7b-instruct && ollama pull nomic-embed-text && echo 'models pulled'"]
    restart: "no"

  elsa-server:
    # Confirm the correct image before first run; fallback: build from ./elsa-server
    image: elsa-workflows/elsa-server:3.x
    container_name: flowforge-elsa
    depends_on:
      elsa-db: { condition: service_healthy }
    environment:
      ConnectionStrings__Elsa: "Host=elsa-db;Database=elsadb;Username=elsa;Password=${ELSA_DB_PASSWORD:-secret}"
    ports: ["5000:8080"]

  nestjs:
    build: ./backend
    container_name: flowforge-nestjs
    depends_on:
      app-db: { condition: service_healthy }
      nats: { condition: service_healthy }
      minio: { condition: service_healthy }
      nats-init: { condition: service_completed_successfully }
      minio-init: { condition: service_completed_successfully }
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: postgres://app:${APP_DB_PASSWORD:-secret}@app-db:5432/appdb
      NATS_URL: nats://nats:4222
      NATS_STREAM_NAME: FLOWFORGE
      JWT_ACCESS_SECRET: ${JWT_ACCESS_SECRET:?set in .env}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET:?set in .env}
      JWT_ACCESS_TTL: 15m
      JWT_REFRESH_TTL: 7d
      MINIO_ENDPOINT: minio
      MINIO_PORT: 9000
      MINIO_USE_SSL: "false"
      MINIO_ACCESS_KEY: ${MINIO_ROOT_USER:-minio}
      MINIO_SECRET_KEY: ${MINIO_ROOT_PASSWORD:-minio12345}
      MINIO_BUCKET_DOCUMENTS: documents
      MINIO_BUCKET_EXPORTS: exports
      OLLAMA_URL: http://ollama:11434
      FASTAPI_HEALTH_URL: http://fastapi:8000/health
      ELSA_HEALTH_URL: http://elsa-server:8080/health
      CORS_ORIGIN: http://localhost:3001
      DEV_BYPASS_AUTH: "false"
      THROTTLE_TTL: "60"
      THROTTLE_LIMIT: "120"
      LOG_LEVEL: info
    ports: ["3000:3000"]

  fastapi:
    build: ./ai-service
    container_name: flowforge-fastapi
    depends_on:
      nats: { condition: service_healthy }
      ollama: { condition: service_healthy }
      app-db: { condition: service_healthy }
      elsa-db: { condition: service_healthy }
      ollama-init: { condition: service_completed_successfully }
    environment:
      NATS_URL: nats://nats:4222
      NATS_STREAM_NAME: FLOWFORGE
      OLLAMA_BASE_URL: http://ollama:11434
      APP_POSTGRES_URL: postgres://app:${APP_DB_PASSWORD:-secret}@app-db:5432/appdb
      ELSA_POSTGRES_URL: postgres://elsa:${ELSA_DB_PASSWORD:-secret}@elsa-db:5432/elsadb
      LLM_MODEL: mistral:7b-instruct
      EMBED_MODEL: nomic-embed-text
    ports: ["8000:8000"]

  nextjs:
    build: ./frontend
    container_name: flowforge-nextjs
    depends_on:
      nestjs: { condition: service_started }
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:3000
      NEXT_PUBLIC_WS_URL: ws://localhost:3000
      NEXT_PUBLIC_ELSA_URL: http://localhost:5000
    ports: ["3001:3001"]

volumes:
  app-db-data:
  elsa-db-data:
  nats-data:
  minio-data:
  ollama-models:
```

#### `infra/app-db-init.sql`
```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

#### `infra/nats.conf`
```
port: 4222
monitor_port: 8222
jetstream: {
  store_dir: "/data"
  max_memory_store: 256MB
  max_file_store: 10GB
}
```

#### `infra/nats-stream-bootstrap.sh`
```sh
#!/bin/sh
set -e
nats --server=nats://nats:4222 stream add FLOWFORGE \
  --subjects "ai.tasks.*,ai.tasks.>,workflow.events.*,session.events.*,system.health.*,dead.flowforge.>" \
  --storage file \
  --retention limits \
  --max-msgs=100000 \
  --max-age=24h \
  --max-msg-size=4MB \
  --discard=old \
  --replicas=1 \
  --defaults \
  || echo "stream already exists or created"
echo "FLOWFORGE stream ready"
```

#### `infra/minio-bootstrap.sh`
```sh
#!/bin/sh
set -e
mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
mc mb --ignore-existing local/documents
mc mb --ignore-existing local/exports
mc anonymous set none local/documents
mc anonymous set none local/exports
echo "buckets ready"
```

#### `.env.example` (repo root)
```
APP_DB_PASSWORD=secret
ELSA_DB_PASSWORD=secret
MINIO_ROOT_USER=minio
MINIO_ROOT_PASSWORD=minio12345
JWT_ACCESS_SECRET=replace-me-access
JWT_REFRESH_SECRET=replace-me-refresh
```

### 1.2 Acceptance

- `docker compose up -d app-db nats minio ollama` brings all four healthy within 60 seconds.
- `docker compose up nats-init minio-init` completes successfully (exit 0).
- `docker exec flowforge-app-db psql -U app -d appdb -c '\dx'` lists `vector` + `pgcrypto`.
- `docker exec flowforge-nats nats stream ls` shows `FLOWFORGE`.
- `docker exec flowforge-minio mc ls local/` lists `documents` + `exports` buckets.
- Commit as `phase 1: docker-compose with app-db, elsa-db, nats+jetstream, minio, ollama`.

---

## Phase 2 — NestJS bootstrap + CoreModule

**Time budget:** 0.5 day. **Serial — blocks Phase 3+.**

### 2.1 Directory layout to create

```
backend/src/
├── main.ts
├── app.module.ts
├── core/
│   ├── core.module.ts
│   ├── config/
│   │   ├── configuration.ts
│   │   └── env.validation.ts
│   ├── logger/
│   │   └── logger.module.ts
│   ├── filters/
│   │   └── http-exception.filter.ts
│   ├── interceptors/
│   │   ├── logging.interceptor.ts
│   │   ├── correlation-id.interceptor.ts
│   │   └── org-scope.interceptor.ts
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   └── roles.guard.ts
│   ├── decorators/
│   │   ├── public.decorator.ts
│   │   ├── roles.decorator.ts
│   │   ├── current-user.decorator.ts
│   │   └── org-id.decorator.ts
│   └── context/
│       └── request-context.service.ts   # AsyncLocalStorage wrapper
└── database/ (placeholder — populated in Phase 3)
```

### 2.2 Env schema (`src/core/config/env.validation.ts`)

Use Joi to validate:

| Key | Type | Required | Default |
|---|---|---|---|
| `NODE_ENV` | `development|test|production` | yes | `development` |
| `PORT` | number | yes | `3000` |
| `DATABASE_URL` | uri | yes | — |
| `NATS_URL` | uri | yes | — |
| `NATS_STREAM_NAME` | string | yes | `FLOWFORGE` |
| `JWT_ACCESS_SECRET` | string min 32 | yes | — |
| `JWT_REFRESH_SECRET` | string min 32 | yes | — |
| `JWT_ACCESS_TTL` | string | yes | `15m` |
| `JWT_REFRESH_TTL` | string | yes | `7d` |
| `MINIO_ENDPOINT` | string | yes | — |
| `MINIO_PORT` | number | yes | `9000` |
| `MINIO_USE_SSL` | boolean | yes | `false` |
| `MINIO_ACCESS_KEY` | string | yes | — |
| `MINIO_SECRET_KEY` | string | yes | — |
| `MINIO_BUCKET_DOCUMENTS` | string | yes | `documents` |
| `MINIO_BUCKET_EXPORTS` | string | yes | `exports` |
| `OLLAMA_URL` | uri | yes | — |
| `FASTAPI_HEALTH_URL` | uri | yes | — |
| `ELSA_HEALTH_URL` | uri | yes | — |
| `CORS_ORIGIN` | string (csv) | yes | `http://localhost:3001` |
| `DEV_BYPASS_AUTH` | boolean | no | `false` |
| `THROTTLE_TTL` | number | no | `60` |
| `THROTTLE_LIMIT` | number | no | `120` |
| `LOG_LEVEL` | `trace|debug|info|warn|error` | no | `info` |

### 2.3 `src/main.ts` requirements

- Create app with `NestFactory.create(AppModule, { bufferLogs: true })`.
- Swap default logger with nestjs-pino.
- `app.use(helmet())`.
- `app.use(cookieParser())`.
- `app.enableCors({ origin: CORS_ORIGIN.split(','), credentials: true })`.
- `app.setGlobalPrefix('api')` (all endpoints mounted under `/api/...`).
- `app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }))`.
- `app.useGlobalFilters(new HttpExceptionFilter(logger))`.
- `app.useGlobalInterceptors(new CorrelationIdInterceptor(), new LoggingInterceptor())`.
- Swagger at `/docs` (only in non-production).
- `app.enableShutdownHooks()`.
- Listen on `PORT`.

### 2.4 `src/app.module.ts` imports (ordered)

1. `ConfigModule.forRoot({ isGlobal: true, load: [configuration], validationSchema: envSchema })`
2. `LoggerModule.forRoot(...)` (nestjs-pino with redact: `['req.headers.authorization','req.headers.cookie','*.password','*.password_hash','*.token']`)
3. `ThrottlerModule.forRootAsync(...)` — reads `THROTTLE_TTL`, `THROTTLE_LIMIT`
4. `TypeOrmModule.forRootAsync(...)` — reads `DATABASE_URL`, `synchronize: false`, `migrationsRun: true`, `autoLoadEntities: true`, `namingStrategy: new SnakeNamingStrategy()`
5. `CoreModule`
6. Feature modules (added as each phase completes): `AuthModule`, `WorkflowsModule`, `SessionsModule`, `MessagesModule`, `DocumentsModule`, `CommentsModule`, `AuditModule`, `HealthModule`, `AgentsModule`, `NatsModule`, `RealtimeModule`.

### 2.5 `HttpExceptionFilter` envelope

Every error response:
```json
{
  "statusCode": 400,
  "error": "ValidationError",
  "message": "email must be a valid email",
  "correlationId": "uuid-v4",
  "path": "/api/auth/register",
  "timestamp": "2026-04-24T12:34:56.789Z"
}
```
Log full stack at `error` level with correlation id; include `actor_id` if available.

### 2.6 `RequestContextService`

Uses `AsyncLocalStorage<{ userId?: string; orgId?: string; correlationId: string; role?: UserRole }>`. The `CorrelationIdInterceptor` seeds it; guards enrich it. All downstream services read from it instead of passing `req` around.

### 2.7 Guards & decorators (skeletons — real logic in Phase 5)

- `@Public()` sets metadata key `IS_PUBLIC` — `JwtAuthGuard` skips if set.
- `JwtAuthGuard` delegates to `AuthGuard('jwt-access')`; if `DEV_BYPASS_AUTH=true` and no token provided, injects synthetic user `{ id: '00000000-0000-0000-0000-000000000001', role: 'admin', orgId: '00000000-0000-0000-0000-00000000a000' }`.
- `RolesGuard` reads `@Roles(...)` metadata and checks `request.user.role`.
- `@CurrentUser()` param decorator — returns `request.user`.
- `@OrgId()` param decorator — returns `request.user.orgId`.

### 2.8 Acceptance

- `pnpm start:dev` boots. `GET /api/health/ping` returns `{ pong: true }` (temporary test route — delete in Phase 10).
- Boot with a missing env var fails fast with Joi error listing the missing key.
- `GET /api/nonexistent` returns the standardized error envelope with 404.
- Swagger visible at `http://localhost:3000/docs` in dev.
- Commit as `phase 2: bootstrap + CoreModule + config/logger/filters/guards`.

---

## Phase 3 — Database layer

**Time budget:** 1 day. **Critical path — blocks all feature modules.**

### 3.1 Files to create

```
backend/src/database/
├── database.module.ts
├── data-source.ts
├── pgvector.transformer.ts
├── snake-naming.strategy.ts      # typeorm-naming-strategies re-export
├── entities/
│   ├── organization.entity.ts
│   ├── user.entity.ts
│   ├── login-history.entity.ts
│   ├── refresh-token.entity.ts
│   ├── workflow.entity.ts
│   ├── workflow-version.entity.ts
│   ├── session.entity.ts
│   ├── message.entity.ts
│   ├── document.entity.ts
│   ├── comment.entity.ts
│   ├── audit-log.entity.ts
│   ├── kg-node.entity.ts
│   ├── kg-edge.entity.ts
│   ├── process-pattern.entity.ts
│   ├── agent-definition.entity.ts
│   ├── pipeline-execution.entity.ts
│   ├── agent-execution.entity.ts
│   ├── agent-log.entity.ts
│   ├── agent-config-override.entity.ts
│   └── index.ts                  # barrel export
├── enums/
│   ├── user-role.enum.ts
│   ├── workflow-status.enum.ts
│   ├── session-mode.enum.ts
│   ├── session-status.enum.ts
│   ├── message-role.enum.ts
│   ├── message-type.enum.ts
│   ├── comment-type.enum.ts
│   ├── actor-type.enum.ts
│   ├── agent-type.enum.ts
│   ├── pipeline-task-type.enum.ts
│   ├── pipeline-status.enum.ts
│   ├── agent-execution-status.enum.ts
│   ├── log-level.enum.ts
│   ├── config-override-scope.enum.ts
│   └── document-type.enum.ts
└── migrations/
    ├── 1700000000000-InitExtensions.ts
    ├── 1700000001000-InitEnums.ts
    ├── 1700000002000-InitCoreTables.ts
    ├── 1700000003000-InitAgentTables.ts
    ├── 1700000004000-InitAuditTrigger.ts
    ├── 1700000005000-SeedAgentRegistry.ts
    └── 1700000006000-SeedProcessPatterns.ts
```

### 3.2 Enum values (authoritative — do not deviate)

- `user_role`: `admin`, `process_owner`, `business_analyst`, `reviewer`, `viewer`
- `workflow_status`: `draft`, `in_elicitation`, `pending_review`, `validated`, `exported`, `archived`
- `session_mode`: `auto`, `interactive`
- `session_status`: `created`, `awaiting_input`, `processing`, `draft_ready`, `in_elicitation`, `in_review`, `validated`, `exported`
- `message_role`: `user`, `ai`, `system`
- `message_type`: `user_input`, `ai_question`, `ai_response`, `ai_summary`, `ai_update`, `ai_confidence_report`, `system_note`, `system_status`
- `comment_type`: `question`, `correction`, `approval`, `suggestion`, `escalation`
- `actor_type`: `user`, `ai_agent`, `system`
- `agent_type`: `orchestrator`, `intake`, `extraction`, `pattern`, `gap_detection`, `qa`, `validation`, `export`
- `pipeline_task_type`: `full_pipeline`, `scoped_reprocess`, `export_only`, `qa_round`
- `pipeline_status`: `pending`, `running`, `paused`, `completed`, `failed`, `cancelled`
- `agent_execution_status`: `pending`, `running`, `completed`, `failed`, `skipped`
- `log_level`: `debug`, `info`, `warning`, `error`
- `config_override_scope`: `org`, `session`
- `document_type`: `procedure_manual`, `interview_transcript`, `email`, `sketch`, `recording`, `other`

### 3.3 `pgvector.transformer.ts`

```ts
import { ValueTransformer } from 'typeorm';

export const pgvectorTransformer = (dimensions: number): ValueTransformer => ({
  to: (value: number[] | null): string | null => {
    if (value == null) return null;
    if (value.length !== dimensions) {
      throw new Error(`vector length ${value.length} != expected ${dimensions}`);
    }
    return `[${value.join(',')}]`;
  },
  from: (value: string | null): number[] | null => {
    if (value == null) return null;
    return value.replace(/^\[|\]$/g, '').split(',').map(Number);
  },
});
```

### 3.4 Migration 1 — `InitExtensions`

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

### 3.5 Migration 2 — `InitEnums`

Create every enum listed in 3.2 via `CREATE TYPE ... AS ENUM (...)`.

### 3.6 Migration 3 — `InitCoreTables` (§8.1 authoritative)

Build EXACTLY these tables and columns — add `org_id` scoping everywhere applicable. Use `snake_case` column names; TypeORM naming strategy handles class → column mapping.

#### `organization`
`id uuid pk default gen_random_uuid()`, `name text not null unique`, `plan text not null default 'free'`, `created_at timestamptz default now()`, `updated_at timestamptz default now()`.

#### `user` (quoted — `"user"` is reserved)
`id uuid pk`, `email citext unique not null` (enable `CREATE EXTENSION citext` in migration 1), `password_hash text not null`, `role user_role not null default 'viewer'`, `org_id uuid not null references "organization"(id) on delete cascade`, `is_verified boolean default false`, `locked_until timestamptz`, `failed_login_count smallint default 0`, `created_at timestamptz default now()`, `updated_at timestamptz default now()`.
Index: `(org_id)`, `(email)`.

#### `login_history`
`id uuid pk`, `user_id uuid references "user"(id) on delete cascade`, `ip_address inet`, `user_agent text`, `success boolean not null`, `created_at timestamptz default now()`.
Index: `(user_id, created_at desc)`.

#### `refresh_token`
`id uuid pk`, `user_id uuid references "user"(id) on delete cascade`, `token_hash text not null unique`, `family_id uuid not null`, `parent_id uuid references refresh_token(id)`, `expires_at timestamptz not null`, `revoked boolean default false`, `revoked_at timestamptz`, `user_agent text`, `ip_address inet`, `created_at timestamptz default now()`.
Index: `(user_id, revoked)`, `(family_id)`, `(token_hash)`.

#### `workflow`
`id uuid pk`, `title text not null`, `description text`, `status workflow_status not null default 'draft'`, `current_version int default 0`, `org_id uuid not null references organization(id) on delete cascade`, `owner_id uuid not null references "user"(id)`, `domain text`, `tags text[] default '{}'`, `created_at timestamptz default now()`, `updated_at timestamptz default now()`.
Index: `(org_id, status)`, `(owner_id)`, `(tags)` gin.

#### `workflow_version`
`id uuid pk`, `workflow_id uuid not null references workflow(id) on delete cascade`, `version_number int not null`, `elements_json jsonb not null`, `elsa_json jsonb`, `confidence_score float`, `created_by uuid references "user"(id)`, `created_at timestamptz default now()`.
Unique: `(workflow_id, version_number)`. Index: `(workflow_id, version_number desc)`.

#### `session`
`id uuid pk`, `workflow_id uuid not null references workflow(id) on delete cascade`, `user_id uuid not null references "user"(id)`, `org_id uuid not null references organization(id)`, `mode session_mode not null`, `status session_status not null default 'created'`, `confidence_score float default 0`, `created_at timestamptz default now()`, `finalized_at timestamptz`.
Index: `(workflow_id, created_at desc)`, `(user_id)`, `(org_id)`.

#### `message`
`id uuid pk`, `session_id uuid not null references session(id) on delete cascade`, `role message_role not null`, `type message_type not null`, `content text not null`, `metadata jsonb default '{}'`, `tsv tsvector generated always as (to_tsvector('english', content)) stored`, `created_at timestamptz default now()`.
Index: `(session_id, created_at asc)`, `(type)`, `tsv` gin.

#### `document`
`id uuid pk`, `workflow_id uuid references workflow(id) on delete cascade`, `session_id uuid references session(id) on delete cascade`, `org_id uuid not null`, `uploaded_by uuid references "user"(id)`, `filename text not null`, `file_type text not null`, `document_type document_type default 'other'`, `storage_url text not null`, `size_bytes bigint not null`, `mime_type text not null`, `extracted_text text`, `preprocessing_confidence float`, `doc_version int default 1`, `parent_document_id uuid references document(id)`, `created_at timestamptz default now()`.
Index: `(workflow_id)`, `(session_id)`, `(org_id)`.

#### `comment`
`id uuid pk`, `workflow_id uuid not null references workflow(id) on delete cascade`, `element_id text`, `author_id uuid not null references "user"(id)`, `type comment_type not null`, `content text not null`, `resolved boolean default false`, `resolved_at timestamptz`, `resolved_by uuid references "user"(id)`, `parent_id uuid references comment(id) on delete cascade`, `injected_to_ai boolean default false`, `created_at timestamptz default now()`.
Index: `(workflow_id, resolved)`, `(element_id)`, `(parent_id)`.

#### `audit_log`
`id uuid pk`, `workflow_id uuid references workflow(id) on delete cascade`, `org_id uuid not null`, `actor_id uuid`, `actor_type actor_type not null`, `event_type varchar(128) not null`, `element_id text`, `before_state jsonb`, `after_state jsonb`, `correlation_id uuid`, `created_at timestamptz default now()`.
Index: `(workflow_id, created_at desc)`, `(actor_type, event_type)`, `(org_id, created_at desc)`.

#### `kg_node`
`id uuid pk`, `session_id uuid not null references session(id) on delete cascade`, `type text not null`, `label varchar(256) not null`, `properties jsonb default '{}'`, `confidence float`, `embedding vector(768)`, `inferred boolean default false`, `created_at timestamptz default now()`.
Index: `(session_id, type)`, raw SQL: `CREATE INDEX ON kg_node USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);`.

#### `kg_edge`
`id uuid pk`, `session_id uuid not null references session(id) on delete cascade`, `from_node_id uuid not null references kg_node(id) on delete cascade`, `to_node_id uuid not null references kg_node(id) on delete cascade`, `relation_type varchar(64) not null`, `condition varchar(512)`, `properties jsonb default '{}'`, `confidence float`, `created_at timestamptz default now()`.
Index: `(session_id)`, `(from_node_id)`, `(to_node_id)`.

#### `process_pattern`
`id uuid pk`, `name text not null unique`, `archetype_type text not null`, `description text`, `template_json jsonb not null`, `required_slots text[] default '{}'`, `embedding vector(768)`, `created_at timestamptz default now()`.
Raw: `CREATE INDEX ON process_pattern USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);`.

### 3.7 Migration 4 — `InitAgentTables` (§8.3 authoritative)

Follow §8.3.1 through §8.3.5 verbatim. All `created_at timestamptz default now()`. Apply indexes from §8.5.

### 3.8 Migration 5 — `InitAuditTrigger`

```sql
CREATE OR REPLACE FUNCTION audit_log_immutable()
  RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is immutable';
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
```

### 3.9 Migration 6 — `SeedAgentRegistry`

Insert 8 rows into `agent_definition`, one per `agent_type` value. Copy `default_config` from `specs.md §F9 parameters table`:

- EXTRACTION: `{"temperature":0.1,"max_tokens":2048,"output_schema_version":"v1","confidence_minimum":0.5}`
- PATTERN: `{"similarity_threshold":0.72,"max_candidates":5,"fallback_to_generic":true}`
- GAP_DETECTION: `{"critical_gap_auto_block":false}`
- QA: `{"max_rounds":5,"max_questions_per_round":3,"skip_allowed":true}`
- VALIDATION: `{"confidence_exit_threshold":0.85,"require_all_critical_resolved":true}`
- EXPORT: `{"default_formats":["elsa","bpmn"],"include_decision_log_in_pdf":true}`
- ORCHESTRATOR: `{}`
- INTAKE: `{}`

Names: `"<Type-title-case> Agent v1"`, version `"1.0.0"`.

### 3.10 Migration 7 — `SeedProcessPatterns`

Insert 6 rows per AI-F4 archetypes (Approval, Escalation, Parallel Review, Notification, Periodic Execution, Onboarding). `template_json` = minimal JSON skeleton. `embedding` = NULL — FastAPI fills on first RAG boot.

### 3.11 Acceptance

- `pnpm migration:run` on a fresh `app-db` completes with zero errors.
- `psql -c "\dt"` lists 19 tables.
- `psql -c "select count(*) from agent_definition"` → 8.
- `psql -c "select count(*) from process_pattern"` → 6.
- Attempting `UPDATE audit_log SET event_type='x'` raises `audit_log is immutable`.
- Round-trip test: insert a row into `kg_node` via raw query with a 768-dim vector literal; read via TypeORM repository; values match.
- Commit as `phase 3: database schema + entities + migrations + seeds`.

---

## Phase 4 — NATS module & contracts

**Time budget:** 0.5–1 day. **Critical path — blocks F4, F5, F6, F8, F9.**

### 4.1 Files

```
backend/src/nats/
├── nats.module.ts
├── nats.client.ts
├── nats.publisher.service.ts
├── nats.subscriber.service.ts
├── dlq.service.ts
└── contracts/
    ├── subjects.ts
    ├── ai-tasks.dto.ts
    ├── workflow-events.dto.ts
    ├── session-events.dto.ts
    ├── system-health.dto.ts
    ├── pipeline-events.dto.ts
    └── index.ts
```

### 4.2 `contracts/subjects.ts` — FROZEN after Phase 4

```ts
export const SUBJECTS = {
  AI_TASKS_NEW:       'ai.tasks.new',
  AI_TASKS_RESULT:    'ai.tasks.result',
  AI_TASKS_PROGRESS:  'ai.tasks.progress',
  WORKFLOW_UPDATED:   'workflow.events.updated',
  SESSION_FINALIZED:  'session.events.finalized',
  SYSTEM_HEALTH_PING: 'system.health.ping',
  DEAD_LETTER_PREFIX: 'dead.flowforge.',
} as const;

export const CONSUMERS = {
  AI_RESULT:     'nestjs-ai-result',
  AI_PROGRESS:   'nestjs-ai-progress',
  WORKFLOW_AUDIT:'nestjs-workflow-audit',
  HEALTH_PING:   'nestjs-health-ping',
} as const;
```

### 4.3 DTO contracts (class-validator)

#### `AiTaskNewPayload`
```
session_id: uuid
task_type: 'FULL_PIPELINE' | 'SCOPED_REPROCESS' | 'EXPORT_ONLY' | 'QA_ROUND'
mode: 'auto' | 'interactive'
input: object                    # task-specific
correlation_id: uuid
triggered_by: uuid (nullable)
pipeline_execution_id: uuid      # pre-generated by NestJS
resume_from?: AgentType          # only for retry
scoped_target?: { comment_id?: uuid; element_id?: string }
```

#### `AiTaskResultPayload`
```
session_id: uuid
pipeline_execution_id: uuid
workflow_json?: object           # final elements JSON
elsa_json?: object
confidence: number (0..1)
questions?: Array<{ id: string; text: string; target_element?: string }>
summary?: string                 # plain-language from Validation Agent
version_number?: number
```

#### `AiTaskProgressPayload`
```
session_id: uuid
pipeline_execution_id: uuid
agent_execution_id: uuid
agent_type: AgentType
agent_name: string
status: AgentExecutionStatus
order_index: number
progress_pct: number (0..100)
confidence_input?: number
confidence_output?: number
llm_calls_delta?: number
tokens_delta?: number
started_at?: iso8601
completed_at?: iso8601
error_message?: string
log?: { level: LogLevel; message: string; metadata?: object }
```

#### `WorkflowUpdatedPayload`
```
workflow_id: uuid
version_number: number
changed_elements: Array<{ element_id: string; change_type: 'added'|'removed'|'modified' }>
source: 'ai' | 'user' | 'comment_injection'
actor_id?: uuid
correlation_id: uuid
```

#### `SessionFinalizedPayload`
```
session_id: uuid
workflow_id: uuid
final_version_number: number
final_confidence: number
finalized_at: iso8601
```

#### `SystemHealthPingPayload`
```
service: 'nestjs' | 'fastapi' | 'ollama' | 'elsa' | 'postgres' | 'nats' | 'minio'
status: 'ok' | 'degraded' | 'down'
latency_ms?: number
details?: object
timestamp: iso8601
```

### 4.4 `NatsClient` behavior

- Connect with reconnect + wait 60s on startup (health-dependent).
- JetStream publish with `msgId` = `${correlationId}:${subject}:${pipelineExecutionId ?? ''}` for idempotency.
- Subscribe as durable consumer with:
  - `ack_policy: 'explicit'`
  - `ack_wait: 30_000` ms
  - `max_deliver: 3`
  - `deliver_policy: 'new'` (not `all` — we don't replay history on restart; we rely on DB state)
- On exception in handler: `msg.nak(5_000)` (5s back-off).
- After 3 deliveries: publish to `dead.flowforge.<original-subject>` with `{ reason, originalSubject, payload, deliveryCount, lastError }` + insert into a `dead_letter` table (create as a migration addendum — keep in Phase 4).

### 4.5 Publisher surface

```ts
class NatsPublisherService {
  publishAiTaskNew(p: AiTaskNewPayload): Promise<void>
  publishWorkflowUpdated(p: WorkflowUpdatedPayload): Promise<void>
  publishSessionFinalized(p: SessionFinalizedPayload): Promise<void>
  publishSystemHealthPing(p: SystemHealthPingPayload): Promise<void>
}
```

### 4.6 Subscriber registration

In `onModuleInit`, register four durable consumers. Each dispatches to a service method (to be wired in later phases):

| Subject | Consumer | Handler wired in |
|---|---|---|
| `ai.tasks.result` | `nestjs-ai-result` | Phase 6 (SessionsService.applyAiResult) |
| `ai.tasks.progress` | `nestjs-ai-progress` | Phase 11 (RealtimeGateway + Phase 12 PipelineEventsConsumer) |
| `workflow.events.updated` | `nestjs-workflow-audit` | Phase 9 + Phase 11 |
| `system.health.ping` | `nestjs-health-ping` | Phase 10 |

Phase 4 registers the handlers with a temporary `console.log` stub until downstream phases replace them.

### 4.7 Acceptance

- Unit test: publish `AiTaskNewPayload` with invalid data → class-validator throws before publish.
- Integration test (testcontainers-nats): publish + subscribe round-trip for every subject.
- Integration test: handler throws → message redelivered 3× → lands in `dead.flowforge.ai.tasks.new` + row in `dead_letter` table.
- Commit as `phase 4: NATS JetStream client + frozen contracts + DLQ`.

---

## Phase 5 — F1 Auth

**Time budget:** 1–1.5 days. **Critical path — blocks every authenticated endpoint.**

### 5.1 Files

```
backend/src/modules/auth/
├── auth.module.ts
├── auth.controller.ts
├── org.controller.ts
├── auth.service.ts
├── services/
│   ├── password.service.ts
│   ├── refresh-token.service.ts
│   ├── email-token.service.ts
│   ├── lockout.service.ts
│   ├── login-history.service.ts
│   └── organization.service.ts
├── strategies/
│   ├── jwt-access.strategy.ts
│   └── jwt-refresh.strategy.ts
├── dto/
│   ├── register.dto.ts
│   ├── verify-email.dto.ts
│   ├── login.dto.ts
│   ├── refresh.dto.ts
│   ├── forgot-password.dto.ts
│   ├── reset-password.dto.ts
│   ├── invite.dto.ts
│   └── change-role.dto.ts
└── constants.ts
```

### 5.2 Endpoint contract (exact)

All under `/api/...`:

- `POST /auth/register` — body `{ email, password, organizationName? }` — creates org if none provided + user as `admin` of that org; otherwise treat as pending invite redemption via separate flow. Returns `{ userId, requiresVerification: true }`.
- `POST /auth/verify-email` — body `{ token }` → `{ verified: true }`.
- `POST /auth/login` — body `{ email, password }` → `{ accessToken }` + sets HTTP-only cookie `refresh_token` (SameSite=Lax, Secure in prod, path=`/api/auth`).
- `POST /auth/refresh` — reads `refresh_token` cookie → validates + rotates → new `{ accessToken }` + new cookie. **Reuse of a revoked token must revoke the entire family** (both `revoked=true` on all descendants/ancestors in the family).
- `POST /auth/logout` — revokes current refresh family + clears cookie.
- `GET /auth/me` — `{ id, email, role, orgId }`.
- `POST /auth/forgot-password` — body `{ email }` → generates single-use token (valid 15 min) → logs to stdout in dev (`[email-dev] password reset: http://localhost:3001/reset?token=...`).
- `POST /auth/reset-password` — body `{ token, newPassword }`.
- `GET /auth/login-history` — authenticated user's own history, cursor-paginated.
- `POST /org/invite` — `@Roles('admin')` — body `{ email, role }` → creates pending user + logs invite link.
- `PATCH /org/users/:id/role` — `@Roles('admin')` — body `{ role }`.
- `DELETE /org/users/:id` — `@Roles('admin')` — soft-delete (`User.deleted_at`).

### 5.3 Password & security

- `bcrypt` rounds = 12.
- Password policy validator: min 10 chars, at least one letter + one digit.
- Lockout: on 5 consecutive failures within 15 min, set `locked_until = now() + 15 min`. Reset on successful login.
- Refresh token: store only `sha256(token)` as `token_hash`. On rotation, set old `revoked=true` and new row's `parent_id` = old id, same `family_id`.
- Access token JWT claims: `{ sub: userId, email, role, orgId, iat, exp }`.
- Refresh JWT claims: `{ sub: userId, jti: tokenId, familyId, iat, exp }`.

### 5.4 JwtAuthGuard — final wiring

Replace stub from Phase 2 with passport-jwt strategy. `DEV_BYPASS_AUTH` behavior unchanged: if flag is true AND no `Authorization` header, inject demo admin; otherwise enforce JWT. Log a warning at boot if flag is on and `NODE_ENV=production`.

### 5.5 Seed fixture for dev

Create a dev-only startup hook (guarded by `NODE_ENV !== 'production' && DEV_BYPASS_AUTH === 'true'`) that inserts:
- Org `00000000-0000-0000-0000-00000000a000` "Demo Org"
- User `00000000-0000-0000-0000-000000000001` email `demo@flowforge.local` role `admin`
So the synthetic bypass user maps to a real row (FK integrity for dev workflows).

### 5.6 Acceptance (e2e with supertest + testcontainers-postgres)

1. Register → verify → login → `/auth/me` returns correct payload.
2. Refresh rotates: old refresh cookie → 401 on second use; new cookie works.
3. Reuse an already-rotated refresh → the entire family is revoked; subsequent refresh attempts fail.
4. 5 bad logins → 6th returns 423 with `locked_until`.
5. Viewer role hitting `POST /workflows` → 403 (tested post-Phase 6).
6. `DEV_BYPASS_AUTH=true` with no Authorization header → demo user is injected.

Commit as `phase 5: F1 Auth with JWT rotation, RBAC, lockout, org invites`.

---

## Phase 6 — F4 Sessions + F5 Workflows + F3 Messages

**Time budget:** 2 days. **Two devs in parallel.**

### 6.1 Dev A — Workflows module

Directory: `backend/src/modules/workflows/`

Files: `workflows.module.ts`, `workflows.controller.ts`, `workflow-versions.controller.ts`, `services/workflows.service.ts`, `services/workflow-versions.service.ts`, `services/workflow-diff.service.ts`, `services/workflow-export.service.ts`, `dto/*.dto.ts`.

Endpoints (every one from §F5):

| Method | Path | Roles | Behavior |
|---|---|---|---|
| POST | `/workflows` | admin, process_owner, business_analyst | create `status='draft'`, version=0 |
| GET | `/workflows` | any auth | org-scoped, pagination, filter by status/tags/domain |
| GET | `/workflows/:id` | any auth | with `current_version` details |
| PATCH | `/workflows/:id` | owner or admin | metadata only; emits `workflow.events.updated` |
| DELETE | `/workflows/:id` | owner or admin | sets status=`archived`; does NOT hard delete |
| GET | `/workflows/:id/versions` | any auth | ordered desc |
| GET | `/workflows/:id/versions/:n` | any auth | full version payload |
| GET | `/workflows/:id/diff/:v1/:v2` | any auth | diff `elements_json` |
| POST | `/workflows/:id/export/elsa` | process_owner, admin | publishes `ai.tasks.new { task_type:'EXPORT_ONLY', format:'elsa' }`; returns `{ pipelineExecutionId }` |
| POST | `/workflows/:id/export/bpmn` | same | same pattern, `format:'bpmn'` |
| POST | `/workflows/:id/export/pdf` | same | same pattern, `format:'pdf'` |
| POST | `/workflows/:id/duplicate` | process_owner, admin | new workflow with copied current version |
| GET | `/workflows/:id/decision-log` | any auth | filtered audit log |
| GET | `/workflows/:id/diagram-data` | any auth | returns `elements_json` in React-Flow-friendly shape |

Diff algorithm: key every element by `element_id`; added = in v2 not v1; removed = in v1 not v2; modified = deep-equal false.

### 6.2 Dev A — Sessions module

Directory: `backend/src/modules/sessions/`

FSM transitions (enforce in `session-fsm.service.ts`):

| From | Event | To |
|---|---|---|
| `created` | `first_message_received` | `awaiting_input` |
| `awaiting_input` | `ai_task_dispatched` | `processing` |
| `processing` | `ai_result_received (auto)` | `draft_ready` |
| `processing` | `ai_question_received (interactive)` | `in_elicitation` |
| `in_elicitation` | `user_answer` | `processing` |
| `draft_ready` | `user_enters_review` | `in_review` |
| `in_review` | `user_validates` | `validated` |
| `validated` | `export_triggered` | `exported` |
| any | `user_finalizes` | `draft_ready` (short-circuit) |

Endpoints:

| Method | Path | Behavior |
|---|---|---|
| POST | `/sessions` | body `{ workflowId, mode }` → creates session |
| GET | `/sessions/:id` | full session + last 50 messages |
| PATCH | `/sessions/:id/mode` | changes mode mid-session per AI-F1 |
| POST | `/sessions/:id/finalize` | manual `this is good enough` → drives FSM to `draft_ready` |
| GET | `/sessions/:id/workflow-state` | current elements JSON |
| GET | `/sessions/:id/progress` | current pipeline execution status |
| DELETE | `/sessions/:id` | archives |

Wire the `ai.tasks.result` subscriber (from Phase 4) to `SessionsService.applyAiResult(payload)`:
1. Create a new `workflow_version` (version_number = workflow.current_version + 1, `elements_json` = payload.workflow_json).
2. Update `workflow.current_version` and `status` (`draft` → `pending_review`).
3. Update session FSM.
4. Publish `workflow.events.updated`.

### 6.3 Dev B — Messages module + SSE

Directory: `backend/src/modules/messages/`

Endpoints:

| Method | Path | Behavior |
|---|---|---|
| GET | `/sessions/:id/messages` | cursor pagination `?cursor=<b64>&limit=50` |
| GET | `/sessions/:id/messages?type=<type>` | filter |
| GET | `/sessions/:id/messages?search=<q>` | FTS via `tsv` column |
| POST | `/sessions/:id/messages` | body `{ content, metadata? }`; appends `user_input`; publishes `ai.tasks.new { task_type: session.currentMode === 'interactive' ? 'QA_ROUND' : 'FULL_PIPELINE' }` |
| GET | `/sessions/:id/messages/export` | PDF via FastAPI `export_only` of transcript |
| GET | `/messages/:id` | single |

SSE endpoint:

| Method | Path | Behavior |
|---|---|---|
| GET | `/sessions/:id/stream` | `text/event-stream`; on handshake, replay last N messages, then subscribe to in-memory fan-out driven by `ai.tasks.progress` for that session |

Include `Cache-Control: no-cache`, `Connection: keep-alive`, heartbeat every 15s.

### 6.4 Acceptance

- Create workflow → create session → POST message → assert `ai.tasks.new` captured (test NATS subscriber); publish synthetic `ai.tasks.result` → session transitions + new workflow_version exists.
- Cursor pagination over 1000 seeded messages.
- FTS: `?search=approval` returns only matching messages.
- SSE: connect, publish progress, observe event delivery within 100ms.
- RBAC: viewer POST `/workflows` → 403.

Commit as `phase 6: F3 messages + F4 sessions (FSM) + F5 workflows & versions`.

---

## Phase 7 — F2 Documents

**Time budget:** 1 day. **Parallel.**

### 7.1 Files

```
backend/src/modules/documents/
├── documents.module.ts
├── documents.controller.ts
├── documents.service.ts
├── services/
│   └── minio.service.ts        # belongs in core/storage but fine here
└── dto/
    ├── upload.dto.ts
    └── update-extracted-text.dto.ts
```

### 7.2 Behavior

- Multer memory storage, size limit 50MB/file, 200MB/session.
- Allowed MIME types: `text/plain`, `text/markdown`, `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `image/png`, `image/jpeg`, `image/webp`, `audio/mpeg`, `audio/wav`, `audio/mp4`.
- On upload:
  1. Validate MIME, compute sha256 for dedup.
  2. PUT to `minio://documents/{orgId}/{uuid}-{filename}`.
  3. Insert `document` row with `storage_url`, `size_bytes`, `mime_type`, `file_type`, `uploaded_by`, `org_id`, `workflow_id?`, `session_id?`.
  4. Publish `ai.tasks.new { task_type:'FULL_PIPELINE', input:{ documentIds:[id] }, mode:sessionMode }` ONLY IF `session_id` present; else just store for later attach.
- On `PATCH /documents/:id/extracted-text` — write user-corrected text; DO NOT re-publish to NATS (user explicitly calls reprocess).
- On `POST /documents/:id/reprocess` — publish `ai.tasks.new { task_type:'FULL_PIPELINE', input:{ documentIds:[id], force_reprocess:true } }`.

### 7.3 Endpoints

All from §F2:

- `POST /documents/upload` (multipart `file` + body `{ workflowId?, sessionId?, documentType? }`)
- `GET /documents/:id`
- `GET /documents/:id/extracted-text`
- `PATCH /documents/:id/extracted-text`
- `DELETE /documents/:id`
- `GET /workflows/:workflowId/documents`
- `POST /documents/:id/reprocess`

### 7.4 Acceptance

- Upload PDF → `mc ls local/documents/{orgId}/` shows object; `document` row exists; `ai.tasks.new` observed.
- Upload unsupported MIME → 415.
- Upload 51MB → 413.
- `GET /workflows/:id/documents` is org-scoped (cross-org request → 404).

Commit as `phase 7: F2 documents with MinIO + reprocess via NATS`.

---

## Phase 8 — F6 Review & Comments

**Time budget:** 0.5–1 day. **Parallel.**

### 8.1 Files

```
backend/src/modules/comments/
├── comments.module.ts
├── comments.controller.ts
├── comments.service.ts
├── services/
│   ├── comment-injection.service.ts
│   └── review-progress.service.ts
└── dto/
    ├── create-comment.dto.ts
    ├── reply.dto.ts
    └── resolve.dto.ts
```

### 8.2 Endpoints

- `POST /workflows/:id/comments` — body `{ elementId?, type, content, parentId? }`
- `GET /workflows/:id/comments` — list + nested replies
- `PATCH /comments/:id` — author-only edit
- `DELETE /comments/:id` — author or admin soft-delete
- `POST /comments/:id/reply` — body `{ content }`
- `POST /comments/:id/resolve` — body `{ resolutionNote? }`
- `POST /comments/:id/inject-to-ai` — publishes `ai.tasks.new { task_type:'SCOPED_REPROCESS', input:{ comment_id:id, target_element:comment.element_id }, ... }`; mark `injected_to_ai=true`. The `ai.tasks.result` handler (Phase 6) will auto-mark resolved when `source='comment_injection'`.
- `PATCH /workflows/:id/elements/:elemId/approve` — reviewer approval marker (stored in a side table or as a comment with `type='approval'`)
- `GET /workflows/:id/review-progress` — `{ approvedCount, totalElements, percent }`

### 8.3 Acceptance

- Create comment → inject → observe NATS message with `task_type='SCOPED_REPROCESS'`.
- Publish synthetic result referencing the comment → comment auto-resolved.
- Reviewer (role) can approve elements; viewer cannot.

Commit as `phase 8: F6 comments + comment-to-prompt injection`.

---

## Phase 9 — F7 Audit

**Time budget:** 0.5 day. **Parallel.**

### 9.1 Files

```
backend/src/modules/audit/
├── audit.module.ts
├── audit.controller.ts
├── audit.service.ts
└── interceptors/
    └── audit.interceptor.ts       # registered globally in app.module
```

### 9.2 `AuditInterceptor` behavior

- Applies to every request.
- Skips GET requests.
- On success, extracts: `actor_id` (current user), `actor_type='user'`, `event_type` = `${controller}.${method}` (e.g., `workflow.create`), `workflow_id` if resolvable from params, `before_state` snapshot (loaded pre-handler for PATCH/DELETE), `after_state` (from response payload).
- Writes `audit_log` row asynchronously (does not block the response).
- On `ai.tasks.progress` where `status` transitions to `completed`, writes an `actor_type='ai_agent'` row with `event_type='agent.<type>.completed'` and before/after = input/output snapshots (Phase 12 wires this).

### 9.3 Endpoints (§F7)

- `GET /workflows/:id/audit-log?from=...&to=...&type=...&actor=...&elementId=...`
- `GET /workflows/:id/decision-log` — filtered to `actor_type='ai_agent'` with `event_type` in `['agent.extraction.completed','agent.pattern.completed','agent.gap_detection.completed','agent.validation.completed']`
- `POST /workflows/:id/audit-log/export` — publishes `ai.tasks.new { task_type:'EXPORT_ONLY', input:{ target:'audit_log_pdf', workflow_id } }`

### 9.4 Acceptance

- Every mutating request in e2e tests produces exactly one audit row.
- `UPDATE audit_log ...` in SQL raises exception (trigger from Phase 3).
- Decision log returns only AI-agent rows.

Commit as `phase 9: F7 audit (immutable + global interceptor)`.

---

## Phase 10 — F8 Health & observability

**Time budget:** 0.5 day. **Parallel.**

### 10.1 Files

```
backend/src/modules/health/
├── health.module.ts
├── health.controller.ts
├── health-proxy.controller.ts
├── services/
│   └── health-cache.service.ts
└── indicators/
    ├── nats.indicator.ts
    ├── minio.indicator.ts
    ├── ollama.indicator.ts
    ├── ai-service.indicator.ts
    ├── elsa.indicator.ts
    └── pgvector.indicator.ts
```

### 10.2 Endpoints

- `GET /health` (public) — aggregated 200 if all ok, 503 otherwise; minimal payload `{ status, services: {...} }`
- `GET /health/details` (admin) — full `{ status, latency_ms, details }` per component
- `GET /health/nats` — proxies `http://nats:8222/jsz?streams=true`
- `GET /health/ai-service` — GET `FASTAPI_HEALTH_URL`
- `GET /health/ollama` — GET `OLLAMA_URL/api/tags`

### 10.3 Behavior

- Cache each indicator for 30s via `HealthCacheService` (FR-8.3).
- Subscribe to `system.health.ping` and broadcast via WS room `admin-health` (wired Phase 11).

### 10.4 Acceptance

- Stop `fastapi` → `GET /health` shows `ai-service: down` within 30s.
- Admin WS client receives `health.alert` event.
- `/health/nats` returns stream stats JSON.

Commit as `phase 10: F8 health with terminus + NATS monitor proxy`.

---

## Phase 11 — WebSocket gateway

**Time budget:** 0.5 day. **Can run alongside Phase 6 second half.**

### 11.1 Files

```
backend/src/modules/realtime/
├── realtime.module.ts
├── realtime.gateway.ts
├── services/
│   └── rooms.service.ts
└── guards/
    └── ws-auth.guard.ts
```

### 11.2 Rooms & events

| Room pattern | Joined by | Events emitted |
|---|---|---|
| `session:{sessionId}` | session participants | `session.state`, `message.appended`, `pipeline.progress` (mirrored from pipeline room) |
| `workflow:{workflowId}` | org members with access | `workflow.updated`, `comment.created`, `comment.resolved` |
| `pipeline:{pipelineExecutionId}` | session participants | `pipeline.progress`, `agent.log`, `agent.status` |
| `admin-health` | role=admin | `health.alert` |

Event payload shapes MUST match `contracts/` DTOs (no new shapes). Any change is a contract change (Phase 4 rule).

### 11.3 Auth

`WsAuthGuard` reads `handshake.auth.token` (Socket.io) or `?token=` query param. Validates JWT access token. Stores `userId`, `orgId`, `role` on `socket.data`.

Enforce org-scope on every `join`: reject joining `workflow:X` if workflow's org != user's org.

### 11.4 Wiring

Replace the Phase 4 stubs:
- `ai.tasks.progress` subscriber → fan-out to `session:{sessionId}` AND `pipeline:{pipelineExecutionId}` as `pipeline.progress`; if payload has `log`, also emit `agent.log`.
- `workflow.events.updated` subscriber → `workflow:{workflowId}` as `workflow.updated`.
- `system.health.ping` subscriber → `admin-health` as `health.alert` (only when `status !== 'ok'`).

### 11.5 Acceptance

- Connect socket with valid JWT → can join `workflow:X` for own-org workflow; rejected for other org.
- Publish synthetic `workflow.events.updated` via NATS → room member receives `workflow.updated` within 100ms.
- Invalid JWT on handshake → connection refused.

Commit as `phase 11: WebSocket gateway with rooms and JWT handshake`.

---

## Phase 12 — F9 Agent Orchestration

**Time budget:** 1–1.5 days. **Depends on Phases 3, 4, 5, 6, 11.**

### 12.1 Files

```
backend/src/modules/agents/
├── agents.module.ts
├── controllers/
│   ├── agent-definitions.controller.ts
│   ├── agent-config-overrides.controller.ts
│   ├── pipeline-executions.controller.ts
│   ├── agent-executions.controller.ts
│   └── telemetry.controller.ts        # admin only
├── services/
│   ├── agent-definitions.service.ts
│   ├── config-resolver.service.ts
│   ├── pipeline-executions.service.ts
│   ├── agent-executions.service.ts
│   └── telemetry.service.ts
├── consumers/
│   └── pipeline-events.consumer.ts
└── dto/
    ├── update-config.dto.ts
    ├── create-override.dto.ts
    └── retry.dto.ts
```

### 12.2 Endpoints (§F9 — all)

**MVP scope (must ship):**

| Method | Path | Behavior |
|---|---|---|
| GET | `/agents` | list |
| GET | `/agents/:id` | detail |
| GET | `/sessions/:id/pipeline-executions` | list |
| GET | `/pipeline-executions/:id` | detail with agent timeline |
| GET | `/pipeline-executions/:id/agents` | list agent executions in order |
| GET | `/agent-executions/:id` | detail |
| GET | `/agent-executions/:id/logs` | SSE stream of `agent_log` rows |

**Stretch (defer if deadline pressure):**

| Method | Path | Behavior |
|---|---|---|
| PATCH | `/agents/:id/config` | admin only; updates `default_config` |
| POST | `/agents/:id/overrides` | body `{ scopeType, scopeId, configPatch }` |
| GET | `/agents/:id/overrides` | list |
| DELETE | `/agents/overrides/:id` | |
| POST | `/pipeline-executions/:id/retry` | publishes `ai.tasks.new { resume_from: last_checkpoint_agent }` |
| DELETE | `/pipeline-executions/:id/cancel` | publishes cancel + sets status=`cancelled` |
| GET | `/admin/agents/telemetry` | aggregates |

### 12.3 `PipelineEventsConsumer` — THE critical wiring

Subscribes to `ai.tasks.progress`. For each payload:

1. Upsert `agent_execution` row by `(pipeline_execution_id, agent_type, order_index)`:
   - On `status='pending'`/`'running'` (first time): insert with `started_at = started_at || now()`, `input_snapshot`.
   - On `status='running'` with `log`: insert an `agent_log` row.
   - On `status='completed'`: update `completed_at`, `output_snapshot`, `confidence_output`, `duration_ms`, `llm_calls_count += delta`, `tokens_consumed += delta`.
   - On `status='failed'`: update `error_message`, `status='failed'`.
2. Update `pipeline_execution`:
   - `last_checkpoint_agent` = last `completed` agent.
   - `total_llm_calls`, `total_tokens_consumed` cumulative.
   - `status`: transitions per §8.3.2 state machine. On all agents completed (known list based on mode/task_type) → `status='completed'`, set `completed_at`, `total_duration_ms`, `final_confidence`.
   - On any agent `failed` → `status='paused'` (allow retry); after `retry_count >= 3` → `status='failed'`.
3. Insert `audit_log` row with `actor_type='ai_agent'` (picked up by Phase 9 interceptor logic — here written directly).

### 12.4 `ConfigResolver.resolve(agentDefId, orgId, sessionId): object`

Deep-merge per §8.3.7:
```ts
return { ...base_default_config, ...(org_override?.config_patch ?? {}), ...(session_override?.config_patch ?? {}) };
```
Single PostgreSQL query pulling both overrides in one round-trip.

### 12.5 Telemetry queries (stretch)

SQL aggregations directly (no ORM):
```sql
SELECT ad.agent_type,
       COUNT(*)                              AS runs,
       AVG(ae.duration_ms)                   AS avg_duration_ms,
       AVG(ae.tokens_consumed)               AS avg_tokens,
       SUM(CASE WHEN ae.status='failed' THEN 1 ELSE 0 END)::float / COUNT(*) AS failure_rate,
       AVG(ae.confidence_output)             AS avg_confidence_out
  FROM agent_execution ae
  JOIN agent_definition ad ON ad.id = ae.agent_definition_id
 WHERE ae.created_at BETWEEN $from AND $to
 GROUP BY ad.agent_type;
```

### 12.6 Acceptance

- Publish a synthetic sequence of `ai.tasks.progress` covering all 8 agents → `GET /pipeline-executions/:id` returns the full timeline with correct order, durations, cumulative tokens.
- `GET /agent-executions/:id/logs` streams rows via SSE in real time.
- Config resolver test: default → org override → session override merge returns expected dict.
- (If stretch shipped) Retry a failed pipeline → new `ai.tasks.new` on NATS has `resume_from` set.

Commit as `phase 12: F9 agent orchestration (registry + pipeline/agent executions + logs + telemetry)`.

---

## Phase 13 — Testing

**Time budget:** continuous; final-day tightening.

### 13.1 Must-have unit tests

- `auth.service.spec.ts` — register / login / lockout / refresh rotation / refresh-reuse revokes family.
- `session-fsm.service.spec.ts` — table-driven transitions.
- `workflow-versions.service.spec.ts` — increment + current flagging.
- `workflow-diff.service.spec.ts` — added/removed/modified correctness.
- `config-resolver.service.spec.ts` — merge chain.
- `nats.client.spec.ts` — idempotency key derivation; DLQ routing after 3 attempts.
- `pipeline-events.consumer.spec.ts` — upsert correctness; pipeline status transitions.
- `roles.guard.spec.ts`, `jwt-auth.guard.spec.ts` — including DEV_BYPASS.
- `audit.interceptor.spec.ts` — writes row once per mutation; skips GET.

### 13.2 Integration tests (`test/integration/`)

Testcontainers: `pgvector/pgvector:pg16` + `nats:2.10-alpine` started per suite.

Per module: one controller test against a real DB + real NATS.

### 13.3 E2E happy path — `test/e2e/auto-workflow.e2e-spec.ts`

Full scenario:
1. Register admin of new org → verify → login.
2. Create workflow `w1`.
3. Upload a PDF document attached to `w1`.
4. Create session `s1` (mode=auto).
5. POST message `"Build me an expense approval process"`.
6. Assert `ai.tasks.new` captured on NATS subscriber mock.
7. Test harness publishes 8 `ai.tasks.progress` messages (one per agent, ending `completed`) + final `ai.tasks.result` with a known `workflow_json`.
8. Assert:
   - `session.status === 'draft_ready'`
   - `workflow.current_version === 1`
   - `GET /workflows/w1/versions` returns 1 version with matching JSON
   - `GET /pipeline-executions/:id` returns 8 agent executions
   - WS subscriber received `workflow.updated` and `pipeline.progress` events
   - `audit_log` has ≥ 10 rows
9. `POST /workflows/w1/export/elsa` → assert `ai.tasks.new { task_type:'EXPORT_ONLY' }` captured.

### 13.4 Acceptance

- `pnpm test` green.
- `pnpm test:e2e` green against running compose stack.
- Coverage on services + guards ≥ 70%.

Commit as `phase 13: unit + integration + e2e coverage`.

---

## Phase 14 — Final hardening

**Time budget:** 0.5 day.

### 14.1 Checklist

- [ ] Every controller has `@ApiTags`, `@ApiOperation`, `@ApiBearerAuth`.
- [ ] Every DTO has `@ApiProperty`.
- [ ] Swagger doc renders at `/docs` with full payload schemas.
- [ ] README updated with architecture diagram + run instructions.
- [ ] `.env.example` complete; no secrets in `.env` committed.
- [ ] `docker compose up` end-to-end smoke test: register → workflow → auto pipeline → draft_ready in a browser driven through Next.js (owner verifies).
- [ ] Pre-pull Mistral + nomic models into `ollama-models` volume before demo; `docker volume ls` shows it populated.
- [ ] Contract freeze: `backend/src/nats/contracts/subjects.ts` has a `// FROZEN — do not edit without coordinated FastAPI change` header.

Commit as `phase 14: final hardening + swagger + demo readiness`.

---

## Dependency graph (quick reference)

```
P0 ─┐
P1 ─┴─> P2 ─> P3 ─> P4 ─> P5 ─> P6 ─┬─> P11 ─> P12 ─> P13/P14
                                     ├─> P7
                                     ├─> P8
                                     ├─> P9
                                     └─> P10
```

Any task in P6–P10 that requires NATS publishing MUST NOT start before P4 is merged.
Any task that requires auth'd endpoints MUST NOT start before P5 is merged (use `DEV_BYPASS_AUTH` in the meantime).

---

## Open decisions (pre-committed — do not re-litigate)

| Decision | Choice |
|---|---|
| Model | **Mistral 7B Instruct + nomic-embed-text** |
| ORM | **TypeORM with custom pgvector transformer** |
| Schema strategy | **Migrations on, synchronize off** |
| Postgres instances | **Two — `app-db` (pgvector) and `elsa-db` (vanilla)** |
| NestJS Elsa DB conn | **None** (FastAPI owns Elsa DB) |
| Auth timing | **Day-one F1 with `DEV_BYPASS_AUTH` flag** |
| Streaming | **SSE for AI tokens + WebSocket for events/rooms** |

---

## Contract freeze (Phase 4 deliverable — quoted here for reference)

**Subjects:** `ai.tasks.new`, `ai.tasks.result`, `ai.tasks.progress`, `workflow.events.updated`, `session.events.finalized`, `system.health.ping`, `dead.flowforge.*`
**Stream:** `FLOWFORGE`, file storage, 24h retention, 100k max msgs, at-least-once, explicit ack, max_deliver=3, ack_wait=30s
**Idempotency key:** `${correlation_id}:${subject}:${pipeline_execution_id ?? ''}`
**WS event names:** `pipeline.progress`, `workflow.updated`, `session.state`, `message.appended`, `comment.created`, `comment.resolved`, `health.alert`, `agent.log`, `agent.status`

Any change to the above requires a coordinated FastAPI + Next.js update. Do not change unilaterally.

---

*End of TODO. Execute phases sequentially respecting the parallel-track hints. Commit after each phase.*
