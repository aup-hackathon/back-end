# AI Workflow Generation Platform — Full Architecture & Design System Specification

> **Hackathon:** Digitalisation d'un processus métier par génération automatique de workflows à partir d'un besoin non structuré
> **Version:** 2.0.0
> **Stack:** Next.js · NestJS · FastAPI · Elsa Server · NATS JetStream · PostgreSQL + pgvector · Ollama

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Layer Specifications](#3-layer-specifications)
   - 3.1 [Client Layer — Next.js](#31-client-layer--nextjs)
   - 3.2 [Gateway Layer — NestJS Modular Monolith](#32-gateway-layer--nestjs-modular-monolith)
   - 3.3 [Message Bus — NATS JetStream](#33-message-bus--nats-jetstream)
   - 3.4 [Worker Layer — FastAPI AI Orchestrator](#34-worker-layer--fastapi-ai-orchestrator)
   - 3.5 [Execution Layer — Elsa Server (.NET)](#35-execution-layer--elsa-server-net)
4. [Database Design](#4-database-design)
5. [Data Contracts & API Schemas](#5-data-contracts--api-schemas)
6. [Sequence Flow — End to End](#6-sequence-flow--end-to-end)
7. [NestJS Module Breakdown](#7-nestjs-module-breakdown)
8. [Error Handling & Resilience](#8-error-handling--resilience)
9. [Infrastructure & DevOps](#9-infrastructure--devops)
10. [Technology Decisions & Justifications](#10-technology-decisions--justifications)
11. [Known Limitations & Future Work](#11-known-limitations--future-work)

---

## 1. Project Overview

### Problem Statement

Technical users — developers, workflow designers, process engineers — need to produce executable workflow definitions quickly. Hand-authoring Elsa 3.0 JSON is mechanical and error-prone; dragging activities in a visual designer is fast for trivial flows but slow and repetitive across dozens of workflows that share patterns. The bottleneck is not *understanding* what to build — it is the *mechanical cost* of expressing a known intent in a specific schema, and the absence of a feedback loop that learns from workflows the team has already built.

### Solution

FlowGen is an AI-powered authoring environment that turns a natural-language prompt from a technical user into a valid, immediately-executable Elsa 3.0 workflow. It supports **two generation modes** (auto and interactive), maintains the **full conversation history** per workflow instance, versions every accepted output **immutably**, and **learns over time** via pgvector-backed retrieval: accepted workflows become few-shot examples for future generations, so quality improves with usage rather than stagnating.

### Key Differentiators

| Differentiator | Detail |
|---|---|
| **Sovereign AI** | Runs entirely on Ollama (local LLMs) — no external API, no data leaves the infrastructure |
| **Lightweight models** | Gemma 9B for generation + `nomic-embed-text` (137M) for embeddings — aligned with the hackathon's "approches sobres" requirement |
| **Two generation modes** | Auto for confident one-shot prompts; Interactive for targeted clarification before generation |
| **Immutable version history** | Every accepted workflow is a new version; drafts never overwrite accepted versions; rollback creates a new version entry |
| **Self-improving via RAG** | Accepted workflows become retrievable few-shot examples via pgvector cosine similarity |
| **Live streaming** | Gemma token streaming via NATS → WebSocket gives real-time generation feedback |
| **Executable output** | Output is valid Elsa 3.0 JSON that runs immediately — not a diagram image |

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER (Next.js)                             │
│   ┌─────────────────────────┐      ┌──────────────────────────────────┐    │
│   │   AI Chat + Versions    │      │      Elsa Studio WASM            │    │
│   │  (prompt · mode toggle  │      │  (preview mode during draft,     │    │
│   │   conversation · rail)  │      │   live editable after Accept)    │    │
│   └─────────────────────────┘      └──────────────────────────────────┘    │
└──────────────────────────┬──────────────────────────────────────────────────┘
                           │ REST POST + WebSocket
┌──────────────────────────▼──────────────────────────────────────────────────┐
│                       GATEWAY LAYER (NestJS)                                │
│   AuthModule (deferred) · WorkflowModule · VersionsModule                   │
│   ConversationsModule · NatsModule (global) · WebSocketGateway · Health     │
│                           │                                                 │
│                 PostgreSQL + pgvector (App Data)                            │
│      users · workflows · workflow_versions · conversation_messages          │
│                       · workflow_embeddings                                 │
└──────────────────────────┬──────────────────────────────────────────────────┘
                           │ Publish / Subscribe
┌──────────────────────────▼──────────────────────────────────────────────────┐
│                    MESSAGE BUS (NATS JetStream)                             │
│  workflow.generate · workflow.question · workflow.stream · workflow.draft   │
│                · workflow.embed · workflow.error · DLQ                      │
└──────────┬──────────────────────────────────────────────────────────────────┘
           │ Subscribe                              │ Publish (stream/error)
┌──────────▼───────────────┐           ┌───────────▼──────────────────────────┐
│  AI ORCHESTRATOR         │           │     ELSA SERVER (.NET)               │
│  FastAPI                 │           │     Execution Engine                 │
│  · ConversationLoader    │           │     · Reads Elsa PostgreSQL          │
│  · RAGRetriever (pgvec)  │──────────▶│     · Executes workflows             │
│  · ModeEvaluator         │  writes   │                                      │
│  · Ollama Gemma 9B       │  Elsa JSON│                                      │
│  · Ollama nomic-embed    │           │                                      │
│  · Pydantic Validator    │           │                                      │
└──────────────────────────┘           └──────────────────────────────────────┘
                                                    │
                                       PostgreSQL (Elsa Defs — separate)
                                       workflow definitions · activity state
```

---

## 3. Layer Specifications

### 3.1 Client Layer — Next.js

**Framework:** Next.js 14 (App Router)
**Language:** TypeScript
**Target user:** technical (developer, workflow designer, process engineer)

#### UX Design Principles

FlowGen is a professional authoring tool, not a hand-holding assistant. The UI assumes the user knows what a workflow is, what Elsa activities are, and what they want to build. Three invariants drive every design decision:

| Principle | Manifestation |
|---|---|
| **No guessing — ask or commit.** The AI never invents missing context silently. | Interactive mode forces one targeted question before generation when info is insufficient; Auto mode refuses to partial-generate and surfaces an error the user must address. |
| **Drafts are disposable, versions are sacred.** Accepted state must never be clobbered by a generation attempt. | Preview → Accept flow. The canvas is read-only until Accept. Modify discards the draft cleanly. |
| **Every generation is reproducible.** A user must be able to see exactly what prompt, what history, and what retrieved examples produced a given version. | `workflow_versions.prompt_used` + conversation history + embedding table are all persisted and viewable. |

#### Two-Pane Studio Layout

The **left pane** is the chat + versions rail; the **right pane** is the Elsa Studio canvas, which swaps between **preview mode** (during draft) and **live mode** (after Accept). A mode toggle (Auto / Interactive) sits at the top of the chat and can be flipped between turns but not mid-generation.

#### Components

| Component | Responsibility |
|---|---|
| `UnifiedStudioLayout` | Two-pane resizable layout; mobile fallback stacks chat above canvas. |
| `ModeToggle` | Segmented control — **Auto** / **Interactive**. Default: Interactive on new workflow, Auto once the workflow has at least one accepted version (the user has proven they know what they want). |
| `PromptComposer` | Plain-text input with a monospace toggle for pasting structured context (JSON, pseudocode, DSL snippets). Multi-line, shift-enter for newline, enter to send. |
| `ConversationTranscript` | Renders the full message history per workflow instance. User messages, AI clarifying questions, and streaming assistant outputs are all first-class turns. |
| `StreamingOutput` | Renders Gemma's JSON tokens live as a collapsing syntax-highlighted tree — activities appear one at a time as they're produced. |
| `ElsaStudioEmbed` | `<iframe>` embedding the Elsa Studio WASM build. Receives `postMessage`: `{ type: 'loadDraft', elsaJson }` (read-only preview) and `{ type: 'loadAccepted', workflowId }` (live, editable). |
| `PreviewBanner` | Amber banner on top of the canvas during draft state: *"Preview — click Accept to commit as version N."* |
| `AcceptModifyBar` | Bottom-of-canvas action bar during draft: **Accept** (commits the draft as a new version, triggers the embedding job, switches the canvas to live mode) · **Modify** (discards the draft, returns focus to the composer). |
| `VersionTimeline` | Right-rail list of all accepted versions with `version_number`, `accepted_at`, and a preview of `prompt_used`. Click to view; a second click rolls back — rollback creates a new version entry rather than deleting history. |
| `ModeIndicator` | Inline badge on each AI turn showing whether it was produced in Auto or Interactive mode, plus how many RAG examples were injected. For trust and debugging. |

#### Key User Journeys

**J1 — Auto mode, confident prompt.** User sets mode to Auto, types a complete prompt, submits → tokens stream in → canvas renders the draft → PreviewBanner appears → user reviews → clicks Accept → canvas switches to live mode, VersionTimeline gains `v1`.

**J2 — Interactive mode, initial underspecification.** User types *"approval workflow for expense reports"* → ModeEvaluator decides info is insufficient → FastAPI publishes `workflow.question`: *"What's the approval threshold, and who approves above it?"* → user answers → loop continues until evaluator decides to generate → draft appears → Accept.

**J3 — Iterative refinement across versions.** After v1 is accepted, user types *"add a regional-manager escalation above 10k€"* → the pipeline runs again with v1 available as a RAG example → new draft → Accept → v2. v1 remains immutable and viewable.

**J4 — Rollback.** User opens v1 in VersionTimeline, clicks Rollback → NestJS creates v3 whose `elsa_json` equals v1's → canvas loads v3. v2 still exists and is still viewable. No history is ever destroyed.

#### Visual language

- **Typography:** Inter for UI, JetBrains Mono for JSON stream and activity ids.
- **State colors:** draft amber `#f59e0b`, accepted green `#16a34a`, error red `#ef4444`.
- **Motion:** 120ms fade-in per activity during stream; 300ms morph on diff when rolling back.
- **Accessibility:** state never conveyed by color alone (icon + label); keyboard-first (⌘/Ctrl+Enter to send, A to Accept, M to Modify); `aria-live="polite"` on the stream region.

#### Communication

- **REST:** `POST /api/workflows` — creates a workflow instance (`status: pending`).
- **REST:** `POST /api/workflows/:id/messages` — sends a user message (prompt or clarification answer). Returns `{ jobId }` and triggers generation or a next question via NATS.
- **REST:** `POST /api/workflows/:id/accept` — commits the current draft as a new version, triggers an embedding job.
- **REST:** `POST /api/workflows/:id/modify` — discards the current draft, returns the workflow to `pending`.
- **REST:** `POST /api/workflows/:id/rollback/:versionNumber` — creates a new version whose `elsa_json` matches the target version.
- **WebSocket:** NestJS `StreamGateway`, rooms by `workflowId`. Events: `token`, `activity-complete`, `question`, `draft`, `accepted`, `error`.
- **postMessage:** parent ↔ Elsa iframe — `loadDraft`, `loadAccepted`, `highlight`, `activityClicked`.

#### Environment Variables

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=ws://localhost:3000
NEXT_PUBLIC_ELSA_URL=http://localhost:5000
```

---

### 3.2 Gateway Layer — NestJS Modular Monolith

**Framework:** NestJS 10
**Language:** TypeScript
**Architecture:** Modular Monolith (single deployment, domain-isolated modules)

#### Module Map

```
src/
├── main.ts
├── app.module.ts
│
├── core/                        # CoreModule — global
│   ├── config/                  # ConfigModule (env via @nestjs/config)
│   ├── logger/                  # LoggerModule (Pino)
│   └── guards/                  # JwtAuthGuard (registered, bypassed pre-auth phase)
│
├── auth/                        # AuthModule — Phase 2 (deferred)
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── jwt.strategy.ts
│   └── auth.module.ts
│
├── workflows/                   # WorkflowModule
│   ├── workflows.controller.ts  # CRUD + messages + accept/modify/rollback
│   ├── workflows.service.ts     # draft/accept state machine
│   ├── workflows.repository.ts
│   └── workflows.module.ts
│
├── versions/                    # VersionsModule
│   ├── versions.controller.ts   # GET /workflows/:id/versions, GET /versions/:id
│   ├── versions.service.ts      # createVersion (append-only, transactional)
│   ├── versions.repository.ts
│   └── versions.module.ts
│
├── conversations/               # ConversationsModule
│   ├── conversations.service.ts # append / getHistory per workflow
│   ├── conversations.repository.ts
│   └── conversations.module.ts
│
├── nats/                        # NatsModule — global
│   ├── nats.publisher.ts
│   ├── nats.subscriber.ts
│   └── nats.module.ts
│
├── gateway/                     # WebSocketGateway
│   ├── stream.gateway.ts        # rooms by workflowId
│   └── gateway.module.ts
│
└── health/                      # HealthModule
    ├── health.controller.ts     # GET /health
    └── health.module.ts
```

#### Module Responsibilities

**CoreModule**
- Loads env via `@nestjs/config`, sets up Pino logger, registers `JwtAuthGuard`.
- During the pre-auth hackathon phase, all routes are `@Public()` and the guard is a no-op.

**AuthModule** *(deferred — Phase 2 / end of hackathon)*
- Single-tenant with a hardcoded demo user during the core build.
- When enabled: `POST /auth/register` (bcrypt), `POST /auth/login` (returns `{ access_token }`), JwtStrategy reads `JWT_SECRET`.

**WorkflowModule**
- Central orchestration. Owns the workflow-instance lifecycle: `pending → processing → draft → accepted` (or `error` from any state).
- `POST /workflows` → creates a workflow row (`status: pending`, `mode: interactive` by default).
- `POST /workflows/:id/messages`:
  1. Appends the message to `conversation_messages` via ConversationsService.
  2. Publishes `workflow.generate` to NATS with `{ jobId, workflowId, mode }`.
  3. Sets status to `processing`, returns `{ jobId }`.
- `POST /workflows/:id/accept`:
  1. Validates workflow is in `draft`.
  2. Delegates to VersionsService.createVersion (transactionally unsets `is_current` on the prior version, inserts a new row with incremented `version_number`, sets `is_current: true`, sets `accepted_at`).
  3. Publishes `workflow.embed` to trigger the embedding job in FastAPI.
  4. Updates workflow status to `accepted`, clears `draft_elsa_json`.
- `POST /workflows/:id/modify` → validates `draft`, clears `draft_elsa_json`, sets status back to `pending`.
- `POST /workflows/:id/rollback/:versionNumber` → VersionsService creates a new version whose `elsa_json` equals the target version (never destructive).
- Subscribes via NatsSubscriber to `workflow.draft`, `workflow.question`, `workflow.error`.

**VersionsModule**
- `GET /workflows/:id/versions` → ordered list of versions.
- `GET /versions/:id` → single version detail.
- `VersionsService.createVersion(workflowId, elsaJson, promptUsed)` — append-only, transactional.
- Exposes no direct mutation — versions are immutable by design.

**ConversationsModule**
- `append(workflowId, role, content)` and `getHistory(workflowId): Message[]`.
- Called by WorkflowController on every user message and by NatsSubscriber when FastAPI publishes a clarifying question.
- FastAPI reads history directly from the app DB (read-only) at generation time rather than receiving it in every NATS payload — avoids duplicating full transcripts on the wire.

**NatsModule**
- `NatsPublisher.publish<T>(subject, payload)`.
- `NatsSubscriber` subscribes on startup to `workflow.stream`, `workflow.question`, `workflow.draft`, `workflow.error`.
- Handlers:
  - `workflow.stream` → `StreamGateway.emitToken(workflowId, token)`
  - `workflow.question` → `ConversationsService.append(workflowId, 'assistant', question)` + `StreamGateway.emitQuestion(...)`
  - `workflow.draft` → `WorkflowService.markDraft(jobId, elsaJson)` + emit
  - `workflow.error` → `WorkflowService.markError(jobId, reason)` + emit

**StreamGateway**
- `@WebSocketGateway({ cors: true })`, rooms by `workflowId`.
- `emitToken`, `emitQuestion`, `emitDraft`, `emitAccepted`, `emitError`.

**HealthModule**
- `GET /health` → checks app DB, pgvector extension, Elsa DB, NATS, Ollama reachability. Returns `{ ok, postgres, pgvector, nats, ollama }`.

---

### 3.3 Message Bus — NATS JetStream

**Version:** NATS Server 2.10+ with JetStream enabled

#### Subjects

| Subject | Publisher | Subscriber | Payload |
|---|---|---|---|
| `workflow.generate` | NestJS WorkflowModule | FastAPI AI Orchestrator | `GenerateJobPayload` |
| `workflow.question` | FastAPI AI Orchestrator | NestJS NatsSubscriber | `QuestionPayload` |
| `workflow.stream` | FastAPI AI Orchestrator | NestJS NatsSubscriber | `StreamTokenPayload` |
| `workflow.draft` | FastAPI AI Orchestrator | NestJS NatsSubscriber | `DraftPayload` |
| `workflow.embed` | NestJS WorkflowModule | FastAPI AI Orchestrator | `EmbedJobPayload` |
| `workflow.error` | FastAPI AI Orchestrator | NestJS NatsSubscriber | `ErrorPayload` |

> `workflow.done` from v1 of this spec is renamed to `workflow.draft` to reflect the two-phase lifecycle — the AI produces a *draft*, the user commits it as a *version*.

#### JetStream Stream Configuration

```yaml
stream_name: WORKFLOWS
subjects:
  - workflow.*
retention: limits
max_msgs: 100000
max_age: 24h
storage: file
replicas: 1
```

#### Dead Letter Queue

Messages that fail processing after **3 retries** in FastAPI are published to `workflow.error` with `{ reason, originalPayload }`. NestJS updates workflow status to `error` and the UI surfaces the reason.

---

### 3.4 Worker Layer — FastAPI AI Orchestrator

**Framework:** FastAPI 0.111+
**Language:** Python 3.11
**AI Runtime:** Ollama (local)

#### Service Structure

```
ai-service/
├── main.py
├── nats_client.py
├── db/
│   ├── app_db.py             # read conversation, read/write embeddings
│   └── elsa_db.py            # write Elsa workflow definitions
├── pipeline/
│   ├── conversation.py       # ConversationLoader
│   ├── prompt_builder.py
│   ├── mode_evaluator.py     # decides: ask question or generate
│   ├── generator.py          # Gemma streaming wrapper
│   ├── validator.py          # Pydantic Elsa 3.0 schema
│   └── elsa_writer.py
├── rag/
│   ├── embedder.py           # nomic-embed-text wrapper
│   └── retriever.py          # pgvector cosine similarity
└── schemas/
    └── elsa.py
```

#### Models

| Model | Size | Role | Why |
|---|---|---|---|
| `gemma2:9b` | 9B params | Generation of Elsa JSON + interactive-mode evaluator output | Strong instruction-following at a sober footprint |
| `nomic-embed-text` | 137M params | Embedding of `prompt_used` for RAG retrieval | Local via Ollama, 768-dim, compatible with pgvector's `ivfflat`/`hnsw` indexes, near-zero CPU/GPU cost |

#### Processing Pipeline

```
NATS workflow.generate
        │
        ▼
  ConversationLoader
  (reads all conversation_messages for this workflow_id
   from the app DB — full history is the context)
        │
        ▼
  RAGRetriever
  (embeds the latest user message with nomic-embed-text,
   queries workflow_embeddings for top 2-3 neighbours by
   cosine similarity, loads the matching workflow_versions.elsa_json
   rows as few-shot examples)
        │
        ▼
  PromptBuilder
  (injects: Elsa 3.0 schema · RAG few-shot examples ·
   full conversation history · current user turn)
        │
        ▼
  ModeEvaluator
  ┌─────────────────────────────────────────────────────┐
  │ mode == "auto"         → skip evaluation, generate  │
  │ mode == "interactive"  → call Gemma with a strict   │
  │    output format:                                   │
  │    { "sufficient": true }                           │
  │    { "sufficient": false, "question": "<one q>" }   │
  │    · sufficient=true  → generation                  │
  │    · sufficient=false → publish workflow.question   │
  │      (one focused question, not a list) and stop    │
  └─────────────────────────────────────────────────────┘
        │ (generation branch)
        ▼
  Gemma 9B (via Ollama streaming API)
        │ streams JSON tokens → publishes workflow.stream
        ▼
  PydanticValidator (Elsa 3.0 schema)
        │
  ┌─────┴──────┐
  valid        invalid
    │              │
    ▼              ▼
  ElsaWriter   workflow.error
  (writes to   (with reason)
  Elsa PG as
  a draft def)
        │
        ▼
  publish workflow.draft
  { jobId, workflowId, elsaJson, elsaWorkflowId }
```

#### Accept-Side Pipeline (embedding job)

```
NATS workflow.embed
        │
        ▼
  read workflow_versions.prompt_used (by workflow_version_id)
        │
        ▼
  nomic-embed-text → 768-dim vector
        │
        ▼
  INSERT INTO workflow_embeddings
  (workflow_version_id, embedding)
```

The embedding job is asynchronous: a failure does not affect the accepted version; it only means that version is not yet retrievable as a RAG example until a background retry succeeds.

#### Prompt Engineering

System prompt sent to Gemma 9B (generation turn):

```
You are an expert Elsa 3.0 workflow author. Produce a valid Elsa 3.0
workflow JSON that satisfies the user's latest request, informed by the
full conversation history below and the retrieved similar examples.

Rules:
- Output ONLY valid JSON. No explanation, no markdown, no preamble.
- Every activity must have a unique "id".
- Supported activity types: Elsa.HttpEndpoint, Elsa.WriteLine,
  Elsa.If, Elsa.Fork, Elsa.Join, Elsa.SetVariable, Elsa.Finish.
- Every connection must reference valid activity ids.

Elsa schema:
{schema_json}

Retrieved examples (accepted workflows similar to this request):
{rag_examples}

Conversation history:
{messages}

Latest user request:
{latest_user_message}
```

ModeEvaluator prompt (interactive mode, pre-generation):

```
Given the conversation history and the latest user request, decide
whether you have enough information to produce a correct Elsa 3.0
workflow.

Output ONLY this JSON:
{ "sufficient": true }
OR
{ "sufficient": false, "question": "<one specific question>" }

Ask exactly one targeted question if information is missing. Do not
ask broad questions. Do not ask multiple questions. Do not explain.
```

#### Environment Variables

```env
NATS_URL=nats://nats:4222
OLLAMA_BASE_URL=http://ollama:11434
APP_POSTGRES_URL=postgresql://app:secret@app-db:5432/appdb
ELSA_POSTGRES_URL=postgresql://elsa:secret@elsa-db:5432/elsadb
GEMMA_MODEL=gemma2:9b
EMBED_MODEL=nomic-embed-text
RAG_TOP_K=3
```

---

### 3.5 Execution Layer — Elsa Server (.NET)

**Framework:** Elsa Workflows 3.x
**Language:** C# / .NET 8

#### Role

Elsa Server is the **workflow execution engine**. It does not generate workflows — it runs them. FastAPI writes the generated JSON into the Elsa PostgreSQL database as a draft definition; once the user Accepts, NestJS marks it as the current executable version.

#### Integration Points

- **Elsa Studio WASM:** embedded in Next.js as an iframe. In **preview mode** it loads the draft JSON passed via `postMessage` without persisting edits. In **live mode** (post-Accept) it connects to Elsa Server's management API for the saved workflow id.
- **Elsa PostgreSQL:** dedicated instance, managed by Elsa's own migrations. FastAPI writes via Elsa's repository API using Elsa's schema.
- **Trigger:** workflows can be triggered via `POST /elsa/workflows/{id}/execute` after Accept.

---

## 4. Database Design

### Database 1 — App Data (NestJS + FastAPI)

**Instance:** `pgvector/pgvector:pg16` — `app-db`

pgvector is a **PostgreSQL extension**, not a separate service. The image `pgvector/pgvector:pg16` bundles the extension with Postgres 16; an init SQL script runs `CREATE EXTENSION IF NOT EXISTS vector;` on first start.

```sql
CREATE EXTENSION IF NOT EXISTS vector;

-- Users (populated only when AuthModule is enabled)
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE NOT NULL,
  password    TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Workflow instances (one per user authoring session)
CREATE TABLE workflows (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  mode             TEXT NOT NULL DEFAULT 'interactive',   -- 'auto' | 'interactive'
  status           TEXT NOT NULL DEFAULT 'pending',       -- pending | processing | draft | accepted | error
  current_job_id   TEXT,                                  -- most recent NATS job id
  draft_elsa_json  JSONB,                                 -- populated on workflow.draft, cleared on accept/modify
  error_reason     TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Immutable accepted versions
CREATE TABLE workflow_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     UUID REFERENCES workflows(id) ON DELETE CASCADE,
  version_number  INTEGER NOT NULL,
  elsa_json       JSONB NOT NULL,
  prompt_used     TEXT NOT NULL,
  is_current      BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  accepted_at     TIMESTAMPTZ,
  UNIQUE (workflow_id, version_number)
);

-- Full conversation history per workflow (user turns + AI clarifying questions)
CREATE TABLE conversation_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id  UUID REFERENCES workflows(id) ON DELETE CASCADE,
  role         TEXT NOT NULL,  -- 'user' | 'assistant'
  content      TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- RAG embeddings for accepted versions
CREATE TABLE workflow_embeddings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_version_id UUID REFERENCES workflow_versions(id) ON DELETE CASCADE,
  embedding           vector(768),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON workflow_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```

> **ivfflat sizing note:** `lists = 100` is tuned for production scale (10k+ rows). At hackathon scale (<100 accepted versions) retrieval quality may be better with an `hnsw` index (`USING hnsw (embedding vector_cosine_ops)`) or no index at all. Tracked in §11.

### Database 2 — Elsa Definitions (Elsa Server owns)

**Instance:** `postgres:16` — `elsa-db`

Managed entirely by Elsa Server's EF Core migrations. FastAPI writes via Elsa's repository API. Do not add custom tables here; all schema management is Elsa's responsibility.

---

## 5. Data Contracts & API Schemas

### NATS Payload: `workflow.generate`

```typescript
interface GenerateJobPayload {
  jobId: string;
  workflowId: string;
  userId: string;
  mode: 'auto' | 'interactive';
}
```

No conversation or input content is in the payload — FastAPI reads history and prior versions directly from the app DB using `workflowId`.

### NATS Payload: `workflow.question`

```typescript
interface QuestionPayload {
  jobId: string;
  workflowId: string;
  question: string;          // one focused question
}
```

### NATS Payload: `workflow.stream`

```typescript
interface StreamTokenPayload {
  jobId: string;
  workflowId: string;
  token: string;
  chunkIndex: number;
}
```

### NATS Payload: `workflow.draft`

```typescript
interface DraftPayload {
  jobId: string;
  workflowId: string;
  elsaJson: object;          // full validated Elsa 3.0 workflow
  elsaWorkflowId: string;    // id of the saved draft definition in Elsa DB
}
```

### NATS Payload: `workflow.embed`

```typescript
interface EmbedJobPayload {
  workflowVersionId: string;
  promptUsed: string;
}
```

### NATS Payload: `workflow.error`

```typescript
interface ErrorPayload {
  jobId: string;
  workflowId: string;
  reason: string;
  originalPayload?: GenerateJobPayload;
}
```

### Elsa 3.0 Workflow JSON (AI Output Contract)

```json
{
  "id": "wf-uuid",
  "name": "Process Name",
  "root": {
    "type": "Elsa.Flowchart",
    "activities": [
      { "id": "act-1", "type": "Elsa.HttpEndpoint", "path": "/start", "methods": ["POST"] },
      { "id": "act-2", "type": "Elsa.If", "condition": "input.approved == true" },
      { "id": "act-3", "type": "Elsa.WriteLine", "text": "Process approved" },
      { "id": "act-4", "type": "Elsa.Finish" }
    ],
    "connections": [
      { "source": { "activity": "act-1", "port": "Done" }, "target": { "activity": "act-2", "port": "In" } },
      { "source": { "activity": "act-2", "port": "True" }, "target": { "activity": "act-3", "port": "In" } },
      { "source": { "activity": "act-3", "port": "Done" }, "target": { "activity": "act-4", "port": "In" } }
    ]
  }
}
```

---

## 6. Sequence Flow — End to End

```
User        Next.js       NestJS       NATS        FastAPI      Elsa Server
 │             │             │            │            │             │
 1─create wf───▶             │            │            │             │
 │             │─POST /workflows──▶       │            │             │
 │             │             │─save (status:pending)   │             │
 │             │◀─{workflowId}            │            │             │
 │             │             │            │            │             │
 2─prompt──────▶             │            │            │             │
 │             │─POST /workflows/:id/messages──▶       │             │
 3            │─append conversation_messages──▶        │             │
 4            │─publish workflow.generate──▶           │             │
 │             │             │            │─subscribe──▶             │
 5            │             │            │            │─load history
 │             │             │            │            │─RAG retrieve (pgvector)
 6 (interactive + info insufficient branch)
 │             │             │            │◀─workflow.question       │
 │             │◀─WS question│            │            │             │
 │◀─question───│             │            │            │             │
 │─answer──────▶             │            │            │             │
 │             │─append conversation_messages──▶       │             │
 │             │─publish workflow.generate (loop step 4)──▶          │
 │             │             │            │            │             │
 7 (auto mode or info sufficient branch)
 │             │             │            │            │─Gemma generate
 │             │             │            │◀─workflow.stream (tokens)│
 8            │◀─WS tokens──│            │            │             │
 │◀─live JSON──│             │            │            │             │
 9            │             │            │            │─Pydantic validate
 10           │             │            │            │─ElsaWriter──▶─save draft
 │             │             │            │◀─workflow.draft          │
 │             │             │◀─subscribe─│            │             │
 │             │─update (status:draft, store draft_elsa_json)        │
 │             │◀─WS draft───│            │            │             │
 │◀─preview────│             │            │            │             │
 │             │─postMessage: loadDraft(elsaJson)────────────────────▶
 │◀─read-only canvas         │            │            │             │
 │             │             │            │            │             │
 11─click Accept─▶           │            │            │             │
 │             │─POST /workflows/:id/accept──▶         │             │
 │             │─VersionsService.create (v N+1)        │             │
 │             │─publish workflow.embed──▶             │             │
 │             │                                       │─nomic-embed-text
 │             │                                       │─insert workflow_embeddings
 │             │─update (status:accepted)              │             │
 │             │◀─WS accepted│            │            │             │
 12           │─postMessage: loadAccepted(workflowId)────────────────▶
 │◀─live editable canvas     │            │            │             │
```

---

## 7. NestJS Module Breakdown

### Dependency Graph

```
AppModule
├── CoreModule (global)
│   ├── ConfigModule
│   ├── LoggerModule
│   └── JwtAuthGuard (global, bypassed pre-auth phase)
├── AuthModule                (deferred — Phase 2)
├── WorkflowModule
│   └── depends on: CoreModule, VersionsModule, ConversationsModule, NatsModule, TypeOrmModule(Workflow)
├── VersionsModule
│   └── depends on: CoreModule, TypeOrmModule(WorkflowVersion)
├── ConversationsModule
│   └── depends on: CoreModule, TypeOrmModule(ConversationMessage)
├── NatsModule (global)
│   └── provides: NatsPublisher, NatsSubscriber
├── GatewayModule
│   └── depends on: NatsModule
└── HealthModule
    └── depends on: CoreModule, NatsModule
```

### Key Injectable Services

| Service | Key Methods |
|---|---|
| `WorkflowService` | `create(dto)`, `addMessage(id, content)`, `markDraft(jobId, elsaJson)`, `markError(jobId, reason)`, `accept(id)`, `modify(id)`, `rollback(id, versionNumber)` |
| `VersionsService` | `createVersion(workflowId, elsaJson, promptUsed)`, `findAll(workflowId)`, `findOne(id)` — create is append-only, transactional |
| `ConversationsService` | `append(workflowId, role, content)`, `getHistory(workflowId)` |
| `NatsPublisher` | `publish<T>(subject, payload): void` |
| `StreamGateway` | `emitToken`, `emitQuestion`, `emitDraft`, `emitAccepted`, `emitError` |

---

## 8. Error Handling & Resilience

### Failure Scenarios

| Scenario | Detection | Recovery |
|---|---|---|
| FastAPI crashes mid-generation | NATS message not acknowledged → redelivered after timeout | FastAPI restarts and re-processes; workflow stays `processing` in DB |
| Gemma produces invalid JSON | Pydantic validation fails | Publish `workflow.error` → NestJS sets `error` → UI shows reason |
| ModeEvaluator returns malformed output | JSON parse fails | Fallback: proceed as if `sufficient: true`, log warning |
| RAG retrieval fails (pgvector down, embedding model down) | Exception in RAGRetriever | Generation proceeds with zero examples; logged. Retrieval is best-effort, not a blocker. |
| Elsa DB write fails | Exception in ElsaWriter | Publish `workflow.error` with reason `elsa_write_failed` |
| Embedding job fails post-Accept | Exception in embedder | Version remains accepted; embedding missing. Background retry. Until it succeeds, the version is not retrievable as a RAG example. |
| NATS unavailable at startup | Health check fails | NestJS refuses requests; Docker restart brings NATS back |

### Retry Policy

```python
max_deliver = 3          # retry up to 3 times
ack_wait = 30s
```

---

## 9. Infrastructure & DevOps

### Docker Compose Services

```yaml
services:

  nats:
    image: nats:2.10-alpine
    command: ["--jetstream", "--store_dir=/data"]
    ports: ["4222:4222", "8222:8222"]

  app-db:
    image: pgvector/pgvector:pg16          # pgvector extension pre-bundled
    environment:
      POSTGRES_DB: appdb
      POSTGRES_USER: app
      POSTGRES_PASSWORD: secret
    volumes:
      - "app-db-data:/var/lib/postgresql/data"
      - "./infra/app-db-init.sql:/docker-entrypoint-initdb.d/01-init.sql:ro"
    # app-db-init.sql contains: CREATE EXTENSION IF NOT EXISTS vector;

  elsa-db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: elsadb
      POSTGRES_USER: elsa
      POSTGRES_PASSWORD: secret
    volumes: ["elsa-db-data:/var/lib/postgresql/data"]

  ollama:
    image: ollama/ollama:latest
    volumes: ["ollama-models:/root/.ollama"]
    ports: ["11434:11434"]
    # After startup, pull the models once:
    #   ollama pull gemma2:9b
    #   ollama pull nomic-embed-text

  nestjs:
    build: ./backend
    depends_on: [app-db, nats]
    environment:
      DATABASE_URL: postgresql://app:secret@app-db:5432/appdb
      NATS_URL: nats://nats:4222
      JWT_SECRET: your-jwt-secret
    ports: ["3000:3000"]

  fastapi:
    build: ./ai-service
    depends_on: [nats, ollama, app-db, elsa-db]
    environment:
      NATS_URL: nats://nats:4222
      OLLAMA_BASE_URL: http://ollama:11434
      APP_POSTGRES_URL: postgresql://app:secret@app-db:5432/appdb
      ELSA_POSTGRES_URL: postgresql://elsa:secret@elsa-db:5432/elsadb
      GEMMA_MODEL: gemma2:9b
      EMBED_MODEL: nomic-embed-text
    ports: ["8000:8000"]

  elsa-server:
    build: ./elsa-server
    depends_on: [elsa-db]
    environment:
      ConnectionStrings__Elsa: Host=elsa-db;Database=elsadb;Username=elsa;Password=secret
    ports: ["5000:5000"]

  nextjs:
    build: ./frontend
    depends_on: [nestjs, elsa-server]
    environment:
      NEXT_PUBLIC_API_URL: http://nestjs:3000
      NEXT_PUBLIC_ELSA_URL: http://elsa-server:5000
    ports: ["3001:3001"]

volumes:
  app-db-data:
  elsa-db-data:
  ollama-models:
```

> **pgvector is enabled via `CREATE EXTENSION`, not a separate container.** The `pgvector/pgvector:pg16` image bundles the extension with Postgres 16; the init SQL enables it on first start.

### Service Port Map

| Service | Port | Protocol |
|---|---|---|
| Next.js (frontend) | 3001 | HTTP |
| NestJS (API) | 3000 | HTTP + WebSocket |
| FastAPI (AI) | 8000 | HTTP |
| Elsa Server | 5000 | HTTP |
| NATS | 4222 | TCP |
| NATS Monitoring | 8222 | HTTP |
| App PostgreSQL + pgvector | 5432 | TCP |
| Elsa PostgreSQL | 5433 | TCP |
| Ollama | 11434 | HTTP |

---

## 10. Technology Decisions & Justifications

| Technology | Decision | Reason |
|---|---|---|
| **NATS JetStream** | Message bus | Persistent, replay-capable, lightweight — avoids Kafka overhead |
| **NestJS Modular Monolith** | Backend architecture | Clean module boundaries without microservice complexity; easy to split later |
| **FastAPI** | AI service | Python ecosystem for ML/AI, async-native, Pydantic built in |
| **Gemma 9B via Ollama** | Text generation | Local LLM, sovereign, no API cost, fits "approches sobres" |
| **nomic-embed-text** | Embedding model for RAG — 137M params, local via Ollama, 768-dim vectors, compatible with pgvector | Sober embedding model for a sober purpose; near-zero overhead vs. a larger embedder |
| **pgvector** | Vector similarity search as a PostgreSQL extension — no new service, cosine distance via `ivfflat`/`hnsw` index | Keeps infrastructure count down; same ops model as the rest of the app data |
| **Immutable version control** | `workflow_versions` table; drafts never overwrite accepted versions; rollback creates a new version entry | Every generation is reproducible; users can iterate fearlessly |
| **Two generation modes (auto / interactive)** | ModeEvaluator gate in FastAPI | Auto respects confident technical users; Interactive elicits missing context via one targeted question rather than guessing |
| **Preview → Accept state machine** | `pending → processing → draft → accepted` | Drafts are disposable; accepted state is canonical and sacred |
| **Two PostgreSQL instances** | Data isolation | Prevents Elsa schema migrations from conflicting with app schema |
| **Pydantic validation** | AI output safety | Catches malformed Elsa JSON before DB write |
| **Elsa Workflows 3.x** | Execution engine | Specified in the hackathon brief; provides the WASM Studio for free |
| **Next.js App Router** | Frontend | SSR for project pages, client components for real-time chat/streaming |
| **JSON over NATS** | Inter-service protocol | Simpler than gRPC; NATS handles framing |

---

## 11. Known Limitations & Future Work

### Hackathon Scope Limitations

| Limitation | Impact | Future Fix |
|---|---|---|
| No NATS authentication (NKeys) | Any service on the network can publish to any subject | Add NKeys per-subject permissions |
| Single NATS node | No HA | Multi-node JetStream cluster |
| Ollama runs on CPU (unless GPU available) | Gemma 9B generation is slow (~30–60s) | GPU passthrough in Docker, or Q4 quantized model |
| **RAG cold-start** | At demo time `workflow_embeddings` is empty — first N generations get no retrieval benefit | Pre-seed with 10–20 hand-curated accepted workflows before the demo |
| **`ivfflat lists=100` is tuned for 10k+ rows** | At <100 rows retrieval quality is poor | Switch to `hnsw` index for demo scale, or skip the index entirely and rely on sequential scan |
| AuthModule deferred | Single-tenant demo only | Enable JWT + bcrypt flow (Phase 2) |
| Interactive evaluator can loop indefinitely | User could keep receiving questions | Cap at 5 clarifying turns, then force a generation attempt |
| Elsa Studio WASM preview/edit mode | Read-only preview relies on a `postMessage` contract that must be confirmed against the WASM build | Verify early; if not supported, render the draft in a lightweight custom viewer before Accept |

### Planned Improvements Post-Hackathon

1. **Cross-version diffing in the UI.** Side-by-side Elsa JSON diff between any two versions in the timeline.
2. **Streaming directly from NATS to browser** via a NATS WebSocket proxy, removing NestJS from the token hot path.
3. **Hybrid retrieval** — combine BM25 keyword search with vector similarity for queries where semantic similarity alone misses the intent.
4. **Scoped RAG** — restrict retrieval to a per-user or per-tenant subset once multi-tenancy is introduced.
5. **Generation cost metrics** — track tokens, latency, retrieval hit count per version for observability.

---

*Generated for the AI Workflow Generation Platform Hackathon — 2025*
