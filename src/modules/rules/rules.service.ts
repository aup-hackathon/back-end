import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { createHash } from 'crypto';
import { DataSource, IsNull, Repository } from 'typeorm';

import { ActorType, AgentType, RuleScope, RuleType, UserRole } from '../../database/enums';
import { AgentExecution } from '../agents/entities';
import { AuditService } from '../audit/audit.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { Session } from '../sessions/entities';
import { Workflow } from '../workflows/entities';
import { RuleApplication, RuleVersion, Rule } from './entities';
import { CreateRuleDto, ImportRulesBundleDto, RuleBundleRuleDto, RulesFilterDto, TestRuleDto, UpdateRuleDto } from './dto/rules.dto';

type RequestUser = {
  id: string;
  orgId: string;
  role: UserRole | string;
};

type SessionContext = {
  org_id: string;
  workflow_id: string;
  session_id: string;
  session_mode: string;
  session_status: string;
  workflow_status: string;
  workflow_domain: string | null;
  workflow_tags: string[];
  user_id: string;
};

type SimulationCacheEntry = {
  expiresAt: number;
  result: Record<string, unknown>;
};

const ACTIVE_RULE_CACHE_TTL_MS = 60_000;
const SIMULATION_CACHE_TTL_MS = 5 * 60_000;
const CONTRADICTABLE_RULE_TYPES = new Set<RuleType>([
  RuleType.ACTOR_MAPPING,
  RuleType.STRUCTURAL_CONSTRAINT,
]);

@Injectable()
export class RulesService {
  private readonly activeRuleCache = new Map<string, { expiresAt: number; rules: Rule[] }>();
  private readonly simulationCache = new Map<string, SimulationCacheEntry>();

  constructor(
    @InjectRepository(Rule)
    private readonly rulesRepository: Repository<Rule>,
    @InjectRepository(RuleVersion)
    private readonly ruleVersionsRepository: Repository<RuleVersion>,
    @InjectRepository(RuleApplication)
    private readonly ruleApplicationsRepository: Repository<RuleApplication>,
    @InjectRepository(Session)
    private readonly sessionsRepository: Repository<Session>,
    @InjectRepository(Workflow)
    private readonly workflowsRepository: Repository<Workflow>,
    @InjectRepository(AgentExecution)
    private readonly agentExecutionsRepository: Repository<AgentExecution>,
    private readonly dataSource: DataSource,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateRuleDto, caller: RequestUser) {
    this.assertRuleManager(caller);
    const workflowId = dto.workflow_id ?? null;
    await this.assertScopeConsistency(dto.scope, workflowId, dto.target_agent ?? null, caller.orgId);

    const candidate = this.rulesRepository.create({
      orgId: caller.orgId,
      workflowId,
      name: dto.name.trim(),
      description: dto.description?.trim() ?? null,
      ruleType: dto.type,
      scope: dto.scope,
      targetAgent: dto.target_agent ?? null,
      condition: dto.condition ?? null,
      instruction: dto.instruction.trim(),
      priority: dto.priority ?? 100,
      version: 1,
      isActive: true,
      createdBy: caller.id,
    });

    await this.ensureNoConflict(candidate);

    const saved = await this.rulesRepository.save(candidate);
    await this.insertAuditLog(saved.workflowId, caller.id, 'RULE_CREATED', null, this.auditShape(saved));
    this.invalidateOrgRuleCache(caller.orgId);
    this.invalidateRuleSimulationCache(saved.id);

    return { rule: this.serializeRule(saved) };
  }

  async findAll(filter: RulesFilterDto, orgId: string) {
    const query = this.rulesRepository.createQueryBuilder('rule')
      .where('rule.orgId = :orgId', { orgId })
      .andWhere('rule.isActive = :isActive', { isActive: true });

    if (filter.type) {
      query.andWhere('rule.ruleType = :ruleType', { ruleType: filter.type });
    }

    if (filter.scope) {
      query.andWhere('rule.scope = :scope', { scope: filter.scope });
    }

    if (filter.agent_type) {
      query.andWhere('rule.targetAgent = :targetAgent', { targetAgent: filter.agent_type });
    }

    const rules = await query
      .orderBy('rule.priority', 'DESC')
      .addOrderBy('rule.updatedAt', 'DESC')
      .getMany();

    return {
      rules: rules.map((rule) => this.serializeRule(rule)),
      total: rules.length,
    };
  }

  async findOne(id: string, orgId: string) {
    const rule = await this.findRuleOrThrow(id, orgId);
    const versions = await this.ruleVersionsRepository.find({
      where: { ruleId: rule.id },
      order: { createdAt: 'DESC' },
    });

    return {
      rule: this.serializeRule(rule),
      versions: versions.map((version) => this.serializeRuleVersion(version)),
    };
  }

  async update(id: string, dto: UpdateRuleDto, caller: RequestUser) {
    this.assertRuleManager(caller);
    const rule = await this.findRuleOrThrow(id, caller.orgId);
    const beforeState = this.auditShape(rule);

    const nextInstruction =
      dto.instruction !== undefined ? dto.instruction.trim() : rule.instruction;
    const nextCondition =
      dto.condition !== undefined ? (dto.condition as Record<string, unknown> | null) : rule.condition;
    const nextPriority = dto.priority ?? rule.priority;
    const nextIsActive = dto.is_active ?? rule.isActive;

    const hasChanges =
      nextInstruction !== rule.instruction ||
      !this.deepEqual(nextCondition, rule.condition) ||
      nextPriority !== rule.priority ||
      nextIsActive !== rule.isActive;

    if (!hasChanges) {
      return { rule: this.serializeRule(rule) };
    }

    const nextRule = this.rulesRepository.create({
      ...rule,
      instruction: nextInstruction,
      condition: nextCondition,
      priority: nextPriority,
      isActive: nextIsActive,
    });

    if (nextRule.isActive) {
      await this.ensureNoConflict(nextRule, rule.id);
    }

    const requiresVersionSnapshot =
      nextInstruction !== rule.instruction ||
      !this.deepEqual(nextCondition, rule.condition) ||
      nextPriority !== rule.priority ||
      nextIsActive !== rule.isActive;

    if (requiresVersionSnapshot) {
      await this.ruleVersionsRepository.insert({
        ruleId: rule.id,
        version: rule.version,
        instruction: rule.instruction,
        condition: rule.condition,
        priority: rule.priority,
        isActive: rule.isActive,
        changedBy: caller.id,
      });
      nextRule.version = rule.version + 1;
    }

    const saved = await this.rulesRepository.save(nextRule);
    const auditEvent =
      nextIsActive !== rule.isActive && !dto.instruction && dto.priority === undefined && dto.condition === undefined
        ? nextIsActive
          ? 'RULE_ACTIVATED'
          : 'RULE_DEACTIVATED'
        : 'RULE_UPDATED';
    await this.insertAuditLog(saved.workflowId, caller.id, auditEvent, beforeState, this.auditShape(saved));
    this.invalidateOrgRuleCache(caller.orgId);
    this.invalidateRuleSimulationCache(saved.id);

    return { rule: this.serializeRule(saved) };
  }

  async activate(id: string, caller: RequestUser) {
    this.assertRuleManager(caller);
    const rule = await this.findRuleOrThrow(id, caller.orgId);
    if (rule.isActive) {
      return { rule: this.serializeRule(rule) };
    }

    await this.ensureNoConflict({ ...rule, isActive: true }, rule.id);
    await this.snapshotRuleVersion(rule, caller.id);

    const beforeState = this.auditShape(rule);
    rule.isActive = true;
    rule.version += 1;
    const saved = await this.rulesRepository.save(rule);
    await this.insertAuditLog(saved.workflowId, caller.id, 'RULE_ACTIVATED', beforeState, this.auditShape(saved));
    this.invalidateOrgRuleCache(caller.orgId);
    this.invalidateRuleSimulationCache(saved.id);

    return { rule: this.serializeRule(saved) };
  }

  async deactivate(id: string, caller: RequestUser) {
    this.assertRuleManager(caller);
    const rule = await this.findRuleOrThrow(id, caller.orgId);
    if (!rule.isActive) {
      return { rule: this.serializeRule(rule) };
    }

    await this.snapshotRuleVersion(rule, caller.id);

    const beforeState = this.auditShape(rule);
    rule.isActive = false;
    rule.version += 1;
    const saved = await this.rulesRepository.save(rule);
    await this.insertAuditLog(saved.workflowId, caller.id, 'RULE_DEACTIVATED', beforeState, this.auditShape(saved));
    this.invalidateOrgRuleCache(caller.orgId);
    this.invalidateRuleSimulationCache(saved.id);

    return { rule: this.serializeRule(saved) };
  }

  async softDelete(id: string, caller: RequestUser) {
    this.assertRuleManager(caller);
    const rule = await this.findRuleOrThrow(id, caller.orgId);
    const beforeState = this.auditShape(rule);

    if (rule.isActive) {
      await this.snapshotRuleVersion(rule, caller.id);
      rule.isActive = false;
      rule.version += 1;
      await this.rulesRepository.save(rule);
    }

    await this.insertAuditLog(rule.workflowId, caller.id, 'RULE_DELETED', beforeState, this.auditShape(rule));
    this.invalidateOrgRuleCache(caller.orgId);
    this.invalidateRuleSimulationCache(rule.id);
  }

  async exportRules(orgId: string) {
    const rules = await this.rulesRepository.find({
      where: { orgId, isActive: true },
      order: { priority: 'DESC', updatedAt: 'DESC' },
    });

    return {
      schema_version: '1.0',
      exported_at: new Date().toISOString(),
      rules: rules.map((rule) => ({
        name: rule.name,
        description: rule.description,
        type: rule.ruleType,
        scope: rule.scope,
        workflow_id: rule.workflowId,
        target_agent: rule.targetAgent,
        condition: rule.condition,
        instruction: rule.instruction,
        priority: rule.priority,
        version: rule.version,
        is_active: rule.isActive,
      })),
    };
  }

  async importRules(bundle: ImportRulesBundleDto, caller: RequestUser) {
    this.assertRuleManager(caller);

    const stagedRules: Rule[] = [];
    const activeRules = [...await this.getCachedActiveRules(caller.orgId)];

    for (const item of bundle.rules) {
      const candidate = await this.buildImportedRule(item, caller);
      if (candidate.isActive) {
        await this.ensureNoConflict(candidate, undefined, [...activeRules, ...stagedRules]);
      }
      stagedRules.push(candidate);
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Rule);
      return repository.save(stagedRules);
    });

    await this.insertAuditLog(
      null,
      caller.id,
      'RULE_IMPORTED',
      null,
      {
        schema_version: bundle.schema_version,
        imported_rule_ids: saved.map((rule) => rule.id),
        count: saved.length,
      },
    );
    this.invalidateOrgRuleCache(caller.orgId);

    return {
      imported_count: saved.length,
      rules: saved.map((rule) => this.serializeRule(rule)),
    };
  }

  async previewForSession(sessionId: string, caller: RequestUser) {
    const { session, rules } = await this.getSessionContextRules(sessionId, caller.orgId);

    return {
      session_id: session.id,
      workflow_id: session.workflowId,
      rules: rules.map((rule) => this.serializeRule(rule)),
    };
  }

  async listActiveRulesForContext(orgId: string, sessionId: string) {
    const { rules } = await this.getSessionContextRules(sessionId, orgId);

    return rules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      type: rule.ruleType,
      scope: rule.scope,
      workflow_id: rule.workflowId,
      target_agent: rule.targetAgent,
      condition: rule.condition,
      instruction: rule.instruction,
      priority: rule.priority,
      version: rule.version,
    }));
  }

  async listRuleApplicationsForAgentExecution(agentExecutionId: string, orgId: string) {
    const agentExecution = await this.agentExecutionsRepository.findOne({
      where: { id: agentExecutionId },
    });
    if (!agentExecution) {
      throw new NotFoundException('Agent execution not found');
    }

    const rows = await this.ruleApplicationsRepository.query(
      `
        SELECT
          ra.id,
          ra.rule_id AS "ruleId",
          ra.rule_version AS "ruleVersion",
          ra.agent_execution_id AS "agentExecutionId",
          ra.triggered,
          ra.impact_description AS "impactDescription",
          ra.created_at AS "createdAt",
          r.name AS "ruleName",
          r.rule_type AS "ruleType"
        FROM rule_application ra
        INNER JOIN agent_execution ae ON ae.id = ra.agent_execution_id
        INNER JOIN pipeline_execution pe ON pe.id = ae.pipeline_execution_id
        INNER JOIN session s ON s.id = pe.session_id
        INNER JOIN workflow w ON w.id = s.workflow_id
        INNER JOIN rule r ON r.id = ra.rule_id
        WHERE ra.agent_execution_id = $1
          AND w.org_id = $2
        ORDER BY ra.created_at ASC
      `,
      [agentExecutionId, orgId],
    );

    return {
      applications: rows.map((row: Record<string, unknown>) => ({
        id: row.id,
        rule_id: row.ruleId,
        rule_name: row.ruleName,
        rule_type: row.ruleType,
        rule_version: row.ruleVersion,
        agent_execution_id: row.agentExecutionId,
        triggered: row.triggered,
        impact_description: row.impactDescription,
        created_at: row.createdAt,
      })),
    };
  }

  async testRule(id: string, dto: TestRuleDto, caller: RequestUser) {
    const rule = await this.findRuleOrThrow(id, caller.orgId);
    const cacheKey = this.buildSimulationCacheKey(rule.id, dto.sample_text, dto.simulate_agent);
    const cached = this.simulationCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    const fastApiUrl = this.configService.get<string>('health.fastapiInternal');
    if (!fastApiUrl) {
      throw new BadGatewayException('FASTAPI internal URL is not configured');
    }

    const basePayload = {
      sample_text: dto.sample_text,
      simulate_agent: dto.simulate_agent,
    };

    const [withRule, withoutRule] = await Promise.all([
      axios.post(`${fastApiUrl}/internal/rules/simulate`, {
        ...basePayload,
        rule: this.serializeRule(rule),
      }),
      axios.post(`${fastApiUrl}/internal/rules/simulate`, {
        ...basePayload,
        rule: null,
      }),
    ]);

    const result = {
      with_rule_output: withRule.data,
      without_rule_output: withoutRule.data,
      diff_summary: this.buildDiffSummary(withRule.data, withoutRule.data),
    };

    this.simulationCache.set(cacheKey, {
      expiresAt: Date.now() + SIMULATION_CACHE_TTL_MS,
      result,
    });

    return result;
  }

  private async buildImportedRule(item: RuleBundleRuleDto, caller: RequestUser): Promise<Rule> {
    const workflowId = item.workflow_id ?? null;
    await this.assertScopeConsistency(item.scope, workflowId, item.target_agent ?? null, caller.orgId);

    return this.rulesRepository.create({
      orgId: caller.orgId,
      workflowId,
      name: item.name.trim(),
      description: item.description?.trim() ?? null,
      ruleType: item.type,
      scope: item.scope,
      targetAgent: item.target_agent ?? null,
      condition: item.condition ?? null,
      instruction: item.instruction.trim(),
      priority: item.priority ?? 100,
      version: item.version ?? 1,
      isActive: item.is_active ?? true,
      createdBy: caller.id,
    });
  }

  private async getSessionContextRules(sessionId: string, orgId: string) {
    const session = await this.sessionsRepository.findOne({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const workflow = await this.workflowsRepository.findOne({
      where: { id: session.workflowId, orgId },
    });
    if (!workflow) {
      throw new NotFoundException('Session not found');
    }

    const context = this.buildSessionContext(session, workflow);
    const rules = (await this.getCachedActiveRules(orgId))
      .filter((rule) => this.matchesSessionScope(rule, session.workflowId))
      .filter((rule) => this.matchesRuleCondition(rule.condition, context))
      .sort((left, right) => right.priority - left.priority || right.updatedAt.getTime() - left.updatedAt.getTime());

    return { session, workflow, rules };
  }

  private async getCachedActiveRules(orgId: string): Promise<Rule[]> {
    const cached = this.activeRuleCache.get(orgId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.rules;
    }

    const rules = await this.rulesRepository.find({
      where: { orgId, isActive: true },
      order: { priority: 'DESC', updatedAt: 'DESC' },
    });

    this.activeRuleCache.set(orgId, {
      expiresAt: Date.now() + ACTIVE_RULE_CACHE_TTL_MS,
      rules,
    });
    return rules;
  }

  private invalidateOrgRuleCache(orgId: string) {
    this.activeRuleCache.delete(orgId);
  }

  private invalidateRuleSimulationCache(ruleId: string) {
    for (const key of this.simulationCache.keys()) {
      if (key.startsWith(`${ruleId}:`)) {
        this.simulationCache.delete(key);
      }
    }
  }

  private matchesSessionScope(rule: Rule, workflowId: string): boolean {
    if (rule.scope === RuleScope.WORKFLOW) {
      return rule.workflowId === workflowId;
    }

    if (rule.workflowId && rule.workflowId !== workflowId) {
      return false;
    }

    return true;
  }

  private matchesRuleCondition(
    condition: Record<string, unknown> | null,
    context: SessionContext,
  ): boolean {
    if (!condition) {
      return true;
    }

    return Object.entries(condition).every(([key, expected]) => {
      const actual = (context as Record<string, unknown>)[key];
      if (Array.isArray(expected) && Array.isArray(actual)) {
        return expected.some((value) => actual.includes(value));
      }

      if (Array.isArray(expected)) {
        return expected.includes(actual);
      }

      if (Array.isArray(actual)) {
        return actual.includes(expected);
      }

      return this.deepEqual(actual, expected);
    });
  }

  private buildSessionContext(session: Session, workflow: Workflow): SessionContext {
    return {
      org_id: workflow.orgId,
      workflow_id: workflow.id,
      session_id: session.id,
      session_mode: session.mode,
      session_status: session.status,
      workflow_status: workflow.status,
      workflow_domain: workflow.domain,
      workflow_tags: workflow.tags ?? [],
      user_id: session.userId,
    };
  }

  private async ensureNoConflict(
    candidate: Pick<Rule, 'id' | 'orgId' | 'workflowId' | 'name' | 'ruleType' | 'scope' | 'targetAgent' | 'condition' | 'instruction' | 'isActive'>,
    excludeRuleId?: string,
    rulePool?: Rule[],
  ) {
    if (!candidate.isActive || !CONTRADICTABLE_RULE_TYPES.has(candidate.ruleType)) {
      return;
    }

    const candidates = rulePool ?? await this.rulesRepository.find({
      where: {
        orgId: candidate.orgId,
        isActive: true,
        ruleType: candidate.ruleType,
        scope: candidate.scope,
        targetAgent: candidate.targetAgent === null ? IsNull() : candidate.targetAgent,
        workflowId: candidate.workflowId === null ? IsNull() : candidate.workflowId,
      },
      order: { priority: 'DESC', updatedAt: 'DESC' },
    });

    const conflictingRule = candidates.find((existingRule) => {
      if (excludeRuleId && existingRule.id === excludeRuleId) {
        return false;
      }

      if (!this.conditionsOverlap(candidate.condition, existingRule.condition)) {
        return false;
      }

      return this.hasTypeSpecificConflict(candidate, existingRule);
    });

    if (!conflictingRule) {
      return;
    }

    const conflictDetail = this.buildConflictDetail(candidate, conflictingRule);
    this.emitConflictEvent(candidate, conflictingRule, conflictDetail);
    throw new ConflictException({
      code: 'RULE_CONFLICT',
      conflicting_rule_id: conflictingRule.id,
      conflicting_rule_name: conflictingRule.name,
      conflict_detail: conflictDetail,
    });
  }

  private conditionsOverlap(
    left: Record<string, unknown> | null,
    right: Record<string, unknown> | null,
  ): boolean {
    if (left === null && right === null) {
      return true;
    }

    if (!left || !right) {
      return false;
    }

    const sharedKeys = Object.keys(left).filter((key) => key in right);
    return sharedKeys.some((key) => this.deepEqual(left[key], right[key]));
  }

  private hasTypeSpecificConflict(
    candidate: Pick<Rule, 'ruleType' | 'condition' | 'instruction'>,
    existingRule: Pick<Rule, 'condition' | 'instruction'>,
  ): boolean {
    if (candidate.ruleType === RuleType.ACTOR_MAPPING) {
      const sourceLeft = this.pickFirstValue(candidate.condition, ['source_label', 'source', 'actor', 'alias']);
      const sourceRight = this.pickFirstValue(existingRule.condition, ['source_label', 'source', 'actor', 'alias']);
      const targetLeft = this.pickFirstValue(candidate.condition, ['canonical', 'canonical_actor', 'target', 'mapped_actor']);
      const targetRight = this.pickFirstValue(existingRule.condition, ['canonical', 'canonical_actor', 'target', 'mapped_actor']);

      if (sourceLeft && sourceRight && sourceLeft === sourceRight && targetLeft && targetRight) {
        return targetLeft !== targetRight;
      }
    }

    if (candidate.ruleType === RuleType.STRUCTURAL_CONSTRAINT) {
      const structureLeft = this.pickFirstValue(candidate.condition, ['structure', 'pattern', 'element']);
      const structureRight = this.pickFirstValue(existingRule.condition, ['structure', 'pattern', 'element']);
      const modeLeft = this.pickFirstValue(candidate.condition, ['mode', 'constraint', 'requirement']);
      const modeRight = this.pickFirstValue(existingRule.condition, ['mode', 'constraint', 'requirement']);

      if (structureLeft && structureRight && structureLeft === structureRight && modeLeft && modeRight) {
        return modeLeft !== modeRight;
      }
    }

    return candidate.instruction.trim() !== existingRule.instruction.trim();
  }

  private buildConflictDetail(
    candidate: Pick<Rule, 'ruleType' | 'scope' | 'workflowId' | 'targetAgent' | 'condition'>,
    conflictingRule: Pick<Rule, 'ruleType' | 'condition'>,
  ): string {
    const overlapKeys = this.extractOverlappingConditionKeys(candidate.condition, conflictingRule.condition);
    const overlapSegment = overlapKeys.length > 0 ? ` overlapping condition keys: ${overlapKeys.join(', ')}` : '';
    return `Conflicting ${candidate.ruleType} rule in ${candidate.scope} scope for the same target agent/workflow.${overlapSegment}`;
  }

  private emitConflictEvent(
    candidate: Pick<Rule, 'orgId' | 'workflowId' | 'scope' | 'name'>,
    conflictingRule: Pick<Rule, 'id' | 'name'>,
    conflictDetail: string,
  ) {
    const payload = {
      code: 'RULE_CONFLICT',
      conflicting_rule_id: conflictingRule.id,
      conflicting_rule_name: conflictingRule.name,
      conflict_detail: conflictDetail,
      incoming_rule_name: candidate.name,
    };

    if (candidate.workflowId) {
      this.realtimeGateway.emitToRoom(`workflow:${candidate.workflowId}`, 'rules.conflict.detected', payload);
      return;
    }

    this.realtimeGateway.emitToRoom(`org:${candidate.orgId}`, 'rules.conflict.detected', payload);
  }

  private extractOverlappingConditionKeys(
    left: Record<string, unknown> | null,
    right: Record<string, unknown> | null,
  ) {
    if (!left || !right) {
      return [];
    }

    return Object.keys(left).filter((key) => key in right && this.deepEqual(left[key], right[key]));
  }

  private pickFirstValue(
    condition: Record<string, unknown> | null,
    keys: string[],
  ): string | null {
    if (!condition) {
      return null;
    }

    for (const key of keys) {
      const value = condition[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }

    return null;
  }

  private async assertScopeConsistency(
    scope: RuleScope,
    workflowId: string | null,
    targetAgent: AgentType | null,
    orgId: string,
  ) {
    if (scope === RuleScope.WORKFLOW && !workflowId) {
      throw new BadRequestException('workflow_id is required for WORKFLOW scoped rules');
    }

    if (scope === RuleScope.ORG && workflowId) {
      throw new BadRequestException('workflow_id must be omitted for ORG scoped rules');
    }

    if (scope === RuleScope.AGENT && !targetAgent) {
      throw new BadRequestException('target_agent is required for AGENT scoped rules');
    }

    if (workflowId) {
      const workflow = await this.workflowsRepository.findOne({ where: { id: workflowId, orgId } });
      if (!workflow) {
        throw new NotFoundException('Workflow not found');
      }
    }
  }

  private async findRuleOrThrow(id: string, orgId: string) {
    const rule = await this.rulesRepository.findOne({
      where: { id, orgId },
    });
    if (!rule) {
      throw new NotFoundException('Rule not found');
    }
    return rule;
  }

  private async snapshotRuleVersion(rule: Rule, changedBy: string) {
    await this.ruleVersionsRepository.insert({
      ruleId: rule.id,
      version: rule.version,
      instruction: rule.instruction,
      condition: rule.condition,
      priority: rule.priority,
      isActive: rule.isActive,
      changedBy,
    });
  }

  private assertRuleManager(caller: RequestUser) {
    if (!caller?.orgId) {
      throw new ForbiddenException('Organization scope is required');
    }

    if (![UserRole.ADMIN, UserRole.BUSINESS_ANALYST].includes(caller.role as UserRole)) {
      throw new ForbiddenException('Admin or Business Analyst role is required');
    }
  }

  private insertAuditLog(
    workflowId: string | null,
    actorId: string,
    eventType: string,
    beforeState: Record<string, unknown> | null,
    afterState: Record<string, unknown> | null,
  ) {
    return this.auditService.log({
      workflowId,
      actorId,
      actorType: ActorType.USER,
      eventType,
      beforeState,
      afterState,
    });
  }

  private auditShape(rule: Rule) {
    return {
      rule_id: rule.id,
      name: rule.name,
      type: rule.ruleType,
      scope: rule.scope,
      workflow_id: rule.workflowId,
      target_agent: rule.targetAgent,
      condition: rule.condition,
      instruction: rule.instruction,
      priority: rule.priority,
      version: rule.version,
      is_active: rule.isActive,
    };
  }

  private serializeRule(rule: Rule) {
    return {
      id: rule.id,
      org_id: rule.orgId,
      workflow_id: rule.workflowId,
      name: rule.name,
      description: rule.description,
      type: rule.ruleType,
      scope: rule.scope,
      target_agent: rule.targetAgent,
      condition: rule.condition,
      instruction: rule.instruction,
      priority: rule.priority,
      version: rule.version,
      is_active: rule.isActive,
      created_by: rule.createdBy,
      created_at: rule.createdAt,
      updated_at: rule.updatedAt,
    };
  }

  private serializeRuleVersion(version: RuleVersion) {
    return {
      id: version.id,
      rule_id: version.ruleId,
      version: version.version,
      instruction: version.instruction,
      condition: version.condition,
      priority: version.priority,
      is_active: version.isActive,
      changed_by: version.changedBy,
      created_at: version.createdAt,
    };
  }

  private buildSimulationCacheKey(ruleId: string, sampleText: string, simulateAgent: AgentType) {
    const sampleHash = createHash('sha256').update(sampleText).digest('hex');
    return `${ruleId}:${simulateAgent}:${sampleHash}`;
  }

  private buildDiffSummary(withRuleOutput: unknown, withoutRuleOutput: unknown) {
    if (this.deepEqual(withRuleOutput, withoutRuleOutput)) {
      return 'No observable difference detected.';
    }

    if (
      withRuleOutput &&
      withoutRuleOutput &&
      typeof withRuleOutput === 'object' &&
      typeof withoutRuleOutput === 'object'
    ) {
      const withKeys = new Set(Object.keys(withRuleOutput as Record<string, unknown>));
      const withoutKeys = new Set(Object.keys(withoutRuleOutput as Record<string, unknown>));
      const changedKeys = [...new Set([...withKeys, ...withoutKeys])]
        .filter((key) =>
          !this.deepEqual(
            (withRuleOutput as Record<string, unknown>)[key],
            (withoutRuleOutput as Record<string, unknown>)[key],
          ),
        );

      if (changedKeys.length > 0) {
        return `Outputs differ on keys: ${changedKeys.join(', ')}.`;
      }
    }

    return 'Rule simulation changed the output.';
  }

  private deepEqual(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
  }
}
