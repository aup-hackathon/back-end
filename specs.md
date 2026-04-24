# FlowForge — Product Specification Document
**Hackathon Project | Version 2.0**
*From Unstructured Business Knowledge to Executable Workflows*

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Proposed Solution](#3-proposed-solution)
4. [System Overview & Architecture](#4-system-overview--architecture)
5. [Feature Specifications](#5-feature-specifications)
   - F1: Authentication & Authorization Management
   - F2: Document Management
   - F3: Messages Management
   - F4: Chat & AI Elicitation Management
   - F5: Workflow Management & Diagram Preview
   - F6: Review & Comments Management
   - F7: Audit Management
   - F8: System Health & Observability
   - F9: AI Agent Generation & Pipeline Orchestration Management
6. [AI Feature Specifications](#6-ai-feature-specifications)
   - AI-F1: Execution Mode Selection (Auto vs Interactive)
   - AI-F2: Multimodal Input Processing
   - AI-F3: Intelligent Extraction Engine
   - AI-F4: Process Pattern Recognition & Template Matching
   - AI-F5: Knowledge Graph Construction & Context Management
   - AI-F6: Gap Detection & Confidence Scoring
   - AI-F7: Active Learning & Smart Q&A (Interactive Mode)
   - AI-F8: Chunking & Hierarchical Summarization
   - AI-F9: Workflow Validation & Plain-Language Summary
   - AI-F10: Workflow Export & Format Conversion
   - AI-F11: Comment Injection & Re-processing
7. [AI Architecture — Multi-Agent Pipeline](#7-ai-architecture--multi-agent-pipeline)
8. [Data Models](#8-data-models)
9. [Tech Stack](#9-tech-stack)
10. [Non-Functional Requirements](#10-non-functional-requirements)
11. [Out of Scope](#11-out-of-scope)
12. [Glossary](#12-glossary)

> **v2.1 addition:** Section 5 now includes F9 — AI Agent Generation & Pipeline Orchestration Management, and Section 8 now includes §8.3 AI Agent Data Models and §8.4 Entity-Relationship Overview.

---

## 1. Executive Summary

**FlowForge** is an AI-powered platform that transforms unstructured business knowledge — expressed as plain text, documents, sketches, meeting notes, or voice transcripts — into structured, executable workflows ready for deployment on **Elsa Workflows 3.x**.

The core problem it solves is the painful, slow, and error-prone gap between how business experts describe their processes and how those processes need to be formally represented for digital execution. FlowForge closes that gap through:

- A **multi-agent AI pipeline** (FastAPI + Ollama) that extracts, structures, and validates process knowledge entirely on-premise
- Two **execution modes** — Auto (fully autonomous) and Interactive (conversational) — so users choose how much control they want
- A **multimodal input processor** that accepts text, documents, images, and audio
- A **NATS JetStream** message bus connecting the NestJS backend and the FastAPI AI layer for reliable async processing
- A **pgvector**-powered semantic search for pattern matching and knowledge retrieval
- A **human-in-the-loop validation layer** through structured review, comments, and live diagram preview

Target users are **Business Analysts**, **Process Owners**, and **IT teams** in organizations undergoing digital transformation, regardless of industry or domain.

---

## 2. Problem Statement

### 2.1 Context

In most organizations, business processes exist long before they are ever formally captured in a system. They live in people's heads, in emails, in whiteboard photos, in Word documents, and in verbal "that's just how we do it" explanations. When a company decides to digitize a process, a human intermediary — typically a Business Analyst — must extract all of that scattered, informal knowledge and translate it into a formal workflow that software can execute.

This translation step is:
- **Slow**: 3–8 weeks per process on average
- **Error-prone**: Important edge cases and implicit rules are regularly missed
- **Inconsistent**: Different analysts produce different workflows from the same description
- **Expensive**: Requires skilled BA resources for what is largely a structural transformation task
- **Lossy**: Information is systematically lost between the business description and the final model

### 2.2 Core Challenges

| # | Challenge | Description |
|---|---|---|
| C1 | **Unstructured Input** | Business needs are expressed informally, vaguely, and non-linearly |
| C2 | **Multi-Source Information** | Relevant process knowledge is scattered across text, images, audio, and documents |
| C3 | **Implicit Knowledge** | Critical steps, rules, and exceptions are assumed and never stated |
| C4 | **Element Identification** | Correctly classifying actors, tasks, decisions, sequences, and rules from raw text |
| C5 | **Interpretation Divergence** | The same description can produce multiple different valid workflows |
| C6 | **Domain Genericity** | The solution must work for any business domain without domain-specific training |
| C7 | **Workflow Validation** | The generated workflow must be verifiable by people who cannot read formal diagrams |

### 2.3 Problem Statement

> How do we reliably transform any unstructured, incomplete, and informal description of a business process — regardless of its format, domain, or source — into a structured, validated, and executable workflow, while minimizing information loss, interpretation errors, and the burden on non-technical business experts?

---

## 3. Proposed Solution

### 3.1 Solution Philosophy

FlowForge is built on three core principles:

1. **Meet users where they are** — accept any input format without requiring the user to pre-structure their knowledge
2. **Let the user choose their level of involvement** — Auto mode for speed, Interactive mode for control
3. **Validate in the user's language** — always translate the workflow back into plain language and a visual diagram for validation, never require the user to read raw technical output

### 3.2 How the Approach Solves Each Challenge

| Challenge | Mechanism | How |
|---|---|---|
| C1 — Unstructured Input | LLM Structured Prompting (Ollama) | Normalizes informal language into structured JSON regardless of input quality |
| C2 — Multi-Source Information | Multimodal Preprocessor + pgvector Merging | Each source independently processed then semantically merged onto a shared scaffold |
| C3 — Implicit Knowledge | Pattern Library + Active Q&A (Interactive) / Inference (Auto) | Archetypes encode complete process expectations; gaps trigger questions or smart defaults |
| C4 — Element Identification | Structured Prompt Classification | LLM classifies every element (actor/task/decision/rule) explicitly with confidence scores |
| C5 — Interpretation Divergence | Pattern Matching + Decision Log | Patterns constrain valid interpretations; all choices are recorded in an immutable audit trail |
| C6 — Domain Genericity | Domain-Agnostic Structural Patterns + pgvector similarity | Patterns operate at structural level; vocabulary is just slot values filled from input |
| C7 — Workflow Validation | Plain-Language Summary + Visual Diagram Preview | Workflow translated to prose and rendered as interactive diagram for human confirmation |

### 3.3 High-Level User Journey

```
User selects execution mode: AUTO or INTERACTIVE
         |
User uploads documents or types description
         |
-- AUTO MODE -------------------------------------------------------
|  AI runs the full pipeline without interruption                  |
|  Infers all gaps using pattern defaults                          |
|  Produces complete draft workflow                                |
|  Notifies user when ready for review                             |
--------------------------------------------------------------------
         OR
-- INTERACTIVE MODE ------------------------------------------------
|  AI produces a first draft                                       |
|  AI surfaces gaps -> asks targeted questions                     |
|  User answers -> AI updates workflow in real time                |
|  Loop continues until confidence threshold met                   |
--------------------------------------------------------------------
         |
User sees: Plain-language summary + Visual diagram preview
         |
User reviews, adds comments, annotates diagram elements
         |
Comments can be injected back as AI prompts for refinement
         |
User validates and approves the workflow
         |
Workflow exported to Elsa Workflows 3.x format
         |
Full audit trail + decision log generated
```

---

## 4. System Overview & Architecture

### 4.1 Architecture Style

FlowForge uses a **service-oriented modular architecture** with three distinct runtime services communicating over **NATS JetStream**:

- **Next.js Frontend** — UI layer, server-side rendering, real-time updates
- **NestJS Backend** — REST API, business logic, data persistence, WebSocket gateway
- **FastAPI AI Service** — Multi-agent pipeline, LLM orchestration, multimodal processing

All services are containerized with Docker and orchestrated via Docker Compose.

### 4.2 System Architecture Diagram

```
+----------------------------------------------------------------------+
|                        FRONTEND (Next.js)                            |
|                                                                      |
|  Auth | Documents | Messages | Chat | Workflows | Reviews | Audit    |
|  Diagram Preview | Health Dashboard | Notification Center            |
+------------------------------------+---------------------------------+
                                     |  HTTPS REST + WebSocket
+------------------------------------v---------------------------------+
|                         BACKEND (NestJS)                             |
|                                                                      |
|  AuthModule        DocumentModule      MessageModule                 |
|  ChatModule        WorkflowModule      CommentModule                 |
|  AuditModule       AIGatewayModule     HealthModule                  |
|                                                                      |
|  WebSocket Gateway (real-time events to frontend)                    |
|  Swagger / OpenAPI  |  Global Exception Filter                       |
|  Rate Limiter       |  Request Logger (Pino)                         |
+----------+------------------------------------------+---------------+
           |                                          |
           |  NATS JetStream (async messaging)        |  TypeORM
           |                                          |
+----------v------------------+    +------------------v--------------+
|    AI SERVICE (FastAPI)     |    |           DATA LAYER            |
|                             |    |                                 |
|  Orchestrator               |    |  PostgreSQL + pgvector          |
|  +-- Intake Agent           |    |  (core data + embeddings +      |
|  +-- Extraction Agent       |    |   knowledge graph nodes +       |
|  +-- Pattern Agent          |    |   vector similarity search)     |
|  +-- Gap Detection Agent    |    |                                 |
|  +-- Q&A Agent              |    |  MinIO (S3-compatible)          |
|  +-- Validation Agent       |    |  (document file storage)        |
|  +-- Export Agent           |    |                                 |
|                             |    +---------------------------------+
|  Ollama (local LLM server)  |
|  +-- Mistral 7B Instruct    |    +---------------------------------+
|  +-- Whisper (STT)          |    |     ELSA WORKFLOWS 3.x          |
|                             |    |  (Workflow Execution Engine)    |
|  Multimodal Preprocessor    |    |  Receives exported definitions  |
|  +-- OCR (Tesseract)        |    +---------------------------------+
|  +-- PDF Extractor          |
|  +-- Image Shape Detector   |    +---------------------------------+
+-----------------------------+    |  NATS JetStream (Message Bus)  |
                                   |  +-- ai.tasks.*                |
                                   |  +-- workflow.events.*         |
                                   |  +-- session.events.*          |
                                   |  +-- system.health.*           |
                                   |  Monitoring UI: port 8222      |
                                   +---------------------------------+
```

### 4.3 NATS JetStream — Communication Layer

NATS JetStream is the nervous system of FlowForge. It decouples the NestJS backend from the FastAPI AI service and enables reliable, persistent, async message delivery.

**Why NATS JetStream instead of direct HTTP calls?**
- AI processing is inherently async and long-running — a direct HTTP call would time out
- JetStream provides **durable subscriptions** — if the AI service restarts mid-task, it picks up where it left off
- **At-least-once delivery** guarantees no task is silently lost
- **Replay capability** — re-process a message without re-submitting from the frontend
- **Fan-out** — multiple consumers can react to the same event (e.g., both the WebSocket gateway and the audit logger listen to `workflow.events.updated`)

**Key Subjects (Topics)**

| Subject | Publisher | Subscriber | Payload |
|---|---|---|---|
| `ai.tasks.new` | NestJS AIGateway | FastAPI Orchestrator | `{ session_id, task_type, input, mode }` |
| `ai.tasks.result` | FastAPI Orchestrator | NestJS AIGateway | `{ session_id, workflow_json, confidence, questions[] }` |
| `ai.tasks.progress` | FastAPI Agents | NestJS WebSocket Gateway | `{ session_id, agent_name, status, progress_pct }` |
| `workflow.events.updated` | NestJS WorkflowModule | Audit Logger + WS Gateway | `{ workflow_id, version, changed_elements[] }` |
| `session.events.finalized` | NestJS ChatModule | Export queue + Audit | `{ session_id, workflow_id }` |
| `system.health.ping` | All services | NATS Monitor | `{ service, status, timestamp }` |

### 4.4 pgvector — Semantic Layer

pgvector extends PostgreSQL with vector operations, eliminating the need for a separate vector database.

**How it's used in FlowForge:**

| Use Case | Description |
|---|---|
| **Pattern Matching** | Each process archetype is stored as an embedding. When a new process is described, its embedding is compared against all patterns via cosine similarity to find the best-matching archetype |
| **Semantic Deduplication** | When merging elements from multiple sources, embeddings detect semantically identical elements with different names ("boss" ≈ "manager" ≈ "supervisor") |
| **Workflow Search** | Users can search existing workflows by meaning, not just keywords |
| **RAG for Context** | Relevant chunks from previously processed documents are retrieved by semantic similarity and injected into LLM prompts as additional context |

---

## 5. Feature Specifications

---

### F1 — Authentication & Authorization Management

#### Purpose
Secure, role-based access to the platform. Every workflow belongs to an organization; every user has a defined role with scoped permissions.

#### User Roles

| Role | Permissions |
|---|---|
| **Admin** | Full access — manage users, view all workflows, system configuration |
| **Process Owner** | Create and manage their own workflows, validate AI outputs, approve for export |
| **Business Analyst** | Create workflows, run AI elicitation sessions, manage documents |
| **Reviewer** | View assigned workflows, add comments and annotations, approve elements |
| **Viewer** | Read-only access to shared workflows and diagrams |

#### Functional Requirements

- FR-1.1: User registration (email + password) with email verification
- FR-1.2: JWT-based session management — short-lived access token (15min) + long-lived refresh token (7 days)
- FR-1.3: Refresh token rotation — each use issues a new refresh token; old one is invalidated immediately
- FR-1.4: Role-based access control (RBAC) enforced at the route guard level in NestJS
- FR-1.5: Multi-tenant support — each organization's data is fully isolated (org_id scoping on all queries)
- FR-1.6: Password reset via time-limited, single-use email token
- FR-1.7: Login history tracking (IP, user agent, timestamp, success/failure) per user
- FR-1.8: Account lockout after 5 consecutive failed login attempts (15-minute cooldown)
- FR-1.9: Secure HTTP-only cookie storage for refresh tokens (not localStorage)
- FR-1.10: Organization management — admin can invite users, assign roles, revoke access

#### API Endpoints

```
POST   /auth/register
POST   /auth/verify-email
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout
GET    /auth/me
POST   /auth/forgot-password
POST   /auth/reset-password
GET    /auth/login-history
POST   /org/invite
PATCH  /org/users/:id/role
DELETE /org/users/:id
```

---

### F2 — Document Management

#### Purpose
Allow users to upload any type of source document describing a business process. The system ingests, preprocesses, and makes it available to the AI pipeline as normalized, structured text.

#### Supported Input Formats

| Format | Preprocessing Method |
|---|---|
| Plain text (.txt) | Direct ingestion + language detection |
| Word document (.docx) | Text + heading structure extraction |
| PDF (digital) | Text extraction with layout awareness |
| PDF (scanned) | OCR via Tesseract |
| Image (.png, .jpg, .webp) | OCR for text regions + shape detection for flow elements |
| Audio (.mp3, .wav, .m4a) | Whisper speech-to-text + speaker diarization |
| Email thread (pasted) | Thread parsing + sender/role normalization |
| Markdown (.md) | Direct ingestion with structure preservation |

#### Functional Requirements

- FR-2.1: Upload single or multiple files per session via drag-and-drop or file picker
- FR-2.2: Real-time upload progress bar + per-file preprocessing status indicator
- FR-2.3: Extracted text preview for user review and correction before AI processing begins
- FR-2.4: Users can annotate, redact, or correct the extracted text before submitting to the pipeline
- FR-2.5: Tag documents by source type (procedure manual, interview transcript, email, sketch, etc.)
- FR-2.6: Store original file (MinIO) + extracted/cleaned text (PostgreSQL) side by side
- FR-2.7: File validation — MIME type check, size limit (50MB per file, 200MB per session), malformed file rejection
- FR-2.8: Link multiple documents to a single workflow session
- FR-2.9: Document versioning — re-uploading a corrected version creates a new version without deleting the original
- FR-2.10: Re-process a document — trigger preprocessing again on an existing document after user corrections

#### API Endpoints

```
POST   /documents/upload
GET    /documents/:id
GET    /documents/:id/extracted-text
PATCH  /documents/:id/extracted-text
DELETE /documents/:id
GET    /workflows/:workflowId/documents
POST   /documents/:id/reprocess
```

---

### F3 — Messages Management

#### Purpose
Centralized storage, retrieval, and management of all messages exchanged within an elicitation session — both AI-generated (questions, responses, summaries, confidence reports) and user messages (inputs, answers, corrections). The Messages module is the source of truth for session history and serves as the AI pipeline's context window.

#### Message Types

| Type | Emitted By | Description |
|---|---|---|
| `user_input` | User | Free-form description, answer to a question, or correction |
| `ai_question` | AI (Q&A Agent) | Targeted clarification question with the targeted element identified |
| `ai_response` | AI (Extraction Agent) | Confirmation or acknowledgment after processing user input |
| `ai_summary` | AI (Validation Agent) | Plain-language workflow summary for human validation |
| `ai_update` | AI (Orchestrator) | Notification that the workflow was changed, with diff details |
| `ai_confidence_report` | AI (Gap Detection Agent) | Full list of extracted elements with their current confidence scores |
| `system_note` | System | Injected review comment being used as additional AI context |
| `system_status` | System | Pipeline progress updates (e.g., "Pattern Agent running...") |

#### Functional Requirements

- FR-3.1: Every message is persisted to PostgreSQL immediately upon creation — no loss on refresh or reconnect
- FR-3.2: Messages are ordered by `created_at` and grouped by session
- FR-3.3: Messages carry a `metadata` JSON field for structured data (confidence scores, targeted element IDs, diff objects)
- FR-3.4: Full message history is loadable on session resume without re-processing
- FR-3.5: Messages are the primary context window source for the AI — the pipeline reads the last N messages as history on each turn
- FR-3.6: Cursor-based pagination for long sessions (no offset-based pagination)
- FR-3.7: Messages are immutable — only sessions can be archived; individual messages cannot be deleted
- FR-3.8: Full-text search across messages within a session
- FR-3.9: Filter messages by type (e.g., show only AI questions, or only user answers)
- FR-3.10: Export the full message history as a readable PDF transcript

#### API Endpoints

```
GET    /sessions/:id/messages
GET    /sessions/:id/messages?type=ai_question
GET    /sessions/:id/messages?search=approval
POST   /sessions/:id/messages
GET    /sessions/:id/messages/export
GET    /messages/:id
```

---

### F4 — Chat & AI Elicitation Management

#### Purpose
The primary interface between the user and the AI pipeline. The Chat module renders the message history in real time and handles all user interactions during the elicitation session — including mode selection, session lifecycle, and live pipeline progress updates.

#### Execution Modes (see AI-F1 for full specification)

| Mode | Behavior |
|---|---|
| **Auto** | AI runs the full pipeline end-to-end without interruption. Gaps are inferred from patterns. User is notified when the draft is ready. |
| **Interactive** | AI generates a draft, enters a Q&A loop, and updates the workflow after each user answer. Loop ends when confidence threshold is met or user finalizes manually. |

Users can switch modes at any point during a session.

#### Session Lifecycle (FSM)

```
CREATED -> AWAITING_INPUT -> PROCESSING ->
  AUTO:        -> DRAFT_READY -> IN_REVIEW -> VALIDATED -> EXPORTED
  INTERACTIVE: -> IN_ELICITATION <-> PROCESSING -> DRAFT_READY -> IN_REVIEW -> VALIDATED -> EXPORTED
```

#### Functional Requirements

- FR-4.1: Mode selection toggle (Auto / Interactive) at session start, switchable anytime mid-session
- FR-4.2: Real-time streaming of AI responses via Server-Sent Events (SSE)
- FR-4.3: Live pipeline progress indicator — which agent is running + completion percentage, delivered via NATS -> WebSocket -> frontend
- FR-4.4: Inline confidence badges on extracted elements, visible alongside the chat
- FR-4.5: "Skip this question" and "Use a default" options for every AI question in Interactive mode
- FR-4.6: Ability to correct a previous answer in free text — AI reprocesses from that specific point forward
- FR-4.7: Manual finalization button: "This is good enough" — bypasses the confidence threshold
- FR-4.8: Overall confidence score displayed as a progress bar throughout the session
- FR-4.9: Session resume — reopening restores full message history and workflow state without re-running the pipeline
- FR-4.10: Chat input accepts free text, file uploads, and pasted content

#### API Endpoints

```
POST   /sessions
GET    /sessions/:id
PATCH  /sessions/:id/mode
POST   /sessions/:id/finalize
GET    /sessions/:id/workflow-state
GET    /sessions/:id/progress
DELETE /sessions/:id
```

---

### F5 — Workflow Management & Diagram Preview

#### Purpose
The central hub where generated workflows are stored, managed, versioned, previewed visually, and exported to Elsa Workflows 3.x. The visual diagram preview is a first-class feature — the primary validation surface for non-technical users.

#### Workflow States (FSM)

```
DRAFT -> IN_ELICITATION -> PENDING_REVIEW -> VALIDATED -> EXPORTED -> ARCHIVED
               ^__________________________|
                       (revision loop)
```

| State | Description |
|---|---|
| `DRAFT` | Created, no AI processing started |
| `IN_ELICITATION` | Active session in progress (Auto or Interactive) |
| `PENDING_REVIEW` | AI processing complete, awaiting human review |
| `VALIDATED` | Reviewed and approved by the process owner |
| `EXPORTED` | Successfully exported to Elsa Workflows |
| `ARCHIVED` | Deprecated or replaced by a newer version |

#### Diagram Preview Feature

The diagram preview is a live, interactive rendering of the current workflow state. It updates in real time as the AI pipeline runs and as the user makes corrections.

| Capability | Description |
|---|---|
| **Live Update** | Diagram re-renders automatically when workflow elements are added, changed, or removed via WebSocket push |
| **Element Inspection** | Click any node to see details: confidence score, source document, AI reasoning, inferred flag |
| **Confidence Overlay** | Nodes color-coded by confidence: green (>85%), yellow (60–85%), red (<60%) |
| **Inferred Element Markers** | Elements inferred from patterns (not explicitly stated) are marked with a distinct warning icon |
| **Zoom, Pan & Minimap** | Standard diagram navigation; minimap for large workflows |
| **Fullscreen Mode** | Expand diagram to fullscreen for detailed review sessions |
| **Right-Click to Comment** | Right-click any element to add an inline comment directly from the diagram |
| **Manual Override** | Process owners can drag-reorder elements or edit properties directly on the diagram (changes logged in audit trail) |
| **Read-only vs Edit Toggle** | Reviewers see read-only; process owners and BAs can edit |

**Rendering Technology:** React Flow (highly customizable, dynamic, supports custom node types and live updates)

#### Version Control

Every significant workflow update creates a new immutable version. The full history is browseable; any two versions can be diffed.

#### Functional Requirements

- FR-5.1: Create, read, update, delete workflows with full org-level scoping
- FR-5.2: Version control — every significant change creates a new immutable version
- FR-5.3: Diff view between any two versions (added/removed/modified elements highlighted)
- FR-5.4: Live interactive diagram preview with confidence overlay, element inspection, and real-time updates
- FR-5.5: Export to Elsa Workflows 3.x JSON definition format
- FR-5.6: Export to BPMN 2.0 XML format
- FR-5.7: Export to PDF — visual diagram + plain-language description + decision log
- FR-5.8: Duplicate a workflow as a starting point for a similar process
- FR-5.9: Tag and categorize workflows (department, domain, process type, status)
- FR-5.10: Full-text and semantic search across all workflows (pgvector)
- FR-5.11: Decision log — all AI interpretation choices, traceable per element, displayed alongside the workflow
- FR-5.12: Workflow dashboard — list view with status, confidence score, last updated, assigned reviewers
- FR-5.13: Manual element editing — process owner can modify element properties directly (changes logged)

#### API Endpoints

```
POST   /workflows
GET    /workflows
GET    /workflows/:id
PATCH  /workflows/:id
DELETE /workflows/:id
GET    /workflows/:id/versions
GET    /workflows/:id/versions/:versionNumber
GET    /workflows/:id/diff/:v1/:v2
POST   /workflows/:id/export/elsa
POST   /workflows/:id/export/bpmn
POST   /workflows/:id/export/pdf
POST   /workflows/:id/duplicate
GET    /workflows/:id/decision-log
GET    /workflows/:id/diagram-data
```

---

### F6 — Review & Comments Management

#### Purpose
Enable structured human-in-the-loop validation of generated workflows. Reviewers annotate specific elements, flag issues, approve sections, and — critically — inject their comments back into the AI session as additional context for automated refinement.

#### Comment-to-Prompt Injection Flow

```
Reviewer adds comment on Decision D1 (via diagram or list view):
  "This threshold should be 1000 EUR, not 500 EUR — confirmed with CFO on 12/04"
           |
Reviewer clicks "Send to AI for Update"
           |
NestJS publishes to NATS: ai.tasks.new
  payload: { type: "comment_injection", comment_text: "...", target_element: "D1" }
           |
FastAPI Extraction Agent processes the comment as a new input
  -> Updates the specific element in the knowledge graph
  -> Recalculates confidence scores
  -> New workflow version created
           |
NestJS receives ai.tasks.result -> publishes workflow.events.updated
           |
Frontend diagram re-renders with updated Decision D1
Comment marked as: "Resolved — applied by AI at [timestamp]"
Decision log entry created: "D1 threshold corrected to 1000 EUR per reviewer note"
```

#### Functional Requirements

- FR-6.1: Add comments on the workflow as a whole, or on any specific element
- FR-6.2: Comment types: `question`, `correction`, `approval`, `suggestion`, `escalation`
- FR-6.3: Threaded replies on comments
- FR-6.4: Resolve / unresolve comments with resolution notes
- FR-6.5: Assign a comment to a specific user for resolution
- FR-6.6: Inject a comment as AI prompt — sends the comment to the AI pipeline via NATS, triggering an automatic targeted workflow update
- FR-6.7: Mark any individual workflow element as "approved" by a reviewer
- FR-6.8: Track review completion percentage (approved elements / total elements)
- FR-6.9: Email notification to assigned reviewers when workflow enters `PENDING_REVIEW`
- FR-6.10: Bulk approve — reviewer approves all remaining elements at once

#### API Endpoints

```
POST   /workflows/:id/comments
GET    /workflows/:id/comments
PATCH  /comments/:id
DELETE /comments/:id
POST   /comments/:id/reply
POST   /comments/:id/resolve
POST   /comments/:id/inject-to-ai
PATCH  /workflows/:id/elements/:elemId/approve
GET    /workflows/:id/review-progress
```

---

### F7 — Audit Management

#### Purpose
Maintain a complete, immutable audit trail of everything that happens to a workflow: every AI decision, every user action, every interpretation choice, every version change, and every export.

#### What Gets Logged

| Category | Examples |
|---|---|
| **AI Decisions** | "Matched Approval Pattern (87% confidence)", "Inferred 48h timeout from pattern default" |
| **Interpretation Choices** | "Chose dynamic role assignment over fixed approver — based on user answer to Q-3" |
| **User Actions** | "User corrected actor 'boss' to 'Department Manager'", "User skipped question Q-5" |
| **Version Changes** | "Version 3 created — 2 tasks added, 1 rule modified, threshold changed" |
| **Review Events** | "Comment injected as AI prompt by [user]", "Element T3 approved by [user]" |
| **Export Events** | "Exported to Elsa 3.x format at [timestamp] by [user]" |
| **Mode Changes** | "Execution mode switched from Auto to Interactive at [timestamp]" |
| **System Events** | "Agent [name] failed — fallback triggered", "NATS message retry #2 for task [id]" |

#### Functional Requirements

- FR-7.1: Every log entry has: `timestamp`, `actor_id`, `actor_type` (user | ai_agent | system), `event_type`, `affected_element_id`, `before_state`, `after_state`
- FR-7.2: Audit log is immutable — no entry can be deleted or modified
- FR-7.3: Filter by date range, event type, actor, element ID
- FR-7.4: Export audit log as PDF or CSV
- FR-7.5: Visual timeline view of the workflow's complete evolution
- FR-7.6: Decision log — a curated, human-readable subset showing only interpretation and inference choices

#### API Endpoints

```
GET    /workflows/:id/audit-log
GET    /workflows/:id/audit-log?type=ai_decision&from=...&to=...
GET    /workflows/:id/decision-log
POST   /workflows/:id/audit-log/export
```

---

### F8 — System Health & Observability

#### Purpose
Provide real-time visibility into the health of all system components for both the operations team and for the frontend system status page. Built using the NestJS `@nestjs/terminus` HealthModule with NATS JetStream monitoring exposed through a dedicated UI panel.

#### Components Monitored

| Component | Health Check Method |
|---|---|
| **NestJS API** | Self-check via `@nestjs/terminus` |
| **PostgreSQL** | TypeORM connection ping via `TypeOrmHealthIndicator` |
| **FastAPI AI Service** | HTTP GET to FastAPI `/health` checked from NestJS via `HttpHealthIndicator` |
| **NATS JetStream** | NATS connection status + JetStream stream availability |
| **MinIO** | S3 bucket reachability check |
| **Elsa Workflows 3.x** | HTTP ping to Elsa API endpoint |
| **Ollama** | HTTP GET to Ollama `/api/tags` — verifies LLM models are loaded and responsive |

#### NATS Monitoring UI

NATS JetStream exposes a built-in monitoring HTTP server (port 8222) providing:
- Server info, connection count, and message rates
- Per-stream stats: message count, byte size, consumer lag
- Subject-level throughput metrics
- Dead-letter queue inspection

This is embedded as a dedicated panel in the frontend admin System Status page.

#### Functional Requirements

- FR-8.1: `GET /health` on NestJS returns aggregated status of all system components
- FR-8.2: Per-component response: `{ status: "ok" | "degraded" | "down", latency_ms, details }`
- FR-8.3: Health checks run every 30 seconds; results cached to avoid hammering dependencies
- FR-8.4: Frontend System Status page (admin only) — live dashboard with green/yellow/red indicators per component
- FR-8.5: NATS Monitoring panel embedded in the admin UI — stream stats, message rates, consumer lag
- FR-8.6: WebSocket push notification to admin users when any component becomes unhealthy
- FR-8.7: Structured request logging on all NestJS routes: method, path, status code, duration, user_id
- FR-8.8: All services log in structured JSON format for easy aggregation

#### API Endpoints

```
GET    /health
GET    /health/details
GET    /health/nats
GET    /health/ai-service
GET    /health/ollama
```

---

### F9 — AI Agent Generation & Pipeline Orchestration Management

#### Purpose

Provide a first-class system for **defining, instantiating, executing, monitoring, and configuring the AI agents** that power FlowForge's multi-agent pipeline. Rather than treating agents as opaque black boxes hardcoded inside FastAPI, this feature exposes them as manageable entities with observable lifecycle states, configurable parameters, per-run telemetry, and full traceability — all persisted in PostgreSQL and surfaced in the admin UI.

This feature bridges the gap between the static agent architecture described in Section 7 and a live, operational system where agents are registered, versioned, executed, monitored, and tuned over time.

---

#### Agent Lifecycle

```
REGISTER agent definition (type, capabilities, default config)
         |
TRIGGER pipeline execution (bound to a Session + task type)
         |
ORCHESTRATOR resolves which agents to run and in what order
         |
         +-----> INTAKE AGENT execution instantiated (status: pending -> running)
         |            Agent logs emitted in real time
         |            Output snapshot saved on completion
         +-----> EXTRACTION AGENT execution instantiated
         |            ...
         +-----> PATTERN AGENT execution instantiated
         |            ...
         +-----> GAP DETECTION AGENT execution instantiated
         |            ...
         +-----> Q&A AGENT (Interactive mode only)
         |            ...
         +-----> VALIDATION AGENT execution instantiated
         |            ...
         +-----> EXPORT AGENT execution instantiated
                      ...
         |
PIPELINE EXECUTION reaches terminal state: completed | failed | paused
         |
Telemetry persisted: duration, token count, LLM call count, confidence delta
         |
Audit log entry created for each agent that produced a state change
```

---

#### Agent Types (Registry)

| Agent Type | Trigger | Inputs | Output |
|---|---|---|---|
| `ORCHESTRATOR` | NATS `ai.tasks.new` | `{ session_id, task_type, mode, input }` | Routes to child agents, publishes progress |
| `INTAKE` | Orchestrator dispatch | Raw input (text / file / audio) | Normalized text, detected language, segment list |
| `EXTRACTION` | After Intake | Normalized text / Q&A answer | Structured JSON: actors, tasks, decisions, rules, sequences |
| `PATTERN` | After Extraction | Extracted JSON + pgvector | Matched archetype, scaffolded template, slot mapping |
| `GAP_DETECTION` | After Pattern | Extracted JSON + pattern requirements | Gap list with severity scores (critical / high / medium / low) |
| `QA` | After Gap Detection (Interactive) | Gap list | Plain-language questions for the user (max 3/round) |
| `VALIDATION` | After Gap Detection (Auto) or after Q&A loop | Merged knowledge graph | Structural validity report + plain-language summary |
| `EXPORT` | After Validation (user-triggered) | Validated workflow JSON | Elsa 3.x JSON, BPMN 2.0 XML, PDF report |

---

#### Functional Requirements

- **FR-9.1**: Maintain a persistent **Agent Registry** — every agent type is stored as a definition record with its version, capabilities descriptor, and default configuration parameters.
- **FR-9.2**: On every NATS task received, create a **PipelineExecution** record linked to the session, capturing task type, execution mode, and the full input payload.
- **FR-9.3**: Create an **AgentExecution** record for each agent spawned within a pipeline run, capturing: status, order index, input snapshot, output snapshot, start time, completion time, duration, LLM call count, and tokens consumed.
- **FR-9.4**: Stream **AgentLog** entries in real time during each agent execution (info, warning, error levels) — forwarded via NATS `ai.tasks.progress` to the WebSocket gateway for frontend display.
- **FR-9.5**: On agent failure, mark the `AgentExecution` as `failed`, record the error message, and allow the `PipelineExecution` to enter `paused` state so it can be retried without full re-submission.
- **FR-9.6**: Support **AgentConfigOverride** — admins and process owners can override default agent parameters at the organization or session level (e.g., lower the confidence gate threshold, increase max Q&A rounds).
- **FR-9.7**: The Pipeline Execution detail view (admin UI) must show the full agent execution timeline: each agent as a card with status badge, duration bar, confidence delta, and expandable log viewer.
- **FR-9.8**: Retry mechanism — a failed `PipelineExecution` can be retried from the last successfully completed agent (not from the beginning), using the saved output snapshot of the last successful agent as the new starting input.
- **FR-9.9**: Every `AgentExecution` that produces a workflow state change must create a corresponding `AuditLog` entry (actor_type = `ai_agent`).
- **FR-9.10**: Expose per-agent telemetry aggregates in the admin dashboard: average duration, average token consumption, failure rate, and confidence output distribution — grouped by agent type and date range.

---

#### Agent Configuration Parameters (per AgentDefinition)

| Agent | Key Parameters | Default |
|---|---|---|
| `EXTRACTION` | `temperature`, `max_tokens`, `output_schema_version` | `0.1`, `2048`, `"v1"` |
| `PATTERN` | `similarity_threshold`, `max_candidates`, `fallback_to_generic` | `0.72`, `5`, `true` |
| `GAP_DETECTION` | `critical_gap_auto_block` (Auto mode blocks on critical gaps) | `false` |
| `QA` | `max_rounds`, `max_questions_per_round`, `skip_allowed` | `5`, `3`, `true` |
| `VALIDATION` | `confidence_exit_threshold`, `require_all_critical_resolved` | `0.85`, `true` |
| `EXPORT` | `default_formats`, `include_decision_log_in_pdf` | `["elsa","bpmn"]`, `true` |

---

#### Pipeline Execution Status Machine

```
PENDING
   |
   v
RUNNING -------> PAUSED (agent failed, awaiting retry)
   |                 |
   |                 v
   |             RUNNING (resumed from last checkpoint)
   v
COMPLETED
   |
   v
FAILED (non-recoverable — e.g., all retry attempts exhausted)
```

---

#### API Endpoints

```
-- Agent Registry
GET    /agents                              List all registered agent definitions
GET    /agents/:id                          Get agent definition + default config
PATCH  /agents/:id/config                  Update default config for an agent (admin only)

-- Agent Config Overrides
POST   /agents/:id/overrides               Create org-level or session-level config override
GET    /agents/:id/overrides               List active overrides for an agent
DELETE /agents/overrides/:overrideId       Delete a config override

-- Pipeline Executions
GET    /sessions/:id/pipeline-executions   List all pipeline runs for a session
GET    /pipeline-executions/:id            Get full pipeline execution detail with agent timeline
POST   /pipeline-executions/:id/retry      Retry a failed pipeline from last checkpoint (admin / owner)
DELETE /pipeline-executions/:id/cancel     Cancel a running pipeline execution

-- Agent Executions (within a pipeline)
GET    /pipeline-executions/:id/agents     List all agent executions for a pipeline run
GET    /agent-executions/:id               Get single agent execution detail + logs
GET    /agent-executions/:id/logs          Stream agent logs (SSE)

-- Telemetry (admin only)
GET    /admin/agents/telemetry             Aggregate stats: avg duration, token use, failure rate per agent type
GET    /admin/agents/telemetry?agent=EXTRACTION&from=...&to=...
```

---

#### Frontend — Pipeline Execution Monitor (Admin + Process Owner)

The **Pipeline Monitor** panel (accessible from the workflow detail page) visualizes the live and historical agent execution timeline:

```
Pipeline Execution #42  [Session: abc-123]  [Mode: INTERACTIVE]  Status: COMPLETED  Duration: 18.4s
─────────────────────────────────────────────────────────────────────────────────────────────────
  [✓] INTAKE          0.8s  | Detected: PDF (3 pages) | Language: French
  [✓] EXTRACTION      6.2s  | 12 actors, 24 tasks, 6 decisions extracted | Confidence: 0.71
  [✓] PATTERN         1.1s  | Matched: Approval Archetype (84%)
  [✓] GAP_DETECTION   0.9s  | 3 gaps found: 1 critical, 2 high
  [✓] QA              7.4s  | 2 rounds, 5 questions answered, 1 skipped
  [✓] VALIDATION      1.5s  | Structural check: PASS | Final confidence: 0.88
  [ ] EXPORT          —     | Awaiting user trigger
─────────────────────────────────────────────────────────────────────────────────────────────────
  LLM Calls: 14 | Tokens consumed: 18,240 | Confidence Δ: +0.17
```

Each row is expandable to reveal the full `AgentLog` stream for that execution.

---

## 6. AI Feature Specifications

The AI capabilities of FlowForge are organized into 11 distinct features, each implemented by one or more specialized agents in the Multi-Agent Pipeline (see Section 7).

---

### AI-F1 — Execution Mode Selection (Auto vs Interactive)

#### Purpose
Give users explicit control over how much the AI involves them in the elicitation process.

#### Auto Mode

The AI pipeline runs **end-to-end without human interruption**. When gaps are detected, the system applies smart defaults derived from the matched process pattern rather than stopping to ask questions. All inferred defaults are clearly marked in the output for review.

**Best for:** Users with a relatively complete description, or who want a fast first draft to review and correct afterward.

**Auto Mode Flow:**
```
Input received
     |
Intake -> Extraction -> Pattern Match -> Knowledge Graph
     |
Gap Detection: gaps found
     |
[Instead of asking] Apply pattern-based defaults for each gap
Mark each defaulted element as: WARNING INFERRED -- please verify
     |
Validation Agent: structural completeness check
     |
Draft workflow ready -> user notified -> moves to PENDING_REVIEW
```

**Auto Mode Inference Rules (example defaults):**
- No timeout mentioned -> infer 48-hour timeout (approval pattern default), marked as inferred
- No rejection path described -> infer a "Notify initiator with reason" end event
- No explicit end event -> infer end after the last task in the detected sequence

#### Interactive Mode

The AI produces a first draft, then **enters a conversation loop** — surfacing gaps one batch at a time (max 3 questions per round) and updating the workflow after each user answer.

**Best for:** Users with partial or informal descriptions who want fine-grained control over the output.

**Interactive Mode Flow:**
```
Input received
     |
Intake -> Extraction -> Pattern Match -> Knowledge Graph
     |
Gap Detection -> Q&A Agent generates prioritized questions
     |
Questions displayed in chat (max 3 per round)
     |
User answers -> Extraction Agent processes -> Graph updated
     |
[Loop] New gap check -> more questions if needed
     |
Confidence >= 0.85 AND all Critical gaps resolved -> exit loop
     |
Validation Agent -> Draft ready -> PENDING_REVIEW
```

#### Mode Switching

Users can switch modes mid-session:
- **Auto -> Interactive**: The system replays all inferred defaults as open questions ("We assumed X — is this correct?")
- **Interactive -> Auto**: Finalizes all current answers and runs the remaining pipeline automatically

---

### AI-F2 — Multimodal Input Processing

#### Purpose
Accept and normalize any type of input into processable text before the AI agent pipeline begins.

#### Processing Pipeline by Format

| Input Type | Processor | Output |
|---|---|---|
| Plain text | Language detection + cleaning | Normalized text segments |
| PDF (digital) | pdfplumber (layout-aware) | Text with heading structure |
| PDF (scanned) | pytesseract OCR | Raw text, confidence-scored |
| Word (.docx) | python-docx | Text with structure markers |
| Image / sketch | Tesseract OCR + shape detector | Text + detected graph structure (boxes/arrows/diamonds) |
| Audio | Whisper (local) + diarization | Timestamped, speaker-labeled transcript |
| Email thread | Thread parser + chronological ordering | Structured conversation with sender normalization |
| Markdown | Direct ingestion + structure parsing | Text with section hierarchy |

#### Functional Requirements

- AI-FR-2.1: All formats produce a normalized intermediate representation: `{ segments: [{ text, source, page, confidence, type }] }`
- AI-FR-2.2: Language detection on every segment — primary support for French, English, Arabic
- AI-FR-2.3: For images with detected diagram shapes, produce a preliminary graph structure: `{ nodes: [...], edges: [...] }` passed directly to the Extraction Agent alongside OCR text
- AI-FR-2.4: For audio, diarization labels each segment with its speaker ID, which maps to candidate process actors
- AI-FR-2.5: Preprocessing failures are non-fatal — system falls back to raw text and logs a warning to the audit trail

---

### AI-F3 — Intelligent Extraction Engine

#### Purpose
The core of the AI pipeline. Transform normalized text segments into structured workflow elements using a locally-running LLM (Ollama + Mistral 7B Instruct) with carefully engineered structured prompts.

#### What Gets Extracted

| Element | Description | Example |
|---|---|---|
| **Actor / Role** | A person, team, department, or system performing an action | "Department Manager", "Finance System" |
| **Task** | A concrete action performed by an actor | "Submit expense report", "Validate the request" |
| **Decision / Gateway** | A branching point where flow diverges based on a condition | "If amount > 1000 EUR", "Depending on category" |
| **Sequence** | The ordering relationship between elements | "then", "after that", "once approved" |
| **Business Rule** | A constraint, threshold, timeout, or policy | "within 48 hours", "only if signed" |
| **Data Object** | A document, form, or artifact involved | "The expense form", "the signed contract" |
| **Event** | A trigger or terminus of the process | "When submitted", "Upon completion" |

#### Structured Prompt Strategy

The LLM is instructed to return strict JSON, never prose. The prompt includes:
- Role definition: "You are a business process extraction expert"
- Output schema definition with all required fields and types
- 3–5 few-shot examples (process description -> correct JSON)
- Explicit constraint: "Do not invent information not in the text. Mark uncertain elements with confidence < 0.7"

#### Output Schema

```json
{
  "actors": [{ "id": "A1", "name": "...", "normalized": "...", "confidence": 0.95 }],
  "tasks": [{ "id": "T1", "name": "...", "actor_id": "A1", "confidence": 0.91 }],
  "decisions": [{ "id": "D1", "condition": "...", "yes_path": "T2", "no_path": "T3", "confidence": 0.73 }],
  "rules": [{ "id": "R1", "type": "timeout", "value": "48h", "applies_to": "T2", "confidence": 0.88 }],
  "sequences": [{ "from": "T1", "to": "D1", "type": "sequential" }],
  "data_objects": [{ "id": "DO1", "name": "...", "used_in": "T1" }],
  "events": { "start": "T1", "end": ["T4", "T5"] },
  "unresolved": ["No timeout defined for D1", "Unclear who receives rejection notification"]
}
```

---

### AI-F4 — Process Pattern Recognition & Template Matching

#### Purpose
Match extracted elements against a library of known process archetypes using pgvector semantic similarity, provide the workflow a proven structural backbone, and use the pattern to surface missing required elements.

#### Pattern Library

| Archetype | Description | Required Elements |
|---|---|---|
| **Approval Pattern** | Submit -> Review -> Approve/Reject -> Notify | Initiator, Reviewer, Decision gateway, two end paths, notification |
| **Escalation Pattern** | Request -> Review -> Escalate if unresolved -> Senior Review | SLA timeout, escalation trigger, second-level reviewer |
| **Parallel Review Pattern** | Submit -> Multiple simultaneous reviews -> Merge -> Decision | Parallel gateway, join gateway, conflict resolution rule |
| **Notification Pattern** | Event -> Trigger -> Notify target(s) | Event trigger, notification actor, recipient list |
| **Periodic Execution Pattern** | Schedule -> Execute -> Log -> Report | Timer event, execution task, logging task |
| **Onboarding Pattern** | Start -> Sequential setup steps -> Completion -> Access granted | Sequential tasks, completion event, access grant task |

#### Matching via pgvector

1. Compute embedding of the extracted element set (sentence-transformers)
2. Query pgvector for most similar pattern embedding (cosine similarity)
3. Similarity > 0.75 -> match confirmed; 0.50–0.75 -> candidate (present options to user); < 0.50 -> no match (proceed without template)

Once matched, extracted elements are mapped to template slots. Unfilled required slots are passed to the Gap Detection Agent.

---

### AI-F5 — Knowledge Graph Construction & Context Management

#### Purpose
Build and maintain a relational graph of all process entities and their relationships within a session, stored in PostgreSQL (adjacency list model) with pgvector for semantic deduplication.

#### Why a Graph Structure?

Processes are fundamentally relational: Actor **performs** Task, Task **triggers** Decision, Decision **routes to** Task, Task **requires** DataObject. A graph makes these relationships first-class citizens, enabling:
- Traversal queries: "Find all tasks the Finance team is involved in"
- Cycle detection: "Is there an infinite loop in the approval path?"
- Orphan detection: "Are there tasks with no predecessor or successor?"
- Semantic deduplication: "Is 'supervisor' here the same entity as 'manager'?" (via pgvector similarity)

#### Graph Schema

```
Nodes: Actor | Task | Decision | Rule | DataObject | Event
Edges: PERFORMS | TRIGGERS | FOLLOWS | DECIDES | REQUIRES | PRODUCES | NOTIFIES
Edge properties: condition, confidence, source_document_id, inferred (bool)
```

#### Context Handling Across Multi-Turn Sessions

- Each session has its own isolated graph namespace in PostgreSQL
- On session resume, the graph is loaded — no re-extraction needed
- When new information arrives (new document, new Q&A answer), only delta elements are processed and merged
- Before inserting a new entity, pgvector checks for existing entities with cosine similarity > 0.90 (same entity, different surface form)
- Contradictions between new and existing nodes are flagged for the Gap Detection Agent

---

### AI-F6 — Gap Detection & Confidence Scoring

#### Purpose
Identify missing, ambiguous, or low-confidence elements in the current workflow state and produce a prioritized list of gaps for the Q&A Agent (Interactive) or the inference engine (Auto).

#### Confidence Score Scale

| Range | Meaning |
|---|---|
| 0.85 – 1.00 | High confidence — clearly and unambiguously stated in the source |
| 0.60 – 0.84 | Medium confidence — inferred from context; likely correct but needs verification |
| 0.00 – 0.59 | Low confidence — uncertain, ambiguous, or only partially described |

#### Gap Types & Severity

| Gap Type | Example | Severity |
|---|---|---|
| Missing required element | No end event defined | Critical |
| Missing decision branch | Decision has a "yes" path but no "no" path | Critical |
| Orphan node | A task with no predecessor or successor | High |
| Unresolved actor | Task assigned to "someone" without a named role | High |
| Missing rule | Approval process with no timeout defined | Medium |
| Ambiguous condition | "Large amount" — no threshold specified | Medium |
| Low-confidence element | Any element with confidence < 0.60 | Variable |

#### Gap Prioritization

Gaps are ranked by: `severity x (1 - confidence) x structural_impact`. Structural gaps (missing branches, orphan nodes) always rank above semantic gaps (unclear names, missing metadata).

---

### AI-F7 — Active Learning & Smart Q&A (Interactive Mode Only)

#### Purpose
Progressive elicitation of missing information through targeted, plain-language questions. Mimics the behavior of an experienced Business Analyst conducting a structured interview.

#### Question Generation Rules

- Maximum 3 questions per round — never overwhelm the user
- Always phrased using domain vocabulary from the current workflow, not technical terms
- Every question includes context: "In the step where the manager reviews the request..."
- Every question has an escape hatch: "Not sure? You can skip this and we'll use a default."
- Questions are ranked by gap severity — most impactful gaps first

#### Answer Processing

User answers are plain text. The Extraction Agent processes each answer:
1. Extract new elements or corrections from the answer text
2. Update the knowledge graph (delta only)
3. Recalculate confidence scores for affected elements
4. Determine if the gap is resolved
5. Check if new gaps were opened by the answer
6. Decide if another Q&A round is needed

#### Termination Conditions

- Overall confidence >= 0.85 AND all Critical + High gaps resolved -> automatic exit
- User clicks "This is good enough" -> manual exit at any confidence level
- User has answered or skipped all available questions -> exit with remaining gaps flagged as inferred

---

### AI-F8 — Chunking & Hierarchical Summarization

#### Purpose
Handle long or complex inputs (multi-page documents, long meeting transcripts) that exceed the LLM's effective context window (~6000 tokens for Mistral 7B).

#### Chunking Strategy

```
STEP 1 -- SEGMENTATION
  Split by: paragraph boundaries, section headings, speaker turns, or document boundaries.
  Target chunk size: ~800 tokens each.

STEP 2 -- LOCAL EXTRACTION (parallelized)
  Run Extraction Agent independently on each chunk.
  Each chunk produces a local JSON fragment.

STEP 3 -- SEMANTIC MERGING (pgvector)
  - Compute embeddings of all extracted entities across all chunks
  - Use pgvector cosine similarity to detect duplicate entities across chunks
  - Merge duplicates, retain highest-confidence instance
  - Link cross-chunk sequences by matching event/task names semantically

STEP 4 -- GLOBAL VALIDATION
  - Run Validation Agent on the merged result
  - Check global connectivity: is the graph fully connected?
  - Detect inter-chunk contradictions
  - Flag elements appearing in only one chunk (lower confidence)
```

---

### AI-F9 — Workflow Validation & Plain-Language Summary

#### Purpose
Before presenting the workflow for human review, validate its structural correctness and translate it into a plain-language description any business expert can understand and verify — no diagram literacy required.

#### Structural Validation Rules

- Every workflow has exactly one start event
- Every workflow has at least one end event
- Every decision gateway has at least two outgoing paths
- Every path from start can reach at least one end event (no dead ends)
- No unreachable tasks exist (no disconnected nodes)
- No unintended infinite loops (loops must be explicitly marked)
- Every actor referenced in a task exists in the actors list

#### Plain-Language Summary Example

```
"Here is the process as I understood it:

1. An EMPLOYEE submits an expense report form with receipts attached.
2. The DEPARTMENT MANAGER receives a notification and has 48 hours to review it.
3. If the total amount is 1,000 EUR or less and approved, the FINANCE SYSTEM
   processes the expense automatically within 2 business days.
4. If the total amount exceeds 1,000 EUR, the CFO must also approve before processing.
5. If the manager does not respond within 48 hours, the request is escalated
   to the DEPARTMENT DIRECTOR.
6. If rejected at any stage, the EMPLOYEE receives an email with the reason
   and may resubmit a corrected report.

WARNING -- The following were inferred and should be verified:
  - Timeout of 48h was not explicitly stated -- is this correct?
  - No maximum resubmission limit was mentioned -- is resubmission unlimited?

Is this description accurate? Confirm, or tell me what needs to change."
```

---

### AI-F10 — Workflow Export & Format Conversion

#### Purpose
Convert the validated internal workflow JSON into target formats for deployment and sharing.

#### Export Formats

| Format | Description | Use Case |
|---|---|---|
| **Elsa Workflows 3.x JSON** | Native Elsa workflow definition — directly importable and executable | Production deployment |
| **BPMN 2.0 XML** | International standard — importable in Camunda, Bizagi, etc. | Interoperability |
| **PDF Report** | Visual diagram + plain-language summary + decision log | Stakeholder review and sign-off |
| **JSON (internal schema)** | Raw FlowForge representation | Developer use, backup, debugging |

#### Elsa Workflows 3.x Mapping

| FlowForge Element | Elsa 3.x Equivalent |
|---|---|
| Task | `Activity` (RunTask or SendSignal) |
| Decision gateway | `FlowSwitch` or `If` activity |
| Actor / Role | Variable scoped to activity + assigned role |
| Business rule (timeout) | `Timer` event boundary on activity |
| Business rule (condition) | Expression on `FlowSwitch` case |
| Start event | `WorkflowTrigger` |
| End event | `Finish` activity |
| Parallel gateway | `Fork` + `Join` activities |

---

### AI-F11 — Comment Injection & Re-processing

#### Purpose
Allow reviewer comments to be fed back into the AI pipeline as additional context, enabling targeted automated workflow updates based on human feedback without re-running the full pipeline.

#### Injection Types

| Type | Behavior |
|---|---|
| **Correction** | "This threshold is 1000 EUR not 500 EUR" -> Extraction Agent updates the specific element |
| **Addition** | "There is also a step where legal reviews the contract" -> New task node added to graph |
| **Deletion** | "The HR notification step does not actually exist" -> Node removed; sequences re-linked |
| **Clarification** | "By 'manager' we mean the direct line manager, not the department head" -> Actor entity normalized |

Each injection triggers a **scoped re-processing** — only the affected elements are reprocessed, not the full pipeline. This makes injections fast (seconds, not the full pipeline duration).

---

## 7. AI Architecture — Multi-Agent Pipeline

### 7.1 Agent Roster & Responsibilities

```
                   +------------------------------------------+
                   |            ORCHESTRATOR                  |
                   |  Receives tasks from NATS JetStream      |
                   |  Routes to appropriate agents            |
                   |  Manages execution mode (Auto/Interactive)|
                   |  Publishes results and progress to NATS  |
                   +-------------------+----------------------+
                                       |
    +----------------------------------+--------------------------------+
    |                                  |                               |
+---v-----------+          +-----------v------+           +------------v---+
| INTAKE AGENT  |          |EXTRACTION AGENT  |           | PATTERN AGENT  |
|               |          |                  |           |                |
| Classify fmt  |          | LLM structured   |           | pgvector       |
| Detect lang   |          | prompting        |           | cosine search  |
| Segment input |          | Extract: actors, |           | Match archetype|
| Preprocess    |          | tasks, decisions,|           | Scaffold templ |
| multimodal    |          | rules, sequences |           | Map to slots   |
+---------------+          | Confidence score |           +----------------+
                           | Output: JSON     |
                           +------------------+

    +----------------------------------+--------------------------------+
    |                                  |                               |
+---v-------------+        +-----------v------+           +------------v-----+
| GAP DETECTION   |        |   Q&A AGENT      |           | VALIDATION AGENT |
|     AGENT       |        | (Interactive)    |           |                  |
|                 |        |                  |           | Structural check |
| Compare extract |        | Prioritize gaps  |           | Dead-end detect  |
| vs pattern reqs |        | Generate plain   |           | Orphan node check|
| Score by sev.   |        | language Qs      |           | Confidence gate  |
| Detect contrad. |        | Parse answers    |           | Generate plain   |
| Auto: infer     |        | -> feed Extractor|           | language summary |
+-----------------+        +------------------+           +------------------+

                              +---------------------+
                              |    EXPORT AGENT     |
                              |                     |
                              | JSON -> Elsa 3.x    |
                              | JSON -> BPMN 2.0    |
                              | Generate PDF report |
                              | Build decision log  |
                              +---------------------+
```

### 7.2 NestJS <-> FastAPI Communication via NATS JetStream

```
NestJS (Backend)                          FastAPI (AI Service)
      |                                          |
      |-- ai.tasks.new -----------------------> |  Orchestrator receives task
      |                                          |  Routes to appropriate agents
      |                                          |  Agents run in sequence or parallel
      |<- ai.tasks.progress ------------------- |  Each agent publishes progress %
      |   (forwarded to WebSocket -> frontend)   |
      |<- ai.tasks.result --------------------- |  Final result published
      |                                          |
      | NestJS saves result to PostgreSQL        |
      | Publishes: workflow.events.updated       |
      | WebSocket gateway pushes to frontend     |
      | Diagram re-renders in real time          |
```

### 7.3 LLM Configuration (Ollama)

| Setting | Value |
|---|---|
| Primary Model | Mistral 7B Instruct |
| Fallback Model | Phi-3 Mini (if Mistral unavailable) |
| Serving Runtime | Ollama local server (port 11434) |
| Invocation | FastAPI -> HTTP POST to Ollama API |
| Temperature | 0.1 (low — for deterministic structured output) |
| Output Format | JSON mode enforced on every call |
| Context Window | 8192 tokens |
| Chunking Threshold | Input > 6000 tokens -> trigger AI-F8 chunking pipeline |

---

## 8. Data Models

### 8.1 PostgreSQL Schema

```sql
-- Organizations
Organization    id (uuid PK), name, plan, created_at, updated_at

-- Users
User            id (uuid PK), email, password_hash, role (enum),
                org_id (fk -> Organization), is_verified, locked_until, created_at

-- Auth
LoginHistory    id, user_id (fk), ip_address, user_agent, success (bool), created_at
RefreshToken    id, user_id (fk), token_hash, expires_at, revoked (bool), created_at

-- Workflows
Workflow        id (uuid PK), title, description, status (enum),
                current_version (int), org_id (fk), owner_id (fk -> User),
                domain, tags (text[]), created_at, updated_at

WorkflowVersion id (uuid PK), workflow_id (fk), version_number (int),
                elements_json (jsonb), elsa_json (jsonb),
                confidence_score (float), created_by (fk -> User), created_at

-- Sessions
Session         id (uuid PK), workflow_id (fk), user_id (fk),
                mode (enum: auto|interactive), status (enum),
                confidence_score (float), created_at, finalized_at

-- Messages
Message         id (uuid PK), session_id (fk), role (enum: user|ai|system),
                type (enum), content (text), metadata (jsonb),
                created_at

-- Documents
Document        id (uuid PK), workflow_id (fk), session_id (fk),
                filename, file_type, storage_url, extracted_text (text),
                preprocessing_confidence (float), doc_version (int), created_at

-- Comments
Comment         id (uuid PK), workflow_id (fk), element_id (nullable),
                author_id (fk -> User), type (enum), content (text),
                resolved (bool), resolved_at, resolved_by (fk),
                parent_id (nullable, fk -> Comment), created_at

-- Audit
AuditLog        id (uuid PK), workflow_id (fk), actor_id (uuid),
                actor_type (enum: user|ai_agent|system), event_type (varchar),
                element_id (nullable), before_state (jsonb), after_state (jsonb),
                created_at

-- Knowledge Graph (adjacency list)
KGNode          id (uuid PK), session_id (fk), type (enum),
                label (varchar), properties (jsonb), confidence (float),
                embedding vector(768),           -- pgvector column
                inferred (bool), created_at

KGEdge          id (uuid PK), session_id (fk),
                from_node_id (fk -> KGNode), to_node_id (fk -> KGNode),
                relation_type (varchar), condition (varchar),
                properties (jsonb), confidence (float), created_at

-- Pattern Library
ProcessPattern  id (uuid PK), name, archetype_type, description,
                template_json (jsonb), required_slots (text[]),
                embedding vector(768),           -- pgvector column
                created_at
```

### 8.2 Key Indexes

```sql
-- Vector similarity search (IVFFlat for approximate nearest neighbor)
CREATE INDEX ON KGNode USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX ON ProcessPattern USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);

-- Common query patterns
CREATE INDEX ON Message (session_id, created_at);
CREATE INDEX ON AuditLog (workflow_id, created_at);
CREATE INDEX ON Workflow (org_id, status);
CREATE INDEX ON KGNode (session_id, type);
CREATE INDEX ON Comment (workflow_id, resolved);
```

---

### 8.3 AI Agent Data Models (F9 — Agent Generation & Pipeline Orchestration)

These tables persist the full lifecycle of every AI agent execution: from the registry of available agent types, through every pipeline run, down to individual per-agent logs and configuration overrides.

---

#### 8.3.1 AgentDefinition — The Agent Registry

One record per agent type. Describes what the agent is, what version it is running, its declared capabilities, and its default configuration. Updated when agents are upgraded or reconfigured.

```sql
CREATE TYPE agent_type_enum AS ENUM (
  'ORCHESTRATOR',
  'INTAKE',
  'EXTRACTION',
  'PATTERN',
  'GAP_DETECTION',
  'QA',
  'VALIDATION',
  'EXPORT'
);

CREATE TABLE AgentDefinition (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(128)  NOT NULL UNIQUE,          -- e.g. "Extraction Agent v1"
  agent_type        agent_type_enum NOT NULL,
  version           VARCHAR(32)   NOT NULL DEFAULT '1.0.0', -- semver
  description       TEXT,
  capabilities      JSONB         NOT NULL DEFAULT '[]',    -- e.g. ["pdf","ocr","audio"]
  default_config    JSONB         NOT NULL DEFAULT '{}',    -- tunable parameters and their defaults
  is_active         BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Example default_config for EXTRACTION agent:
-- {
--   "temperature": 0.1,
--   "max_tokens": 2048,
--   "output_schema_version": "v1",
--   "confidence_minimum": 0.5
-- }
```

---

#### 8.3.2 PipelineExecution — One Pipeline Run per Session Task

Created each time the Orchestrator receives a task from NATS `ai.tasks.new`. Tracks the overall lifecycle of a complete (or scoped) pipeline run.

```sql
CREATE TYPE pipeline_task_type_enum AS ENUM (
  'FULL_PIPELINE',        -- full run from Intake to Validation
  'SCOPED_REPROCESS',     -- only affected elements re-processed (comment injection)
  'EXPORT_ONLY',          -- Export Agent triggered alone after user approval
  'QA_ROUND'              -- a single Interactive Q&A answer cycle
);

CREATE TYPE pipeline_status_enum AS ENUM (
  'PENDING',
  'RUNNING',
  'PAUSED',               -- one agent failed; awaiting retry
  'COMPLETED',
  'FAILED',               -- all retry attempts exhausted
  'CANCELLED'
);

CREATE TABLE PipelineExecution (
  id                    UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID                    NOT NULL REFERENCES Session(id) ON DELETE CASCADE,
  task_type             pipeline_task_type_enum NOT NULL,
  mode                  VARCHAR(16)             NOT NULL CHECK (mode IN ('auto','interactive')),
  status                pipeline_status_enum    NOT NULL DEFAULT 'PENDING',
  input_payload         JSONB                   NOT NULL DEFAULT '{}', -- full NATS task payload snapshot
  retry_count           SMALLINT                NOT NULL DEFAULT 0,
  last_checkpoint_agent agent_type_enum,                              -- last successfully completed agent
  triggered_by          UUID                    REFERENCES "User"(id), -- NULL if triggered by system/NATS
  nats_message_id       VARCHAR(256),                                  -- JetStream message sequence for replay
  started_at            TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  total_duration_ms     INTEGER,
  total_llm_calls       INTEGER                 NOT NULL DEFAULT 0,
  total_tokens_consumed INTEGER                 NOT NULL DEFAULT 0,
  final_confidence      FLOAT,                                         -- confidence score at end of pipeline
  error_summary         TEXT,
  created_at            TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);

CREATE INDEX ON PipelineExecution (session_id, created_at DESC);
CREATE INDEX ON PipelineExecution (status);
```

---

#### 8.3.3 AgentExecution — One Record per Agent per Pipeline Run

Created for every agent spawned within a `PipelineExecution`. Captures the agent's full input/output state, timing, and telemetry for that specific run. This is the primary unit of observability for the AI pipeline.

```sql
CREATE TYPE agent_execution_status_enum AS ENUM (
  'PENDING',    -- queued, not yet started
  'RUNNING',    -- actively processing
  'COMPLETED',  -- finished successfully
  'FAILED',     -- threw an error or timed out
  'SKIPPED'     -- not needed for this mode/task (e.g. QA skipped in Auto mode)
);

CREATE TABLE AgentExecution (
  id                      UUID                        PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_execution_id   UUID                        NOT NULL REFERENCES PipelineExecution(id) ON DELETE CASCADE,
  agent_definition_id     UUID                        NOT NULL REFERENCES AgentDefinition(id),
  status                  agent_execution_status_enum NOT NULL DEFAULT 'PENDING',
  order_index             SMALLINT                    NOT NULL,   -- execution order within the pipeline
  input_snapshot          JSONB,                                  -- full input passed to this agent
  output_snapshot         JSONB,                                  -- full output produced (used as checkpoint)
  confidence_input        FLOAT,                                  -- confidence score entering this agent
  confidence_output       FLOAT,                                  -- confidence score after this agent
  llm_calls_count         SMALLINT                    NOT NULL DEFAULT 0,
  tokens_consumed         INTEGER                     NOT NULL DEFAULT 0,
  error_message           TEXT,
  duration_ms             INTEGER,
  started_at              TIMESTAMPTZ,
  completed_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ                 NOT NULL DEFAULT NOW()
);

CREATE INDEX ON AgentExecution (pipeline_execution_id, order_index);
CREATE INDEX ON AgentExecution (agent_definition_id, status);
CREATE INDEX ON AgentExecution (status, created_at DESC);
```

---

#### 8.3.4 AgentLog — Real-Time Step-Level Log per Agent Execution

Granular log entries emitted by each agent during its run. Used for the real-time log viewer in the Pipeline Monitor UI. Forwarded via NATS `ai.tasks.progress` to the WebSocket gateway.

```sql
CREATE TYPE log_level_enum AS ENUM (
  'DEBUG',
  'INFO',
  'WARNING',
  'ERROR'
);

CREATE TABLE AgentLog (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_execution_id    UUID          NOT NULL REFERENCES AgentExecution(id) ON DELETE CASCADE,
  log_level             log_level_enum NOT NULL DEFAULT 'INFO',
  message               TEXT          NOT NULL,
  metadata              JSONB         DEFAULT '{}', -- e.g. { "chunk_index": 2, "element_id": "T3" }
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX ON AgentLog (agent_execution_id, created_at ASC);

-- Example log entries for the Extraction agent:
-- INFO  | "Processing chunk 1/3 (812 tokens)"
-- INFO  | "Extracted 4 actors: [Employee, Manager, CFO, Finance System]"
-- WARN  | "Low confidence on Decision D2 (0.48) — ambiguous condition phrasing"
-- INFO  | "Extraction complete: 12 tasks, 6 decisions, 3 rules — confidence: 0.71"
```

---

#### 8.3.5 AgentConfigOverride — Per-Org or Per-Session Configuration Overrides

Allows admins or process owners to override an agent's default configuration for a specific organization (permanent) or a specific session (one-off). The effective config at runtime is computed by merging: `default_config` ← `org override` ← `session override`.

```sql
CREATE TYPE config_override_scope_enum AS ENUM (
  'ORG',      -- applies to all sessions in this organization
  'SESSION'   -- applies to a single session only
);

CREATE TABLE AgentConfigOverride (
  id                    UUID                        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_definition_id   UUID                        NOT NULL REFERENCES AgentDefinition(id) ON DELETE CASCADE,
  scope_type            config_override_scope_enum  NOT NULL,
  scope_id              UUID                        NOT NULL, -- org_id or session_id depending on scope_type
  config_patch          JSONB                       NOT NULL, -- partial JSON merged over default_config
  description           TEXT,                                 -- why this override was set
  created_by            UUID                        NOT NULL REFERENCES "User"(id),
  created_at            TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),

  UNIQUE (agent_definition_id, scope_type, scope_id)          -- one override per agent per scope
);

CREATE INDEX ON AgentConfigOverride (agent_definition_id, scope_type, scope_id);

-- Example config_patch:
-- { "confidence_exit_threshold": 0.80, "max_rounds": 3 }
-- This overrides only these two keys; all other defaults remain unchanged
```

---

#### 8.3.6 Relationships Between Agent Tables

```
AgentDefinition ──< AgentExecution >── PipelineExecution ──< Session
      |
      └──< AgentConfigOverride
                 |
                 scope_id -> Organization | Session

AgentExecution ──< AgentLog
```

---

#### 8.3.7 Runtime Config Resolution Algorithm

At execution time, the Orchestrator computes the effective configuration for each agent using this merge chain:

```python
def resolve_agent_config(agent_def_id, org_id, session_id) -> dict:
    base   = AgentDefinition.default_config          # lowest priority
    org    = AgentConfigOverride.get(agent_def_id, scope="ORG",     scope_id=org_id)
    sess   = AgentConfigOverride.get(agent_def_id, scope="SESSION", scope_id=session_id)
    return {**base, **(org or {}), **(sess or {})}   # highest priority wins
```

---

### 8.4 Entity-Relationship Overview

The diagram below shows how the new Agent tables (§8.3) connect to the existing schema (§8.1):

```
┌─────────────────┐        ┌──────────────────────┐        ┌──────────────────────┐
│  Organization   │──┐     │   AgentDefinition    │──────< │  AgentConfigOverride │
│  id, name, plan │  │     │  id, name, type,     │        │  scope_type, scope_id│
└─────────────────┘  │     │  version, capabilities│        │  config_patch        │
                     │     │  default_config       │        └──────────────────────┘
┌─────────────────┐  │     └──────────┬───────────┘
│     User        │──┤               │
│  id, email,     │  │               │ 1:N
│  role, org_id   │  │               │
└────────┬────────┘  │     ┌──────────▼──────────┐
         │           │     │   AgentExecution     │
         │ 1:N       │     │  id, status,         │──────< AgentLog
         │           │     │  order_index,        │        id, level, message
┌────────▼────────┐  │     │  input/output snap   │
│    Workflow     │  │     │  confidence_in/out   │
│  id, title,     │  │     │  llm_calls, tokens   │
│  status, org_id │  │     └──────────┬───────────┘
└────────┬────────┘  │               │ N:1
         │           │               │
         │ 1:N       │     ┌──────────▼───────────┐
         │           │     │  PipelineExecution   │
┌────────▼────────┐  │     │  id, task_type, mode │
│    Session      │──┘     │  status, retry_count │
│  id, mode,      │──────< │  last_checkpoint,    │
│  status,        │ 1:N    │  total_tokens, nats_ │
│  workflow_id    │        │  message_id          │
└─────────────────┘        └──────────────────────┘

Existing tables (§8.1) connected to agent tables:
  Session.id  ←── PipelineExecution.session_id
  User.id     ←── PipelineExecution.triggered_by
  User.id     ←── AgentConfigOverride.created_by
  AuditLog    ←── Every AgentExecution state change (actor_type = 'ai_agent')
```

---

### 8.5 Extended Key Indexes (F9 additions)

```sql
-- Agent telemetry aggregations (dashboard queries)
CREATE INDEX ON AgentExecution (agent_definition_id, created_at DESC);
CREATE INDEX ON AgentExecution (pipeline_execution_id, order_index ASC);
CREATE INDEX ON AgentExecution (status, created_at DESC);

-- Real-time log streaming
CREATE INDEX ON AgentLog (agent_execution_id, created_at ASC);

-- Config override lookups at runtime
CREATE INDEX ON AgentConfigOverride (agent_definition_id, scope_type, scope_id);

-- Pipeline status monitoring
CREATE INDEX ON PipelineExecution (session_id, created_at DESC);
CREATE INDEX ON PipelineExecution (status);
```

---

### 9.1 Overview

| Layer | Technology | Role |
|---|---|---|
| **Frontend** | Next.js 15 (App Router) | UI, SSR, real-time updates |
| **Backend** | NestJS (TypeScript) | REST API, business logic, WebSocket gateway |
| **AI Service** | FastAPI (Python 3.11+) | Multi-agent pipeline, LLM orchestration |
| **Workflow Engine** | Elsa Workflows 3.x (.NET) | Execution of exported workflow definitions |
| **Message Bus** | NATS JetStream | Async NestJS <-> FastAPI communication + event streaming |
| **Database** | PostgreSQL 16 + pgvector | Core data + vector embeddings + knowledge graph |
| **LLM Runtime** | Ollama | Local LLM serving (Mistral 7B Instruct, Phi-3 Mini) |
| **File Storage** | MinIO (S3-compatible) | Document and file storage |
| **Containerization** | Docker + Docker Compose | Service orchestration |

### 9.2 Frontend (Next.js)

| Concern | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| UI Components | shadcn/ui |
| Workflow Diagram | React Flow (live-updating, custom node types, confidence overlay) |
| State Management | Zustand (client state) |
| Server State | TanStack Query / React Query (API cache, optimistic updates) |
| Forms | React Hook Form + Zod |
| Real-time | SSE (AI streaming responses) + WebSocket (live workflow events) |
| Toast Notifications | Sonner |
| In-App Notifications | Custom notification center (bell icon + WebSocket) |
| Charts | Recharts (confidence over time, audit timeline) |
| API Client | Axios with request interceptors (auto token refresh on 401) |
| Error Handling | React Error Boundaries + global Axios error handler |

### 9.3 Backend (NestJS)

| Concern | Technology |
|---|---|
| Framework | NestJS |
| Language | TypeScript |
| ORM | TypeORM |
| Validation | class-validator + class-transformer |
| Auth | JWT (access + refresh tokens) + Passport.js |
| NATS Client | @nestjs/microservices with NATS JetStream transport |
| WebSocket | @nestjs/websockets + Socket.io adapter |
| File Upload | Multer + custom preprocessing dispatcher |
| Health Checks | @nestjs/terminus (TypeOrmHealthIndicator, HttpHealthIndicator) |
| Rate Limiting | @nestjs/throttler |
| API Documentation | @nestjs/swagger (auto-generated OpenAPI 3.0) |
| Logging | Pino (structured JSON logging) |
| Config & Validation | @nestjs/config + Joi schema validation |
| Exception Handling | Global NestJS exception filter (standardized error responses) |

### 9.4 AI Service (FastAPI)

| Concern | Technology |
|---|---|
| Framework | FastAPI (Python 3.11+) |
| LLM Client | Ollama Python SDK + direct HTTP |
| Agent Orchestration | LangGraph (graph-based agent workflow management) |
| Embeddings | sentence-transformers (all-MiniLM-L6-v2, 768 dimensions) |
| PDF Processing | pdfplumber |
| OCR | pytesseract (Tesseract wrapper) |
| Speech-to-Text | openai-whisper (local inference) |
| DOCX Processing | python-docx |
| NATS Client | nats.py with JetStream support |
| pgvector Client | psycopg2 + pgvector Python extension |
| Health Endpoint | FastAPI built-in `/health` route |

### 9.5 Infrastructure

| Concern | Technology |
|---|---|
| PostgreSQL | postgres:16 with pgvector extension |
| NATS | nats:2.x with JetStream enabled |
| NATS Monitoring | Built-in HTTP monitor on port 8222 |
| MinIO | minio/minio (latest stable) |
| Ollama | ollama/ollama (GPU or CPU mode) |
| Elsa Workflows | elsa-workflows/elsa-server:3.x |
| Orchestration | Docker Compose (hackathon scope) |

---

## 10. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Performance** | Auto mode: first draft within 30 seconds for inputs <= 1000 words |
| **Performance** | Interactive mode: AI response within 5 seconds per Q&A turn |
| **Performance** | Diagram preview re-renders within 1 second of any workflow update |
| **Performance** | REST API p95 latency < 200ms for all non-AI endpoints |
| **Privacy** | All AI processing runs fully on-premise via Ollama — no data leaves the organization |
| **Privacy** | Documents encrypted at rest in MinIO |
| **Privacy** | JWT secrets and all credentials managed via environment variables, never hardcoded |
| **Reliability** | AI pipeline failure -> graceful degradation: session paused, user notified, retry via NATS durable subscription |
| **Reliability** | NATS JetStream durable subscriptions ensure no AI task is silently lost on service restart |
| **Observability** | All services emit structured JSON logs; /health endpoint aggregates all component statuses |
| **Observability** | NATS monitoring UI embedded in admin panel for real-time message bus visibility |
| **Usability** | Business users with no technical background can complete a workflow in <= 30 minutes |
| **Genericity** | System produces valid output across >= 5 distinct business domains without reconfiguration |
| **Auditability** | Every AI decision is traceable in the immutable audit log |
| **Portability** | All Elsa exports are valid and directly importable by a standard Elsa Workflows 3.x installation |
| **Security** | RBAC enforced at route guard level; org-level data isolation on all database queries |
| **Security** | Rate limiting on all public endpoints via @nestjs/throttler |
| **Security** | File upload MIME type validation — unexpected file types are rejected before storage |
| **Security** | Refresh tokens stored in HTTP-only cookies; access tokens kept in memory only |

---

## 11. Out of Scope (Hackathon)

The following are in-scope for a production version but will not be implemented during the hackathon:

- Real-time multi-user collaborative editing of the same workflow simultaneously
- Domain-specific fine-tuning of the LLM (healthcare, banking, legal, public sector)
- Integration with external ERP / HRIS / CRM systems
- Regulatory compliance checking (GDPR, labor law, ISO standards)
- Workflow simulation and performance bottleneck modeling
- Mobile application (iOS / Android)
- Automated test case generation from workflow definitions
- Continuous learning feedback loop from Elsa execution data
- Multi-language UI (English only for hackathon)
- SSO / SAML integration for enterprise identity providers
- Advanced analytics dashboard (process cycle times, approval rates, throughput)

---

## 12. Glossary

| Term | Definition |
|---|---|
| **Auto Mode** | AI execution mode where the pipeline runs end-to-end without user interaction; gaps are inferred from patterns |
| **Interactive Mode** | AI execution mode where the pipeline pauses at gaps to ask the user targeted clarifying questions |
| **Workflow** | A structured, executable sequence of tasks, decisions, and actors representing a business process |
| **Elsa Workflows 3.x** | An open-source .NET workflow engine used as the execution target of this platform |
| **Elicitation** | The process of extracting process knowledge from a business expert through structured conversation |
| **BPMN** | Business Process Model and Notation — the international standard for process diagrams |
| **pgvector** | A PostgreSQL extension that adds vector data types and cosine similarity search operations |
| **NATS JetStream** | A persistent, durable messaging system built on the NATS message broker |
| **Ollama** | A local LLM serving runtime that runs models like Mistral 7B entirely on-premise |
| **Confidence Score** | A 0–1 score assigned to each extracted element indicating how certain the AI is about its correctness |
| **Decision Log** | A curated record of all interpretation choices made by the AI during workflow generation |
| **Pattern / Archetype** | A reusable structural template for common process types (approval, escalation, parallel review, etc.) |
| **Gap Detection** | Identifying missing, ambiguous, or incomplete information in a partially-constructed workflow |
| **Human-in-the-Loop** | A design pattern where AI performs the heavy lifting but humans validate and correct the output |
| **Comment Injection** | Sending a reviewer comment back to the AI pipeline as additional context for automated targeted refinement |
| **Multi-Agent Pipeline** | An AI architecture where multiple specialized agents each handle one focused task in sequence or parallel |
| **Chunking** | Breaking long inputs into smaller segments for LLM processing when content exceeds the context window |
| **Knowledge Graph** | A graph structure where nodes are process entities and edges are their typed relationships |
| **Inferred Element** | A workflow element not explicitly stated in the source, derived from pattern defaults and marked with a warning |
| **Diarization** | Speaker identification in audio transcripts — attributing each speech segment to a specific named speaker |
| **Scoped Re-processing** | Running the AI pipeline on only the elements affected by a comment injection, not the full workflow |
| **Agent Registry** | The persistent catalog of all AI agent definitions, their versions, capabilities, and default configurations (`AgentDefinition` table) |
| **PipelineExecution** | A single end-to-end (or scoped) run of the multi-agent pipeline, created each time a NATS `ai.tasks.new` message is received by the Orchestrator |
| **AgentExecution** | One record representing the execution of a single agent within a given PipelineExecution, capturing status, input/output snapshots, timing, and LLM telemetry |
| **AgentLog** | Granular real-time log entries emitted by an agent during its execution, streamed via NATS and displayed in the Pipeline Monitor UI |
| **AgentConfigOverride** | A partial JSON patch applied on top of an agent's default configuration, scoped to an organization or a specific session |
| **Pipeline Checkpoint** | The output snapshot of the last successfully completed agent in a pipeline run; used to resume a failed pipeline without starting over |
| **Effective Config** | The agent configuration computed at runtime by merging: default_config ← org override ← session override (highest priority wins) |
| **Pipeline Monitor** | The admin UI panel that shows the live and historical agent execution timeline for a session, including per-agent status, duration, confidence delta, and expandable logs |

---

*Document version: 2.1 | Status: Hackathon Draft | Project: FlowForge | Added: F9 Agent Generation, §8.3–§8.5 Agent Data Models*
