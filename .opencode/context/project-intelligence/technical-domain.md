<!-- Context: project-intelligence/technical | Priority: critical | Version: 1.1 | Updated: 2026-04-25 -->

# Technical Domain

**Purpose**: NestJS architecture, patterns, and code standards for this codebase.
**Last Updated**: 2026-04-25
**Version**: 1.1

---

## ⚠️ SKILL PRIORITY: NestJS Skills Override Codebase

> **IMPORTANT**: When generating code, follow NestJS global skills (nestjs, nestjs-best-practices) patterns FIRST. The skills represent production best practices and SHOULD override the actual codebase structure where they differ.

### Priority Order:
1. **NestJS Skills** (`nestjs`, `nestjs-best-practices`) - Primary reference
2. **This Context** - Project-specific adaptations
3. **Codebase** - Last resort (may have outdated patterns)

### Skills vs Codebase Conflicts:
| Area | Global Skill Says | Codebase Has | Use |
|------|--------------|------------|-----|
| ORM | Drizzle ORM | TypeORM | Skills: Drizzle patterns adapt to TypeORM |
| Auth | Implement full auth | User entity only | Follow skills to implement |
| DTOs | Zod | class-validator | Skills with class-validator |

---

## Project Status: Auth Not Implemented

### Current State:
- ✅ User entity exists (`src/modules/auth/entities/user.entity.ts`)
- ✅ User roles defined (`UserRole` in enums)
- ❌ Auth controller NOT implemented
- ❌ Auth service NOT implemented
- ❌ Login/Register endpoints missing
- ❌ JWT strategy NOT configured in Passport
- ❌ Login history tracking exists but not used

### Required Auth Implementation (Follow NestJS Skills):

```typescript
// 1. Auth Controller (CREATE)
@Controller('auth')
export class AuthController {
  @Post('register')
  register(@Body() dto: RegisterDto) { ... }
  
  @Post('login')
  login(@Body() dto: LoginDto) { ... }
  
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) { ... }
  
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout() { ... }
}

// 2. Auth Service
@Injectable()
export class AuthService {
  async validateUser(email, password) { ... }
  async login(user, response) { ... }
  async register(dto) { ... }
  async refreshToken(refreshToken) { ... }
}

// 3. JWT Strategy (CREATE)
export class JwtStrategy extends PassportStrategy(Strategy) {
  async validate(payload) { ... }
}

// 4. Local Strategy (CREATE)
export class LocalStrategy extends PassportStrategy(Strategy, 'local') {
  async validate(email, password) { ... }
}
```

### Login History Usage:
The codebase has `LoginHistory` entity - implement to track:
- Successful logins
- Failed attempts (with IP, user-agent)
- Logout events

## Quick Reference
**Update Triggers**: Tech stack changes | New patterns | Architecture decisions
**Audience**: Developers, AI agents

---

## Primary Stack

| Layer | Technology | Version | Rationale |
|-------|------------|---------|-----------|
| Framework | NestJS | 10.3.x | Enterprise Node.js framework |
| Language | TypeScript | 5.3.x | Type safety |
| ORM | TypeORM | 0.3.x | PostgreSQL integration |
| Database | PostgreSQL | 15+ | Primary data store |
| Auth | Passport + JWT | | Standard auth |
| Validation | class-validator | 0.14.x | DTO validation |
| API Docs | Swagger/OpenAPI | 7.3.x | API documentation |
| Events | NATS | 2.x | Event publishing |
| Logging | Pino | 8.x | Structured logging |
| File Storage | S3/MinIO | 7.x | Document storage |

---

## Project Structure

```
src/
├── app.module.ts              # Root module - imports all feature modules
├── main.ts                    # Application bootstrap
├── core/                     # Core utilities
│   ├── config/               # Configuration (env validation, config service)
│   ├── guards/               # Global guards (JwtAuthGuard, RolesGuard)
│   ├── decorators/           # Custom decorators (@CurrentUser)
│   ├── context/               # Request context service
│   └── logger/               # Logger module (Pino)
├── database/
│   ├── enums/               # Database enums (SessionStatus, UserRole, etc.)
│   ├── types/               # Custom types (JsonValue)
│   └── migrations/           # TypeORM migrations
├── modules/                   # Feature modules
│   ├── auth/                # Authentication
│   ├── sessions/            # Sessions (core business logic)
│   ├── workflows/           # Workflows
│   ├── documents/           # Documents
│   ├── messages/            # Messages
│   ├── organizations/       # Organizations
│   ├── agents/             # AI Agents
│   ├── divergence/         # Divergence detection
│   ├── skills/             # Skills management
│   ├── health/             # Health indicators
│   └── realtime/           # WebSocket gateway
└── infra/                    # Infrastructure
    └── nats/               # NATS publisher
```

---

## Module Pattern

### Feature Module Structure

```typescript
// {module-name}.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SomeEntity } from './entities/some.entity';
import { SomeController } from './some.controller';
import { SomeService } from './some.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SomeEntity, RelatedEntity]),
    // Import other modules (e.g., NatsModule, AIGatewayModule)
  ],
  controllers: [SomeController],
  providers: [SomeService],
  exports: [SomeService],
})
export class SomeModule {}
```

### Controllers

```typescript
// {module-name}.controller.ts
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { CurrentUser } from '@/core/decorators/current-user.decorator';
import { Roles } from '@/core/decorators/roles.decorator';
import { UserRole } from '@/database/enums';
import { SomeGuard } from './some.guard';
import { SomeService } from './some.service';

type RequestUser = {
  id: string;
  orgId: string;
  role: UserRole | string;
};

@ApiTags('module-name')
@ApiBearerAuth()
@Controller('resource')
export class SomeController {
  constructor(private readonly service: SomeService) {}

  @Post()
  @ApiOperation({ summary: 'Create something' })
  @ApiResponse({ status: 201, description: 'Created' })
  create(@Body() dto: CreateDto, @CurrentUser() caller: RequestUser) {
    return this.service.create(dto, caller);
  }

  @Get(':id')
  @UseGuards(SomeOrgGuard)
  @ApiOperation({ summary: 'Get something' })
  get(@Param('id') id: string, @CurrentUser() caller: RequestUser) {
    return this.service.findOne(id, caller);
  }
}
```

### Services

```typescript
// {module-name}.service.ts
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SomeEntity } from './entities/some.entity';
import { CreateDto, UpdateDto } from './dto';
import { UserRole } from '@/database/enums';

type RequestUser = {
  id: string;
  orgId: string;
  role: UserRole | string;
};

@Injectable()
export class SomeService {
  constructor(
    @InjectRepository(SomeEntity)
    private readonly repository: Repository<SomeEntity>,
  ) {}

  async create(dto: CreateDto, caller: RequestUser) {
    const entity = this.repository.create({
      ...dto,
      orgId: caller.orgId,
    });
    return this.repository.save(entity);
  }

  async findOne(id: string, caller: RequestUser) {
    const entity = await this.repository.findOne({
      where: { id, orgId: caller.orgId },
    });
    if (!entity) throw new NotFoundException('Not found');
    return entity;
  }

  async findAll(caller: RequestUser) {
    return this.repository.find({ where: { orgId: caller.orgId } });
  }

  private assertOwner(entity: SomeEntity, caller: RequestUser) {
    if (caller.role !== UserRole.ADMIN && entity.userId !== caller.id) {
      throw new ForbiddenException('Only owner or admin can modify');
    }
  }
}
```

---

## Entities

### Standard Entity Pattern

```typescript
// entities/some.entity.ts
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { SomeStatus } from '@/database/enums';

@Entity('some_table')
export class SomeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  orgId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: SomeStatus, default: SomeStatus.ACTIVE })
  status: SomeStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  archivedAt: Date | null;
}
```

### Enums (in database/enums/index.ts)

```typescript
// All enums in src/database/enums/index.ts
export enum UserRole {
  ADMIN = 'admin',
  PROCESS_OWNER = 'process_owner',
  BUSINESS_ANALYST = 'business_analyst',
  REVIEWER = 'reviewer',
  VIEWER = 'viewer',
}

export enum SessionStatus {
  CREATED = 'created',
  AWAITING_INPUT = 'awaiting_input',
  PROCESSING = 'processing',
  DRAFT_READY = 'draft_ready',
  NEEDS_RECONCILIATION = 'needs_reconciliation',
  IN_ELICITATION = 'in_elicitation',
  IN_REVIEW = 'in_review',
  VALIDATED = 'validated',
  EXPORTED = 'exported',
  ARCHIVED = 'archived',
  ERROR = 'error',
}
// ... more enums
```

---

## DTOs

### Create DTO Pattern

```typescript
// dto/create-some.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsUUID } from 'class-validator';

import { SomeType } from '@/database/enums';

export class CreateSomeDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  workflowId: string;

  @ApiProperty({ enum: SomeType })
  @IsEnum(SomeType)
  type: SomeType;

  @ApiProperty()
  @IsString()
  name: string;
}
```

### Update DTO Pattern

```typescript
// dto/update-some.dto.ts
import { PartialType } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { CreateSomeDto } from './create-some.dto';

export class UpdateSomeDto extends PartialType(CreateSomeDto) {
  @ApiPropertyOptional({ enum: SomeStatus })
  @IsEnum(SomeStatus)
  status?: SomeStatus;
}
```

---

## Guards

### Org Guard Pattern

```typescript
// {module-name}.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class SomeOrgGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const paramId = request.params.id;

    // Fetch entity and check orgId matches user.orgId
    const entity = await this.service.findOne(paramId);
    if (!entity) return false;
    if (entity.orgId !== user.orgId) return false;

    return true;
  }
}
```

### Roles Guard Decorator

```typescript
// src/core/decorators/roles.decorator.ts
import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@/database/enums';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
```

---

## Authentication Patterns

### JWT Auth Guard (Global)

```typescript
// src/core/guards/jwt-auth.guard.ts
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt-access') implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    // DEV bypass
    if (process.env.DEV_BYPASS_AUTH === 'true' && !request.headers.authorization) {
      request.user = { id: 'dev-user-id', role: 'admin', orgId: 'dev-org-id' };
      return true;
    }
    return super.canActivate(context) as boolean;
  }
}
```

### Current User Decorator

```typescript
// src/core/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
```

---

## RequestUser Type (Consistent)

All services use this type for authenticated users:

```typescript
type RequestUser = {
  id: string;
  orgId: string;
  role: UserRole | string;
};
```

Controllers receive this from `@CurrentUser()` decorator.

---

## API Response Patterns

### Standard Responses in Controller

- `@ApiBearerAuth()` - Requires JWT
- `@ApiTags('resource')` - Groups endpoints
- `@ApiOperation({ summary: '...' })` - Endpoint description
- `@ApiResponse({ status: 201, description: '...' })` - Response docs
- `@UseGuards(OrgGuard)` - Organization-level access control
- `@Roles(UserRole.ADMIN)` - Role-based access (optional)

---

## Naming Conventions

| Type | Convention | Example |
|------|-----------|----------|
| Files | kebab-case | session-fsm.ts |
| Modules | kebab-case | sessions.module.ts |
| Services | kebab-case | sessions.service.ts |
| Controllers | kebab-case | sessions.controller.ts |
| Entities | kebab-case | session.entity.ts |
| DTOs | kebab-case | create-session.dto.ts |
| Enums | PascalCase | SessionStatus |
| Classes | PascalCase | SessionsService |
| Database Tables | snake_case | session_table |
| Database Columns | snake_case | created_at |

---

## Code Standards

1. **TypeScript**: Strict mode enabled
2. **Validation**: Use class-validator + class-transformer
3. **Auth**: JWT via Passport, org-scoped access
4. **Database**: TypeORM with SnakeNamingStrategy
5. **Enums**: Stored in database/enums/index.ts
6. **Org Isolation**: Always filter by orgId from RequestUser
7. **Guards**: Use Org*Guard for resource-level access
8. **Exceptions**: Use NestJS built-in (NotFoundException, ForbiddenException)
9. **Logging**: Use injected Logger from core
10. **Events**: Publish via NatsPublisherService
11. **Testing**: Jest with supertest

---

## Import Aliases

```json
// tsconfig.json paths
{
  "@/*": ["src/*"],
  "@modules/*": ["src/modules/*"],
  "@core/*": ["src/core/*"],
  "@infra/*": ["src/infra/*"],
  "@database/*": ["src/database/*"]
}
```

Example: `import { Session } from '@/modules/sessions/entities/session.entity';`

---

## 📂 Codebase References

| Implementation | File | Description |
|----------------|------|-------------|
| Root Module | src/app.module.ts | Imports all feature modules |
| Sessions Module | src/modules/sessions/sessions.module.ts | Example feature module |
| Sessions Service | src/modules/sessions/sessions.service.ts | Service pattern |
| Sessions Controller | src/modules/sessions/sessions.controller.ts | Controller pattern |
| Session Entity | src/modules/sessions/entities/session.entity.ts | Entity pattern |
| Create Session DTO | src/modules/sessions/dto/create-session.dto.ts | DTO pattern |
| Enums | src/database/enums/index.ts | All database enums |
| JWT Auth Guard | src/core/guards/jwt-auth.guard.ts | Auth guard |
| Current User Decorator | src/core/decorators/current-user.decorator.ts | User decorator |

---

## Related Context

- business-domain.md - Business logic patterns
- decisions-log.md - Architecture decisions