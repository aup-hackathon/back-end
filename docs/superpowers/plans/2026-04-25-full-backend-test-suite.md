# Full Backend Test Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create comprehensive HTTP endpoint tests for all NestJS backend modules matching the FastAPI testing pattern, including WebSocket and infrastructure tests.

**Architecture:** 
- Use Jest with `@nestjs/testing` and supertest for HTTP testing
- Create shared `conftest.ts` with TestApp fixtures, mock HTTP client, and auth middleware
- Mock database repositories at service level (not full testcontainers for speed)
- Mock NATS, AI Gateway, file storage, and external APIs
- Test all CRUD endpoints + edge cases for each module

**Tech Stack:** Jest, supertest, @nestjs/testing, jest-mock

---

## Task 1: Create Test Infrastructure (conftest.ts)

**Files:**
- Create: `test/conftest.ts`

**Purpose:** Shared test fixtures like FastAPI's conftest.py

- [ ] **Step 1: Create test/conftest.ts with shared fixtures**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/core/guards/jwt-auth.guard';

// Test user for authenticated requests
export const testUser = {
  id: 'test-user-id',
  orgId: 'test-org-id',
  role: 'ADMIN' as const,
};

// Mock JWT guard to bypass auth in tests
export const mockJwtGuard = {
  canActivate: jest.fn().mockReturnValue(true),
};

// Create test app with mocked guards
export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(JwtAuthGuard)
    .useValue(mockJwtGuard)
    .compile();

  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  return app;
}

// HTTP client helper
export function createHttpClient(app: INestApplication) {
  return request(app.getHttpServer());
}
```

- [ ] **Step 2: Export mock repositories and services**

Add helper functions for mocking repositories used across tests.

- [ ] **Step 3: Export NATS mock utilities**

Add mock functions for NATS client similar to FastAPI's mock_nats fixture.

- [ ] **Step 4: Export AI Gateway mock**

Add mock for AI/gateway HTTP calls.

---

## Task 2: Skills Module Tests

**Files:**
- Create: `test/modules/skills/skills.controller.spec.ts`
- Test: `test/modules/skills/skills.service.spec.ts`

**Endpoints to test:**
- `POST /api/skills` - Create skill
- `GET /api/skills` - List skills
- `GET /api/skills/:id` - Get skill by ID
- `PATCH /api/skills/:id` - Update skill
- `DELETE /api/skills/:id` - Soft delete skill
- `POST /api/skills/search` - Semantic search
- `POST /api/skills/import` - Import skills
- `GET /api/skills/export` - Export skills
- `GET /api/skills/:id/applications` - Application history

- [ ] **Step 1: Write skills controller tests**

Tests for all CRUD endpoints with mock service.

- [ ] **Step 2: Write skills service tests**

Tests for business logic: create, findAll, findOne, update, remove, semanticSearch, importSkills, exportSkills.

- [ ] **Step 3: Run tests to verify they pass**

Run: `npm test -- --testPathPattern=skills`
Expected: PASS

---

## Task 3: Documents Module Tests

**Files:**
- Create: `test/modules/documents/documents.controller.spec.ts`
- Test: `test/modules/documents/documents.service.spec.ts`

**Endpoints to test:**
- `POST /api/documents/upload` - Upload document
- `GET /api/documents` - List documents
- `GET /api/documents/:id` - Get document
- `PATCH /api/documents/:id` - Update document
- `DELETE /api/documents/:id` - Delete document
- `GET /api/documents/:id/extracted-text` - Get extracted text
- `POST /api/documents/:id/preprocess` - Trigger preprocessing
- `GET /api/documents/:id/download` - Download original

- [ ] **Step 1: Write documents controller tests**

- [ ] **Step 2: Write documents service tests**

Includes file storage mock, document preprocessing tests.

- [ ] **Step 3: Run tests to verify they pass**

---

## Task 4: Sessions Module Tests

**Files:**
- Create: `test/modules/sessions/sessions.controller.spec.ts`
- Test: `test/modules/sessions/sessions.service.spec.ts`

**Endpoints to test:**
- `POST /api/sessions` - Create session
- `GET /api/sessions` - List sessions
- `GET /api/sessions/:id` - Get session
- `PATCH /api/sessions/:id` - Update session
- `DELETE /api/sessions/:id` - Delete session
- `POST /api/sessions/:id/start` - Start session
- `POST /api/sessions/:id/complete` - Complete session
- `POST /api/sessions/:id/pause` - Pause session

- [ ] **Step 1: Write sessions controller tests**

- [ ] **Step 2: Write sessions service tests**

Includes FSM state machine tests.

- [ ] **Step 3: Run tests to verify they pass**

---

## Task 5: Rules Module Tests

**Files:**
- Create: `test/modules/rules/rules.controller.spec.ts`
- Test: `test/modules/rules/rules.service.spec.ts`

**Endpoints to test:**
- `POST /api/rules` - Create rule
- `GET /api/rules` - List rules
- `GET /api/rules/:id` - Get rule
- `PATCH /api/rules/:id` - Update rule
- `DELETE /api/rules/:id` - Delete rule
- `POST /api/rules/:id/test` - Test rule
- `GET /api/rules/:id/versions` - Get rule versions
- `POST /api/rules/:id/activate` - Activate rule
- `POST /api/rules/:id/deactivate` - Deactivate rule

- [ ] **Step 1: Write rules controller tests**

- [ ] **Step 2: Write rules service tests**

Includes rule conflict detection, version history.

- [ ] **Step 3: Run tests to verify they pass**

---

## Task 6: Workflows Module Tests

**Files:**
- Create: `test/modules/workflows/workflows.controller.spec.ts`
- Test: `test/modules/workflows/workflows.service.spec.ts`

**Endpoints to test:**
- `POST /api/workflows` - Create workflow
- `GET /api/workflows` - List workflows
- `GET /api/workflows/:id` - Get workflow
- `PATCH /api/workflows/:id` - Update workflow
- `DELETE /api/workflows/:id` - Delete workflow
- `POST /api/workflows/:id/publish` - Publish workflow
- `GET /api/workflows/:id/export` - Export workflow
- `POST /api/workflows/:id/import` - Import workflow
- `GET /api/workflows/:id/versions` - Get versions

- [ ] **Step 1: Write workflows controller tests**

- [ ] **Step 2: Write workflows service tests**

- [ ] **Step 3: Run tests to verify they pass**

---

## Task 7: Messages Module Tests

**Files:**
- Create: `test/modules/messages/messages.controller.spec.ts`
- Test: `test/modules/messages/messages.service.spec.ts`

**Endpoints to test:**
- `POST /api/messages` - Create message
- `GET /api/messages` - List messages
- `GET /api/messages/:id` - Get message
- `DELETE /api/messages/:id` - Delete message
- `GET /api/sessions/:sessionId/messages` - Session messages

- [ ] **Step 1: Write messages controller tests**

- [ ] **Step 2: Write messages service tests**

- [ ] **Step 3: Run tests to verify they pass**

---

## Task 8: Organizations Module Tests

**Files:**
- Create: `test/modules/organizations/organizations.controller.spec.ts`
- Test: `test/modules/organizations/organizations.service.spec.ts`

**Endpoints to test:**
- `POST /api/organizations` - Create organization
- `GET /api/organizations` - List organizations
- `GET /api/organizations/:id` - Get organization
- `PATCH /api/organizations/:id` - Update organization
- `POST /api/organizations/:id/members` - Add member
- `DELETE /api/organizations/:id/members/:userId` - Remove member

- [ ] **Step 1: Write organizations controller tests**

- [ ] **Step 2: Write organizations service tests**

- [ ] **Step 3: Run tests to verify they pass**

---

## Task 9: Comments Module Tests

**Files:**
- Create: `test/modules/comments/comments.controller.spec.ts`
- Test: `test/modules/comments/comments.service.spec.ts`

**Endpoints to test:**
- `POST /api/comments` - Create comment
- `GET /api/comments` - List comments
- `GET /api/comments/:id` - Get comment
- `PATCH /api/comments/:id` - Update comment
- `DELETE /api/comments/:id` - Delete comment

- [ ] **Step 1: Write comments controller tests**

- [ ] **Step 2: Write comments service tests**

- [ ] **Step 3: Run tests to verify they pass**

---

## Task 10: Health Module Tests

**Files:**
- Create: `test/modules/health/health.controller.spec.ts`

**Endpoints to test:**
- `GET /api/health` - Health check
- `GET /api/health/live` - Liveness probe
- `GET /api/health/ready` - Readiness probe

- [ ] **Step 1: Write health controller tests**

- [ ] **Step 2: Run tests to verify they pass**

---

## Task 11: AI Gateway Module Tests

**Files:**
- Create: `test/modules/ai-gateway/ai-gateway.service.spec.ts`

**Tests:**
- Task creation
- Task processing
- Retry logic
- DLQ handling

- [ ] **Step 1: Write AI Gateway service tests**

- [ ] **Step 2: Run tests to verify they pass**

---

## Task 12: Realtime Module Tests (WebSocket)

**Files:**
- Create: `test/modules/realtime/realtime.gateway.spec.ts`

**Tests:**
- WebSocket connection
- Room join/leave
- Message broadcast
- JWT authentication on handshake

- [ ] **Step 1: Write realtime gateway tests**

Using @nestjs/websockets/testing

- [ ] **Step 2: Run tests to verify they pass**

---

## Task 13: Infrastructure Tests (NATS)

**Files:**
- Create: `test/infra/nats/nats.publisher.service.spec.ts`

**Tests:**
- Publish message
- Subscribe to subject
- Connection handling
- Error handling

- [ ] **Step 1: Write NATS publisher service tests**

- [ ] **Step 2: Run tests to verify they pass**

---

## Task 14: Integration Tests (Optional - Full Coverage)

**Files:**
- Modify: `test/jest-e2e.config.ts`

**Purpose:** End-to-end tests with real database (Optional - requires Docker)

- [ ] **Step 1: Create e2e test configuration**

- [ ] **Step 2: Add e2e tests for critical paths**

---

## Execution Order

1. Task 1: Create test infrastructure (conftest.ts) - Foundation for all other tests
2. Tasks 2-13: Individual module tests (can run in parallel after Task 1)
3. Task 14: Integration tests (optional)

**Recommended approach:** Execute Tasks 2-13 in parallel using BatchExecutor after Task 1 is complete.

---

## Verification Commands

```bash
# Run all tests
npm test

# Run specific module tests
npm test -- --testPathPattern=skills
npm test -- --testPathPattern=documents
npm test -- --testPathPattern=sessions
npm test -- --testPathPattern=rules
npm test -- --testPathPattern=workflows
npm test -- --testPathPattern=messages
npm test -- --testPathPattern=organizations
npm test -- --testPathPattern=comments
npm test -- --testPathPattern=health
npm test -- --testPathPattern=ai-gateway
npm test -- --testPathPattern=realtime
npm test -- --testPathPattern=nats

# Run with coverage
npm test -- --coverage

# Expected: All tests PASS
```