# FlowForge Backend

NestJS gateway for the FlowForge platform.

## Quick Start

1. Install dependencies:
   ```bash
   pnpm install
   ```
2. Set up environment:
   ```bash
   cp .env.example .env
   ```
3. Start infrastructure:
   ```bash
   docker compose up -d app-db nats minio ollama
   ```
4. Run migrations:
   ```bash
   pnpm migration:run
   ```
5. Start development server:
   ```bash
   pnpm start:dev
   ```
