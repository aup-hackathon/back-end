import { DocumentPreprocessSubscriberService } from './document-preprocess.subscriber.service';

describe('DocumentPreprocessSubscriberService', () => {
  const documentRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const natsClient = {
    subscribeDurable: jest.fn().mockResolvedValue(undefined),
  };

  const realtimeGateway = {
    emitToSession: jest.fn(),
  };

  const service = new DocumentPreprocessSubscriberService(
    documentRepository as never,
    natsClient as never,
    realtimeGateway as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers a durable subscriber for preprocess results', async () => {
    await service.onModuleInit();

    expect(natsClient.subscribeDurable).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'document.preprocess.result',
        durableName: 'nestjs-document-preprocess-result',
      }),
    );
  });

  it('updates the document and emits a session event when preprocessing completes', async () => {
    const document = {
      id: '11111111-1111-4111-8111-111111111111',
      sessionId: '22222222-2222-4222-8222-222222222222',
      extractedText: null,
      preprocessingConfidence: null,
      deletedAt: null,
      archivedAt: null,
    };

    documentRepository.findOne.mockResolvedValue(document);
    documentRepository.save.mockImplementation(async (value) => value);

    await service.handlePreprocessResult({
      document_id: document.id,
      extracted_text: 'Normalized OCR text',
      preprocessing_confidence: 0.91,
    });

    expect(documentRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        extractedText: 'Normalized OCR text',
        preprocessingConfidence: 0.91,
      }),
    );
    expect(realtimeGateway.emitToSession).toHaveBeenCalledWith(
      document.sessionId,
      'document.ready',
      { type: 'document.ready', document_id: document.id },
    );
  });
});
