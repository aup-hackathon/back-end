---
type: feature
priority: high
created: 2026-04-25T01:45:00Z
created_by: OpenAgent
status: created
tags: [projects, workflows, organization, module]
keywords: [projects module, workflow grouping, audit trail, nested routes]
patterns: [REST API patterns, cascade delete, audit logging, entity relationships]
---

# FEATURE-001: Projects Module for Workflow Organization

## Description

Create a new "Projects" module to organize workflows under projects. Each project can contain multiple workflows, allowing workflow integrators to group related workflows together. This provides better organization, especially when managing multiple clients or workflow families.

## Context

**Problem**: Currently, all workflows exist in a flat structure with no organizational layer. As the number of workflows grows, it becomes difficult to manage and locate specific workflows.

**Solution**: Introduce projects as a grouping mechanism. Each project can hold multiple workflows, making it easier to:
- Organize workflows by client/purpose
- Track workflow ownership
- Bulk operate on related workflows in the future
- Provide audit trail for accountability

## Requirements

### Functional Requirements

- **R1**: Create project with auto-generated ID and custom name
  - Project ID: UUID or auto-increment (system-generated)
  - Project name: User-provided, unique within active projects
  - Project status: ACTIVE by default (no archival for now)

- **R2**: Assign workflow to project
  - Workflow must be created with a project reference
  - No default project - explicit assignment required
  - Once assigned, workflow CANNOT be moved to another project

- **R3**: List workflows within a project
  - API: GET /projects/:projectId/workflows
  - Return paginated list of workflows in that project

- **R4**: Get project by ID
  - API: GET /projects/:projectId
  - Return project details

- **R5**: List all projects
  - API: GET /projects
  - Return paginated list of all projects

- **R6**: Delete project with cascade
  - API: DELETE /projects/:projectId
  - When project is deleted, ALL its workflows are also deleted
  - Cascades to workflow executions/runs
  - Audit trail logs the deletion

- **R7**: Audit trail for project operations
  - Track: project creation, workflow assignment, project deletion
  - Store: actor (user/system), timestamp, action, metadata

### Non-Functional Requirements

- **NFR1**: Scalable design - no hard limits on projects/workflows (support hundreds of thousands)
- **NFR2**: API response consistency - follow existing patterns
- **NFR3**: Performance - listing projects should be fast with proper indexes

## Current State

- All workflows exist in a flat structure (no grouping)
- No project entity exists
- Workflows have no project association

## Desired State

```
Projects Table:
├── id (UUID/auto-increment)
├── name (string, required, unique)
├── created_at
├── updated_at
└── created_by

Workflows Table (updated):
├── id
├── name
├── project_id (NEW - foreign key to projects)
├── ...
└── [existing fields]

Audit Logs (updated):
├── id
├── entity_type (project|workflow)
├── entity_id
├── action (created|assigned|deleted)
├── actor
├── timestamp
└── metadata (JSON)
```

## Research Context

### Keywords to Search
- project - Existing entity patterns
- workflow - Current workflow DB schema
- audit - Existing audit logging patterns
- nested routes - Current API route conventions
- cascade delete - How deletions are handled

### Patterns to Investigate
- REST API patterns - Current route structures
- Database migrations - How schema changes are applied
- Audit logging - Existing audit implementation
- Entity relationships - How foreign keys are defined

### Key Decisions Made
- Nested API routes: /projects/:id/workflows (NOT query param)
- Project deletion cascades to workflows (no orphan workflows)
- Flat structure (no parent/child project hierarchy)
- No default project (explicit assignment required)
- Workflows are FIXED to their project once created (not movable)

## Success Criteria

### Automated Verification
- [ ] Can create project with name
- [ ] Project gets auto-generated ID
- [ ] Can create workflow with project assignment
- [ ] GET /projects/:id/workflows returns correct workflows
- [ ] DELETE /projects/:id deletes project AND its workflows
- [ ] Audit trail logs project creation
- [ ] Audit trail logs deletion

### Manual Verification
- [ ] Project appears in list after creation
- [ ] Workflows show under correct project
- [ ] Cannot create workflow without project_id
- [ ] Deleted project and workflows no longer exist

## API Endpoints

| Method | Endpoint | Description |
|--------|---------|------------|
| POST | /projects | Create new project |
| GET | /projects | List all projects |
| GET | /projects/:id | Get project by ID |
| DELETE | /projects/:id | Delete project (cascade) |
| GET | /projects/:id/workflows | List workflows in project |

## Related Information

- Related ticket: [if audit module exists]
- Depends on: [database migration capability]

## Notes

- Future considerations (out of scope):
  - Moveable workflows between projects
  - Project archival status
  - Project-level settings (retention, timeouts)
  - Client integration
  - Import/Export projects