import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { WorkflowStatus, ActorType } from '../../database/enums';
import { AuditLog } from '../audit/entities';
import { NatsPublisherService } from '../../nats/nats.publisher.service';
import { Workflow, WorkflowVersion } from './entities';
import {
  CreateWorkflowDto,
  UpdateWorkflowDto,
  UpdateWorkflowWithVersionDto,
  WorkflowFilterDto,
} from './dto/workflow.dto';

@Injectable()
export class WorkflowsService {
  private readonly logger = new Logger(WorkflowsService.name);

  constructor(
    @InjectRepository(Workflow)
    private readonly workflowRepository: Repository<Workflow>,
    @InjectRepository(WorkflowVersion)
    private readonly workflowVersionRepository: Repository<WorkflowVersion>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    private readonly dataSource: DataSource,
    private readonly natsPublisher: NatsPublisherService,
  ) {}

  async create(dto: CreateWorkflowDto, orgId: string, ownerId: string): Promise<Workflow> {
    const workflow = this.workflowRepository.create({
      title: dto.title,
      description: dto.description ?? null,
      domain: dto.domain ?? null,
      tags: dto.tags ?? [],
      orgId,
      ownerId,
      status: WorkflowStatus.DRAFT,
      currentVersion: 0,
    });

    const saved = await this.workflowRepository.save(workflow);

    await this.workflowVersionRepository.insert({
      workflowId: saved.id,
      versionNumber: 1,
      elementsJson: {},
      elsaJson: null,
      confidenceScore: null,
      createdBy: ownerId,
    });

    saved.currentVersion = 1;
    await this.workflowRepository.save(saved);

    await this.auditLogRepository.insert({
      workflowId: saved.id,
      actorId: ownerId,
      actorType: ActorType.USER,
      eventType: 'WORKFLOW_CREATED',
      beforeState: null,
      afterState: { title: saved.title, status: saved.status },
    });

    return this.findOne(saved.id, orgId);
  }

  async findAll(filter: WorkflowFilterDto, orgId: string): Promise<{ workflows: Workflow[]; total: number }> {
    const { status, domain, tags, search, page = 1, limit = 20 } = filter;

    const query = this.workflowRepository.createQueryBuilder('workflow')
      .where('workflow.orgId = :orgId', { orgId })
      .andWhere('workflow.status != :archived', { archived: WorkflowStatus.ARCHIVED });

    if (status) {
      query.andWhere('workflow.status = :status', { status });
    }

    if (domain) {
      query.andWhere('workflow.domain = :domain', { domain });
    }

    if (tags && tags.length > 0) {
      query.andWhere('workflow.tags && :tags', { tags });
    }

    if (search) {
      query.andWhere(
        '(workflow.title ILIKE :search OR workflow.description ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const total = await query.getCount();

    const workflows = await query
      .orderBy('workflow.updatedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return { workflows, total };
  }

  async findOne(id: string, orgId: string): Promise<Workflow> {
    const workflow = await this.workflowRepository.findOne({
      where: { id, orgId },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow ${id} not found`);
    }

    return workflow;
  }

  async findOneWithLatestVersion(id: string, orgId: string): Promise<Workflow & { latestVersion: WorkflowVersion }> {
    const workflow = await this.workflowRepository.findOne({
      where: { id, orgId },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow ${id} not found`);
    }

    const latestVersion = await this.workflowVersionRepository.findOne({
      where: { workflowId: id },
      order: { versionNumber: 'DESC' },
    });

    return { ...workflow, latestVersion: latestVersion! };
  }

  async update(
    id: string,
    dto: UpdateWorkflowDto | UpdateWorkflowWithVersionDto,
    orgId: string,
    callerId: string,
    callerRole: string,
  ): Promise<Workflow> {
    const workflow = await this.workflowRepository.findOne({ where: { id, orgId } });

    if (!workflow) {
      throw new NotFoundException(`Workflow ${id} not found`);
    }

    if (workflow.ownerId !== callerId && callerRole !== 'admin') {
      throw new ForbiddenException('Only owner or admin can update this workflow');
    }

    const beforeState = { title: workflow.title, status: workflow.status, currentVersion: workflow.currentVersion };

    if (dto.title) workflow.title = dto.title;
    if (dto.description !== undefined) workflow.description = dto.description;
    if (dto.domain !== undefined) workflow.domain = dto.domain;
    if (dto.tags) workflow.tags = dto.tags;
    if ('status' in dto && dto.status) workflow.status = dto.status;

    let source: 'ai' | 'user' | 'reconciliation' = 'user';
    const isVersionUpdate = 'elements_json' in dto && dto.elements_json;

    if (isVersionUpdate) {
      await this.dataSource.transaction(async (manager) => {
        const currentVersion = await manager
          .createQueryBuilder(Workflow, 'workflow')
          .select(['workflow.currentVersion'])
          .where('workflow.id = :id', { id })
          .getOne();

        const newVersionNumber = (currentVersion?.currentVersion ?? 0) + 1;

        await manager.insert(WorkflowVersion, {
          workflowId: id,
          versionNumber: newVersionNumber,
          elementsJson: dto.elements_json,
          elsaJson: null,
          confidenceScore: null,
          createdBy: callerId,
        });

        await manager.update(Workflow, id, {
          currentVersion: newVersionNumber,
          updatedAt: new Date(),
        });
      });

      workflow.currentVersion += 1;
      source = (dto as any).source ?? 'user';
    }

    const saved = await this.workflowRepository.save(workflow);

    await this.auditLogRepository.insert({
      workflowId: id,
      actorId: callerId,
      actorType: ActorType.USER,
      eventType: isVersionUpdate ? 'WORKFLOW_VERSION_CREATED' : 'WORKFLOW_UPDATED',
      beforeState,
      afterState: { title: saved.title, status: saved.status, currentVersion: saved.currentVersion },
    });

    if (isVersionUpdate) {
      await this.natsPublisher.publishWorkflowUpdated({
        workflow_id: id,
        version_number: saved.currentVersion,
        changed_elements: [],
        source,
        correlation_id: uuidv4(),
      });
    }

    return this.findOne(id, orgId);
  }

  async archive(id: string, orgId: string, callerId: string, callerRole: string): Promise<Workflow> {
    const workflow = await this.workflowRepository.findOne({ where: { id, orgId } });

    if (!workflow) {
      throw new NotFoundException(`Workflow ${id} not found`);
    }

    if (workflow.ownerId !== callerId && callerRole !== 'admin') {
      throw new ForbiddenException('Only owner or admin can archive this workflow');
    }

    const beforeStatus = workflow.status;
    workflow.status = WorkflowStatus.ARCHIVED;
    const saved = await this.workflowRepository.save(workflow);

    await this.auditLogRepository.insert({
      workflowId: id,
      actorId: callerId,
      actorType: ActorType.USER,
      eventType: 'WORKFLOW_ARCHIVED',
      beforeState: { status: beforeStatus },
      afterState: { status: WorkflowStatus.ARCHIVED },
    });

    return saved;
  }

  async findVersions(workflowId: string, orgId: string): Promise<WorkflowVersion[]> {
    const workflow = await this.workflowRepository.findOne({ where: { id: workflowId, orgId } });
    if (!workflow) {
      throw new NotFoundException(`Workflow ${workflowId} not found`);
    }

    return this.workflowVersionRepository.find({
      where: { workflowId },
      order: { versionNumber: 'DESC' },
    });
  }

  async findVersion(workflowId: string, versionNumber: number, orgId: string): Promise<WorkflowVersion> {
    const workflow = await this.workflowRepository.findOne({ where: { id: workflowId, orgId } });
    if (!workflow) {
      throw new NotFoundException(`Workflow ${workflowId} not found`);
    }

    const version = await this.workflowVersionRepository.findOne({
      where: { workflowId, versionNumber },
    });

    if (!version) {
      throw new NotFoundException(`Version ${versionNumber} not found for workflow ${workflowId}`);
    }

    return version;
  }

  async computeDiff(
    workflowId: string,
    v1: number,
    v2: number,
    orgId: string,
  ): Promise<{ added: any[]; removed: any[]; modified: any[] }> {
    const workflow = await this.workflowRepository.findOne({ where: { id: workflowId, orgId } });
    if (!workflow) {
      throw new NotFoundException(`Workflow ${workflowId} not found`);
    }

    const [version1, version2] = await Promise.all([
      this.workflowVersionRepository.findOne({ where: { workflowId, versionNumber: v1 } }),
      this.workflowVersionRepository.findOne({ where: { workflowId, versionNumber: v2 } }),
    ]);

    if (!version1 || !version2) {
      throw new NotFoundException('One or both versions not found');
    }

    const elements1 = this.extractElements(version1.elementsJson);
    const elements2 = this.extractElements(version2.elementsJson);

    const ids1 = new Set(elements1.map((e) => e.id));
    const ids2 = new Set(elements2.map((e) => e.id));

    const added = elements2.filter((e) => !ids1.has(e.id));
    const removed = elements1.filter((e) => !ids2.has(e.id));
    const modified = elements2.filter((e) => {
      if (!ids1.has(e.id)) return false;
      const old = elements1.find((o) => o.id === e.id);
      return JSON.stringify(old) !== JSON.stringify(e);
    });

    return { added, removed, modified };
  }

  async duplicate(id: string, orgId: string, ownerId: string, title?: string): Promise<Workflow> {
    const workflow = await this.workflowRepository.findOne({ where: { id, orgId } });
    if (!workflow) {
      throw new NotFoundException(`Workflow ${id} not found`);
    }

    const latestVersion = await this.workflowVersionRepository.findOne({
      where: { workflowId: id },
      order: { versionNumber: 'DESC' },
    });

    const newWorkflow = this.workflowRepository.create({
      title: title ?? `Copy of ${workflow.title}`,
      description: workflow.description,
      domain: workflow.domain,
      tags: [...workflow.tags],
      orgId,
      ownerId,
      status: WorkflowStatus.DRAFT,
      currentVersion: 0,
    });

    const saved = await this.workflowRepository.save(newWorkflow);

    await this.workflowVersionRepository.insert({
      workflowId: saved.id,
      versionNumber: 1,
      elementsJson: latestVersion?.elementsJson ?? {},
      elsaJson: latestVersion?.elsaJson ?? null,
      confidenceScore: null,
      createdBy: ownerId,
    });

    saved.currentVersion = 1;
    await this.workflowRepository.save(saved);

    return this.findOne(saved.id, orgId);
  }

  async getDiagramData(workflowId: string, orgId: string): Promise<{ nodes: any[]; edges: any[] }> {
    const workflow = await this.workflowRepository.findOne({ where: { id: workflowId, orgId } });
    if (!workflow) {
      throw new NotFoundException(`Workflow ${workflowId} not found`);
    }

    const latestVersion = await this.workflowVersionRepository.findOne({
      where: { workflowId },
      order: { versionNumber: 'DESC' },
    });

    const elementsJson = (latestVersion?.elementsJson ?? {}) as Record<string, unknown>;
    return {
      nodes: (elementsJson.nodes ?? []) as any[],
      edges: (elementsJson.edges ?? []) as any[],
    };
  }

  private extractElements(elementsJson: unknown): Array<{ id: string; [key: string]: unknown }> {
    if (!elementsJson || typeof elementsJson !== 'object') return [];
    const json = elementsJson as Record<string, unknown>;
    return Array.isArray(json.elements) ? (json.elements as Array<{ id: string }>) : [];
  }
}