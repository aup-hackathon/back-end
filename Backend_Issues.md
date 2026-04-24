# 🟦 BACKEND ISSUES (NestJS)

---

## BE-01 — Database Schema, Migrations & pgvector Setup
**Labels:** `priority:critical` `scope:infra` `backend`

**Description:**
Bootstrap the full PostgreSQL schema using TypeORM migrations. Install and enable the `pgvector` extension. Create all core tables from §8.1, §8.3, §8.6, §8.7 of the spec. This is a prerequisite for every other backend issue.

**Tasks:**
- Enable `pgvector` extension on the Postgres instance (`CREATE EXTENSION IF NOT EXISTS vector`)
- Write TypeORM migration for §8.1 tables: `Organization`, `User`, `LoginHistory`, `RefreshToken`, `Workflow`, `WorkflowVersion`, `Session`, `Message`, `Document`, `Comment`, `AuditLog`, `KGNode`, `KGEdge`, `ProcessPattern`
- Write TypeORM migration for §8.3 tables: `AgentDefinition`, `PipelineExecution`, `AgentExecution`, `AgentLog`, `AgentConfigOverride`
- Write TypeORM migration for §8.6 tables: `WorkflowGraphSnapshot`, `DivergenceReport`, `DivergencePoint`, `ReconciliationAction`
- Write TypeORM migration for §8.7 tables: `Rule`, `RuleApplication`, `Skill`, `SkillApplication`
- Create all indexes listed in §8.2, §8.5, §8.6, §8.8 including IVFFlat indexes for vector columns
- Seed script: insert default `AgentDefinition` rows for all 8 agent types with their default configs from §F9

**Security Rules:**
- DB user used by NestJS must have no `DROP TABLE` or `ALTER TABLE` privileges — only DML
- All credentials must come from environment variables, never hardcoded

**Acceptance Criteria:**
- `npm run migration:run` completes without errors on a fresh Postgres 16 instance
- All vector columns accept `vector(768)` typed data
- IVFFlat indexes are created and can be queried with `<=>` operator
- Seed script populates all 8 `AgentDefinition` records with correct default configs

**Testing Requirements:**
- Run migration on a clean DB and verify all tables exist with correct column types
- Verify the IVFFlat index with a sample cosine similarity query against `KGNode`

**Dependencies:** None — this is the foundation

---

## BE-02 — AuthModule: Registration, Login & JWT Issuance
**Labels:** `priority:critical` `scope:auth` `backend`

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
**Labels:** `priority:critical` `scope:auth` `backend`

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
**Labels:** `priority:high` `scope:auth` `backend`

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
**Labels:** `priority:high` `scope:auth` `backend`

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
**Labels:** `priority:high` `scope:documents` `backend`

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
**Labels:** `priority:high` `scope:documents` `backend`

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
**Labels:** `priority:high` `scope:messages` `backend`

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
**Labels:** `priority:critical` `scope:chat` `backend`

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

## BE-10 — AIGatewayModule: NATS Publisher & Result Subscriber
**Labels:** `priority:critical` `scope:ai` `backend`

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

## BE-11 — WorkflowModule: CRUD, Versioning & Search
**Labels:** `priority:critical` `scope:workflow` `backend`

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

## BE-12 — WorkflowModule: Export Endpoints (Elsa, BPMN, PDF)
**Labels:** `priority:medium` `scope:workflow` `backend`

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

## BE-13 — CommentModule: CRUD, Threading & AI Injection
**Labels:** `priority:high` `scope:review` `backend`

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

## BE-14 — AuditModule: Immutable Log & Export
**Labels:** `priority:high` `scope:audit` `backend`

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
**Labels:** `priority:medium` `scope:infra` `backend`

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

## BE-16 — AgentModule: Registry, Pipeline Execution & Retry
**Labels:** `priority:high` `scope:agents` `backend`

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

## BE-17 — WebSocket Gateway: Real-Time Event Push
**Labels:** `priority:critical` `scope:infra` `backend`

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

## BE-18 — DivergenceModule: Graph Comparison & Reconciliation
**Labels:** `priority:medium` `scope:divergence` `backend`

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

## BE-19 — RulesModule: CRUD, Validation & Conflict Detection
**Labels:** `priority:medium` `scope:rules` `backend`

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

**Dependencies:** BE-01, BE-09

---

## BE-20 — SkillsModule: CRUD, Embedding Generation & Retrieval
**Labels:** `priority:medium` `scope:skills` `backend`

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
