import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Session } from '../../sessions/entities/session.entity';
import { Workflow } from '../../workflows/entities/workflow.entity';
import { Message } from '../entities';
import {
  CreateMessageDto,
  ListSessionMessagesQueryDto,
  MessageResponseDto,
  PaginatedMessagesDto,
} from '../dtos';
import {
  DEFAULT_MESSAGE_PAGE_SIZE,
  decodeMessageCursor,
  getMessagePageWindow,
} from '../utils/message-pagination.util';
import { applyOptionalMessageFilters } from '../utils/message-query.util';

type RequestUser = {
  id: string;
  orgId: string;
  role: string;
};

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private readonly messagesRepository: Repository<Message>,
    @InjectRepository(Session)
    private readonly sessionsRepository: Repository<Session>,
  ) {}

  async createMessage(
    sessionId: string,
    dto: CreateMessageDto,
    currentUser: RequestUser,
  ): Promise<MessageResponseDto> {
    await this.findOwnedSessionOrThrow(sessionId, currentUser.orgId);

    const message = this.messagesRepository.create({
      sessionId,
      role: dto.role,
      type: dto.type,
      content: dto.content,
      metadata: dto.metadata ?? {},
      archivedAt: null,
    });

    const savedMessage = await this.messagesRepository.save(message);
    return this.toMessageResponse(savedMessage);
  }

  async listSessionMessages(
    sessionId: string,
    query: ListSessionMessagesQueryDto,
    currentUser: RequestUser,
  ): Promise<PaginatedMessagesDto> {
    await this.findOwnedSessionOrThrow(sessionId, currentUser.orgId);

    const cursor = query.cursor ? decodeMessageCursor(query.cursor) : undefined;

    const queryBuilder = this.createOwnedSessionMessagesQuery(sessionId, currentUser.orgId);

    applyOptionalMessageFilters(queryBuilder, {
      type: query.type,
      search: query.search || undefined,
      cursor,
    });

    const rows = await queryBuilder
      .orderBy('message.created_at', 'ASC')
      .addOrderBy('message.id', 'ASC')
      .limit(DEFAULT_MESSAGE_PAGE_SIZE + 1)
      .getMany();

    const page = getMessagePageWindow(rows, DEFAULT_MESSAGE_PAGE_SIZE);

    return {
      items: page.items.map((message) => this.toMessageResponse(message)),
      next_cursor: page.nextCursor,
    };
  }

  async getMessage(messageId: string, currentUser: RequestUser): Promise<MessageResponseDto> {
    const message = await this.messagesRepository
      .createQueryBuilder('message')
      .innerJoin(Session, 'session', 'session.id = message.session_id AND session.archived_at IS NULL')
      .innerJoin(
        Workflow,
        'workflow',
        'workflow.id = session.workflow_id AND workflow.org_id = :orgId',
        { orgId: currentUser.orgId },
      )
      .where('message.id = :messageId', { messageId })
      .andWhere('message.archived_at IS NULL')
      .getOne();

    if (!message) {
      throw new NotFoundException('Message not found.');
    }

    return this.toMessageResponse(message);
  }

  async exportSessionTranscriptPdf(sessionId: string, currentUser: RequestUser): Promise<Buffer> {
    await this.findOwnedSessionOrThrow(sessionId, currentUser.orgId);

    const messages = await this.createOwnedSessionMessagesQuery(sessionId, currentUser.orgId)
      .orderBy('message.created_at', 'ASC')
      .addOrderBy('message.id', 'ASC')
      .getMany();

    return this.renderTranscriptPdf(sessionId, messages);
  }

  private async findOwnedSessionOrThrow(sessionId: string, orgId: string): Promise<Session> {
    const session = await this.sessionsRepository
      .createQueryBuilder('session')
      .innerJoin(
        Workflow,
        'workflow',
        'workflow.id = session.workflow_id AND workflow.org_id = :orgId',
        { orgId },
      )
      .where('session.id = :sessionId', { sessionId })
      .andWhere('session.archived_at IS NULL')
      .getOne();

    if (!session) {
      throw new NotFoundException('Session not found.');
    }

    return session;
  }

  private toMessageResponse(message: Message): MessageResponseDto {
    return {
      id: message.id,
      sessionId: message.sessionId,
      role: message.role,
      type: message.type,
      content: message.content,
      metadata: message.metadata ?? {},
      createdAt: message.createdAt.toISOString(),
    };
  }

  private createOwnedSessionMessagesQuery(sessionId: string, orgId: string) {
    return this.messagesRepository
      .createQueryBuilder('message')
      .innerJoin(Session, 'session', 'session.id = message.session_id AND session.archived_at IS NULL')
      .innerJoin(
        Workflow,
        'workflow',
        'workflow.id = session.workflow_id AND workflow.org_id = :orgId',
        { orgId },
      )
      .where('message.session_id = :sessionId', { sessionId })
      .andWhere('message.archived_at IS NULL');
  }

  private renderTranscriptPdf(sessionId: string, messages: Message[]): Promise<Buffer> {
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
        Title: `Session ${sessionId} Transcript`,
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

      pdf.fontSize(18).text('Session Transcript', { align: 'center' });
      pdf.moveDown(0.5);
      pdf.fontSize(10).text(`Session ID: ${sessionId}`);
      pdf.fontSize(10).text(`Generated At: ${new Date().toISOString()}`);
      pdf.moveDown();

      if (messages.length === 0) {
        pdf.fontSize(12).text('No messages were found for this session.');
        pdf.end();
        return;
      }

      messages.forEach((message, index) => {
        pdf
          .fontSize(11)
          .text(
            `${index + 1}. ${message.createdAt.toISOString()} | ${message.role} | ${message.type}`,
          );
        pdf.fontSize(12).text(message.content);

        const metadataKeys = Object.keys(message.metadata ?? {});
        if (metadataKeys.length > 0) {
          pdf.fontSize(9).text(`Metadata: ${JSON.stringify(message.metadata)}`);
        }

        pdf.moveDown();
      });

      pdf.end();
    });
  }
}
