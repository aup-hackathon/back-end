# FlowForge Backend

Phase 0 scaffold for the NestJS backend.

## Local setup

```bash
pnpm install
cp .env.example .env
docker compose up -d app-db nats
pnpm migration:run
pnpm start:dev
```
