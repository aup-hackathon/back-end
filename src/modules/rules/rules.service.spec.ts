import { ConflictException } from '@nestjs/common';
import axios from 'axios';

import { RuleScope, RuleType, SessionMode, SessionStatus, UserRole, WorkflowStatus } from '../../database/enums';
import { RulesService } from './rules.service';

describe('RulesService', () => {
  const buildService = () => {
    const rulesRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({
        id: 'rule-1',
        createdAt: new Date('2026-04-25T10:00:00.000Z'),
        updatedAt: new Date('2026-04-25T10:00:00.000Z'),
        ...value,
      })),
      find: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    const ruleVersionsRepository = {
      insert: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };
    const ruleApplicationsRepository = {
      query: jest.fn(),
    };
    const sessionsRepository = {
      findOne: jest.fn(),
    };
    const workflowsRepository = {
      findOne: jest.fn(),
    };
    const agentExecutionsRepository = {
      findOne: jest.fn(),
    };
    const auditService = {
      log: jest.fn(),
    };
    const realtimeGateway = {
      emitToRoom: jest.fn(),
    };
    const configService = {
      get: jest.fn((key: string) => (key === 'health.fastapiInternal' ? 'http://fastapi.test' : undefined)),
    };
    const dataSource = {
      transaction: jest.fn(async (callback: (manager: { getRepository: () => typeof rulesRepository }) => Promise<unknown>) =>
        callback({ getRepository: () => rulesRepository })),
    };

    const service = new RulesService(
      rulesRepository as never,
      ruleVersionsRepository as never,
      ruleApplicationsRepository as never,
      sessionsRepository as never,
      workflowsRepository as never,
      agentExecutionsRepository as never,
      dataSource as never,
      realtimeGateway as never,
      configService as never,
      auditService as never,
    );

    return {
      service,
      rulesRepository,
      ruleVersionsRepository,
      ruleApplicationsRepository,
      sessionsRepository,
      workflowsRepository,
      agentExecutionsRepository,
      auditService,
      realtimeGateway,
      configService,
      dataSource,
    };
  };

  const caller = {
    id: 'user-1',
    orgId: 'org-1',
    role: UserRole.ADMIN,
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns 409 when creating a conflicting actor mapping rule', async () => {
    const { service, rulesRepository, realtimeGateway } = buildService();
    const workflow = {
      id: 'workflow-1',
      orgId: caller.orgId,
    };

    rulesRepository.find.mockResolvedValue([
      {
        id: 'rule-existing',
        orgId: caller.orgId,
        workflowId: null,
        name: 'Map boss to director',
        ruleType: RuleType.ACTOR_MAPPING,
        scope: RuleScope.ORG,
        targetAgent: null,
        condition: {
          source_label: 'boss',
          canonical: 'Director',
        },
        instruction: 'Map boss to Director',
        isActive: true,
      },
    ]);
    rulesRepository.save.mockResolvedValue(undefined);

    await expect(
      service.create(
        {
          name: 'Map boss to line manager',
          type: RuleType.ACTOR_MAPPING,
          scope: RuleScope.ORG,
          instruction: 'Map boss to Line Manager',
          condition: {
            source_label: 'boss',
            canonical: 'Line Manager',
          },
        },
        caller,
      ),
    ).rejects.toThrow(ConflictException);

    expect(rulesRepository.save).not.toHaveBeenCalled();
    expect(realtimeGateway.emitToRoom).toHaveBeenCalledWith(
      'org:org-1',
      'rules.conflict.detected',
      expect.objectContaining({
        conflicting_rule_id: 'rule-existing',
        conflicting_rule_name: 'Map boss to director',
      }),
    );
  });

  it('previews only the rules that match the session workflow and condition context', async () => {
    const { service, sessionsRepository, workflowsRepository, rulesRepository } = buildService();

    sessionsRepository.findOne.mockResolvedValue({
      id: 'session-1',
      workflowId: 'workflow-1',
      userId: caller.id,
      mode: SessionMode.AUTO,
      status: SessionStatus.CREATED,
    });
    workflowsRepository.findOne.mockResolvedValue({
      id: 'workflow-1',
      orgId: caller.orgId,
      status: WorkflowStatus.DRAFT,
      domain: 'finance',
      tags: ['approval'],
    });
    rulesRepository.find.mockResolvedValue([
      {
        id: 'rule-match-1',
        orgId: caller.orgId,
        workflowId: null,
        name: 'Finance extraction guard',
        description: null,
        ruleType: RuleType.EXTRACTION,
        scope: RuleScope.ORG,
        targetAgent: null,
        condition: { workflow_domain: 'finance' },
        instruction: 'Prefer finance terminology',
        priority: 200,
        version: 1,
        isActive: true,
        createdBy: caller.id,
        createdAt: new Date('2026-04-25T10:00:00.000Z'),
        updatedAt: new Date('2026-04-25T10:00:00.000Z'),
      },
      {
        id: 'rule-match-2',
        orgId: caller.orgId,
        workflowId: 'workflow-1',
        name: 'Workflow-specific QA rule',
        description: null,
        ruleType: RuleType.VALIDATION,
        scope: RuleScope.WORKFLOW,
        targetAgent: null,
        condition: { session_mode: SessionMode.AUTO },
        instruction: 'Validate auto sessions strictly',
        priority: 150,
        version: 1,
        isActive: true,
        createdBy: caller.id,
        createdAt: new Date('2026-04-25T10:00:00.000Z'),
        updatedAt: new Date('2026-04-25T10:00:00.000Z'),
      },
      {
        id: 'rule-miss',
        orgId: caller.orgId,
        workflowId: null,
        name: 'Healthcare naming rule',
        description: null,
        ruleType: RuleType.NAMING_CONVENTION,
        scope: RuleScope.ORG,
        targetAgent: null,
        condition: { workflow_domain: 'healthcare' },
        instruction: 'Use healthcare verbs',
        priority: 100,
        version: 1,
        isActive: true,
        createdBy: caller.id,
        createdAt: new Date('2026-04-25T10:00:00.000Z'),
        updatedAt: new Date('2026-04-25T10:00:00.000Z'),
      },
    ]);

    const result = await service.previewForSession('session-1', caller);

    expect(result.rules.map((rule) => rule.id)).toEqual(['rule-match-1', 'rule-match-2']);
  });

  it('creates a RuleVersion snapshot and increments the rule version on patch', async () => {
    const { service, rulesRepository, ruleVersionsRepository, auditService } = buildService();

    rulesRepository.findOne.mockResolvedValue({
      id: 'rule-1',
      orgId: caller.orgId,
      workflowId: null,
      name: 'Extraction rule',
      description: null,
      ruleType: RuleType.EXTRACTION,
      scope: RuleScope.ORG,
      targetAgent: null,
      condition: null,
      instruction: 'Original instruction',
      priority: 100,
      version: 1,
      isActive: true,
      createdBy: caller.id,
      createdAt: new Date('2026-04-25T10:00:00.000Z'),
      updatedAt: new Date('2026-04-25T10:00:00.000Z'),
    });

    const result = await service.update(
      'rule-1',
      { instruction: 'Updated instruction' },
      caller,
    );

    expect(ruleVersionsRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleId: 'rule-1',
        version: 1,
        instruction: 'Original instruction',
        isActive: true,
      }),
    );
    expect(result.rule.version).toBe(2);
    expect(auditService.log).toHaveBeenCalled();
  });

  it('creates a RuleVersion snapshot when activating an inactive rule', async () => {
    const { service, rulesRepository, ruleVersionsRepository } = buildService();

    rulesRepository.findOne.mockResolvedValue({
      id: 'rule-1',
      orgId: caller.orgId,
      workflowId: null,
      name: 'Dormant rule',
      description: null,
      ruleType: RuleType.ACTOR_MAPPING,
      scope: RuleScope.ORG,
      targetAgent: null,
      condition: {
        source_label: 'boss',
        canonical: 'Line Manager',
      },
      instruction: 'Map boss to Line Manager',
      priority: 100,
      version: 1,
      isActive: false,
      createdBy: caller.id,
      createdAt: new Date('2026-04-25T10:00:00.000Z'),
      updatedAt: new Date('2026-04-25T10:00:00.000Z'),
    });
    rulesRepository.find.mockResolvedValue([]);

    const result = await service.activate('rule-1', caller);

    expect(ruleVersionsRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleId: 'rule-1',
        version: 1,
        isActive: false,
      }),
    );
    expect(result.rule.is_active).toBe(true);
    expect(result.rule.version).toBe(2);
  });

  it('returns distinct with/without outputs for rule testing and caches the response', async () => {
    const { service, rulesRepository } = buildService();

    rulesRepository.findOne.mockResolvedValue({
      id: 'rule-1',
      orgId: caller.orgId,
      workflowId: null,
      name: 'Prompt injection',
      description: null,
      ruleType: RuleType.PROMPT_INJECTION,
      scope: RuleScope.ORG,
      targetAgent: null,
      condition: null,
      instruction: 'Always mention the approval actor',
      priority: 100,
      version: 1,
      isActive: true,
      createdBy: caller.id,
      createdAt: new Date('2026-04-25T10:00:00.000Z'),
      updatedAt: new Date('2026-04-25T10:00:00.000Z'),
    });

    const axiosSpy = jest.spyOn(axios, 'post')
      .mockResolvedValueOnce({ data: { extracted_actor: 'Finance' } } as never)
      .mockResolvedValueOnce({ data: { extracted_actor: 'Operations' } } as never);

    const result = await service.testRule(
      'rule-1',
      {
        sample_text: 'Invoices require sign-off.',
        simulate_agent: 'EXTRACTION' as never,
      },
      caller,
    );

    expect(result.with_rule_output).toEqual({ extracted_actor: 'Finance' });
    expect(result.without_rule_output).toEqual({ extracted_actor: 'Operations' });
    expect(result.diff_summary).toContain('extracted_actor');
    expect(axiosSpy).toHaveBeenCalledTimes(2);

    await service.testRule(
      'rule-1',
      {
        sample_text: 'Invoices require sign-off.',
        simulate_agent: 'EXTRACTION' as never,
      },
      caller,
    );

    expect(axiosSpy).toHaveBeenCalledTimes(2);
  });
});
