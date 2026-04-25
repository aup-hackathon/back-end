import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';

import { ActorType, UserRole } from '../../database/enums';
import { JsonValue } from '../../database/types/json-value.type';
import { Workflow } from '../workflows/entities/workflow.entity';
import { AuditLog } from './entities/audit-log.entity';
import { AI_DECISION_FILTER, DECISION_EVENT_TYPES } from './audit.constants';
import { AuditLogExportFormat, AuditLogExportQueryDto } from './dto/audit-log-export-query.dto';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

type AuditAccessUser = {
  id: string;
  orgId: string;
  role: UserRole | string;
};

type AuditLogEntryInput = {
  id?: string;
  workflowId?: string | null;
  actorId?: string | null;
  actorType: ActorType;
  eventType: string;
  elementId?: string | null;
  beforeState?: JsonValue | null;
  afterState?: JsonValue | null;
};

type AuditFilterInput = Pick<AuditLogQueryDto, 'type' | 'from' | 'to' | 'actor_id'>;

type PaginatedAuditLogResult = {
  entries: AuditLog[];
  total: number;
  page: number;
  limit: number;
};

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    @InjectRepository(Workflow)
    private readonly workflowRepository: Repository<Workflow>,
  ) {}

  async log(entry: AuditLogEntryInput): Promise<AuditLog> {
    if (entry.id) {
      throw new BadRequestException('Audit log rows are immutable');
    }

    const auditLog = this.auditLogRepository.create({
      workflowId: entry.workflowId ?? null,
      actorId: entry.actorId ?? null,
      actorType: entry.actorType,
      eventType: entry.eventType,
      elementId: entry.elementId ?? null,
      beforeState: entry.beforeState ?? null,
      afterState: entry.afterState ?? null,
    });

    return this.auditLogRepository.save(auditLog);
  }

  async getWorkflowAuditLog(
    workflowId: string,
    currentUser: AuditAccessUser,
    query: AuditLogQueryDto,
  ): Promise<PaginatedAuditLogResult> {
    await this.assertWorkflowAccess(workflowId, currentUser);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.buildAuditLogQuery(workflowId, query);

    const total = await qb.getCount();
    const entries = await qb
      .orderBy('audit.created_at', 'DESC')
      .addOrderBy('audit.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return { entries, total, page, limit };
  }

  async getDecisionLog(
    workflowId: string,
    currentUser: AuditAccessUser,
    query: AuditLogQueryDto,
  ): Promise<PaginatedAuditLogResult> {
    await this.assertWorkflowAccess(workflowId, currentUser);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.buildAuditLogQuery(workflowId, query, { decisionOnly: true });

    const total = await qb.getCount();
    const entries = await qb
      .orderBy('audit.created_at', 'DESC')
      .addOrderBy('audit.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return { entries, total, page, limit };
  }

  async listDecisionEntriesForWorkflow(workflowId: string): Promise<AuditLog[]> {
    return this.auditLogRepository.find({
      where: DECISION_EVENT_TYPES.map((eventType) => ({ workflowId, eventType })),
      order: { createdAt: 'DESC', id: 'DESC' },
    });
  }

  async exportWorkflowAuditLog(
    workflowId: string,
    currentUser: AuditAccessUser,
    query: AuditLogExportQueryDto,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    await this.assertWorkflowAccess(workflowId, currentUser);

    const entries = await this.buildAuditLogQuery(workflowId, query)
      .orderBy('audit.created_at', 'DESC')
      .addOrderBy('audit.id', 'DESC')
      .getMany();

    const generatedAt = new Date();
    const timestamp = generatedAt.toISOString().replace(/[:.]/g, '-');
    const filename = `workflow-${workflowId}-audit-log-${timestamp}.${query.format}`;

    if (query.format === AuditLogExportFormat.CSV) {
      return {
        buffer: this.renderCsv(entries),
        contentType: 'text/csv; charset=utf-8',
        filename,
      };
    }

    return {
      buffer: await this.renderPdf(workflowId, entries, query, generatedAt),
      contentType: 'application/pdf',
      filename,
    };
  }

  private async assertWorkflowAccess(workflowId: string, currentUser: AuditAccessUser): Promise<void> {
    const allowedRoles = new Set<string>([
      UserRole.ADMIN,
      UserRole.PROCESS_OWNER,
      UserRole.BUSINESS_ANALYST,
    ]);

    if (!allowedRoles.has(currentUser.role)) {
      throw new ForbiddenException('You do not have permission to access the audit log');
    }

    const workflow = await this.workflowRepository.findOne({
      where: { id: workflowId, orgId: currentUser.orgId },
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }
  }

  private buildAuditLogQuery(
    workflowId: string,
    query: AuditFilterInput,
    options?: { decisionOnly?: boolean },
  ): SelectQueryBuilder<AuditLog> {
    const qb = this.auditLogRepository
      .createQueryBuilder('audit')
      .where('audit.workflow_id = :workflowId', { workflowId });

    if (options?.decisionOnly || query.type === AI_DECISION_FILTER) {
      qb.andWhere('audit.event_type IN (:...decisionEventTypes)', {
        decisionEventTypes: [...DECISION_EVENT_TYPES],
      });
    } else if (query.type) {
      qb.andWhere('audit.event_type = :eventType', { eventType: query.type });
    }

    if (query.from) {
      qb.andWhere('audit.created_at >= :from', {
        from: new Date(query.from).toISOString(),
      });
    }

    if (query.to) {
      qb.andWhere('audit.created_at <= :to', {
        to: new Date(query.to).toISOString(),
      });
    }

    if (query.actor_id) {
      qb.andWhere('audit.actor_id = :actorId', { actorId: query.actor_id });
    }

    return qb;
  }

  private renderCsv(entries: AuditLog[]): Buffer {
    const header = [
      'id',
      'workflow_id',
      'actor_id',
      'actor_type',
      'event_type',
      'element_id',
      'created_at',
      'before_state',
      'after_state',
    ];

    const lines = [
      header.join(','),
      ...entries.map((entry) =>
        [
          entry.id,
          entry.workflowId ?? '',
          entry.actorId ?? '',
          entry.actorType,
          entry.eventType,
          entry.elementId ?? '',
          entry.createdAt.toISOString(),
          this.stringifyState(entry.beforeState),
          this.stringifyState(entry.afterState),
        ]
          .map((value) => this.escapeCsv(value))
          .join(','),
      ),
    ];

    return Buffer.from(lines.join('\n'), 'utf8');
  }

  private async renderPdf(
    workflowId: string,
    entries: AuditLog[],
    query: AuditFilterInput,
    generatedAt: Date,
  ): Promise<Buffer> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PDFDocument = require('pdfkit') as new (options?: Record<string, unknown>) => {
      fontSize(size: number): any;
      text(text: string, options?: Record<string, unknown>): any;
      moveDown(lines?: number): any;
      on(event: string, callback: (...args: any[]) => void): any;
      end(): void;
    };

    const pdf = new PDFDocument({
      margin: 48,
      compress: false,
      info: {
        Title: `Workflow ${workflowId} Audit Log`,
        Author: 'FlowForge Backend',
      },
    });

    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];

      pdf.on('data', (chunk: Buffer | Uint8Array) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.on('error', reject);

      pdf.fontSize(18).text('Workflow Audit Log', { align: 'center' });
      pdf.moveDown(0.5);
      pdf.fontSize(10).text(`Workflow ID: ${workflowId}`);
      pdf.fontSize(10).text(`Generated At: ${generatedAt.toISOString()}`);
      pdf.fontSize(10).text(
        `Filters: ${JSON.stringify({
          type: query.type ?? null,
          from: query.from ?? null,
          to: query.to ?? null,
          actor_id: query.actor_id ?? null,
        })}`,
      );
      pdf.moveDown();

      if (entries.length === 0) {
        pdf.fontSize(12).text('No audit log entries matched the requested filters.');
        pdf.end();
        return;
      }

      entries.forEach((entry, index) => {
        pdf
          .fontSize(11)
          .text(
            `${index + 1}. ${entry.createdAt.toISOString()} | ${entry.eventType} | ${entry.actorType}`,
          );

        if (entry.actorId) {
          pdf.fontSize(10).text(`Actor ID: ${entry.actorId}`);
        }

        if (entry.elementId) {
          pdf.fontSize(10).text(`Element ID: ${entry.elementId}`);
        }

        if (entry.beforeState !== null && entry.beforeState !== undefined) {
          pdf.fontSize(9).text(`Before: ${this.stringifyState(entry.beforeState)}`);
        }

        if (entry.afterState !== null && entry.afterState !== undefined) {
          pdf.fontSize(9).text(`After: ${this.stringifyState(entry.afterState)}`);
        }

        pdf.moveDown();
      });

      pdf.end();
    });
  }

  private stringifyState(value: JsonValue | null | undefined): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'string') {
      return value;
    }

    return JSON.stringify(value);
  }

  private escapeCsv(value: string): string {
    const normalized = value.replace(/"/g, '""');
    return `"${normalized}"`;
  }
}

