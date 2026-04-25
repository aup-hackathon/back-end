import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';

import { ActorType } from '../../database/enums';
import { AuditService } from '../audit/audit.service';
import { Workflow } from '../workflows/entities/workflow.entity';
import { Project } from './entities/project.entity';
import { CreateProjectDto, ProjectFilterDto } from './dto/project.dto';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(Workflow)
    private readonly workflowRepository: Repository<Workflow>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateProjectDto, orgId: string, ownerId: string): Promise<Project> {
    // Check if project with same name already exists
    const existing = await this.projectRepository.findOne({
      where: { name: dto.name, orgId },
    });

    if (existing) {
      throw new ConflictException({
        code: 'PROJECT_NAME_EXISTS',
        message: `Project with name "${dto.name}" already exists`,
      });
    }

    const project = this.projectRepository.create({
      name: dto.name,
      orgId,
      ownerId,
    });

    const saved = await this.projectRepository.save(project);

    await this.auditService.log({
      elementId: saved.id,
      actorId: ownerId,
      actorType: ActorType.USER,
      eventType: 'PROJECT_CREATED',
      beforeState: null,
      afterState: { name: saved.name, orgId: saved.orgId },
    });

    return saved;
  }

  async findAll(filter: ProjectFilterDto, orgId: string): Promise<{ projects: Project[]; total: number }> {
    const { search, page = 1, limit = 20 } = filter;

    const query = this.projectRepository
      .createQueryBuilder('project')
      .where('project.orgId = :orgId', { orgId });

    if (search) {
      query.andWhere('project.name ILIKE :search', { search: `%${search}%` });
    }

    const total = await query.getCount();

    const projects = await query
      .orderBy('project.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return { projects, total };
  }

  async findOne(id: string, orgId: string): Promise<Project> {
    const project = await this.projectRepository.findOne({
      where: { id, orgId },
    });

    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }

    return project;
  }

  async delete(id: string, orgId: string, actorId: string): Promise<void> {
    const project = await this.findOne(id, orgId);

    // Use transaction for cascade delete
    await this.dataSource.transaction(async (manager) => {
      // Get all workflows in this project
      const workflows = await manager.find(Workflow, {
        where: { projectId: id },
      });

      // Delete all workflow versions first
      if (workflows.length > 0) {
        const workflowIds = workflows.map((w) => w.id);

        await manager
          .createQueryBuilder()
          .delete()
          .from('workflow_version')
          .where('workflow_id IN (:...workflowIds)', { workflowIds })
          .execute();
      }

      // Delete all workflows in project
      await manager
        .createQueryBuilder()
        .delete()
        .from(Workflow)
        .where('project_id = :projectId', { projectId: id })
        .execute();

      // Delete the project
      await manager.remove(Project, project);
    });

    await this.auditService.log({
      elementId: id,
      actorId,
      actorType: ActorType.USER,
      eventType: 'PROJECT_DELETED',
      beforeState: { name: project.name, orgId: project.orgId },
      afterState: null,
    });
  }

  async findWorkflows(
    projectId: string,
    orgId: string,
    filter: ProjectFilterDto,
  ): Promise<{ workflows: Workflow[]; total: number }> {
    // Verify project exists
    await this.findOne(projectId, orgId);

    const { page = 1, limit = 20 } = filter;

    const query = this.workflowRepository
      .createQueryBuilder('workflow')
      .where('workflow.projectId = :projectId', { projectId })
      .andWhere('workflow.orgId = :orgId', { orgId });

    const total = await query.getCount();

    const workflows = await query
      .orderBy('workflow.updatedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return { workflows, total };
  }
}