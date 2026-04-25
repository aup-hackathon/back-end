import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AuditService } from '../../audit/audit.service';
import { Skill } from '../entities/skill.entity';
import { SkillApplication } from '../entities/skill-application.entity';
import { SkillType, ActorType, UserRole } from '../../../database/enums';
import { JsonValue } from '../../../database/types/json-value.type';

import {
  CreateSkillDto,
  UpdateSkillDto,
  SemanticSearchDto,
  SemanticSearchResultDto,
  SkillResponseDto,
  SkillDetailResponseDto,
  SkillExportDto,
  SkillApplicationResponseDto,
  SkillAnalyticsDto,
} from '../dto';

type RequestUser = {
  id: string;
  orgId: string;
  role: string;
};

interface EmbeddingResult {
  embedding: number[];
}

@Injectable()
export class SkillsService {
  constructor(
    @InjectRepository(Skill)
    private readonly skillRepo: Repository<Skill>,
    @InjectRepository(SkillApplication)
    private readonly skillAppRepo: Repository<SkillApplication>,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Create a new skill - calls FastAPI to generate embedding
   */
  async create(dto: CreateSkillDto, caller: RequestUser): Promise<SkillResponseDto> {
    // Security: only Admin and Business Analyst can create
    this.assertCanModify(caller.role);

    // ACTOR_CATALOG: enforce is_mandatory = true and uniqueness
    let isMandatory = dto.isMandatory ?? false;
    if (dto.skillType === SkillType.ACTOR_CATALOG) {
      isMandatory = true;
      await this.validateActorCatalogUniqueness(caller.orgId);
    }

    // Prepare content for embedding
    const contentForEmbedding = this.prepareContentForEmbedding(dto.name, dto.content);

    // Call FastAPI to generate embedding
    let embedding: number[] | null = null;
    try {
      embedding = await this.generateEmbedding(contentForEmbedding);
    } catch (error) {
      console.error('Failed to generate embedding:', error);
      throw new InternalServerErrorException('Failed to generate skill embedding');
    }

    // Create skill entity
    const skill = this.skillRepo.create({
      name: dto.name,
      description: dto.description,
      skillType: dto.skillType,
      content: { full: dto.content } as JsonValue,
      embedding,
      appliesToDomains: dto.appliesToDomains,
      appliesToAgents: dto.appliesToAgents,
      isActive: true,
      isMandatory,
      usageCount: 0,
      version: 1,
      orgId: caller.orgId,
      createdBy: caller.id,
    });

    const saved = await this.skillRepo.save(skill);

    // Audit log
    await this.logSkillChange(saved.id, caller.id, null, { ...saved, isMandatory } as any, 'SKILL_CREATED');

    return this.toResponseDto(saved);
  }

  /**
   * List skills with filtering
   */
  async findAll(
    filter: { type?: SkillType; isActive?: boolean },
    caller: RequestUser,
  ): Promise<{ skills: SkillResponseDto[]; total: number }> {
    const where: Record<string, unknown> = { orgId: caller.orgId };

    if (filter.type !== undefined) {
      where.skillType = filter.type;
    }
    if (filter.isActive !== undefined) {
      where.isActive = filter.isActive;
    }

    const [skills, total] = await this.skillRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
    });

    return { skills: skills.map((s) => this.toResponseDto(s)), total };
  }

  /**
   * Get skill detail with usage stats
   */
  async findOne(id: string, caller: RequestUser): Promise<SkillDetailResponseDto> {
    const skill = await this.findSkillByIdAndOrg(id, caller.orgId);

    // Get usage stats
    const [appCount, avgSimilarity] = await this.getUsageStats(id);

    return {
      ...this.toResponseDto(skill),
      applicationCount: appCount,
      avgSimilarityScore: avgSimilarity,
    };
  }

  /**
   * Update skill - regenerates embedding if content changes
   */
  async update(id: string, dto: UpdateSkillDto, caller: RequestUser): Promise<SkillResponseDto> {
    const skill = await this.findSkillByIdAndOrg(id, caller.orgId);
    this.assertCanModify(caller.role);

    // Track if content changed (triggers version bump + embedding regeneration)
    const contentChanged = dto.content !== undefined && dto.content !== (skill.content as any)?.full;
    const beforeState = { ...skill };

    // Apply updates
    if (dto.name !== undefined) skill.name = dto.name;
    if (dto.description !== undefined) skill.description = dto.description;
    if (dto.content !== undefined) {
      skill.content = { full: dto.content } as JsonValue;
    }
    if (dto.appliesToDomains !== undefined) skill.appliesToDomains = dto.appliesToDomains;
    if (dto.appliesToAgents !== undefined) skill.appliesToAgents = dto.appliesToAgents;
    if (dto.isActive !== undefined) skill.isActive = dto.isActive;

    // ACTOR_CATALOG: enforce is_mandatory = true
    if (skill.skillType === SkillType.ACTOR_CATALOG && dto.isMandatory !== undefined && dto.isMandatory === false) {
      throw new ForbiddenException('ACTOR_CATALOG skills must always be mandatory');
    }

    // Update version and regenerate embedding if content changed
    if (contentChanged) {
      skill.version += 1;

      // Regenerate embedding
      const contentForEmbedding = this.prepareContentForEmbedding(skill.name, dto.content!);
      try {
        skill.embedding = await this.generateEmbedding(contentForEmbedding);
      } catch (error) {
        console.error('Failed to regenerate embedding:', error);
        throw new InternalServerErrorException('Failed to regenerate skill embedding');
      }
    }

    const updated = await this.skillRepo.save(skill);

    // Audit log
    await this.logSkillChange(id, caller.id, beforeState as any, updated, 'SKILL_UPDATED');

    return this.toResponseDto(updated);
  }

  /**
   * Soft delete skill
   */
  async remove(id: string, caller: RequestUser): Promise<void> {
    const skill = await this.findSkillByIdAndOrg(id, caller.orgId);
    this.assertCanModify(caller.role);

    if (skill.skillType === SkillType.ACTOR_CATALOG && skill.isMandatory) {
      throw new ForbiddenException('Cannot delete mandatory ACTOR_CATALOG skill');
    }

    skill.isActive = false;
    await this.skillRepo.save(skill);

    // Audit log
    await this.logSkillChange(id, caller.id, { isActive: true } as any, { isActive: false } as any, 'SKILL_DELETED');
  }

  /**
   * Semantic search - embed query, then pgvector similarity search
   */
  async semanticSearch(dto: SemanticSearchDto, caller: RequestUser): Promise<SemanticSearchResultDto[]> {
    // Generate embedding for query
    let queryEmbedding: number[] | null = null;
    try {
      queryEmbedding = await this.generateEmbedding(dto.queryText);
    } catch (error) {
      console.error('Failed to generate query embedding:', error);
      throw new InternalServerErrorException('Failed to process search query');
    }

    // Build WHERE clause with filters
    const whereClause: Record<string, unknown> = {
      orgId: caller.orgId,
      isActive: true,
    };

    if (dto.filterTypes && dto.filterTypes.length > 0) {
      whereClause.skillType = dto.filterTypes;
    }

    // Get all active skills for org (simple approach - pgvector in TypeORM needs raw query)
    const skills = await this.skillRepo.find({
      where: whereClause,
      order: { usageCount: 'DESC' },
    });

    // Calculate cosine similarity in memory (for small to medium datasets)
    const results = skills
      .filter((s) => s.embedding)
      .map((skill) => ({
        skill,
        similarity: this.cosineSimilarity(queryEmbedding!, skill.embedding!),
      }))
      .filter((r) => r.similarity >= (dto.minSimilarity ?? 0.35))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, dto.topK ?? 5)
      .map((r) => ({
        id: r.skill.id,
        name: r.skill.name,
        skillType: r.skill.skillType,
        similarityScore: r.similarity,
        contentPreview: ((r.skill.content as any)?.full ?? '').substring(0, 200),
      }));

    return results;
  }

  /**
   * Import skills from array (batch with single embedding call)
   */
  async importSkills(
    skills: CreateSkillDto[],
    caller: RequestUser,
  ): Promise<{ imported: number; failed: Array<{ index: number; error: string }> }> {
    this.assertCanModify(caller.role);

    if (skills.length > 200) {
      throw new BadRequestException('Maximum 200 skills per import');
    }

    const failed: Array<{ index: number; error: string }> = [];
    const embeddingItems: Array<{ id: string; content: string }> = [];

    // Validate and prepare
    for (let i = 0; i < skills.length; i++) {
      const dto = skills[i];
      try {
        // Validate ACTOR_CATALOG constraint
        if (dto.skillType === SkillType.ACTOR_CATALOG) {
          const existing = await this.skillRepo.findOne({
            where: { orgId: caller.orgId, skillType: SkillType.ACTOR_CATALOG, isActive: true },
          });
          if (existing) {
            failed.push({ index: i, error: 'ACTOR_CATALOG already exists for org' });
            continue;
          }
        }

        embeddingItems.push({
          id: `temp-${i}`,
          content: this.prepareContentForEmbedding(dto.name, dto.content),
        });
      } catch (e) {
        failed.push({ index: i, error: String(e) });
      }
    }

    // Batch generate embeddings
    let embeddings: Array<{ embedding: number[] }> = [];
    try {
      embeddings = await this.generateEmbeddingBatch(embeddingItems.map((i) => i.content));
    } catch (error) {
      console.error('Batch embedding failed:', error);
      throw new InternalServerErrorException('Failed to generate embeddings for import');
    }

    // Insert all in transaction
    const queryRunner = this.skillRepo.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let imported = 0;
      for (let i = 0; i < embeddingItems.length; i++) {
        const dto = skills[i];
        const embedResult = embeddings[i];

        const skill = queryRunner.manager.create(Skill, {
          name: dto.name,
          description: dto.description,
          skillType: dto.skillType,
          content: { full: dto.content } as JsonValue,
          embedding: embedResult?.embedding ?? null,
          appliesToDomains: dto.appliesToDomains,
          appliesToAgents: dto.appliesToAgents,
          isActive: true,
          isMandatory: dto.skillType === SkillType.ACTOR_CATALOG ? true : (dto.isMandatory ?? false),
          usageCount: 0,
          version: 1,
          orgId: caller.orgId,
          createdBy: caller.id,
        });

        await queryRunner.manager.save(skill);
        imported++;
      }

      await queryRunner.commitTransaction();
      return { imported, failed };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Export skills (without embeddings)
   */
  async exportSkills(caller: RequestUser): Promise<SkillExportDto[]> {
    const skills = await this.skillRepo.find({
      where: { orgId: caller.orgId, isActive: true },
    });

    return skills.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      skillType: s.skillType,
      content: (s.content as any)?.full ?? '',
      appliesToDomains: s.appliesToDomains,
      appliesToAgents: s.appliesToAgents,
      isActive: s.isActive,
      isMandatory: s.isMandatory,
      version: s.version,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  }

  /**
   * Get skill applications with pagination
   */
  async findApplications(
    skillId: string,
    caller: RequestUser,
    page: number = 1,
    limit: number = 20,
  ): Promise<SkillApplicationResponseDto[]> {
    await this.findSkillByIdAndOrg(skillId, caller.orgId);

    const apps = await this.skillAppRepo.find({
      where: { skillId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return apps.map((a) => ({
      id: a.id,
      skillId: a.skillId,
      agentExecutionId: a.agentExecutionId,
      retrievalRank: a.retrievalRank,
      similarityScore: a.similarityScore,
      injectedTokens: a.injectedTokens,
      wasMandatory: a.wasMandatory,
      createdAt: a.createdAt,
    }));
  }

  /**
   * Get applications for specific agent execution
   */
  async findApplicationsByExecution(
    agentExecutionId: string,
    caller: RequestUser,
  ): Promise<SkillApplicationResponseDto[]> {
    const apps = await this.skillAppRepo.find({
      where: { agentExecutionId },
      order: { retrievalRank: 'ASC' },
    });

    return apps.map((a) => ({
      id: a.id,
      skillId: a.skillId,
      agentExecutionId: a.agentExecutionId,
      retrievalRank: a.retrievalRank,
      similarityScore: a.similarityScore,
      injectedTokens: a.injectedTokens,
      wasMandatory: a.wasMandatory,
      createdAt: a.createdAt,
    }));
  }

  /**
   * Get analytics (Admin only)
   */
  async getAnalytics(caller: RequestUser): Promise<SkillAnalyticsDto[]> {
    if (caller.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin only');
    }

    // Complex query - get stats per skill
    const skills = await this.skillRepo.find({
      where: { orgId: caller.orgId },
      order: { usageCount: 'DESC' },
    });

    const results: SkillAnalyticsDto[] = [];
    for (const skill of skills) {
      const apps = await this.skillAppRepo.find({
        where: { skillId: skill.id },
      });

      const appCount = apps.length;
      const avgSimilarity =
        apps.length > 0 ? apps.reduce((acc, a) => acc + (a.similarityScore ?? 0), 0) / apps.length : null;
      const avgTokens = apps.length > 0 ? apps.reduce((acc, a) => acc + a.injectedTokens, 0) / apps.length : null;

      results.push({
        id: skill.id,
        name: skill.name,
        applicationCount: appCount,
        avgSimilarity,
        avgTokens,
        avgConfidenceDelta: null, // Requires join with agent_execution
      });
    }

    return results;
  }

  /**
   * List mandatory skills (for BE-25 hook)
   */
  async listMandatorySkills(orgId: string): Promise<Skill[]> {
    return this.skillRepo.find({
      where: { orgId, isMandatory: true, isActive: true },
    });
  }

  /**
   * Retrieve top-K skills (for BE-25 hook)
   */
  async retrieveTopKSkills(
    orgId: string,
    contextEmbedding: number[],
    topK: number,
    agentType?: string,
  ): Promise<Skill[]> {
    const where: Record<string, unknown> = {
      orgId,
      isActive: true,
      embedding: undefined as any, // Will filter in memory
    };

    const skills = await this.skillRepo.find({ where });

    return skills
      .filter((s) => s.embedding)
      .map((skill) => ({
        skill,
        similarity: this.cosineSimilarity(contextEmbedding, skill.embedding!),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK)
      .map((r) => r.skill);
  }

  // Private helpers

  private async findSkillByIdAndOrg(id: string, orgId: string): Promise<Skill> {
    const skill = await this.skillRepo.findOne({ where: { id, orgId } });
    if (!skill) {
      throw new NotFoundException('Skill not found');
    }
    return skill;
  }

  private assertCanModify(role: string): void {
    if (role !== UserRole.ADMIN && role !== UserRole.BUSINESS_ANALYST) {
      throw new ForbiddenException('Only Admin and Business Analyst can modify skills');
    }
  }

  private async validateActorCatalogUniqueness(orgId: string): Promise<void> {
    const existing = await this.skillRepo.findOne({
      where: { orgId, skillType: SkillType.ACTOR_CATALOG, isActive: true },
    });
    if (existing) {
      throw new ConflictException({
        code: 'ACTOR_CATALOG_EXISTS',
        message: 'An ACTOR_CATALOG skill already exists. Deactivate it first.',
      });
    }
  }

  private prepareContentForEmbedding(name: string, content: string): string {
    return `Skill: ${name}. Content: ${content}`;
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    // Call FastAPI internal endpoint
    const response = await fetch(process.env.FASTAPI_URL + '/internal/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      throw new Error(`Embedding failed: ${response.status}`);
    }

    const data = (await response.json()) as EmbeddingResult;
    return data.embedding;
  }

  private async generateEmbeddingBatch(texts: string[]): Promise<Array<{ embedding: number[] }>> {
    const response = await fetch(process.env.FASTAPI_URL + '/internal/embed/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: texts.map((text) => ({ content: text })) }),
    });

    if (!response.ok) {
      throw new Error(`Batch embedding failed: ${response.status}`);
    }

    return (await response.json()) as Array<{ embedding: number[] }>;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    const dotProduct = a.reduce((acc, val, i) => acc + val * b[i], 0);
    const magA = Math.sqrt(a.reduce((acc, val) => acc + val * val, 0));
    const magB = Math.sqrt(b.reduce((acc, val) => acc + val * val, 0));

    if (magA === 0 || magB === 0) return 0;
    return dotProduct / (magA * magB);
  }

  private async getUsageStats(skillId: string): Promise<[number, number | null]> {
    const apps = await this.skillAppRepo.find({ where: { skillId } });
    const count = apps.length;
    const avg =
      count > 0 ? apps.reduce((acc, a) => acc + (a.similarityScore ?? 0), 0) / count : null;
    return [count, avg];
  }

  private async logSkillChange(
    skillId: string,
    actorId: string,
    beforeState: any,
    afterState: any,
    eventType: string,
  ): Promise<void> {
    await this.auditService.log({
      workflowId: skillId,
      actorId,
      actorType: ActorType.USER,
      eventType,
      beforeState,
      afterState,
    });
  }

  private toResponseDto(skill: Skill): SkillResponseDto {
    return {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      skillType: skill.skillType,
      content: (skill.content as any)?.full ?? '',
      appliesToDomains: skill.appliesToDomains,
      appliesToAgents: skill.appliesToAgents,
      isActive: skill.isActive,
      isMandatory: skill.isMandatory,
      usageCount: skill.usageCount,
      version: skill.version,
      createdAt: skill.createdAt,
      updatedAt: skill.updatedAt,
    };
  }
}
