<!-- Context: project-intelligence/navigation | Priority: high | Version: 1.1 | Updated: 2026-04-25 -->

# Project Intelligence Navigation

## Priority: NestJS Skills First

> **IMPORTANT**: When generating code, ALWAYS load NestJS global skills first:
> - `nestjs` - Full NestJS patterns with Drizzle ORM adaptation
> - `nestjs-best-practices` - Production best practices
> 
> Then load this context for project-specific overrides.

## Quick Routes

| File | Description | Priority |
|------|-------------|----------|
| [technical-domain.md](./technical-domain.md) | Tech stack, architecture, NestJS patterns | critical |

## Deep Dives

| File | Description |
|------|-------------|

## Context Structure

```
.opencode/context/project-intelligence/
├── technical-domain.md    # Main context (NestJS patterns + project)
└── navigation.md         # This file
```

## Key Files to Know

| File | Location | Use |
|------|----------|-----|
| NestJS Skill | `~/.config/opencode/skills/nestjs/SKILL.md` | Primary patterns |
| NestJS Best Practices | `~/.config/opencode/skills/nestjs-best-practices/SKILL.md` | Best practices |
| This Context | `.opencode/context/project-intelligence/technical-domain.md` | Codebase overrides |

## Usage

When generating code:
1. Load NestJS skills first
2. Load technical-domain.md for project-specific info
3. Generate code following skill patterns (not raw codebase)

## Updating

Run `/add-context --update` when:
- Add new libraries
- Change patterns
- Migrate tech stack