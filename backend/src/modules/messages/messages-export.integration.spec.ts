import { randomUUID } from 'crypto';

import { DataType, newDb } from 'pg-mem';
import { DataSource, Repository } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

import { MessageRole, MessageType, SessionMode, SessionStatus, WorkflowStatus } from '../../database/enums';
import { Session } from '../sessions/entities/session.entity';
import { Workflow } from '../workflows/entities/workflow.entity';
import { Message } from './entities';
import { MessagesService } from './services/messages.service';

describe('MessagesService PDF export integration', () => {
  let dataSource: DataSource;
  let messageRepository: Repository<Message>;
  let sessionRepository: Repository<Session>;
  let workflowRepository: Repository<Workflow>;

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
      entities: [Message, Session, Workflow],
      namingStrategy: new SnakeNamingStrategy(),
      synchronize: true,
    });
    await dataSource.initialize();

    messageRepository = dataSource.getRepository(Message);
    sessionRepository = dataSource.getRepository(Session);
    workflowRepository = dataSource.getRepository(Workflow);
  });

  beforeEach(async () => {
    await messageRepository.clear();
    await sessionRepository.clear();
    await workflowRepository.clear();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('includes all session messages in chronological order inside the exported PDF', async () => {
    const workflow = await workflowRepository.save(
      workflowRepository.create({
        id: '22222222-2222-4222-8222-222222222222',
        title: 'Invoice workflow',
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
        mode: SessionMode.INTERACTIVE,
        status: SessionStatus.CREATED,
        confidenceScore: 0,
        finalizedAt: null,
        archivedAt: null,
      }),
    );

    await messageRepository.save([
      messageRepository.create({
        id: '44444444-4444-4444-8444-444444444441',
        sessionId: session.id,
        role: MessageRole.USER,
        type: MessageType.USER_INPUT,
        content: 'First user message',
        metadata: {},
        createdAt: new Date('2026-01-01T09:00:00.000Z'),
        archivedAt: null,
      }),
      messageRepository.create({
        id: '44444444-4444-4444-8444-444444444442',
        sessionId: session.id,
        role: MessageRole.AI,
        type: MessageType.AI_QUESTION,
        content: 'Second AI question',
        metadata: {},
        createdAt: new Date('2026-01-01T09:01:00.000Z'),
        archivedAt: null,
      }),
      messageRepository.create({
        id: '44444444-4444-4444-8444-444444444443',
        sessionId: session.id,
        role: MessageRole.AI,
        type: MessageType.AI_RESPONSE,
        content: 'Third AI response',
        metadata: {},
        createdAt: new Date('2026-01-01T09:02:00.000Z'),
        archivedAt: null,
      }),
    ]);

    const service = new MessagesService(messageRepository, sessionRepository);
    const pdfBuffer = await service.exportSessionTranscriptPdf(session.id, currentUser);
    const pdfText = pdfBuffer.toString('latin1');
    const firstMessageHex = Buffer.from('First user message', 'utf8').toString('hex');
    const secondMessageHex = Buffer.from('Second AI question', 'utf8').toString('hex');
    const thirdMessageHex = Buffer.from('Third AI response', 'utf8').toString('hex');

    expect(pdfBuffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
    expect(pdfText).toContain(firstMessageHex);
    expect(pdfText).toContain(secondMessageHex);
    expect(pdfText).toContain(thirdMessageHex);
    expect(pdfText.indexOf(firstMessageHex)).toBeLessThan(pdfText.indexOf(secondMessageHex));
    expect(pdfText.indexOf(secondMessageHex)).toBeLessThan(pdfText.indexOf(thirdMessageHex));
  });
});
