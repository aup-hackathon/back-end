import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { ActorType } from '@database/enums';
import { JsonValue } from '@database/types/json-value.type';
import { AuditLog } from '@modules/audit/entities/audit-log.entity';
import { Session } from '@modules/sessions/entities';
import { Workflow } from '@modules/workflows/entities';
import { NatsPublisherService } from '../../../infra/nats/nats.publisher.service';

import { Document } from '../entities';
import {
  DocumentExtractedTextDto,
  DocumentResponseDto,
  UpdateExtractedTextDto,
  UploadDocumentDto,
} from '../dtos';
import { DocumentStorageService } from './document-storage.service';
import {
  assertDocumentFileSizeWithinLimit,
  assertSessionDocumentSizeWithinLimit,
} from '../utils/document-size.util';
import { validateDocumentMimeType } from '../utils/document-validation.util';
import { buildSafeObjectKey } from '../utils/document-storage.util';

type RequestUser = {
  id: string;
  orgId: string;
  role: string;
};

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(Workflow)
    private readonly workflowRepository: Repository<Workflow>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    private readonly documentStorageService: DocumentStorageService,
    private readonly natsPublisher: NatsPublisherService,
  ) { }

  async uploadDocument(
    dto: UploadDocumentDto,
    file: Express.Multer.File | undefined,
    currentUser: RequestUser,
  ): Promise<DocumentResponseDto> {
    if (!file) {
      throw new BadRequestException('A multipart file is required under the "file" field.');
    }

    assertDocumentFileSizeWithinLimit(file.size);
    const normalizedMimeType = await validateDocumentMimeType(file.originalname, file.buffer);

    const ownedSession = await this.findOwnedSession(dto.sessionId, currentUser.orgId);
    if (!ownedSession) {
      throw new NotFoundException('Session not found.');
    }

    if (dto.workflowId && dto.workflowId !== ownedSession.workflowId) {
      throw new BadRequestException(
        'The provided workflowId does not match the workflow linked to the session.',
      );
    }

    const currentSessionBytes = await this.getSessionDocumentBytes(ownedSession.id);
    assertSessionDocumentSizeWithinLimit(currentSessionBytes, file.size);

    const nextVersion = await this.getNextDocumentVersion(ownedSession.id, file.originalname);
    const objectKey = buildSafeObjectKey(
      currentUser.orgId,
      ownedSession.workflowId,
      ownedSession.id,
      nextVersion,
      uuidv4(),
      file.originalname,
    );

    const storageResult = await this.documentStorageService.storeDocument({
      objectKey,
      contentType: normalizedMimeType,
      buffer: file.buffer,
    });

    const document = this.documentRepository.create({
      workflowId: ownedSession.workflowId,
      sessionId: ownedSession.id,
      filename: file.originalname,
      fileType: normalizedMimeType,
      storageUrl: storageResult.storageUrl,
      fileSizeBytes: file.size,
      docVersion: nextVersion,
      deletedAt: null,
    });

    const savedDocument = await this.documentRepository.save(document);
    await this.publishDocumentPreprocess(savedDocument);

    return this.toDocumentResponse(savedDocument, storageResult.presignedUrl);
  }

  async getDocument(documentId: string, currentUser: RequestUser): Promise<DocumentResponseDto> {
    const document = await this.findActiveOwnedDocument(documentId, currentUser.orgId);
    if (!document) {
      throw new NotFoundException('Document not found.');
    }

    const presignedUrl = await this.documentStorageService.createPresignedUrl(document.storageUrl);
    return this.toDocumentResponse(document, presignedUrl);
  }

  async softDeleteDocument(documentId: string, currentUser: RequestUser): Promise<void> {
    const document = await this.findActiveOwnedDocument(documentId, currentUser.orgId);
    if (!document) {
      throw new NotFoundException('Document not found.');
    }

    document.deletedAt = new Date();
    await this.documentRepository.save(document);
  }

  async listWorkflowDocuments(
    workflowId: string,
    currentUser: RequestUser,
  ): Promise<DocumentResponseDto[]> {
    const workflow = await this.workflowRepository.findOne({
      where: {
        id: workflowId,
        orgId: currentUser.orgId,
      },
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found.');
    }

    const documents = await this.documentRepository.find({
      where: {
        workflowId,
        deletedAt: null,
      },
      order: {
        createdAt: 'DESC',
      },
    });

    return documents.map((document) => this.toDocumentResponse(document));
  }

  async getExtractedText(
    documentId: string,
    currentUser: RequestUser,
  ): Promise<DocumentExtractedTextDto> {
    const document = await this.findActiveOwnedDocument(documentId, currentUser.orgId);
    if (!document) {
      throw new NotFoundException('Document not found.');
    }

    return this.toExtractedTextResponse(document);
  }

  async updateExtractedText(
    documentId: string,
    dto: UpdateExtractedTextDto,
    currentUser: RequestUser,
  ): Promise<DocumentExtractedTextDto> {
    const document = await this.findActiveOwnedDocument(documentId, currentUser.orgId);
    if (!document) {
      throw new NotFoundException('Document not found.');
    }

    const beforeState = {
      extracted_text: document.extractedText,
      preprocessing_confidence: document.preprocessingConfidence,
    };

    document.extractedText = dto.extractedText;
    const savedDocument = await this.documentRepository.save(document);
    await this.auditLogRepository.insert({
      workflowId: savedDocument.workflowId,
      actorId: currentUser.id,
      actorType: ActorType.USER,
      eventType: 'DOCUMENT_EXTRACTED_TEXT_UPDATED',
      elementId: savedDocument.id,
      beforeState,
      afterState: {
        extracted_text: savedDocument.extractedText,
        preprocessing_confidence: savedDocument.preprocessingConfidence,
      },
    });

    return this.toExtractedTextResponse(savedDocument);
  }

  async reprocessDocument(
    documentId: string,
    currentUser: RequestUser,
  ): Promise<DocumentResponseDto> {
    const document = await this.findActiveOwnedDocument(documentId, currentUser.orgId);
    if (!document) {
      throw new NotFoundException('Document not found.');
    }

    if (!document.sessionId || !document.workflowId) {
      throw new BadRequestException('Only workflow session documents can be reprocessed.');
    }

    const nextVersion = await this.getNextDocumentVersion(document.sessionId, document.filename);
    const nextDocument = this.documentRepository.create({
      workflowId: document.workflowId,
      sessionId: document.sessionId,
      filename: document.filename,
      fileType: document.fileType,
      storageUrl: document.storageUrl,
      fileSizeBytes: document.fileSizeBytes,
      extractedText: null,
      preprocessingConfidence: null,
      docVersion: nextVersion,
      deletedAt: null,
      archivedAt: null,
    });

    const savedDocument = await this.documentRepository.save(nextDocument);
    await this.publishDocumentPreprocess(savedDocument);
    const presignedUrl = await this.documentStorageService.createPresignedUrl(savedDocument.storageUrl);

    return this.toDocumentResponse(savedDocument, presignedUrl);
  }

  private async findOwnedSession(sessionId: string, orgId: string): Promise<Session | null> {
    const sessionAlias = 'session';
    const workflowAlias = 'workflow';

    return this.sessionRepository
      .createQueryBuilder(sessionAlias)
      .innerJoin(
        Workflow,
        workflowAlias,
        `${workflowAlias}.id = ${sessionAlias}.workflow_id AND ${workflowAlias}.org_id = :orgId`,
        { orgId },
      )
      .where(`${sessionAlias}.id = :sessionId`, { sessionId })
      .getOne();
  }

  private async findActiveOwnedDocument(documentId: string, orgId: string): Promise<Document | null> {
    const documentAlias = 'document';
    const workflowAlias = 'workflow';

    return this.documentRepository
      .createQueryBuilder(documentAlias)
      .innerJoin(
        Workflow,
        workflowAlias,
        `${workflowAlias}.id = ${documentAlias}.workflow_id AND ${workflowAlias}.org_id = :orgId`,
        { orgId },
      )
      .where(`${documentAlias}.id = :documentId`, { documentId })
      .andWhere(`${documentAlias}.deleted_at IS NULL`)
      .getOne();
  }

  private async getSessionDocumentBytes(sessionId: string): Promise<number> {
    const documentAlias = 'document';
    const rawResult = await this.documentRepository
      .createQueryBuilder(documentAlias)
      .select(`COALESCE(SUM(${documentAlias}.file_size_bytes), 0)`, 'totalSizeBytes')
      .where(`${documentAlias}.session_id = :sessionId`, { sessionId })
      .getRawOne<{ totalSizeBytes: string }>();

    return Number(rawResult?.totalSizeBytes ?? 0);
  }

  private async getNextDocumentVersion(sessionId: string, filename: string): Promise<number> {
    const documentAlias = 'document';
    const rawResult = await this.documentRepository
      .createQueryBuilder(documentAlias)
      .select(`COALESCE(MAX(${documentAlias}.doc_version), 0)`, 'maxVersion')
      .where(`${documentAlias}.session_id = :sessionId`, { sessionId })
      .andWhere(`${documentAlias}.filename = :filename`, { filename })
      .getRawOne<{ maxVersion: string }>();

    return Number(rawResult?.maxVersion ?? 0) + 1;
  }

  private toDocumentResponse(
    document: Document,
    presignedUrl?: string,
  ): DocumentResponseDto {
    return {
      id: document.id,
      workflowId: document.workflowId,
      sessionId: document.sessionId,
      filename: document.filename,
      fileType: document.fileType,
      storageUrl: document.storageUrl,
      fileSizeBytes: document.fileSizeBytes,
      docVersion: document.docVersion,
      presignedUrl,
      createdAt: document.createdAt.toISOString(),
      deletedAt: document.deletedAt ? document.deletedAt.toISOString() : null,
    };
  }

  private toExtractedTextResponse(document: Document): DocumentExtractedTextDto {
    return {
      documentId: document.id,
      docVersion: document.docVersion,
      extractedText: document.extractedText,
      preprocessingConfidence: document.preprocessingConfidence,
    };
  }

  private publishDocumentPreprocess(document: Document): Promise<void> {
    return this.natsPublisher.publishDocumentPreprocess({
      document_id: document.id,
      file_type: document.fileType,
      storage_url: document.storageUrl,
    });
  }
}
