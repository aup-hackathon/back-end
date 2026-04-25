import { randomUUID } from 'crypto';

import { DataType, newDb } from 'pg-mem';
import { DataSource, Repository } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

import { WorkflowStatus, SessionMode, SessionStatus } from '../../../database/enums';
import { Session } from '../../sessions/entities/session.entity';
import { Workflow } from '../../workflows/entities/workflow.entity';
import { Document } from '../entities/document.entity';
import { DocumentPreprocessSubscriberService } from './document-preprocess.subscriber.service';
import { DocumentsService } from './documents.service';

jest.mock('../utils/document-validation.util', () => ({
  validateDocumentMimeType: jest.fn(async () => 'application/pdf'),
}));

describe('DocumentsService integration', () => {
  let dataSource: DataSource;
  let documentRepository: Repository<Document>;
  let sessionRepository: Repository<Session>;
  let workflowRepository: Repository<Workflow>;

  const documentStorageService = {
    storeDocument: jest.fn(async ({ objectKey }: { objectKey: string }) => ({
      storageUrl: `minio://documents/${objectKey}`,
      presignedUrl: `https://files.test/${objectKey}`,
    })),
    createPresignedUrl: jest.fn(async (storageUrl: string) => `https://files.test/${storageUrl}`),
  };

  const natsPublisher = {
    publishDocumentPreprocess: jest.fn(async () => undefined),
  };
  const auditService = {
    log: jest.fn(async () => undefined),
  };

  const realtimeGateway = {
    emitToSession: jest.fn(),
  };

  const currentUser = {
    id: '11111111-1111-4111-8111-111111111111',
    orgId: '00000000-0000-4000-8000-000000000001',
    role: 'process_owner',
  };

  beforeAll(async () => {
    const db = newDb({ autoCreateForeignKeyIndices: true });
    db.public.registerFunction({
      name: 'current_database',
      returns: DataType.text,
      implementation: () => 'flowforge_test',
    });
    db.public.registerFunction({
      name: 'version',
      returns: DataType.text,
      implementation: () => 'PostgreSQL 16.0',
    });
    db.public.registerFunction({
      name: 'gen_random_uuid',
      returns: DataType.uuid,
      implementation: () => randomUUID(),
    });
    db.public.registerFunction({
      name: 'uuid_generate_v4',
      returns: DataType.uuid,
      implementation: () => randomUUID(),
    });

    dataSource = await db.adapters.createTypeormDataSource({
      type: 'postgres',
      entities: [Document, Session, Workflow],
      namingStrategy: new SnakeNamingStrategy(),
      synchronize: true,
    });
    await dataSource.initialize();

    documentRepository = dataSource.getRepository(Document);
    sessionRepository = dataSource.getRepository(Session);
    workflowRepository = dataSource.getRepository(Workflow);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await documentRepository.clear();
    await sessionRepository.clear();
    await workflowRepository.clear();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('uploads a PDF and persists extracted text after preprocessing completes', async () => {
    const workflow = await workflowRepository.save(
      workflowRepository.create({
        id: '22222222-2222-4222-8222-222222222222',
        title: 'Claims intake',
        description: null,
        status: WorkflowStatus.DRAFT,
        currentVersion: 1,
        orgId: currentUser.orgId,
        ownerId: currentUser.id,
        domain: null,
        tags: [],
      }),
    );

    const session = await sessionRepository.save(
      sessionRepository.create({
        id: '33333333-3333-4333-8333-333333333333',
        workflowId: workflow.id,
        userId: currentUser.id,
        mode: SessionMode.AUTO,
        status: SessionStatus.CREATED,
        confidenceScore: 0,
        finalizedAt: null,
        archivedAt: null,
      }),
    );

    const documentsService = new DocumentsService(
      documentRepository,
      sessionRepository,
      workflowRepository,
      documentStorageService as never,
      natsPublisher as never,
      auditService as never,
    );
    const subscriber = new DocumentPreprocessSubscriberService(
      documentRepository,
      { subscribe: jest.fn() } as never,
      realtimeGateway as never,
    );

    const fileBuffer = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF',
      'utf8',
    );
    const uploadResult = await documentsService.uploadDocument(
      {
        sessionId: session.id,
        workflowId: workflow.id,
      },
      {
        fieldname: 'file',
        originalname: 'requirements.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: fileBuffer.length,
        buffer: fileBuffer,
        stream: undefined as never,
        destination: '',
        filename: 'requirements.pdf',
        path: '',
      } as Express.Multer.File,
      currentUser,
    );

    expect(uploadResult.docVersion).toBe(1);
    expect(natsPublisher.publishDocumentPreprocess).toHaveBeenCalledWith(
      expect.objectContaining({
        document_id: uploadResult.id,
        file_type: 'application/pdf',
      }),
    );

    await subscriber.handlePreprocessResult({
      document_id: uploadResult.id,
      extracted_text: 'Normalized OCR text for the uploaded PDF',
      preprocessing_confidence: 0.94,
    });

    const extractedText = await documentsService.getExtractedText(uploadResult.id, currentUser);
    const storedDocument = await documentRepository.findOneByOrFail({ id: uploadResult.id });

    expect(extractedText).toEqual({
      documentId: uploadResult.id,
      docVersion: 1,
      extractedText: 'Normalized OCR text for the uploaded PDF',
      preprocessingConfidence: 0.94,
    });
    expect(storedDocument.extractedText).toBe('Normalized OCR text for the uploaded PDF');
    expect(storedDocument.preprocessingConfidence).toBe(0.94);
    expect(realtimeGateway.emitToSession).toHaveBeenCalledWith(session.id, 'document.ready', {
      type: 'document.ready',
      document_id: uploadResult.id,
    });
  });
});
