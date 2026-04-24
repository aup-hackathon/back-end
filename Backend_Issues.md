# 🟦 BACKEND ISSUES (NestJS)

---

## BE-01 — Database Schema, Migrations & pgvector Setup
**State:** `CLOSED`
**Labels:** `backend` `priority:critical` `scope:infra`

**Description:**
Bootstrap the full PostgreSQL schema using TypeORM migrations. Install and enable the `pgvector` extension. Create all core tables from §8.1, §8.3, §8.6, §8.7 of the spec. This is a prerequisite for every other backend issue.

**Tasks:**
- Enable `pgvector` extension on the Postgres instance (`CREATE EXTENSION IF NOT EXISTS vector`)
- Write TypeORM migration for §8.1 tables: `Organization`, `User`, `LoginHistory`, `RefreshToken`, `Workflow`, `WorkflowVersion`, `Session`, `Message`, `Document`, `Comment`, `AuditLog`, `KGNode`, `KGEdge`, `ProcessPattern`
- Write TypeORM migration for §8.3 tables: `AgentDefinition`, `PipelineExecution`, `AgentExecution`, `AgentLog`, `AgentConfigOverride`
- Write TypeORM migration for §8.6 tables: `WorkflowGraphSnapshot`, `DivergenceReport`, `DivergencePoint`, `ReconciliationAction`
- Write TypeORM migration for §8.7 tables: `Rule`, **`RuleVersion`**, `Skill`, `RuleApplication`, `SkillApplication`
- Create all indexes listed in §8.2, §8.5, §8.6, §8.8 including IVFFlat indexes for vector columns
- Seed script: insert default `AgentDefinition` rows for all **10** agent types with their default configs from §F9
- Seed script: insert the **6 starter `ProcessPattern` archetypes** (Approval, Escalation, Parallel Review, Notification, Periodic Execution, Onboarding) per AI-F4 — `template_json` as minimal skeletons, `embedding` left NULL (filled by FastAPI on first RAG boot)

**Security Rules:**
- DB user used by NestJS must have no `DROP TABLE` or `ALTER TABLE` privileges — only DML
- All credentials must come from environment variables, never hardcoded
- `AuditLog` table must reject UPDATE and DELETE at the DB level (trigger or role-level revoke)

**Acceptance Criteria:**
- `npm run migration:run` completes without errors on a fresh Postgres 16 instance
- All vector columns (KGNode.embedding, ProcessPattern.embedding, Skill.embedding, WorkflowGraphSnapshot.graph_embedding) accept `vector(768)` typed data
- IVFFlat indexes are created and can be queried with `<=>` operator
- Seed script populates all 10 `AgentDefinition` records with correct default configs
- Seed script populates 6 `ProcessPattern` records
- Attempt to `UPDATE` or `DELETE` an `AuditLog` row raises a DB error

**Testing Requirements:**
- Run migration on a clean DB and verify all tables exist with correct column types
- Verify the IVFFlat index with a sample cosine similarity query against `KGNode`
- Round-trip test: insert a 768-dim vector into each pgvector column and read it back

**Dependencies:** None — this is the foundation

---

## v2.2 Alignment Amendments

These items MUST be included (they were missing from the original scope):

### Additional enum types (§8.6 + §8.7)

All of these are new v2.2 enums — define as PostgreSQL types in the first migration:

- `graph_type_enum` → `'INTENT','GENERATED','EXECUTED','RECONCILED'`
- `graph_source_enum` → `'AI_EXTRACTION','AI_GENERATION','ELSA_IMPORT','MANUAL_MERGE'`
- `comparison_type_enum` → `'INTENT_VS_GENERATED','GENERATED_VS_EXECUTED','INTENT_VS_EXECUTED'`
- `divergence_severity_enum` → `'NONE','LOW','MEDIUM','HIGH','CRITICAL'`
- `divergence_report_status_enum` → `'PENDING','RUNNING','COMPLETED','FAILED'`
- `divergence_point_type_enum` → 11 values (§8.6.3)
- `point_severity_enum` → `'INFO','LOW','MEDIUM','HIGH','CRITICAL'`
- `reconciliation_action_type_enum` → `'ACCEPT_A','ACCEPT_B','AI_SUGGEST_APPLY','MANUAL_EDIT','SKIP'`
- `rule_type_enum` → 6 values (§8.7.1)
- `rule_scope_enum` → `'ORG','WORKFLOW','AGENT'`
- `skill_type_enum` → 6 values (§8.7.2)

### Extended `agent_type_enum`

The spec §8.3.1 lists 8 values but §7.1 adds two new pipeline agents (v2.2). The enum MUST include:

```
'ORCHESTRATOR','INTAKE','EXTRACTION','PATTERN','GAP_DETECTION','QA',
'VALIDATION','EXPORT','DIVERGENCE','RULES_SKILLS_LOADER'
```

Seed 10 `AgentDefinition` rows accordingly:
- `DIVERGENCE` default_config: `{"similarity_threshold":0.85,"path_depth_limit":12,"reconciliation_llm":true}`
- `RULES_SKILLS_LOADER` default_config: `{"top_k_skills":3,"mandatory_actor_catalog":true}`

### `RuleVersion` table

§8.7.1 defines a `RuleVersion` table for immutable rule-update history (FR-13.12). Original issue body listed `RuleApplication` twice and dropped `RuleVersion` — fix this: include `RuleVersion (id, rule_id fk, version, instruction, condition, changed_by fk User, created_at)`.

### `current_version` integrity

When a migration creates `Workflow` and `WorkflowVersion`, add a DB trigger OR application-level guarantee that `Workflow.current_version` is never ahead of the max `WorkflowVersion.version_number` for that workflow.

### Seed `ProcessPattern` library

See Tasks list addition above — 6 archetypes per AI-F4, already part of §8.1.

---

## BE-02 — AuthModule: Registration, Login & JWT Issuance
**State:** `OPEN`
**Labels:** `backend` `priority:critical` `scope:auth`

**Description:**
Implement the core authentication flow: user registration with email verification, login with JWT access token and HTTP-only refresh token cookie, and the `/auth/me` endpoint. Implements FR-1.1, FR-1.2, FR-1.9.

**Tasks:**
- `POST /auth/register` — hash password with bcrypt (cost factor ≥ 12), create `User` (unverified), generate a time-limited email verification token, and send a verification email via Nodemailer
- `POST /auth/verify-email` — validate the token, set `is_verified = true`
- `POST /auth/login` — validate credentials, check account lockout (`locked_until`), issue 15-min JWT access token + 7-day refresh token; set refresh token in HTTP-only `Secure` cookie; record `LoginHistory` entry
- `GET /auth/me` — return the authenticated user's profile (requires valid JWT)
- Implement `JwtAuthGuard` and `RolesGuard` as global guards in `AppModule`
- Implement `JwtStrategy` using `passport-jwt` with access token verification

**Security Rules:**
- Passwords stored only as bcrypt hashes — never plain text or reversible
- Access token payload contains only: `sub` (user_id), `role`, `org_id` — no sensitive data
- Refresh token stored as a SHA-256 hash in the `RefreshToken` table — raw value only sent via cookie
- HTTP-only, Secure, SameSite=Strict cookie attributes required on the refresh token cookie
- Rate limit: `POST /auth/login` → 5 requests/minute per IP via `@nestjs/throttler`

**Acceptance Criteria:**
- User can register, receive a verification email, verify, and log in successfully
- Unverified users receive a `403 Forbidden` on login
- Access token expires after 15 minutes and is rejected after expiry
- `LoginHistory` row is created for every login attempt (success and failure)

**Testing Requirements:**
- Unit tests for `AuthService`: register, login (success, wrong password, unverified, locked)
- e2e test: full registration → verify → login flow
- Assert HTTP-only cookie is set on successful login response

**Dependencies:** BE-01

---

## BE-03 — AuthModule: Refresh Token Rotation, Logout & Account Lockout
**State:** `OPEN`
**Labels:** `backend` `priority:critical` `scope:auth`

**Description:**
Implement token rotation (FR-1.3), secure logout (invalidate refresh token), and account lockout after 5 failed attempts (FR-1.8). Extends BE-02.

**Tasks:**
- `POST /auth/refresh` — read refresh token from HTTP-only cookie, verify against `RefreshToken` table (hash comparison), issue new access token and a new refresh token (rotation), invalidate the old refresh token in DB (set `revoked = true`), return new cookie
- `POST /auth/logout` — mark the current refresh token as `revoked = true`; clear the cookie
- Implement lockout logic in login flow: on 5 consecutive failures, set `User.locked_until = NOW() + 15 minutes`; reject login with `423 Locked` until cooldown expires
- Reset the failure counter on successful login

**Security Rules:**
- If a revoked refresh token is presented (token reuse detected), immediately revoke ALL refresh tokens for that user and log a security event to `AuditLog`
- Refresh token rotation must be atomic — issue new token and revoke old in a single DB transaction

**Acceptance Criteria:**
- `/auth/refresh` issues a new pair of tokens and the old refresh token is rejected on second use
- After 5 failed login attempts, account is locked for exactly 15 minutes
- Logout invalidates the session immediately — the old refresh token is rejected
- Token reuse triggers revocation of all sessions and an audit log entry

**Testing Requirements:**
- Unit test: refresh token rotation (happy path, revoked token, reuse attack)
- Unit test: lockout counter increments and resets correctly
- e2e test: logout → verify old refresh token is rejected

**Dependencies:** BE-02

---

## BE-04 — AuthModule: Password Reset & Login History
**State:** `OPEN`
**Labels:** `backend` `priority:high` `scope:auth`

**Description:**
Implement password reset via email (FR-1.6) and expose the login history endpoint (FR-1.7).

**Tasks:**
- `POST /auth/forgot-password` — generate a single-use, time-limited (15 min) reset token, store its hash in the DB, and send an email with the reset link
- `POST /auth/reset-password` — validate the token (not expired, not already used), update `password_hash`, invalidate the reset token and all existing refresh tokens for that user
- `GET /auth/login-history` — return paginated `LoginHistory` records for the authenticated user (last 50 entries, ordered by `created_at DESC`)

**Security Rules:**
- Reset token must be cryptographically random (use `crypto.randomBytes(32)`) — never sequential or guessable
- After password reset, all active sessions must be invalidated (revoke all `RefreshToken` rows for that user)
- Endpoint `POST /auth/forgot-password` always returns `200 OK` even if the email doesn't exist (prevents user enumeration)

**Acceptance Criteria:**
- Password reset email is received within 5 seconds of the request
- Reset token cannot be used more than once
- Reset token expires after 15 minutes
- All sessions are invalidated after a successful password reset

**Testing Requirements:**
- Unit test: token generation, validation, expiry, and single-use enforcement
- Unit test: all sessions revoked after reset
- Test: endpoint returns 200 for non-existent emails (no enumeration)

**Dependencies:** BE-02

---

## BE-05 — OrganizationModule: User Invites & Role Management
**State:** `OPEN`
**Labels:** `backend` `priority:high` `scope:auth`

**Description:**
Allow admins to invite users, assign roles, and revoke access. Implements FR-1.10.

**Tasks:**
- `POST /org/invite` — generate an invite token, send email to the invitee, create a pending `User` record scoped to the calling user's `org_id`
- `PATCH /org/users/:id/role` — update a user's `role` within the organization; admin only; emit `AuditLog` entry
- `DELETE /org/users/:id` — revoke access (soft delete or `is_active = false`), revoke all refresh tokens
- Implement `OrgMemberGuard` to ensure a user can only manage members of their own `org_id`
- All queries on `User` and all other org-scoped tables must include `WHERE org_id = :calling_user_org_id`

**Security Rules:**
- Only `Admin` role can call any endpoint in this module
- Org isolation: an admin can only manage users within their own organization
- Role downgrade of the last admin in an org is forbidden

**Acceptance Criteria:**
- An admin can invite a new user who does not yet have an account
- Role changes are reflected immediately and emit an audit log entry
- Deleting a user invalidates all their active sessions
- A non-admin user receives `403 Forbidden` on all org management endpoints

**Testing Requirements:**
- Unit test: org isolation guard rejects cross-org access
- Unit test: last-admin protection
- e2e test: invite → accept → assign role → revoke

**Dependencies:** BE-02

---

## BE-06 — DocumentModule: Upload, Storage & Validation
**State:** `OPEN`
**Labels:** `backend` `priority:high` `scope:documents`

**Description:**
Handle file uploads to MinIO. Validates MIME type and file size. Creates `Document` records in PostgreSQL. Implements FR-2.1, FR-2.6, FR-2.7, FR-2.9.

**Tasks:**
- `POST /documents/upload` — accept `multipart/form-data`, validate MIME type against an allowlist, validate file size (max 50 MB per file), upload to MinIO using `minio` Node.js SDK, create `Document` record (filename, file_type, storage_url, doc_version = 1)
- Implement session-level size check: reject if total documents for a session would exceed 200 MB
- `GET /documents/:id` — return document metadata; verify requester belongs to same org
- `DELETE /documents/:id` — soft delete; do not remove from MinIO (preserve for audit)
- `GET /workflows/:workflowId/documents` — list all documents linked to a workflow
- Document versioning: if re-uploading a document with the same name for the same session, increment `doc_version` and create a new `Document` record without touching the old one

**Security Rules:**
- MIME type must be validated both by file extension and by file magic bytes (use `file-type` npm package) — extension-only validation is not sufficient
- Allowed MIME types: `text/plain`, `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `image/png`, `image/jpeg`, `image/webp`, `audio/mpeg`, `audio/wav`, `audio/x-m4a`, `text/markdown`
- MinIO bucket must have server-side encryption enabled
- `GET` on a document must verify `org_id` ownership before returning a presigned URL

**Acceptance Criteria:**
- Files of allowed types up to 50 MB upload successfully and a presigned URL is returned
- Files exceeding 50 MB return `413 Payload Too Large`
- Disallowed file types return `415 Unsupported Media Type`
- Session total size limit is enforced

**Testing Requirements:**
- Unit test: MIME validation (valid types, spoofed extension with wrong magic bytes)
- Unit test: size limit enforcement (file-level and session-level)
- Integration test: upload to MinIO and verify the URL is accessible

**Dependencies:** BE-01

---

## BE-07 — DocumentModule: Text Extraction & Reprocessing
**State:** `OPEN`
**Labels:** `backend` `priority:high` `scope:documents`

**Description:**
After upload, trigger asynchronous preprocessing to extract text from the document. Store extracted text in PostgreSQL. Allow users to view and correct the text before AI processing. Implements FR-2.2, FR-2.3, FR-2.4, FR-2.10.

**Tasks:**
- After upload, publish a NATS message `document.preprocess` with `{ document_id, file_type, storage_url }`
- FastAPI preprocessing service handles OCR (Tesseract), PDF extraction, Whisper STT — it publishes the result back to `document.preprocess.result`
- NestJS subscriber: on `document.preprocess.result`, update `Document.extracted_text` and `preprocessing_confidence`
- `GET /documents/:id/extracted-text` — return the current extracted text
- `PATCH /documents/:id/extracted-text` — allow user to edit the extracted text (stores corrected version); emit `AuditLog` entry
- `POST /documents/:id/reprocess` — re-trigger preprocessing on an existing document; increments `doc_version`
- Push a WebSocket event to the session room when preprocessing completes: `{ type: 'document.ready', document_id }`

**Security Rules:**
- Extracted text is stored only in PostgreSQL (not re-uploaded to MinIO)
- The NATS `document.preprocess` subject is internal — not exposed as an HTTP endpoint
- User edits to extracted text are always `AuditLog`-ed with `before_state` and `after_state`

**Acceptance Criteria:**
- Uploading a PDF triggers preprocessing; extracted text is available via GET within 30 seconds
- User can edit extracted text; the corrected version is used by the AI pipeline
- Reprocessing creates a new document version and does not overwrite the original

**Testing Requirements:**
- Integration test: upload a test PDF and verify `extracted_text` is populated
- Unit test: NATS subscriber correctly updates the `Document` record on result receipt

**Dependencies:** BE-06, NATS JetStream configured

---

## BE-08 — MessageModule: CRUD, Pagination & Search
**State:** `OPEN`
**Labels:** `backend` `priority:high` `scope:messages`

**Description:**
Persist and retrieve all session messages. Implements FR-3.1 through FR-3.10.

**Tasks:**
- `POST /sessions/:id/messages` — create a new message; validate `type` against the enum from §F3; enforce that `session_id` belongs to the caller's org
- `GET /sessions/:id/messages` — return messages ordered by `created_at ASC`; implement cursor-based pagination (accept `cursor` query param, return `next_cursor` in response); default page size: 50
- `GET /sessions/:id/messages?type=ai_question` — filter by message type
- `GET /sessions/:id/messages?search=keyword` — full-text search using `tsvector` / `plainto_tsquery` on the `content` column
- `GET /messages/:id` — fetch a single message by ID
- `GET /sessions/:id/messages/export` — generate a readable PDF transcript of the session (use `pdfkit`)
- Messages are immutable: no `PATCH` or `DELETE` endpoints

**Security Rules:**
- All session-scoped queries must include `org_id` check via join through `Session → Workflow → Organization`
- Cursor tokens must be opaque (base64-encoded timestamp + ID) to prevent parameter tampering

**Acceptance Criteria:**
- Messages are returned in correct chronological order
- Cursor-based pagination correctly returns the next page without skipping or duplicating records
- Filter by type returns only messages of that type
- Full-text search returns relevant messages
- Export generates a valid, readable PDF

**Testing Requirements:**
- Unit test: cursor pagination edge cases (first page, last page, empty result)
- Unit test: type filtering and full-text search
- Integration test: PDF export contains all messages in order

**Dependencies:** BE-01, BE-09 (session must exist first)

---

## BE-09 — SessionModule: Lifecycle & FSM
**State:** `OPEN`
**Labels:** `backend` `priority:critical` `scope:chat`

**Description:**
Manage the elicitation session lifecycle from creation to finalization. Implements the FSM from §F4 and all FR-4.x endpoints.

**Tasks:**
- `POST /sessions` — create a new `Session` linked to a `workflow_id`; set `status = CREATED`, `mode` from request body (`auto` | `interactive`)
- `GET /sessions/:id` — return session details including current `status`, `confidence_score`, `mode`
- `PATCH /sessions/:id/mode` — switch mode; emit `AuditLog` entry for the mode change
- `POST /sessions/:id/finalize` — transition session to `DRAFT_READY`; validate that a workflow exists; emit `session.events.finalized` on NATS
- `GET /sessions/:id/workflow-state` — return the current `elements_json` from the latest `WorkflowVersion` linked to this session
- `GET /sessions/:id/progress` — return `{ current_agent, progress_pct, overall_confidence }` from the latest `PipelineExecution`
- `DELETE /sessions/:id` — archive the session (soft delete); only the owner can do this
- Enforce the session FSM: only valid transitions are permitted (e.g., a `VALIDATED` session cannot go back to `AWAITING_INPUT` without explicit revision)

**Security Rules:**
- Only the session owner (or an Admin) can call `finalize`, `mode switch`, and `delete`
- All session queries must be scoped by `org_id`

**Acceptance Criteria:**
- Session FSM enforces valid transitions; invalid transitions return `422 Unprocessable Entity`
- Mode switch emits an `AuditLog` entry
- Finalizing a session triggers the NATS `session.events.finalized` message

**Testing Requirements:**
- Unit test: FSM transition table (all valid and invalid transitions)
- Unit test: org isolation guard on session endpoints

**Dependencies:** BE-01, BE-05

---

## v2.2 Alignment Amendments

### Session FSM — full authoritative transition table

`session_status` enum values (add to BE-01 if missing): `CREATED, AWAITING_INPUT, PROCESSING, IN_ELICITATION, DRAFT_READY, NEEDS_RECONCILIATION, IN_REVIEW, VALIDATED, EXPORTED, ARCHIVED, ERROR`.

Per §F4 + v2.2 (§AI-F12 adds `NEEDS_RECONCILIATION`):

| From | Event | To |
|---|---|---|
| `CREATED` | first user message received | `AWAITING_INPUT` |
| `AWAITING_INPUT` | `ai.tasks.new` published | `PROCESSING` |
| `PROCESSING` (auto mode) | `ai.tasks.result` received | `DRAFT_READY` |
| `PROCESSING` (interactive mode) | `ai.tasks.question` or `ai.tasks.result` w/ questions[] | `IN_ELICITATION` |
| `IN_ELICITATION` | user posts answer | `PROCESSING` |
| `DRAFT_READY` | divergence I-vs-G similarity < 0.70 | `NEEDS_RECONCILIATION` |
| `NEEDS_RECONCILIATION` | all CRITICAL divergence points resolved | `DRAFT_READY` |
| `DRAFT_READY` | user enters review | `IN_REVIEW` |
| `IN_REVIEW` | process owner validates | `VALIDATED` |
| `VALIDATED` | export triggered and completed | `EXPORTED` |
| any except terminal | user finalizes manually | `DRAFT_READY` |
| any | unrecoverable pipeline error | `ERROR` |
| any | user deletes | `ARCHIVED` |

Blocked transitions:
- Cannot `VALIDATE` a session while in `NEEDS_RECONCILIATION`
- Cannot export while `NEEDS_RECONCILIATION` (enforced cross-module: BE-12 checks this)

### Additional acceptance criteria

- Setting `status=NEEDS_RECONCILIATION` MUST be emitted as a WebSocket event `session.needs_reconciliation` to the `session:{id}` room (BE-17).
- `DELETE /sessions/:id` MUST cascade-archive its `Message`, `Document`-link, and `PipelineExecution` rows without hard delete.

### Additional endpoint

- `PATCH /sessions/:id/status` (admin only) — manual status override, AuditLog-ed with reason. Escape hatch for edge cases. Returns `409` if the target status violates FSM unless `force=true`.

### Testing additions

- Test: a session in `NEEDS_RECONCILIATION` rejects `VALIDATE` transition with 422 until the Divergence module (BE-18) signals all CRITICAL points resolved.
- Test: `session.needs_reconciliation` WS event emitted when the subscriber flips the status.

---

## BE-10 — AIGatewayModule: NATS Publisher & Result Subscriber
**State:** `OPEN`
**Labels:** `backend` `priority:critical` `scope:ai`

**Description:**
Bridge between the NestJS backend and the FastAPI AI service via NATS JetStream. Publishes tasks to `ai.tasks.new` and processes results from `ai.tasks.result`. Implements the communication layer described in §4.3 and §7.2.

**Tasks:**
- Set up NATS JetStream connection in NestJS using `@nestjs-plugins/nestjs-nats-jetstream-transporter` or native `nats.js`
- Configure durable streams for subjects: `ai.tasks.*`, `workflow.events.*`, `session.events.*`, `system.health.*`
- Implement `publishAiTask(payload)` service method: publish to `ai.tasks.new` with `{ session_id, task_type, input, mode, org_id }`, save `nats_message_id` to the `PipelineExecution` record
- Implement `@EventPattern('ai.tasks.result')` subscriber: parse result, update `WorkflowVersion` with new `elements_json`, update `Session.confidence_score`, publish `workflow.events.updated`, push WebSocket event to session room
- Implement `@EventPattern('ai.tasks.progress')` subscriber: forward agent progress events to WebSocket gateway room
- Handle NATS delivery failures: on retry exhaustion, mark `PipelineExecution.status = FAILED` and emit a WebSocket notification to the user

**Security Rules:**
- NATS credentials must be loaded from environment variables
- The `org_id` field in every NATS payload must be validated against the session on receipt — never trust payload org_id blindly

**Acceptance Criteria:**
- Publishing an `ai.tasks.new` message creates a `PipelineExecution` record with `status = PENDING`
- Receiving `ai.tasks.result` updates the workflow and session correctly
- If the AI service is down, the NATS durable subscription retains the message for when it recovers
- Agent progress events appear on the WebSocket within 1 second of being published

**Testing Requirements:**
- Integration test: publish a mock `ai.tasks.result` and verify DB is updated + WebSocket event is emitted
- Unit test: NATS failure handler sets `PipelineExecution.status = FAILED`

**Dependencies:** BE-01, BE-09, NATS running

---

## v2.2 Alignment Amendments

### Full subject catalog — FROZEN after this issue ships

The publisher/subscriber wiring in this module is the **authoritative contract** between NestJS and FastAPI. Export the subjects list as a TypeScript const (e.g. `src/nats/contracts/subjects.ts`) that FastAPI mirrors as Pydantic.

**Publisher (NestJS → FastAPI):**
| Subject | Payload |
|---|---|
| `ai.tasks.new` | `{ correlation_id, session_id, org_id, task_type, mode, input, pipeline_execution_id, resume_from_checkpoint? }` |
| `ai.tasks.divergence` | `{ correlation_id, report_id, graph_a_id, graph_b_id, comparison_type, session_id }` (dispatched by BE-18; wiring lives here) |
| `ai.context.load` | `{ correlation_id, session_id, org_id, active_rules[], skill_ids[] }` — **new v2.2**, must fire BEFORE each pipeline run |
| `workflow.events.updated` | `{ workflow_id, version_number, changed_elements[], source, actor_id?, correlation_id }` |
| `session.events.finalized` | `{ session_id, workflow_id, final_version_number, final_confidence, finalized_at }` |

**Subscriber (FastAPI → NestJS):**
| Subject | Durable consumer name | Handler target |
|---|---|---|
| `ai.tasks.result` | `nestjs-ai-result` | this module |
| `ai.tasks.progress` | `nestjs-ai-progress` | BE-24 AI Pipeline Events Consumer + BE-17 WS fanout |
| `ai.tasks.divergence.result` | `nestjs-divergence-result` | BE-18 |
| `system.health.ping` | `nestjs-health-ping` | BE-15 |

### Correlation ID + idempotency key — mandatory

Every published message carries `correlation_id` (UUID v4 generated when the originating HTTP request is received, or propagated from `X-Correlation-Id`). The JetStream `msgId` MUST be `${correlation_id}:${subject}:${pipeline_execution_id ?? ''}` to make redelivery safely idempotent. Every subscriber handler MUST be idempotent on this composite key.

### DLQ policy

- `ack_wait: 30s`, `max_deliver: 3`, `deliver_policy: new`.
- After 3 failed deliveries, publish to `dead.flowforge.<original-subject>` with `{ reason, originalSubject, payload, deliveryCount, lastError }` AND insert into a `dead_letter` table for admin replay (schema: `id, subject, payload jsonb, reason, delivery_count, last_error, created_at`).
- Add this table to BE-01's migration scope (coordinate).

### Auto-trigger Intent-vs-Generated divergence on `ai.tasks.result`

Per FR-12.1 — every successful `ai.tasks.result` MUST automatically kick off an I-vs-G divergence:
1. Snapshot the INTENT graph (from extracted KG nodes/edges — if not already persisted by BE-23, build it here)
2. Snapshot the GENERATED graph from the new `WorkflowVersion.elements_json`
3. Publish `ai.tasks.divergence` with `comparison_type='INTENT_VS_GENERATED'`

If the returned `similarity_score < threshold` (default 0.70, overridable per-org — BE-18), PATCH the session to `NEEDS_RECONCILIATION` via BE-09.

### Cross-cutting: publish `workflow.events.updated` on every mutation path

All callers that modify `WorkflowVersion.elements_json` go through `AiGatewayModule.markWorkflowUpdated(workflowId, versionNumber, changedElements, source)`. Sources: `'ai'`, `'user'`, `'comment_injection'`, `'reconciliation'`.

### Testing additions

- Contract test: publish each DTO via the public NATS client and assert a Pydantic schema mirror (held in `ai-service/contracts/`) accepts it.
- Idempotency test: deliver the same message twice; only ONE `PipelineExecution` row exists.
- DLQ test: throw in the handler 3 times; the message lands in `dead.flowforge.*` and `dead_letter` row is inserted.

---

## BE-11 — WorkflowModule: CRUD, Versioning & Search
**State:** `OPEN`
**Labels:** `backend` `priority:critical` `scope:workflow`

**Description:**
Core workflow management: create, read, update, delete, version control, and semantic search. Implements FR-5.1, FR-5.2, FR-5.8 through FR-5.12.

**Tasks:**
- `POST /workflows` — create a new `Workflow` (status: `DRAFT`), scoped to `org_id`
- `GET /workflows` — list workflows for the org; support filters: `status`, `domain`, `tags`; support full-text search and semantic search (pgvector on `elements_json` embedding, if available)
- `GET /workflows/:id` — return workflow with latest version details and current `confidence_score`
- `PATCH /workflows/:id` — update title, description, tags, domain; emit `AuditLog` entry
- `DELETE /workflows/:id` — transition to `ARCHIVED`; only the owner or Admin can archive
- `GET /workflows/:id/versions` — list all versions ordered by `version_number DESC`
- `GET /workflows/:id/versions/:versionNumber` — return a specific version's `elements_json`
- `GET /workflows/:id/diff/:v1/:v2` — compute a diff between two versions: identify added, removed, and modified elements in `elements_json` (compare by element `id` field)
- `POST /workflows/:id/duplicate` — create a new `Workflow` with the same `elements_json` as the current version; new title = "Copy of [original title]"
- `GET /workflows/:id/diagram-data` — return the `elements_json` in a format ready for React Flow rendering (nodes and edges arrays)

**Security Rules:**
- All workflow queries must include `WHERE org_id = :caller_org_id`
- `PATCH` and `DELETE` require `owner_id = :caller_id` OR role = `Admin`
- Diff endpoint must validate both version numbers belong to the same workflow

**Acceptance Criteria:**
- Creating a workflow returns a `201` with the new workflow and an initial version (`version_number = 1`)
- Every `PATCH` that modifies `elements_json` creates a new immutable `WorkflowVersion` record
- Diff endpoint correctly identifies added/removed/modified elements between two versions
- Semantic search returns workflows ranked by cosine similarity

**Testing Requirements:**
- Unit test: version auto-increment on every significant update
- Unit test: diff algorithm (added/removed/modified elements)
- Integration test: org isolation — user from org A cannot access org B's workflows

**Dependencies:** BE-01, BE-05

---

## v2.2 Alignment Amendments

### `current_version` auto-update contract

Every successful `WorkflowVersion` insert is wrapped in a DB transaction that:
1. Acquires row lock on `Workflow.id`.
2. Inserts the version row with `version_number = Workflow.current_version + 1`.
3. Updates `Workflow.current_version = version_number`.
4. Updates `Workflow.updated_at = NOW()`.
5. Publishes `workflow.events.updated` via BE-10 with `source` = `'ai' | 'user' | 'reconciliation'` depending on caller.

A conflict on the `UNIQUE (workflow_id, version_number)` constraint MUST retry once before returning 500.

### Semantic search — embedding generation flow

`Workflow` rows don't currently have an embedding column in §8.1. Two options (decide in this issue):
- **Option A (recommended):** Add `Workflow.description_embedding vector(768)` nullable column in BE-01. Generate/refresh via FastAPI embed endpoint when `title` or `description` changes. Search via `description_embedding <=> :query_embedding` cosine distance.
- **Option B:** Cross-join `WorkflowVersion.elements_json`'s task/actor labels into a virtual embedding at query time (heavier, avoid).

Go with Option A. Coordinate the column addition back into BE-01 via a follow-up migration.

### Additional endpoints (from spec §F5)

- `GET /workflows/:id/decision-log` — delegate to BE-14 (AuditModule) service; this controller exposes the proxy route under the workflow namespace.

### Missing cross-references

- Exports (`/export/elsa|bpmn|pdf`) live in BE-12 — link from this module's controller.
- Divergence (`/divergence`, `/divergence-reports`, `/import-elsa`) lives in BE-18.
- **BE-12 MUST block export when `Session.status = 'NEEDS_RECONCILIATION'`** (FR-12.2).

### Additional security

- Tag/domain filters MUST be bound parameters — no string interpolation (SQL injection guard).
- Semantic-search similarity threshold should default to `0.3` cosine (cutoff low-quality matches) and be overridable via `?min_similarity=...`.

### Testing additions

- Test: two concurrent PATCH requests on the same workflow → both succeed with different `version_number` values; no lost writes.
- Test: semantic search returns empty when no workflow has an embedding yet (cold-start tolerance).

---

## BE-12 — WorkflowModule: Export Endpoints (Elsa, BPMN, PDF)
**State:** `OPEN`
**Labels:** `backend` `priority:medium` `scope:workflow`

**Description:**
Generate exportable formats from the validated workflow. Implements FR-5.5, FR-5.6, FR-5.7.

**Tasks:**
- `POST /workflows/:id/export/elsa` — convert `elements_json` to Elsa Workflows 3.x JSON using the element mapping table from §AI-F10; return as a downloadable `.json` file; emit `AuditLog` entry with `event_type = EXPORTED`
- `POST /workflows/:id/export/bpmn` — convert `elements_json` to BPMN 2.0 XML using `bpmn-moddle` or equivalent; return `.bpmn` file
- `POST /workflows/:id/export/pdf` — generate a PDF combining: the plain-language summary (from the latest `ai_summary` message), the diagram screenshot (placeholder URL for now), and the decision log; use `pdfkit`
- Transition workflow `status` to `EXPORTED` on successful Elsa export
- All exports require the workflow to be in `VALIDATED` status

**Security Rules:**
- Exports are only accessible to the workflow owner, Business Analyst, or Admin
- Workflow must be in `VALIDATED` status to export to Elsa; return `409 Conflict` otherwise
- Each export action creates an immutable `AuditLog` entry

**Acceptance Criteria:**
- Elsa export produces a valid JSON that passes Elsa's schema validation
- BPMN export is a well-formed XML document
- PDF export contains at least the plain-language summary and the decision log
- Exporting a non-validated workflow returns `409 Conflict`

**Testing Requirements:**
- Unit test: Elsa mapping — each FlowForge element type maps to the correct Elsa activity type
- Unit test: export blocked when status ≠ `VALIDATED`
- Integration test: generate and parse the Elsa JSON and BPMN XML

**Dependencies:** BE-11

---

## v2.2 Alignment Amendments

### Block export when session has unresolved CRITICAL divergences (FR-12.2)

Before any export:
1. Resolve the most recent `Session` linked to this workflow.
2. If the session's `status = 'NEEDS_RECONCILIATION'` OR any `DivergencePoint` with `severity = 'CRITICAL'` AND `resolved = false` exists for the latest `DivergenceReport`, return **`409 Conflict`** with body `{ code: 'RECONCILIATION_REQUIRED', unresolved_critical_points: N }`.

### Delegate heavy exports to FastAPI via NATS (recommended)

BPMN XML generation and PDF generation are CPU-heavy and live better in FastAPI. Change the implementation to:
1. Endpoint creates a `PipelineExecution` row with `task_type='EXPORT_ONLY'` and `input_payload={ format, workflow_id, version_id }`.
2. Publish `ai.tasks.new { task_type:'EXPORT_ONLY', format, workflow_id, version_id, correlation_id }` via BE-10.
3. Return `202 Accepted` with `{ pipelineExecutionId, statusUrl: '/pipeline-executions/:id' }`.
4. FastAPI Export Agent produces the artifact, uploads to MinIO `exports` bucket, publishes `ai.tasks.result` with `output_uri`.
5. Client polls or subscribes to WS to download.

Elsa export JSON can stay synchronous in NestJS since it's a pure JSON transform (no heavy compute).

### Export artifacts stored in MinIO

All exports persisted to MinIO path `exports/{org_id}/{workflow_id}/v{version}-{format}-{timestamp}.{ext}` with presigned download URLs (15-min TTL). Delete artifacts older than 7 days via a cron (out of hackathon scope but noted).

### AuditLog entry shape for exports

```
event_type: 'WORKFLOW_EXPORTED'
actor_type: 'user'
before_state: { status: 'VALIDATED' }
after_state: { status: 'EXPORTED', format, artifact_uri }
```

### Testing additions

- Test: export on a workflow whose latest session is `NEEDS_RECONCILIATION` → 409 with `RECONCILIATION_REQUIRED`.
- Test: BPMN XML validates against bpmn-moddle schema.
- Test: presigned MinIO URL is downloadable for 15 minutes, then expires.

---

## BE-13 — CommentModule: CRUD, Threading & AI Injection
**State:** `OPEN`
**Labels:** `backend` `priority:high` `scope:review`

**Description:**
Enable structured review through comments on workflows and workflow elements. Includes thread replies, resolution, element-level approval, and the comment-to-AI-injection flow. Implements all FR-6.x requirements.

**Tasks:**
- `POST /workflows/:id/comments` — create a comment; body includes `element_id` (nullable), `type` (enum: `question` | `correction` | `approval` | `suggestion` | `escalation`), `content`
- `GET /workflows/:id/comments` — list all comments; support filter by `resolved`, `type`, `element_id`
- `PATCH /comments/:id` — update content (only by comment author; Admin can also edit)
- `DELETE /comments/:id` — soft delete
- `POST /comments/:id/reply` — add a threaded reply (sets `parent_id` on new comment)
- `POST /comments/:id/resolve` — mark as resolved; require a `resolution_note`; record `resolved_at` and `resolved_by`
- `POST /comments/:id/inject-to-ai` — publish to NATS `ai.tasks.new` with `task_type = 'comment_injection'`, `comment_text`, `target_element_id`, `session_id`; record a `system_note` message in the session's message history; emit `AuditLog` entry
- `PATCH /workflows/:id/elements/:elemId/approve` — mark a workflow element as approved by the reviewer; update `elements_json` approval flag; track review completion percentage
- `GET /workflows/:id/review-progress` — return `{ approved_count, total_count, completion_pct }`

**Security Rules:**
- Only `Reviewer`, `Business Analyst`, `Process Owner`, and `Admin` roles can create comments
- AI injection (`inject-to-ai`) is restricted to `Business Analyst`, `Process Owner`, and `Admin`
- All comment queries must be scoped to the caller's org via the workflow

**Acceptance Criteria:**
- Comment with a valid `element_id` is linked to the specific workflow element
- Thread reply correctly sets `parent_id` and appears nested in the list
- Resolving a comment requires a non-empty `resolution_note`
- `inject-to-ai` publishes the NATS message and records a `system_note` message in session history
- Review progress calculation is correct

**Testing Requirements:**
- Unit test: review progress calculation (0%, 50%, 100%)
- Unit test: inject-to-ai publishes correct NATS payload
- Integration test: comment create → reply → resolve flow

**Dependencies:** BE-11, BE-10

---

## v2.2 Alignment Amendments

### Missing endpoints from §F6

Add the following three features that were skipped:

#### FR-6.5 — Assign a comment to a specific user for resolution

- Migration: add `Comment.assigned_to uuid nullable references "user"(id)` + index `(assigned_to, resolved)`.
- `PATCH /comments/:id/assign` — body `{ assignee_id }`; author, admin, or process owner can assign; AuditLog on change.
- `GET /comments/assigned-to-me?resolved=false` — list comments assigned to the caller.

#### FR-6.9 — Email notification to assigned reviewers

- When a workflow transitions to `PENDING_REVIEW` (status change in BE-11), look up all comments with `assigned_to` in that workflow + each reviewer already on the workflow and trigger an email.
- For hackathon scope, emails are logged to stdout with `[email-dev] reviewer-notification-to: {email} body: ...`. A real SMTP implementation is out of scope.
- WebSocket fallback: also emit `notification.review_request` to the `user:{id}` room via BE-17.

#### FR-6.10 — Bulk approve

- `POST /workflows/:id/elements/approve-all` — body `{ element_ids?: string[] }`; if omitted, approves ALL unapproved elements. Admin or Process Owner only. Single AuditLog entry with list of element_ids approved.

### Comment-injection task_type

The current body uses `task_type = 'comment_injection'` but BE-10 / §8.3.2 defines the enum as `FULL_PIPELINE | SCOPED_REPROCESS | EXPORT_ONLY | QA_ROUND`. Change to `task_type = 'SCOPED_REPROCESS'` with `scoped_target: { comment_id, element_id }` in the NATS payload.

### Comment-resolution auto-linking

When `ai.tasks.result` comes back with `source='comment_injection'` in the `workflow.events.updated` payload chain (BE-10 passes `correlation_id` through), mark the original comment as `resolved=true, resolved_by='ai', resolution_note='Applied by AI from comment injection'`. Append an `AuditLog` with `event_type='COMMENT_RESOLVED_BY_AI'`.

### Review progress — ignore archived elements

`GET /workflows/:id/review-progress` must exclude elements marked `archived=true` in `elements_json` from both numerator and denominator.

### Testing additions

- Test: assign → email log observed → WS event received.
- Test: bulk approve on 50 elements generates one AuditLog row (not 50).
- Test: `SCOPED_REPROCESS` NATS payload carries `scoped_target.comment_id`; synthetic AI result resolves the comment.

---

## BE-14 — AuditModule: Immutable Log & Export
**State:** `OPEN`
**Labels:** `backend` `priority:high` `scope:audit`

**Description:**
Expose the immutable audit log for filtering, decision log subsetting, and export. Implements all FR-7.x requirements. Note: `AuditLog` rows are written by all other modules; this module only exposes read and export endpoints.

**Tasks:**
- `GET /workflows/:id/audit-log` — return paginated audit log for a workflow; support filters: `?type=ai_decision`, `?from=ISO_DATE`, `?to=ISO_DATE`, `?actor_id=UUID`
- `GET /workflows/:id/audit-log?type=ai_decision` — filter to AI decision entries only
- `GET /workflows/:id/decision-log` — return a curated subset: only entries where `event_type` is an interpretation or inference choice (e.g., `PATTERN_MATCHED`, `GAP_INFERRED`, `ANSWER_APPLIED`)
- `POST /workflows/:id/audit-log/export` — generate a PDF or CSV (based on `?format=pdf|csv` query param) of the audit log
- Implement `AuditService.log(entry)` — a shared service method used by all other modules to write audit entries; enforce that no update or delete is possible on `AuditLog` rows (use DB-level trigger or ORM hooks)

**Security Rules:**
- `AuditLog` table must have no `UPDATE` or `DELETE` grants for the application DB user — enforced at the PostgreSQL role level
- Only `Admin`, `Process Owner`, and `Business Analyst` can access the audit log
- Export endpoint is rate-limited to 5 requests/minute

**Acceptance Criteria:**
- Audit log entries are never deletable or modifiable — any attempt returns a DB-level error
- Filtering by date range and event type returns correct results
- Decision log contains only AI interpretation events
- Export generates a correct PDF or CSV with all filtered entries

**Testing Requirements:**
- Unit test: `AuditService.log()` creates a correct entry for each event type
- Unit test: attempt to update an audit log entry fails at the service layer
- Integration test: filter by date range and verify paginated results

**Dependencies:** BE-01

---

## BE-15 — HealthModule: System Status Aggregation
**State:** `OPEN`
**Labels:** `backend` `priority:medium` `scope:infra`

**Description:**
Implement the system health aggregation endpoint using `@nestjs/terminus`. Check all system components. Implements all FR-8.x requirements.

**Tasks:**
- Install `@nestjs/terminus` and configure `HealthModule`
- Add health indicators for: PostgreSQL (via `TypeOrmHealthIndicator`), FastAPI AI Service (via `HttpHealthIndicator` to `http://ai-service/health`), MinIO (via `HttpHealthIndicator` to MinIO health endpoint), NATS (custom indicator checking JetStream stream availability), Ollama (via `HttpHealthIndicator` to `http://ollama:11434/api/tags`), Elsa Workflows (via `HttpHealthIndicator`)
- `GET /health` — return aggregated `{ status: 'ok'|'degraded'|'down', components: {...} }`
- `GET /health/details` — return per-component response with `latency_ms` and details
- Cache health check results for 30 seconds (use in-memory cache or Redis) to avoid hammering dependencies
- `GET /health/nats` — return NATS stream stats (proxy from NATS monitoring port 8222)
- Implement a WebSocket event push: when any component becomes `degraded` or `down`, push a `system.health.alert` event to all admin-subscribed WebSocket clients
- Configure Pino request logger on all NestJS routes: log `method`, `path`, `status`, `duration_ms`, `user_id`

**Security Rules:**
- `GET /health/details` and `GET /health/nats` are restricted to `Admin` role
- `GET /health` is public (needed by load balancers / monitoring tools)

**Acceptance Criteria:**
- All 7 components are checked and their statuses are correctly reported
- A simulated PostgreSQL outage shows `down` status in the response
- Health results are cached and do not produce a new DB query on every call within the 30-second window
- Admin receives a WebSocket alert within 5 seconds of a component becoming unhealthy

**Testing Requirements:**
- Unit test: health indicator returns `degraded` when dependency responds slowly (> 500ms)
- Unit test: caching — second call within 30s does not hit the dependency

**Dependencies:** BE-01, BE-10 (WebSocket gateway)

---

## v2.2 Alignment Amendments

### Missing endpoints from §F8

Add these individual-component endpoints listed in the spec but not implemented above:

- `GET /health/ai-service` — proxy check of `http://ai-service:8000/health` returning the raw body + latency.
- `GET /health/ollama` — proxy check of `http://ollama:11434/api/tags` returning the model list + latency.
- `GET /health/pgvector` — runs `SELECT extversion FROM pg_extension WHERE extname='vector'` and returns `{ installed, version, latency_ms }`.

All three are `Admin`-only.

### Component list (authoritative)

The aggregated response MUST cover exactly: `postgres, pgvector, nats (jetstream), minio, ollama, fastapi (ai-service), elsa-server`. NestJS itself is implicitly healthy if the endpoint responds.

Response shape:
```json
{
  "status": "ok" | "degraded" | "down",
  "services": {
    "postgres":   { "status": "ok",       "latency_ms": 3 },
    "pgvector":   { "status": "ok",       "latency_ms": 5, "version": "0.6.0" },
    "nats":       { "status": "ok",       "latency_ms": 2, "jetstream": true },
    "minio":      { "status": "ok",       "latency_ms": 8 },
    "ollama":     { "status": "degraded", "latency_ms": 820, "models_loaded": 1 },
    "fastapi":    { "status": "ok",       "latency_ms": 15 },
    "elsa":       { "status": "down",     "latency_ms": null, "error": "ECONNREFUSED" }
  },
  "timestamp": "..."
}
```

`degraded` when latency > 500ms OR partial error; `down` when unreachable.

### Subscribe to `system.health.ping` (BE-10 catalog)

Other services emit `system.health.ping` on heartbeat. This module MUST subscribe (durable `nestjs-health-ping`) and:
- Fold the latest ping timestamp into the cached indicator result (ping freshness < 60s = ok).
- Broadcast WS `health.alert` to `admin-health` room when any component's status flips.

### Request logger scope

Pino request logging config belongs to BE-22 (NestJS bootstrap). Remove the "Configure Pino request logger" task from this issue; cross-reference BE-22 instead.

### Testing additions

- Test: kill Ollama container → `GET /health` shows `ollama: down` within 30s (cache TTL).
- Test: `admin-health` WS client receives `health.alert` within 5s of status flip.
- Test: `/health/details` returns 401 for non-admin.

---

## BE-16 — AgentModule: Registry, Pipeline Execution & Retry
**State:** `OPEN`
**Labels:** `backend` `priority:high` `scope:agents`

**Description:**
Persist and manage agent definitions, pipeline executions, and agent executions. Expose the monitoring API. Implements all FR-9.x requirements.

**Tasks:**
- `GET /agents` — list all `AgentDefinition` records
- `GET /agents/:id` — return definition with `default_config`
- `PATCH /agents/:id/config` — update `default_config`; Admin only; emit `AuditLog` entry
- `POST /agents/:id/overrides` — create `AgentConfigOverride` for org or session scope
- `GET /agents/:id/overrides` — list active overrides
- `DELETE /agents/overrides/:overrideId` — remove an override
- `GET /sessions/:id/pipeline-executions` — list all pipeline runs for a session
- `GET /pipeline-executions/:id` — return full execution with all `AgentExecution` rows ordered by `order_index`
- `POST /pipeline-executions/:id/retry` — allowed only when `status = PAUSED`; re-publish to NATS `ai.tasks.new` with `{ restart_from_checkpoint: last_checkpoint_agent, pipeline_execution_id }`; Admin or Process Owner only
- `DELETE /pipeline-executions/:id/cancel` — set `status = CANCELLED`; push a NATS cancellation signal
- `GET /pipeline-executions/:id/agents` — list all `AgentExecution` rows for a run
- `GET /agent-executions/:id` — single agent execution with all `AgentLog` entries
- `GET /agent-executions/:id/logs` — SSE stream: send existing logs, then subscribe to new `AgentLog` entries via NATS `ai.tasks.progress` and forward to the SSE connection
- `GET /admin/agents/telemetry` — aggregate: avg duration, avg tokens, failure rate per agent type; filter by `?agent=&from=&to=`

**Security Rules:**
- `PATCH /agents/:id/config` and telemetry endpoints are `Admin` only
- Retry endpoint requires `Admin` or `Process Owner` role
- SSE log stream must close gracefully when the client disconnects

**Acceptance Criteria:**
- Pipeline retry resumes from `last_checkpoint_agent` — not from the beginning
- SSE stream delivers logs in real time as they arrive from NATS
- Telemetry aggregates are correct (avg, failure rate) and filterable by date range

**Testing Requirements:**
- Unit test: retry logic — correct NATS payload published with checkpoint information
- Unit test: config resolution algorithm (default ← org override ← session override)
- Integration test: SSE endpoint streams log entries as they arrive

**Dependencies:** BE-01, BE-10

---

## v2.2 Alignment Amendments

### Scope note: read-plane only

This module is the **read + control-plane**. The WRITE path for `AgentExecution` / `AgentLog` rows is covered by the new issue **BE-24 — AI Pipeline Events Consumer**. Do not duplicate.

### `POST /agents/:id/overrides` body shape (explicit)

```json
{
  "scope_type": "ORG" | "SESSION",
  "scope_id": "<uuid>",
  "config_patch": { "key": "value", ... },
  "description": "why this override was set"
}
```
Enforces UNIQUE (agent_definition_id, scope_type, scope_id) per §8.3.5.

### `GET /pipeline-executions/:id/agent-config-resolved`

New endpoint — returns the resolved effective config per agent for debugging:
```json
[
  { "agent_type": "EXTRACTION", "effective_config": { ... }, "sources": ["default", "org:xxx"] }
]
```
Implements §8.3.7 merge algorithm for read.

### Retry state machine (authoritative)

- Allowed only when `PipelineExecution.status = 'PAUSED'` (set by BE-24 on agent failure).
- `retry_count` increments; after `retry_count >= 3` → `status = 'FAILED'` permanently, retry returns 409.
- The published NATS payload carries `resume_from_checkpoint: last_checkpoint_agent, pipeline_execution_id, correlation_id`.
- AuditLog entry `event_type='PIPELINE_RETRIED'` with actor = caller.

### Cancel state machine

- Allowed when status in `{PENDING, RUNNING, PAUSED}`.
- Publishes `ai.tasks.cancel { pipeline_execution_id, correlation_id }` — FastAPI consumer stops processing.
- All subsequent `ai.tasks.progress` and `ai.tasks.result` for that `pipeline_execution_id` are ignored by BE-24 (check status before persisting).

### Telemetry SQL (authoritative)

```sql
SELECT ad.agent_type,
       COUNT(*)                              AS runs,
       AVG(ae.duration_ms)                   AS avg_duration_ms,
       AVG(ae.tokens_consumed)               AS avg_tokens,
       SUM(CASE WHEN ae.status='FAILED' THEN 1 ELSE 0 END)::float / COUNT(*) AS failure_rate,
       AVG(ae.confidence_output)             AS avg_confidence_out
  FROM agent_execution ae
  JOIN agent_definition ad ON ad.id = ae.agent_definition_id
 WHERE ae.created_at BETWEEN $from AND $to
   AND ($agent IS NULL OR ad.agent_type = $agent)
 GROUP BY ad.agent_type;
```

### Testing additions

- Unit test: retry on `status = COMPLETED` → 409.
- Unit test: cancel publishes `ai.tasks.cancel` and the downstream consumer ignores late progress events.
- Integration test: effective-config endpoint returns correct merge for a session with both org + session overrides.

### Dependencies update

Depends on: BE-01, BE-10, **BE-24** (for persisted AgentExecution/AgentLog rows to read).

---

## BE-17 — WebSocket Gateway: Real-Time Event Push
**State:** `OPEN`
**Labels:** `backend` `priority:critical` `scope:infra`

**Description:**
Implement a Socket.IO WebSocket gateway in NestJS. All real-time events (pipeline progress, workflow updates, document ready, health alerts) are pushed through this gateway. Consumed by the frontend.

**Tasks:**
- Install `@nestjs/platform-socket.io` and create a `WsGateway`
- Implement session-scoped rooms: on connection, the client authenticates with a JWT and joins a room keyed by `session_id`
- Implement `workflow-room` rooms: join by `workflow_id` for workflow update events
- Implement `admin-room` for system health alerts (Admin role only)
- Expose the following server-to-client events:
  - `pipeline.progress` — `{ session_id, agent_name, status, progress_pct }` (from `ai.tasks.progress`)
  - `workflow.updated` — `{ workflow_id, version, changed_elements[] }` (from `workflow.events.updated`)
  - `document.ready` — `{ document_id, extracted_text_preview }` (from document preprocessing)
  - `session.finalized` — `{ session_id, workflow_id }`
  - `system.health.alert` — `{ component, status, timestamp }` (admin room only)
- JWT authentication middleware on WebSocket connection handshake

**Security Rules:**
- Clients without a valid JWT are disconnected immediately during handshake
- A client can only join rooms for sessions/workflows belonging to their `org_id`
- Admin room requires `Admin` role; non-admins joining it are rejected

**Acceptance Criteria:**
- A connected client receives `pipeline.progress` events within 1 second of the NATS message being published
- Joining a room for another org's session is rejected with a `401` disconnect
- Disconnection is clean — the room is vacated and no events are queued for disconnected clients

**Testing Requirements:**
- Integration test: mock NATS message → verify WebSocket event is received by a connected test client
- Unit test: auth middleware rejects connections without a valid JWT

**Dependencies:** BE-10 (NATS must be running)

---

## v2.2 Alignment Amendments

### Full authoritative room + event catalog

**Rooms:**

| Room pattern | Who joins | Auth rule |
|---|---|---|
| `user:{userId}` | the user themselves | self-only |
| `session:{sessionId}` | session owner + workflow collaborators in same org | org-scoped |
| `workflow:{workflowId}` | org members with access | org-scoped |
| `pipeline:{pipelineExecutionId}` | session participants | org-scoped |
| `admin-health` | role = `admin` | role-gated |

**Server → client events (catalog is authoritative — FE and BE-10 both reference this list):**

| Event name | Room | Source NATS subject | Payload |
|---|---|---|---|
| `pipeline.progress` | `session:*`, `pipeline:*` | `ai.tasks.progress` | `{ session_id, pipeline_execution_id, agent_type, agent_name, status, order_index, progress_pct, confidence_output? }` |
| `agent.log` | `pipeline:*` | `ai.tasks.progress` (log field) | `{ agent_execution_id, log_level, message, metadata, created_at }` |
| `agent.status` | `pipeline:*` | `ai.tasks.progress` | `{ agent_execution_id, status, duration_ms?, error_message? }` |
| `workflow.updated` | `workflow:*` | `workflow.events.updated` | `{ workflow_id, version_number, changed_elements[], source, correlation_id }` |
| `session.state` | `session:*` | internal | `{ session_id, status }` |
| `session.needs_reconciliation` | `session:*` | internal (triggered from BE-10 auto-divergence) | `{ session_id, report_id, similarity_score }` |
| `session.finalized` | `session:*` | `session.events.finalized` | `{ session_id, workflow_id, final_version_number, final_confidence }` |
| `document.ready` | `session:*` | BE-07 subscriber | `{ document_id, extracted_text_preview, confidence }` |
| `comment.created` | `workflow:*` | internal | `{ comment_id, workflow_id, element_id?, author_id, type }` |
| `comment.resolved` | `workflow:*` | internal | `{ comment_id, resolved_by, resolved_at }` |
| `divergence.report.ready` | `workflow:*`, `session:*` | `ai.tasks.divergence.result` via BE-18 | `{ report_id, comparison_type, similarity_score, severity, total_points, critical_count }` |
| `divergence.report.updated` | `workflow:*` | internal (reconciliation progress) | `{ report_id, unresolved_points, resolved_points }` |
| `rules.conflict.detected` | `workflow:*` | internal (pipeline loader logs a conflict) | `{ rule_a_id, rule_b_id, scope, message }` |
| `skills.application.logged` | `pipeline:*` | internal | `{ skill_id, agent_execution_id, similarity_score, injected_tokens }` |
| `system.health.alert` | `admin-health` | `system.health.ping` | `{ component, status, since, details }` |
| `notification.review_request` | `user:{assigneeId}` | internal (from BE-13 assign) | `{ comment_id, workflow_id, by_user_id }` |

### JWT handshake + room join guard

- Read token from `socket.handshake.auth.token` OR `?token=` query param.
- Validate via the same passport-jwt strategy as REST.
- On `joinRoom` event, verify: for `session:*` and `workflow:*` that the target belongs to `socket.data.orgId`; for `pipeline:*` that the linked session belongs to the org; for `admin-health` that `socket.data.role === 'admin'`.
- Log every rejection at `warn` with the user id for auditing.

### Heartbeat & backpressure

- Socket.io default ping/pong at 25s. Any socket quiet for 60s is closed.
- If a room has no listeners, the subscriber discards its messages for that room (no queuing).

### Testing additions

- Test: publish every event in the catalog via a mock NATS producer; assert rooms receive exactly the specified payload shapes.
- Test: a user in org A joining `workflow:{id}` for a workflow in org B → `join_error` emitted + disconnect.
- Test: `agent.log` frequency 20 events/sec does not drop messages (backpressure smoke test).

---

## BE-18 — DivergenceModule: Graph Comparison & Reconciliation
**State:** `OPEN`
**Labels:** `backend` `priority:medium` `scope:divergence`

**Description:**
Manage divergence reports and reconciliation actions. Persists results from the FastAPI Divergence Agent. Implements all FR-12.x requirements.

**Tasks:**
- `POST /workflows/:id/divergence` — create a `DivergenceReport` with `status = PENDING`; publish `ai.tasks.divergence` to NATS with `{ graph_a_id, graph_b_id, comparison_type, session_id }`
- Implement `@EventPattern('ai.tasks.divergence.result')` subscriber: receive the result from FastAPI, update `DivergenceReport` with `similarity_score`, `severity`, insert all `DivergencePoint` records; if `similarity_score < 0.70`, flag session as `NEEDS_RECONCILIATION` via PATCH on `Session.status`
- `GET /workflows/:id/divergence-reports` — list all reports for a workflow
- `GET /divergence-reports/:id` — full report with summary stats
- `GET /divergence-reports/:id/points` — list divergence points; filter by `?severity=&resolved=`
- `POST /divergence-points/:id/reconcile` — accept body `{ action_type, notes }`; create `ReconciliationAction`; if action_type resolves the point, set `DivergencePoint.resolved = true`; emit `AuditLog` entry
- `POST /divergence-reports/:id/accept-all-a` and `accept-all-b` — bulk reconcile all unresolved points
- `GET /divergence-points/:id/suggest` — call FastAPI `/suggest-reconciliation` with the point data; return AI suggestion text
- `POST /workflows/:id/import-elsa` — parse uploaded Elsa JSON, build a `WorkflowGraphSnapshot` of type `EXECUTED`, trigger `G vs E` divergence comparison

**Security Rules:**
- `POST /divergence-points/:id/reconcile` requires `Process Owner` or `Admin` role
- Export of a workflow in `NEEDS_RECONCILIATION` status is blocked at the export endpoint
- All reconciliation actions are audit-logged

**Acceptance Criteria:**
- After a pipeline run, an I vs G report is automatically created (triggered by the AIGateway on receiving `ai.tasks.result`)
- If similarity < 0.70, the session status transitions to `NEEDS_RECONCILIATION`
- Reconciling all CRITICAL points clears the `NEEDS_RECONCILIATION` flag
- Import of an Elsa definition creates the `EXECUTED` graph snapshot and triggers G vs E comparison

**Testing Requirements:**
- Unit test: status flag set when similarity < 0.70
- Unit test: bulk accept-all correctly resolves all unresolved points
- Integration test: full divergence flow — publish → receive result → verify report and points created

**Dependencies:** BE-10, BE-11, BE-16

---

## v2.2 Alignment Amendments

### WorkflowGraphSnapshot ownership moved to BE-23

`WorkflowGraphSnapshot` CRUD, `import-elsa` parsing, and auto-creation of INTENT / GENERATED snapshots live in the new issue **BE-23 — WorkflowGraphSnapshot Module**. This module (BE-18) consumes snapshot IDs but does not own their creation.

### Divergence module scope (final)

Endpoints this module owns (all under `/api/...`):

| Method | Path | Body / Params | Auth |
|---|---|---|---|
| POST | `/workflows/:id/divergence` | `{ graph_a_id, graph_b_id, comparison_type }` | process_owner, admin |
| GET | `/workflows/:id/divergence-reports` | pagination | any auth in-org |
| GET | `/divergence-reports/:id` | — | any auth in-org |
| GET | `/divergence-reports/:id/points` | `?severity=&resolved=&type=` | any auth in-org |
| POST | `/divergence-points/:id/reconcile` | `{ action_type, notes?, manual_edit_payload? }` | process_owner, admin |
| POST | `/divergence-reports/:id/accept-all-a` | — | process_owner, admin |
| POST | `/divergence-reports/:id/accept-all-b` | — | process_owner, admin |
| GET | `/divergence-points/:id/suggest` | — | any auth in-org |
| POST | `/divergence-reports/:id/finalize-reconciliation` | — | process_owner, admin |

### Per-org threshold config (FR-12.10)

Add a new DB table in a follow-up migration (coordinate with BE-01):
```sql
CREATE TABLE OrgDivergenceConfig (
  org_id uuid PRIMARY KEY REFERENCES Organization(id) ON DELETE CASCADE,
  min_similarity_for_auto_approval float NOT NULL DEFAULT 0.70,
  auto_block_on_critical boolean NOT NULL DEFAULT TRUE,
  auto_trigger_i_vs_g boolean NOT NULL DEFAULT TRUE,
  updated_by uuid REFERENCES "user"(id),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
```

Endpoints (admin only):
- `GET /admin/divergence-config` — returns org's config (creates default row if missing).
- `PATCH /admin/divergence-config` — update any field.

### Auto-trigger I-vs-G (FR-12.1) — definitive wiring

Wiring lives in BE-10's `ai.tasks.result` handler. On each successful result:
1. If `OrgDivergenceConfig.auto_trigger_i_vs_g = true` (default) AND a pair of INTENT + GENERATED snapshots exists for this workflow version → publish `ai.tasks.divergence` with `comparison_type='INTENT_VS_GENERATED'`.
2. This module's `@EventPattern('ai.tasks.divergence.result')` subscriber persists the report + points.
3. If `severity >= HIGH` OR `critical_count > 0`, transition `Session.status → NEEDS_RECONCILIATION` via BE-09 service (not a raw PATCH).
4. Emit `session.needs_reconciliation` + `divergence.report.ready` WS events via BE-17.

### Reconciliation → new WorkflowVersion (FR-12.8)

`POST /divergence-reports/:id/finalize-reconciliation`:
1. Require all `severity='CRITICAL'` points to be `resolved=true` OR skipped.
2. Build a new `WorkflowGraphSnapshot` with `graph_type='RECONCILED'`, `source='MANUAL_MERGE'`, `nodes/edges` computed from the `ReconciliationAction` trail.
3. Call BE-11 `WorkflowVersions.create(workflowId, elements_json_derived_from_reconciled_graph, created_by)`.
4. Update `Session.status → DRAFT_READY` via BE-09.
5. Emit `workflow.events.updated { source:'reconciliation' }` via BE-10.

### Reconcile body — manual edit payload

Body for `POST /divergence-points/:id/reconcile`:
```json
{
  "action_type": "ACCEPT_A" | "ACCEPT_B" | "AI_SUGGEST_APPLY" | "MANUAL_EDIT" | "SKIP",
  "notes": "...",
  "manual_edit_payload": { /* required if action_type = MANUAL_EDIT; new node/edge spec */ }
}
```

### AuditLog coverage (FR-12.7)

Every resolution writes an AuditLog row:
- `event_type`: `DIVERGENCE_POINT_RESOLVED`
- `actor_type`: `user` (or `ai_agent` when `AI_SUGGEST_APPLY`)
- `before_state`: `{ divergence_point_id, description, severity, resolved: false }`
- `after_state`: `{ action_type, resolution_action_id, resolved: true }`

### Testing additions

- Test: auto-trigger fires on `ai.tasks.result` when config allows; skipped when flag off.
- Test: `finalize-reconciliation` refuses when CRITICAL points unresolved.
- Test: `accept-all-a` creates one ReconciliationAction per unresolved point and emits one summary AuditLog.
- Test: manual-edit payload schema validated (missing payload when action=MANUAL_EDIT → 400).

### Dependencies update

Depends on: BE-10, BE-11, **BE-17 (new events)**, **BE-23 (snapshot module)**, **BE-26 (reconciliation-to-new-version flow)** if that issue is split off. If BE-23/26 aren't created separately, absorb their scope here.

---

## BE-19 — RulesModule: CRUD, Validation & Conflict Detection
**State:** `OPEN`
**Labels:** `backend` `priority:medium` `scope:rules`

**Description:**
Manage organizational AI behavior rules. Expose CRUD and a preview endpoint. Implements FR-13.1 through FR-13.9.

**Tasks:**
- `POST /rules` — create a `Rule`; required fields: `name`, `type` (enum), `scope`, `instruction`; validate that `org_id` is set from the caller's org; activate by default
- `GET /rules` — list active rules for the org; filter by `?type=&scope=&agent_type=`
- `GET /rules/:id` — return rule detail
- `PATCH /rules/:id` — update instruction or priority; deactivate/reactivate
- `DELETE /rules/:id` — hard delete (rules are not audit-critical themselves; their applications are recorded in `RuleApplication`)
- Conflict detection: before creating or activating a rule, check for conflicts (same `scope` + `agent_target` + overlapping `condition`); if conflict found, return a `409 Conflict` with details of the conflicting rule
- `GET /sessions/:id/rules/preview` — return which rules would be applied to this session without running the pipeline
- `POST /rules/export` and `POST /rules/import` — export/import a JSON bundle of rules for cross-org sharing

**Security Rules:**
- Only `Admin` and `Business Analyst` can create/edit/delete rules
- Import endpoint validates the JSON bundle schema strictly before inserting any records

**Acceptance Criteria:**
- Creating a conflicting rule returns `409 Conflict` with the conflicting rule's ID and name
- Preview endpoint returns all matching rules without triggering any pipeline action
- Deactivated rules are excluded from the Orchestrator's context fetch

**Testing Requirements:**
- Unit test: conflict detection (same scope + agent + condition overlap)
- Unit test: preview endpoint returns correct rule set based on session context
- Unit test: preview endpoint returns correct rule set based on session context

**Dependencies:** BE-01, BE-09

---

## v2.2 Alignment Amendments

### Missing endpoints (from spec §AI-F13 — match exactly)

Add:
- `POST /rules/:id/activate` — explicit activate; emits AuditLog + invalidates any cached rule set for the org.
- `POST /rules/:id/deactivate` — explicit deactivate (preferred over PATCH for auditability).
- `GET /rules/export` — **GET** (not POST) returns the active-rules bundle as a downloadable JSON.
- `GET /agent-executions/:id/rules` — list `RuleApplication` rows for a specific agent execution (FR-13.5 traceability).

### `DELETE /rules/:id` should be SOFT delete, not hard

Rules can be referenced historically by `RuleApplication` — hard deleting breaks the FK. Change to SOFT delete (set `is_active=false`, keep the row). Update the body accordingly.

### RuleVersion on every update (FR-13.12)

Every `PATCH /rules/:id` that changes `instruction` or `condition`:
1. Inserts a `RuleVersion` snapshot of the PREVIOUS state.
2. Increments `Rule.version`.
3. Returns the updated rule + version number.

Coordinate the `RuleVersion` table with BE-01.

### FR-13.9 — Rule testing endpoint

`POST /rules/:id/test`:
- Body: `{ sample_text: string, simulate_agent: 'EXTRACTION'|'VALIDATION'|... }`
- Delegates to FastAPI `POST /internal/rules/simulate` with the rule and sample text.
- Returns `{ with_rule_output: {...}, without_rule_output: {...}, diff_summary: '...' }`.
- Does NOT create a `PipelineExecution` or `AgentExecution` — purely simulation.
- Response cached 5 min per `(rule_id, sample_text_hash)` to avoid re-running on UI retries.

### Conflict-detection algorithm (authoritative)

Two rules conflict if ALL of these hold:
- Same `org_id`
- Same `scope`
- Same `target_agent` (including both NULL)
- `workflow_id` equal or both NULL
- Condition overlap: either both `condition IS NULL` (always overlap) OR their JSONB conditions have at least one key with equal values
- Types in the "contradictable" set (e.g., two `ACTOR_MAPPING` rules mapping the same source label to different canonicals, or two `STRUCTURAL_CONSTRAINT` rules forbidding-vs-requiring the same structure)

On detection, write a WS `rules.conflict.detected` event to `workflow:{id}` (or org-broadcast if scope=ORG) and return 409 with `{ code: 'RULE_CONFLICT', conflicting_rule_id, conflicting_rule_name, conflict_detail }`.

### Orchestrator context hook (glue to BE-25)

This module exposes an **internal service method** `listActiveRulesForContext(orgId, sessionId): ActiveRuleDto[]` consumed by BE-25 (Rules & Skills Context Loader). The loader publishes `ai.context.load` with `active_rules[]` before each pipeline start. This method also filters by workflow scope when the session has a `workflow_id`.

### AuditLog coverage

Every create, update, activate/deactivate, import, and delete writes an AuditLog entry with `event_type` prefix `RULE_`.

### Testing additions

- Unit: conflict detection across all type pairs in the contradictable set.
- Unit: PATCH creates RuleVersion; inactive → active also creates a RuleVersion noting the state flip.
- Integration: `/rules/:id/test` returns `with`/`without` outputs distinct when the rule is impactful.
- Test: `GET /agent-executions/:id/rules` returns only rows for that execution.

---

## BE-20 — SkillsModule: CRUD, Embedding Generation & Retrieval
**State:** `OPEN`
**Labels:** `backend` `priority:medium` `scope:skills`

**Description:**
Manage the organization's skill library. On create/update, call FastAPI to generate and store the vector embedding. Implements FR-13.3, FR-13.6.

**Tasks:**
- `POST /skills` — create a `Skill`; after saving, call FastAPI `POST /internal/embed` with the skill content; store the returned `vector(768)` in `Skill.embedding`
- `GET /skills` — list skills for the org; filter by `?type=&is_active=`
- `GET /skills/:id` — return skill detail with usage stats (`application_count`, `avg_similarity_score`)
- `PATCH /skills/:id` — update content; re-generate embedding via FastAPI call
- `DELETE /skills/:id` — soft delete (`is_active = false`)
- `POST /skills/search` — semantic search: embed the query text via FastAPI, then run pgvector cosine similarity against `Skill.embedding`; return top-K results
- `POST /skills/import` — import skills from a JSON file upload
- `GET /admin/skills/analytics` — return per-skill usage: `application_count`, `avg_similarity_score`, `avg_confidence_delta`; Admin only

**Security Rules:**
- Only `Admin` and `Business Analyst` can create/modify/delete skills
- The `ACTOR_CATALOG` skill type must always have `is_mandatory = true` — never excluded from agent context
- Embedding generation is done via an internal call to FastAPI — this endpoint is not publicly exposed

**Acceptance Criteria:**
- Creating a skill calls FastAPI and stores the embedding; the skill is immediately searchable
- Semantic search returns the most relevant skills ranked by cosine similarity
- `ACTOR_CATALOG` skills are always included regardless of top-K filtering

**Testing Requirements:**
- Unit test: on skill update, embedding is regenerated
- Integration test: semantic search returns correct results ranked by similarity

**Dependencies:** BE-01, FastAPI `/internal/embed` available

---

## v2.2 Alignment Amendments

### Missing endpoints (from spec §AI-F13 — match exactly)

Add:
- `GET /skills/:id/applications` — list `SkillApplication` rows for this skill with pagination (usage history per FR-13.6).
- `GET /skills/export` — **GET** (not POST) returns the active-skills bundle as downloadable JSON (with embeddings stripped — they're regenerated on import target).
- `GET /agent-executions/:id/skills` — list `SkillApplication` rows for a specific agent execution.

### Skill versioning (FR-13.12)

`PATCH /skills/:id` that changes `content`:
1. Increment `Skill.version`.
2. Re-generate embedding.
3. Persist an immutable `SkillVersion` snapshot if this table is added (optional for hackathon; flag as technical debt otherwise).

Minimum acceptable: bump `version` counter on every content-changing PATCH and record in the AuditLog entry.

### Batch embedding on import (FR-13.10)

`POST /skills/import`:
1. Accept multipart or JSON body with an array of skills (max 200 per request).
2. Validate every entry against the per-type content schema.
3. Call FastAPI `POST /internal/embed/batch` with `{ items: [{ id, content_for_embedding }] }` — **one network round-trip** (not N).
4. Insert rows with returned embeddings in a single transaction.
5. Return `{ imported: N, failed: [...] }`.

### `ACTOR_CATALOG` invariants

- At most ONE active `ACTOR_CATALOG` skill per org at a time. Creating a second while one is active returns 409 `ACTOR_CATALOG_EXISTS` — the user must deactivate the old one first.
- `is_mandatory` is FORCED to TRUE for `ACTOR_CATALOG` type regardless of request body.
- ACTOR_CATALOG bypasses top-K retrieval — BE-25 always injects it.

### `applies_to_agents` semantics

- NULL = applies to all agent types.
- Array value = only these agent types may retrieve the skill (FastAPI filters at retrieval time based on `ai.context.load` config).

### Search endpoint body shape

`POST /skills/search`:
```json
{
  "query_text": "...",
  "top_k": 5,
  "filter_types": ["VOCABULARY", "DOMAIN_KNOWLEDGE"],
  "min_similarity": 0.35
}
```

Returns `[{ id, name, skill_type, similarity_score, content_preview }]` ordered by similarity desc.

### Analytics SQL (authoritative)

```sql
SELECT s.id,
       s.name,
       COUNT(sa.*)                AS application_count,
       AVG(sa.similarity_score)   AS avg_similarity,
       AVG(sa.injected_tokens)    AS avg_tokens,
       -- confidence delta: sum(confidence_output - confidence_input) across the agent executions where this skill was applied
       AVG(ae.confidence_output - ae.confidence_input) AS avg_confidence_delta
  FROM skill s
  LEFT JOIN skill_application sa ON sa.skill_id = s.id
  LEFT JOIN agent_execution ae ON ae.id = sa.agent_execution_id
 WHERE s.org_id = $1
   AND (sa.created_at BETWEEN $from AND $to OR sa.created_at IS NULL)
 GROUP BY s.id, s.name;
```

### Orchestrator context hook (glue to BE-25)

Expose internal service methods:
- `listMandatorySkills(orgId): Skill[]` — returns all `is_mandatory=true` active skills (ACTOR_CATALOG etc.).
- `retrieveTopKSkills(orgId, contextEmbedding, topK, agentType?): Skill[]` — pgvector query.

BE-25 calls these before publishing `ai.context.load`.

### AuditLog

Every create/update/delete writes AuditLog with `event_type` prefix `SKILL_` and `before/after_state`.

### Testing additions

- Test: creating a second ACTOR_CATALOG while one is active → 409.
- Test: `is_mandatory` forced to true on ACTOR_CATALOG even when body says false.
- Test: batch import 50 skills → one FastAPI call, 50 rows inserted, transaction rolled back on any failure.
- Test: `GET /skills/export` body has no `embedding` field in the JSON bundle.
- Test: `GET /agent-executions/:id/skills` returns only that execution's rows ordered by `retrieval_rank`.

---

## BE-21 — Infra & Docker Compose Bootstrap
**State:** `OPEN`
**Labels:** `backend` `priority:critical` `scope:infra`

**Description:**
Stand up the complete local/dev infrastructure via Docker Compose so every other backend issue has a reproducible environment. This is the second foundation (alongside BE-01 which covers the DB schema once the DB is up). No BE-xx that talks to NATS, MinIO, Ollama, or Elsa can be validated without this.

Currently the repo has only `backend/Dockerfile` and `.env.example`; there is no `docker-compose.yml`, no NATS stream bootstrap, no MinIO bucket bootstrap, no Ollama model pull, and no init SQL for pgvector.

**Tasks:**
- Create `/docker-compose.yml` at repo root with services: `app-db` (pgvector/pgvector:pg16), `elsa-db` (postgres:16-alpine), `nats` (nats:2.10-alpine with JetStream), `nats-init`, `minio` (minio/minio:latest), `minio-init`, `ollama` (ollama/ollama:latest), `ollama-init`, `elsa-server`, `nestjs` (build from ./backend), `fastapi` (build from ./ai-service), `nextjs` (build from ./frontend)
- Add named volumes: `app-db-data`, `elsa-db-data`, `nats-data`, `minio-data`, `ollama-models`
- Add healthchecks on all long-running services; `depends_on: { condition: service_healthy }` + `condition: service_completed_successfully` for init services
- Create `/infra/app-db-init.sql` — `CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS citext;`
- Create `/infra/nats.conf` — JetStream enabled, store_dir=/data, monitor_port=8222
- Create `/infra/nats-stream-bootstrap.sh` — runs `nats stream add FLOWFORGE` with subjects `ai.tasks.*, ai.tasks.>, workflow.events.*, session.events.*, system.health.*, ai.context.*, dead.flowforge.>`, retention=limits, storage=file, max_age=24h, max_msgs=100k, max_msg_size=4MB, discard=old, replicas=1
- Create `/infra/minio-bootstrap.sh` — creates buckets `documents` and `exports`; anonymous=none
- Create `/infra/ollama-pull.sh` — pulls `mistral:7b-instruct` and `nomic-embed-text` into the shared `ollama-models` volume
- Create `/.env.example` at repo root (separate from `backend/.env.example`) with every cross-service variable: DB passwords, MinIO root creds, JWT secrets, Ollama/Elsa URLs
- Port map (published): NestJS 3000, Next.js 3001, Elsa 5000, FastAPI 8000, NATS 4222, NATS monitor 8222, MinIO 9000, MinIO console 9001, Postgres app 5432, Postgres elsa 5433, Ollama 11434
- `README.md` at repo root: how to boot the stack, how to reset data, how to pre-seed Ollama models before demo day

**Security Rules:**
- No secrets committed — `.env` is git-ignored; `.env.example` is authoritative
- `MINIO_ROOT_PASSWORD`, DB passwords, and JWT secrets MUST be passed via env, never baked into the Dockerfile or image
- NATS runs without auth inside the compose network (hackathon scope); flag as follow-up to enable NKeys for production
- MinIO bucket ACL = none (private); access is always via presigned URL from the NestJS backend

**Acceptance Criteria:**
- `docker compose up -d app-db elsa-db nats minio ollama` brings all five healthy within 60 seconds on a clean laptop
- `docker compose up nats-init minio-init ollama-init` all exit with code 0
- `docker exec flowforge-app-db psql -U app -d appdb -c '\dx'` lists `vector`, `pgcrypto`, `citext`
- `docker exec flowforge-nats nats stream ls` shows `FLOWFORGE`
- `docker exec flowforge-minio mc ls local/` lists both buckets
- `curl :11434/api/tags` returns both `mistral:7b-instruct` and `nomic-embed-text`
- Full stack boot (`docker compose up -d`) reaches all healthy within 180 seconds once models are pre-pulled
- Bringing down the stack and up again preserves DB, NATS streams, MinIO buckets, and Ollama models (volume persistence)

**Testing Requirements:**
- Smoke: a shell script `scripts/smoke.sh` at repo root that boots the stack, runs migrations, hits `/api/health`, and tears down — must pass green on a fresh checkout
- Volume test: bring the stack up, insert a row into `appdb`, stop the stack with `down` (no `-v`), up again — row persists

**Dependencies:** None (foundation)

**Risk:** Ollama model pull on demo-day Wi-Fi is catastrophic (Mistral 7B Q4 ≈ 4 GB). Mitigation baked in: `scripts/pre-pull-models.sh` + shipping the `ollama-models` volume via `docker save`/`load` to the demo laptop before arrival.

---

## BE-22 — NestJS Bootstrap: main.ts, CoreModule, Global Pipes/Filters/Interceptors
**State:** `OPEN`
**Labels:** `backend` `priority:critical` `scope:infra`

**Description:**
Bootstrap the NestJS application shell: `main.ts`, `AppModule`, global pipes/filters/interceptors, Swagger, structured logging, config validation, CORS, throttler, correlation-id propagation, and the RBAC + JWT guard scaffold (real JWT logic lands in BE-02/BE-03).

Nothing in BE-02..BE-20 can actually run until this foundation exists. Today the repo has empty `src/`, a `package.json`, and a `Dockerfile` — no wiring.

**Tasks:**

### 1. Application entry (`src/main.ts`)

- `NestFactory.create(AppModule, { bufferLogs: true })`
- Swap default logger with `nestjs-pino`
- `app.use(helmet())`
- `app.use(cookieParser())`
- `app.enableCors({ origin: CORS_ORIGIN.split(','), credentials: true })`
- `app.setGlobalPrefix('api')`
- `app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }))`
- `app.useGlobalFilters(new HttpExceptionFilter(logger))`
- `app.useGlobalInterceptors(new CorrelationIdInterceptor(), new LoggingInterceptor())`
- Swagger at `/docs` in non-production: `@nestjs/swagger` auto-generates OpenAPI 3.0
- `app.enableShutdownHooks()`
- Listen on `PORT`

### 2. Root `AppModule`

Import order (final assembly; each feature module is a dependency added as it ships):
1. `ConfigModule.forRoot({ isGlobal: true, load: [configuration], validationSchema: envSchema })` — Joi
2. `LoggerModule` (nestjs-pino, redact: `['req.headers.authorization','req.headers.cookie','*.password','*.password_hash','*.token']`)
3. `ThrottlerModule.forRootAsync` reading `THROTTLE_TTL`, `THROTTLE_LIMIT`
4. `TypeOrmModule.forRootAsync` reading `DATABASE_URL`, `synchronize: false`, `migrationsRun: true`, `autoLoadEntities: true`, `namingStrategy: new SnakeNamingStrategy()`
5. `CoreModule`
6. Feature modules (BE-02..BE-20) wired as each ships

### 3. `CoreModule` (`@Global()`)

- `src/core/config/configuration.ts` + `env.validation.ts` (Joi schema)
- `src/core/logger/logger.module.ts`
- `src/core/filters/http-exception.filter.ts` — standardized envelope `{ statusCode, error, message, correlationId, path, timestamp }`
- `src/core/interceptors/logging.interceptor.ts` — method, path, status, duration_ms, user_id
- `src/core/interceptors/correlation-id.interceptor.ts` — reads/creates `x-correlation-id`, seeds `AsyncLocalStorage`
- `src/core/context/request-context.service.ts` — `{ userId?, orgId?, role?, correlationId }` via ALS
- `src/core/guards/jwt-auth.guard.ts` — stub that delegates to passport `'jwt-access'`; short-circuits on `@Public()`; supports `DEV_BYPASS_AUTH=true` (injects synthetic admin in dev)
- `src/core/guards/roles.guard.ts` + `@Roles(...)` decorator
- `src/core/decorators/public.decorator.ts`
- `src/core/decorators/current-user.decorator.ts`
- `src/core/decorators/org-id.decorator.ts`
- `src/core/interceptors/org-scope.interceptor.ts` — enforces `org_id` is present on the request context for every non-public route

### 4. Env schema (Joi)

Required: `NODE_ENV`, `PORT`, `DATABASE_URL`, `NATS_URL`, `NATS_STREAM_NAME=FLOWFORGE`, `JWT_ACCESS_SECRET` (min 32 chars), `JWT_REFRESH_SECRET` (min 32 chars), `JWT_ACCESS_TTL=15m`, `JWT_REFRESH_TTL=7d`, `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_USE_SSL`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET_DOCUMENTS`, `MINIO_BUCKET_EXPORTS`, `OLLAMA_URL`, `FASTAPI_HEALTH_URL`, `FASTAPI_INTERNAL_URL`, `ELSA_HEALTH_URL`, `CORS_ORIGIN`.
Optional with defaults: `DEV_BYPASS_AUTH=false`, `THROTTLE_TTL=60`, `THROTTLE_LIMIT=120`, `LOG_LEVEL=info`.

Boot MUST fail fast if any required var is missing.

### 5. Standard error envelope

Every error response:
```json
{
  "statusCode": 400,
  "error": "ValidationError",
  "message": "email must be a valid email",
  "correlationId": "uuid-v4",
  "path": "/api/auth/register",
  "timestamp": "..."
}
```

### 6. Correlation IDs across NATS

`CorrelationIdInterceptor` seeds `x-correlation-id`. Whenever the backend publishes a NATS message (via BE-10), the correlation id MUST ride on the payload (`correlation_id` field) AND be used inside `msgId` as per BE-10's idempotency spec.

**Security Rules:**
- Helmet defaults + `crossOriginEmbedderPolicy: false` (to allow Swagger UI in dev)
- CORS in production strictly whitelisted — no wildcard
- Swagger disabled when `NODE_ENV=production`
- `DEV_BYPASS_AUTH=true` in production: log a WARN at boot; optionally refuse to boot

**Acceptance Criteria:**
- `pnpm start:dev` boots with all BE-02..BE-20 modules stubbed as empty modules — no runtime error
- `GET /api/nonexistent` returns the standardized error envelope with 404 + `correlationId`
- Boot with missing env var → Joi error listing the missing key; exit code non-zero
- `GET /docs` renders Swagger UI in dev
- Every log line includes `correlationId` when inside a request scope
- `x-correlation-id` from the client is preserved through NATS publish → subscribe round-trip (integration test with BE-10)

**Testing Requirements:**
- Unit: Joi schema rejects missing secret
- Unit: HttpExceptionFilter output matches the envelope shape
- Unit: `JwtAuthGuard` with `DEV_BYPASS_AUTH=true` and no Authorization header → synthetic admin injected
- Integration: correlation id flows REST → NATS → subscriber handler → response log

**Dependencies:** None (foundation). BE-01 can migrate in parallel but this must land before any feature module is wired.

---

## BE-23 — WorkflowGraphSnapshot Module: Intent/Generated/Executed/Reconciled Persistence
**State:** `OPEN`
**Labels:** `backend` `priority:high` `scope:divergence`

**Description:**
Manage the three workflow graph representations — Intent (I), Generated (G), Executed (E), and Reconciled (R) — as immutable `WorkflowGraphSnapshot` rows. Provide auto-creation hooks for each source (pipeline outputs, Elsa imports, reconciliation merges) so the Divergence module (BE-18) always has snapshots to compare. Implements the snapshot side of AI-F12 / §8.6.1.

This issue was missing from the original backlog — BE-18 references `graph_a_id` / `graph_b_id` but nothing was creating those snapshots. Without this module the divergence flow cannot be tested end-to-end.

**Tasks:**

### Persistence & entity

- `WorkflowGraphSnapshot` TypeORM entity mapped to §8.6.1 columns (`id, workflow_id, workflow_version_id, session_id, graph_type, source, nodes jsonb, edges jsonb, node_count, edge_count, graph_embedding vector(768), created_by, created_at`)
- Repository + service with `create`, `findByWorkflow`, `findById`, `listByWorkflowAndType` methods — snapshots are immutable (no update, no soft delete for hackathon scope)

### Endpoints

| Method | Path | Behavior | Roles |
|---|---|---|---|
| GET | `/workflows/:id/graph-snapshots` | List all snapshots for a workflow; filter `?type=INTENT|GENERATED|EXECUTED|RECONCILED` | any auth in-org |
| GET | `/graph-snapshots/:id` | Return the full snapshot with nodes + edges | any auth in-org |
| GET | `/graph-snapshots/:id/diagram-data` | Return nodes/edges in React Flow shape | any auth in-org |
| POST | `/workflows/:id/import-elsa` | Upload an Elsa 3.x workflow JSON; parse → build `EXECUTED` snapshot → kick off `GENERATED_VS_EXECUTED` divergence via BE-18 | process_owner, admin |
| POST | `/graph-snapshots` | Manual snapshot creation (typically only called by services, exposed to admin for debugging) | admin |

### Auto-creation hooks (the core value of this module)

Three internal service entry points; no HTTP surface. Each must be idempotent on `(workflow_id, workflow_version_id, graph_type)`.

1. **INTENT snapshot** — `GraphSnapshotService.snapshotIntentFromSession(sessionId)`
   - Called by BE-10 on receipt of `ai.tasks.result` BEFORE creating the GENERATED snapshot
   - Builds nodes/edges from the session's extracted KG (`KGNode`, `KGEdge` tables scoped to session_id)
   - `source = 'AI_EXTRACTION'`, `graph_type = 'INTENT'`
   - `graph_embedding` = aggregated average of node embeddings (coarse whole-graph fingerprint)

2. **GENERATED snapshot** — `GraphSnapshotService.snapshotGeneratedFromVersion(workflowVersionId)`
   - Called by BE-10 after persisting the new `WorkflowVersion`
   - Builds nodes/edges from `WorkflowVersion.elements_json`
   - `source = 'AI_GENERATION'`, `graph_type = 'GENERATED'`
   - Links to the version via `workflow_version_id`

3. **EXECUTED snapshot** — `GraphSnapshotService.snapshotExecutedFromElsaJson(workflowId, elsaJson, uploadedBy)`
   - Called by `POST /workflows/:id/import-elsa`
   - Parses Elsa 3.x JSON (Flowchart activities + connections) into the generic graph model
   - `source = 'ELSA_IMPORT'`, `graph_type = 'EXECUTED'`

4. **RECONCILED snapshot** — `GraphSnapshotService.snapshotReconciled(workflowId, sessionId, reportId, nodes, edges, createdBy)`
   - Called by BE-18 `finalize-reconciliation`
   - `source = 'MANUAL_MERGE'`, `graph_type = 'RECONCILED'`

### Graph representation

Each snapshot stores nodes + edges as JSONB per §AI-F12:
```
Node: { id, type (START|END|TASK|DECISION|PARALLEL_GATEWAY), label, actor, properties:{timeout,condition,...} }
Edge: { from_node_id, to_node_id, type (SEQUENCE|CONDITION|DEFAULT|LOOP_BACK), condition_label }
```

Node/edge-level embeddings (`vector(768)`) are generated by the FastAPI Divergence Agent at comparison time — NOT stored in the snapshot JSONB. The `graph_embedding` column holds only the coarse whole-graph vector.

### Elsa JSON parser

Supports Elsa 3.x's `Flowchart` activity with nested `activities[]` + `connections[]`. Mapping:
- `Elsa.HttpEndpoint`, `Elsa.WriteLine`, `Elsa.SetVariable` → `TASK`
- `Elsa.If`, `Elsa.FlowSwitch` → `DECISION`
- `Elsa.Fork`, `Elsa.Join` → `PARALLEL_GATEWAY`
- `Elsa.Finish` → `END`
- Root `Elsa.Flowchart`'s first activity → `START`
Unknown activity types degrade to `TASK` with a warning log.

**Security Rules:**
- Snapshots inherit org scoping from their parent `Workflow`
- Cross-org access on `GET /graph-snapshots/:id` → 404 (don't leak existence)
- `import-elsa` validates the uploaded file is valid JSON, ≤ 1 MB, not arbitrary binary

**Acceptance Criteria:**
- Successful pipeline run produces exactly one INTENT + one GENERATED snapshot per version
- `POST /workflows/:id/import-elsa` produces exactly one EXECUTED snapshot and publishes `ai.tasks.divergence` for `GENERATED_VS_EXECUTED`
- `finalize-reconciliation` in BE-18 results in exactly one RECONCILED snapshot + a new `WorkflowVersion`
- Re-calling a hook with the same `(workflow_id, version_id, graph_type)` → returns the existing snapshot (idempotent)
- Listing returns snapshots ordered by `created_at DESC` grouped by `graph_type`

**Testing Requirements:**
- Unit: Elsa JSON parser round-trips a known sample workflow into the expected node/edge graph
- Unit: idempotency — calling the hook twice with the same key returns the same snapshot id
- Integration: upload Elsa JSON → EXECUTED snapshot stored + `ai.tasks.divergence` observed on NATS
- Integration: synthetic `ai.tasks.result` → INTENT + GENERATED snapshots created in order

**Dependencies:** BE-01 (WorkflowGraphSnapshot table), BE-10 (NATS publisher), BE-11 (WorkflowVersion), **referenced by BE-18**

---

## BE-24 — AI Pipeline Events Consumer: AgentExecution/AgentLog Persistence
**State:** `OPEN`
**Labels:** `backend` `priority:high` `scope:agents`

**Description:**
The **write-plane** for agent execution observability. Consumes `ai.tasks.progress` from FastAPI and persists the lifecycle of every `AgentExecution` + `AgentLog` + pipeline state transitions. Also writes `actor_type='ai_agent'` entries to `AuditLog` on every state change (FR-9.9).

This issue was missing from the original backlog — BE-16 only exposes read endpoints over these tables; nothing was writing the rows. Without this module the agent timeline, retry checkpointing, and telemetry are empty.

**Tasks:**

### NATS subscriber

Durable consumer `nestjs-agent-progress-writer` on subject `ai.tasks.progress` (distinct from the WebSocket fanout consumer `nestjs-ai-progress` in BE-10 — different concern, different consumer). Uses explicit ack; `max_deliver=3`; DLQ per BE-10 policy.

### Per-event processing algorithm

Payload (from `AiTaskProgressPayload` in BE-10's contract):
```
{ correlation_id, session_id, pipeline_execution_id, agent_execution_id, agent_type, agent_name,
  status, order_index, progress_pct?, confidence_input?, confidence_output?,
  llm_calls_delta?, tokens_delta?, started_at?, completed_at?, error_message?,
  log? { level, message, metadata } }
```

Handler flow (inside a DB transaction):

1. Idempotency check: if `agent_execution_id` + `status` already persisted at this or a later stage, acknowledge and return.
2. Guard: if `PipelineExecution.status IN ('CANCELLED','FAILED')`, discard the event silently (ack + log).
3. Upsert `AgentExecution`:
   - If not exists, INSERT with `pipeline_execution_id, agent_definition_id (resolved via agent_type), order_index, status='PENDING', started_at=now()`.
   - If `status='RUNNING'`, set `started_at` if not set.
   - If `status='COMPLETED'`, set `completed_at`, `duration_ms`, `confidence_output`, `output_snapshot` (if provided), increment `llm_calls_count`, increment `tokens_consumed`.
   - If `status='FAILED'`, set `error_message`, `status='FAILED'`, `completed_at`.
   - If `status='SKIPPED'`, just set `completed_at`.
4. If `log` field present: insert an `AgentLog` row with `agent_execution_id, log_level, message, metadata, created_at`.
5. Update `PipelineExecution`:
   - `total_llm_calls += llm_calls_delta`
   - `total_tokens_consumed += tokens_delta`
   - `last_checkpoint_agent = agent_type` when the status becomes `COMPLETED`
   - If ANY agent for this pipeline has `status='FAILED'` → `PipelineExecution.status='PAUSED'`
   - If all expected agents have terminal status (`COMPLETED` or `SKIPPED`) → `PipelineExecution.status='COMPLETED'`, set `completed_at`, `total_duration_ms`, `final_confidence`
6. Write an `AuditLog` entry for every terminal status (`COMPLETED`, `FAILED`, `SKIPPED`) with:
   - `actor_type='ai_agent'`
   - `event_type='AGENT_<AGENT_TYPE>_<STATUS>'` (e.g. `AGENT_EXTRACTION_COMPLETED`)
   - `before_state = { input_snapshot }`, `after_state = { output_snapshot, confidence_output }`
   - `correlation_id` propagated from the payload

### Expected-agents list per task type

`COMPLETED` detection needs to know which agents are expected for each `PipelineExecution`:

| task_type | mode | Expected agents (in order) |
|---|---|---|
| FULL_PIPELINE | auto | INTAKE, EXTRACTION, PATTERN, GAP_DETECTION, VALIDATION, DIVERGENCE |
| FULL_PIPELINE | interactive | INTAKE, EXTRACTION, PATTERN, GAP_DETECTION, QA, VALIDATION, DIVERGENCE |
| SCOPED_REPROCESS | any | EXTRACTION, VALIDATION |
| EXPORT_ONLY | any | EXPORT |
| QA_ROUND | interactive | EXTRACTION, GAP_DETECTION |

The list is a constant map loaded at boot. `DIVERGENCE` at the tail of `FULL_PIPELINE` is optional — if `OrgDivergenceConfig.auto_trigger_i_vs_g=false`, strip it.

### Cross-module hook

On `PipelineExecution.status` transitions, notify BE-17 via an internal event emitter (or directly emit from this module's gateway client) to push `pipeline.progress` / `agent.status` WS events with the persisted row (so clients receive the DB-authoritative payload, not the raw NATS blob).

**Security Rules:**
- The subscriber validates `session_id` belongs to the right org via `PipelineExecution → Session` join before touching any row — never trust NATS payload's `org_id`
- Reject and DLQ any event whose `correlation_id` does not match the `PipelineExecution.input_payload.correlation_id`

**Acceptance Criteria:**
- Synthetic progress sequence of 7 events (one per expected agent) → 7 `AgentExecution` rows with correct `order_index`, monotonic `started_at`
- Each event that carries a `log` field produces exactly one `AgentLog` row
- When the last expected agent completes → `PipelineExecution.status='COMPLETED'`, `completed_at` set, `total_duration_ms` matches the span between the first `started_at` and last `completed_at`
- One `AuditLog` row per terminal status with `actor_type='ai_agent'`
- Duplicate delivery of the same event → no duplicate rows (idempotent)
- Cancelled pipeline receives progress → events dropped silently

**Testing Requirements:**
- Unit: idempotency on `(pipeline_execution_id, agent_type, status)`
- Unit: expected-agents map correctly detects completion per task_type + mode
- Unit: FAILED event flips `PipelineExecution.status='PAUSED'`
- Integration: replay a 20-event sequence (mixed agents, some failures, some logs) → final DB state matches fixture
- Integration: AuditLog table has exactly one `ai_agent` row per terminal status across the replay

**Dependencies:** BE-01, BE-10 (contracts + NATS), BE-16 (reads what this writes)

---

## BE-25 — Rules & Skills Context Loader: ai.context.load Publisher + Application Traceability
**State:** `OPEN`
**Labels:** `backend` `priority:high` `scope:ai`

**Description:**
Before each pipeline run, NestJS must resolve the active Rules + seed the Skill retriever for the Orchestrator. This is done by publishing `ai.context.load` on NATS. Also owns the persistence of `RuleApplication` / `SkillApplication` rows based on FastAPI callbacks.

This issue was missing — BE-19 (Rules) and BE-20 (Skills) cover CRUD only; neither covers the context injection for a running pipeline. AI-F13 FR-13.4 / FR-13.5 / FR-13.6 require this glue.

**Tasks:**

### Publisher — `ai.context.load`

Called from BE-10 immediately before publishing `ai.tasks.new` for any task whose `task_type IN ('FULL_PIPELINE','SCOPED_REPROCESS','QA_ROUND')`.

Payload:
```json
{
  "correlation_id": "<same as the following ai.tasks.new>",
  "session_id": "<uuid>",
  "org_id": "<uuid>",
  "pipeline_execution_id": "<uuid>",
  "active_rules": [
    {
      "id": "...", "name": "...", "rule_type": "...", "scope": "...",
      "target_agent": "...", "priority": 100, "instruction": "...", "condition": {...}
    }
  ],
  "mandatory_skill_ids": ["..."],
  "skill_retriever_config": {
    "org_id": "<uuid>",
    "top_k": 3,
    "min_similarity": 0.35,
    "filter_types_per_agent": { "EXTRACTION": ["VOCABULARY","FEW_SHOT_EXAMPLE","DOMAIN_KNOWLEDGE"], "PATTERN": ["ARCHETYPE"], "VALIDATION": ["DOMAIN_KNOWLEDGE"] }
  }
}
```

### Service API

`ContextLoaderService.loadFor(sessionId): ContextPayload` — internal service called from BE-10.
- Delegates to BE-19 `RulesService.listActiveRulesForContext(orgId, sessionId)` for rules (sorted by priority desc).
- Delegates to BE-20 `SkillsService.listMandatorySkills(orgId)` for mandatory skills (ACTOR_CATALOG always in).
- Retrieves session workflow context embedding: calls FastAPI `POST /internal/embed` with a concatenation of the latest user message + workflow title — this becomes the query vector for the top-K skill retrieval. BE-25 attaches this as `context_embedding` in the payload OR delegates to FastAPI by passing top-K config only (recommended for this issue — FastAPI runs the pgvector query using the retriever config).
- Returns the assembled payload.

### Rule conflict broadcast

If `RulesService.listActiveRulesForContext` returns any pair tagged as conflicting (BE-19 detects conflicts on activate but also on context resolve), emit WS `rules.conflict.detected` to `workflow:{id}` via BE-17 AND write an AuditLog row with `event_type='RULE_CONFLICT_RESOLVED_BY_PRIORITY'`.

### Subscriber — application records from FastAPI

FastAPI reports per-agent rule/skill applications via `ai.tasks.progress` events with a new optional field (extend BE-10's contract):
```
applications?: {
  rules?: [{ rule_id, rule_version, triggered, impact_description }],
  skills?: [{ skill_id, retrieval_rank, similarity_score, injected_tokens, was_mandatory }]
}
```

When BE-24 persists the `AgentExecution`, this module is called to also insert:
- One `RuleApplication` row per rule entry (FK `agent_execution_id`)
- One `SkillApplication` row per skill entry (FK `agent_execution_id`)

Also increments `Skill.usage_count` for each retrieved skill.

### Admin introspection endpoints

- `POST /admin/context/preview` — body `{ session_id }`, admin-only; returns the exact payload that would be published by `ai.context.load` RIGHT NOW. For debugging prompt engineering.

**Security Rules:**
- Rule instructions and skill content can contain org-sensitive data — never log the full payload at `info`; log a hash/preview only
- `/admin/context/preview` is admin-only and rate-limited (10 req/min)
- Always validate `session_id.org_id == caller.org_id` before assembling

**Acceptance Criteria:**
- Each `ai.tasks.new` publication is preceded by exactly one `ai.context.load` publication with the same `correlation_id`
- `active_rules` excludes rules where `is_active=false`
- Mandatory ACTOR_CATALOG skills are always included in `mandatory_skill_ids` when present for the org
- For every agent execution that carries `applications`, the corresponding `RuleApplication` + `SkillApplication` rows exist in DB after BE-24 completes
- `Skill.usage_count` increments correctly across a run
- Rule-conflict pairs emit `rules.conflict.detected` WS event within 500ms

**Testing Requirements:**
- Integration: spin up a session with 3 active rules (one WORKFLOW-scoped, two ORG-scoped) → `ai.context.load` carries all 3, sorted by priority desc
- Integration: simulate a progress event with `applications.skills=[{...}]` → `SkillApplication` row inserted + `Skill.usage_count` +1
- Unit: preview endpoint returns correct payload for a session with overrides
- Unit: org isolation — attempt to load context for a cross-org session → 404

**Dependencies:** BE-01, BE-10, BE-19 (rules service), BE-20 (skills service), BE-24 (AgentExecution upsert)

---

## BE-26 — Reconciliation Finalizer: Merged Graph → New WorkflowVersion
**State:** `OPEN`
**Labels:** `backend` `priority:medium` `scope:divergence`

**Description:**
A cross-module coordinator that turns a completed reconciliation (BE-18) into a new `WorkflowVersion` (BE-11), a `RECONCILED` `WorkflowGraphSnapshot` (BE-23), updated session state (BE-09), and a `workflow.events.updated` publication (BE-10). Implements FR-12.8.

Called by BE-18's `POST /divergence-reports/:id/finalize-reconciliation`. Broken out as its own issue because the transaction spans 5 modules and needs tight ownership.

**Tasks:**

### Service entry point

`ReconciliationFinalizerService.finalize(divergenceReportId, callerUserId): { newVersionId, newSnapshotId }`

Transaction body (single DB transaction where possible):

1. **Preconditions**
   - Load `DivergenceReport` — must be `status='COMPLETED'`.
   - Every `DivergencePoint` with `severity='CRITICAL'` must be `resolved=true` (either via explicit action or explicit SKIP — SKIP is allowed only if the `ReconciliationAction.notes` field is non-empty with justification).
   - If any CRITICAL unresolved → throw `ReconciliationBlocked` → 409 with unresolved count.

2. **Build merged graph**
   - Start from graph A (typically INTENT) or graph B (typically GENERATED) depending on which had more `ACCEPT_*` actions overall (tiebreak: prefer GENERATED as the more recent artifact).
   - Walk every `ReconciliationAction` for this report:
     - `ACCEPT_A` / `ACCEPT_B` — adopt the node/edge from the chosen graph
     - `AI_SUGGEST_APPLY` — parse the stored suggestion into node/edge delta; apply
     - `MANUAL_EDIT` — apply the stored `manual_edit_payload` delta
     - `SKIP` — leave current state as-is
   - Result: `(merged_nodes[], merged_edges[])`

3. **Create RECONCILED snapshot** via BE-23:
   - `GraphSnapshotService.snapshotReconciled(workflowId, sessionId, reportId, nodes, edges, callerUserId)`

4. **Derive `elements_json`** — BE-11's canonical shape — from the merged graph (reverse mapping of the Elsa parser in BE-23).

5. **Create `WorkflowVersion`** via BE-11's `WorkflowVersionsService.create`:
   - `elements_json = derived`
   - `confidence_score` = carried over from the latest version (reconciliation is human-validated; do not recompute)
   - `created_by = callerUserId`

6. **Update Session** via BE-09 `SessionService.setStatus(sessionId, 'DRAFT_READY')`
   - The session was in `NEEDS_RECONCILIATION` when this was called; blocking that transition is already covered by BE-09's FSM amendments.

7. **Publish `workflow.events.updated`** via BE-10 `publishWorkflowUpdated(workflowId, newVersion, changedElements, source='reconciliation', correlationId)`

8. **AuditLog entries** (multiple, all in the same txn):
   - `RECONCILIATION_FINALIZED` — before: `{ divergence_report_id, unresolved_critical: 0 }`, after: `{ new_version_id, new_snapshot_id }`, `actor_type='user'`
   - One `WORKFLOW_VERSION_CREATED` via BE-11's normal path (already audit-logged there — don't double)

9. **WS fanout** via BE-17:
   - `divergence.report.updated { report_id, finalized: true }`
   - `workflow.updated { version_number, changed_elements, source:'reconciliation' }`
   - `session.state { session_id, status:'DRAFT_READY' }`

### Rollback on failure

If any step in the transaction fails:
- Do NOT create the snapshot nor the version.
- AuditLog `RECONCILIATION_FAILED` with the error message.
- Return 500 to the caller (BE-18's finalize endpoint).

### Manual edit payload schema

Validated by Joi/class-validator at the point of reconcile submission (BE-18 already) AND re-validated here before applying:
```json
{
  "operation": "REPLACE_NODE" | "ADD_NODE" | "REMOVE_NODE" | "REPLACE_EDGE" | "ADD_EDGE" | "REMOVE_EDGE",
  "node"?: { id, type, label, actor, properties },
  "edge"?: { from_node_id, to_node_id, type, condition_label },
  "target_element_id"?: "..."
}
```

**Security Rules:**
- `callerUserId` MUST have role `process_owner` or `admin` (enforced at BE-18 endpoint level; defense-in-depth here with a secondary check)
- Cross-org: validate the report's workflow belongs to `callerUser.orgId`
- Rollback on failure MUST NOT leak partial state — use a single transaction or compensating inserts, never a half-done version row

**Acceptance Criteria:**
- Finalize with all CRITICAL resolved → new version created, RECONCILED snapshot created, session flipped to DRAFT_READY
- Finalize with 1 unresolved CRITICAL → 409 `RECONCILIATION_BLOCKED`, no rows created
- All 4 WS events emitted in order within 1s
- AuditLog has `RECONCILIATION_FINALIZED` + `WORKFLOW_VERSION_CREATED` rows
- Failure mid-transaction leaves no orphan rows (verified by counting rows before/after a forced failure)

**Testing Requirements:**
- Unit: each ReconciliationAction type produces correct delta on a toy graph
- Unit: CRITICAL-blocking check — fails fast without touching other modules
- Integration: happy path produces the expected rows across 5 tables in one transaction
- Integration: injected failure at step 5 rolls back step 3's snapshot insert

**Dependencies:** BE-09, BE-10, BE-11, BE-17, BE-18, BE-23

---

## BE-27 — Global Cross-Cutting: Throttler Tuning, Org-Scope Guard, Logging, Swagger, Helmet
**State:** `OPEN`
**Labels:** `backend` `priority:high` `scope:infra`

**Description:**
Enforce the non-functional security and logging requirements globally across all routes: rate limiting per IP + per user, org-scope guard as a global interceptor, structured request logging with correlation id, global exception filter with standardized envelope, and Swagger/OpenAPI auto-generation.

Some of these concerns are mentioned across BE-02, BE-14, BE-15, BE-22 — this issue consolidates them into one deliverable and locks down the contract. Needed so that the hackathon demo cannot be trivially DoS'd and so FE + FastAPI have a stable, self-describing API.

**Tasks:**

### Rate limiting

- Global `@nestjs/throttler` configured in BE-22 — THIS issue tunes it:
  - Anonymous routes: 30 req/min per IP
  - Authenticated routes: 200 req/min per `user_id`
  - `POST /auth/login`, `POST /auth/refresh`, `POST /auth/forgot-password`: 5 req/min per IP (override)
  - `POST /auth/register`: 3 req/min per IP
  - `POST /documents/upload`: 20 req/min per user
  - `GET /health`: unlimited (monitoring endpoint)
- Throttler uses IP + user_id composite key.
- Returns standard `429 Too Many Requests` via the envelope from BE-22.

### Org-scope interceptor (global)

Already scaffolded in BE-22; THIS issue enforces it:
- Every non-public, non-admin-only controller method MUST have an implicit org filter applied.
- Audit-by-reflection: at boot, walk every controller and assert that controllers whose entities include `org_id` have `@UseGuards(JwtAuthGuard)` + `@OrgScoped()` decorator on the class OR each method. Fail fast if not.

### Correlation ID + structured logging

- Every log line MUST include `correlationId` when inside a request/NATS scope (via `AsyncLocalStorage` from BE-22).
- Pino redact list: `['req.headers.authorization','req.headers.cookie','*.password','*.password_hash','*.token','*.refresh_token','*.access_token','*.secret']`.
- Log sampling: `LOG_SAMPLE_RATE=1.0` by default; tunable via env to downsample WS-heavy flows in prod.
- Request log fields (mandatory): `method, path, statusCode, duration_ms, user_id, org_id, correlationId, user_agent, ip, contentLength`.

### Swagger / OpenAPI

- `@nestjs/swagger` mounted at `/docs` in non-production; OpenAPI JSON at `/docs-json`.
- Every DTO uses `@ApiProperty`; every controller method uses `@ApiOperation`, `@ApiResponse`, `@ApiTags`, `@ApiBearerAuth` where auth is required.
- Tag grouping per scope: `auth, organizations, workflows, sessions, messages, documents, comments, audit, health, agents, pipeline, rules, skills, divergence, graph-snapshots`.
- Include `x-correlation-id` response header in all schemas.

### Helmet + CSP

- Helmet with default CSP disabled in dev (for Swagger UI), enabled in prod.
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` in prod.
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`.

### Global exception filter (confirm)

- Standardized envelope (see BE-22).
- On unhandled exceptions: log at `error` with stack, return 500 with a generic message; never leak internal stack traces to the client in prod.
- Known error classes mapped: `EntityNotFoundError` → 404; `QueryFailedError` with unique violation → 409; Joi validation errors → 400.

**Security Rules:**
- Throttler storage: in-memory is OK for hackathon; document that production should swap to Redis.
- Do NOT log request bodies for `POST /auth/*` endpoints (they contain passwords).
- Do NOT log the `Authorization` header.
- Do NOT expose `X-Powered-By: Express` — disable via Helmet.

**Acceptance Criteria:**
- Hammering `POST /auth/login` from a single IP → 6th request within a minute returns 429 with envelope
- Boot-time check fails if any org-scoped controller lacks the required guard stack
- Every structured log line has `correlationId` when inside a request
- Swagger UI at `/docs` in dev renders ALL endpoints with correct tags and auth indicators
- `/docs-json` response validates as OpenAPI 3.0
- Password in a failed-login request body does NOT appear in Pino output (redacted)
- Unhandled `ReferenceError` in a controller → 500 with generic body, full stack only in logs

**Testing Requirements:**
- Integration: 10 rapid `POST /auth/login` → observe 429 at request 6
- Unit: Pino redact test with a password-in-body payload
- Unit: exception filter output matches envelope for 400, 401, 403, 404, 409, 422, 429, 500
- Static check: a test script opens `/docs-json` and asserts every path has ≥1 `ApiResponse` entry

**Dependencies:** BE-22 (most of this is tuning what BE-22 scaffolded)
