import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PipelineExecution } from '../../agents/entities/pipeline-execution.entity';
import { AuditService } from '../../audit/audit.service';
import { Workflow } from '../entities/workflow.entity';
import { WorkflowVersion } from '../entities/workflow-version.entity';
import { Session } from '../../sessions/entities/session.entity';
import { DivergenceReport } from '../../divergence/entities/divergence-report.entity';
import { DivergencePoint } from '../../divergence/entities/divergence-point.entity';
import { Message } from '../../messages/entities/message.entity';
import { PipelineTaskType, WorkflowStatus, ActorType, SessionStatus, PointSeverity, SessionMode, PipelineStatus } from '../../../database/enums';
import { JsonValue } from '../../../database/types/json-value.type';
import { WorkflowsService } from '../workflows.service';
import { ElsaMappingService, ElsaWorkflowJson, FlowForgeElement } from './elsa-mapping.service';
import { ExportFormat } from '../dto/export-workflow.dto';

@Injectable()
export class WorkflowExportService {
  constructor(
    @InjectRepository(Workflow)
    private readonly workflowRepo: Repository<Workflow>,
    @InjectRepository(WorkflowVersion)
    private readonly versionRepo: Repository<WorkflowVersion>,
    @InjectRepository(Session)
    private readonly sessionRepo: Repository<Session>,
    @InjectRepository(DivergenceReport)
    private readonly divergenceReportRepo: Repository<DivergenceReport>,
    @InjectRepository(DivergencePoint)
    private readonly divergencePointRepo: Repository<DivergencePoint>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    @InjectRepository(PipelineExecution)
    private readonly pipelineExecutionRepo: Repository<PipelineExecution>,
    @Inject(forwardRef(() => WorkflowsService))
    private readonly workflowsService: WorkflowsService,
    private readonly elsaMappingService: ElsaMappingService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Check if workflow can be exported (requires VALIDATED status and no unresolved CRITICAL divergences)
   */
  async validateExportability(
    workflowId: string,
    orgId: string,
    actorId: string,
    actorRole: string,
  ): Promise<{ canExport: boolean; reason?: string; unresolvedCriticalPoints?: number }> {
    const workflow = await this.workflowsService.findOneWithLatestVersion(workflowId, orgId);
    if (!workflow) {
      return { canExport: false, reason: 'WORKFLOW_NOT_FOUND' };
    }

    // Security check: owner, business analyst, or admin only
    if (workflow.ownerId !== actorId && actorRole !== 'admin' && actorRole !== 'business_analyst') {
      return { canExport: false, reason: 'FORBIDDEN' };
    }

    if (workflow.status !== WorkflowStatus.VALIDATED) {
      return { canExport: false, reason: 'INVALID_STATUS', unresolvedCriticalPoints: 0 };
    }

    // Check for unresolved CRITICAL divergences (FR-12.2)
    const session = await this.sessionRepo.findOne({
      where: { workflowId },
      order: { createdAt: 'DESC' },
    });

    if (session && session.status === SessionStatus.NEEDS_RECONCILIATION) {
      return { canExport: false, reason: 'RECONCILIATION_REQUIRED' };
    }

    if (session) {
      const latestReport = await this.divergenceReportRepo.findOne({
        where: { workflowId },
        order: { createdAt: 'DESC' },
      });

      if (latestReport) {
        const criticalUnresolved = await this.divergencePointRepo.count({
          where: {
            reportId: latestReport.id,
            severity: PointSeverity.CRITICAL,
            resolved: false,
          },
        });

        if (criticalUnresolved > 0) {
          return { canExport: false, reason: 'RECONCILIATION_REQUIRED', unresolvedCriticalPoints: criticalUnresolved };
        }
      }
    }

    return { canExport: true };
  }

  /**
   * Export to Elsa (synchronous - pure JSON transform)
   */
  async exportToElsa(
    workflowId: string,
    versionNumber: number,
    userId: string,
    orgId: string,
  ): Promise<{ json: ElsaWorkflowJson; filename: string; artifactUri: string }> {
    const version = await this.versionRepo.findOne({
      where: { workflowId, versionNumber },
    });
    if (!version) {
      throw new NotFoundException(`Workflow version ${versionNumber} not found`);
    }

    const workflow = await this.workflowRepo.findOne({ where: { id: workflowId } });
    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    const elementsJson = version.elementsJson as JsonValue;
    const elements = this.parseElements(elementsJson);

    const elsaJson = this.elsaMappingService.convertToElsaWorkflow(
      elements,
      workflowId,
      workflow.title,
      versionNumber,
    );

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `workflow-${workflowId}-v${versionNumber}-elsa-${timestamp}.json`;
    const artifactUri = `exports/${orgId}/${workflowId}/v${versionNumber}-elsa-${timestamp}.json`;

    await this.updateAuditLog(workflowId, userId, {
      status: WorkflowStatus.VALIDATED,
    }, {
      status: WorkflowStatus.EXPORTED,
      format: 'elsa',
      artifactUri,
    });

    await this.workflowRepo.update(workflowId, { status: WorkflowStatus.EXPORTED });

    return { json: elsaJson, filename, artifactUri };
  }

  /**
   * Export to BPMN (async - CPU heavy, create pipeline execution for FastAPI)
   */
  async exportToBpmnAsync(
    workflowId: string,
    versionNumber: number,
    userId: string,
    orgId: string,
    correlationId: string,
  ): Promise<{ pipelineExecutionId: string; statusUrl: string }> {
    const pipelineExecution = this.pipelineExecutionRepo.create({
      sessionId: workflowId,
      taskType: PipelineTaskType.EXPORT_ONLY,
      mode: SessionMode.INTERACTIVE,
      inputPayload: { format: ExportFormat.BPMN, workflowId, versionNumber, correlationId } as any,
      triggeredBy: userId,
      status: PipelineStatus.PENDING,
    });

    const saved = await this.pipelineExecutionRepo.save(pipelineExecution);

    // Note: The NATS publish should happen via the AI Gateway module
    // For now, return the pipeline execution ID for polling

    return {
      pipelineExecutionId: saved.id,
      statusUrl: `/pipeline-executions/${saved.id}`,
    };
  }

  /**
   * Export to PDF (async - CPU heavy, create pipeline execution for FastAPI)
   */
  async exportToPdfAsync(
    workflowId: string,
    versionNumber: number,
    userId: string,
    orgId: string,
    correlationId: string,
  ): Promise<{ pipelineExecutionId: string; statusUrl: string }> {
    const pipelineExecution = this.pipelineExecutionRepo.create({
      sessionId: workflowId,
      taskType: PipelineTaskType.EXPORT_ONLY,
      mode: SessionMode.INTERACTIVE,
      inputPayload: { format: ExportFormat.PDF, workflowId, versionNumber, correlationId } as any,
      triggeredBy: userId,
      status: PipelineStatus.PENDING,
    });

    const saved = await this.pipelineExecutionRepo.save(pipelineExecution);

    // Note: The NATS publish should happen via the AI Gateway module
    // For now, return the pipeline execution ID for polling

    return {
      pipelineExecutionId: saved.id,
      statusUrl: `/pipeline-executions/${saved.id}`,
    };
  }

  /**
   * Get plain-language summary for PDF export
   */
  async getPlainLanguageSummary(workflowId: string): Promise<string | null> {
    // Get the latest session for this workflow
    const session = await this.sessionRepo.findOne({
      where: { workflowId },
      order: { createdAt: 'DESC' },
    });

    if (!session) {
      return null;
    }

    const summaryMessage = await this.messageRepo.findOne({
      where: { sessionId: session.id, type: 'ai_summary' as any },
      order: { createdAt: 'DESC' },
    });

    if (!summaryMessage) {
      return null;
    }

    return summaryMessage.content as string;
  }

  /**
   * Get decision log for PDF export
   */
  async getDecisionLog(workflowId: string): Promise<Array<{ actor: string; action: string; timestamp: Date }>> {
    const auditLogs = await this.auditService.listDecisionEntriesForWorkflow(workflowId);

    return auditLogs.slice(0, 50).map((log) => ({
      actor: log.actorType,
      action: log.eventType,
      timestamp: log.createdAt,
    }));
  }

  private parseElements(elementsJson: JsonValue): { nodes?: FlowForgeElement[]; edges?: FlowForgeElement[] } {
    if (typeof elementsJson === 'string') {
      try {
        return JSON.parse(elementsJson);
      } catch {
        return {};
      }
    }
    return (elementsJson as { nodes?: FlowForgeElement[]; edges?: FlowForgeElement[] }) ?? {};
  }

  private async updateAuditLog(
    workflowId: string,
    actorId: string,
    beforeState: JsonValue,
    afterState: JsonValue,
  ): Promise<void> {
    await this.auditService.log({
      workflowId,
      actorId,
      actorType: ActorType.USER,
      eventType: 'WORKFLOW_EXPORTED',
      beforeState,
      afterState,
    });
  }
}
