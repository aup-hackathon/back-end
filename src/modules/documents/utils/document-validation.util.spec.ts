import { validateDocumentMimeType } from './document-validation.util';

describe('document-validation.util', () => {
  it('accepts png files when extension and magic bytes match', async () => {
    const pngBuffer = Buffer.from(
      '89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C489',
      'hex',
    );

    await expect(
      validateDocumentMimeType('diagram.png', pngBuffer, async () => ({ mime: 'image/png' })),
    ).resolves.toBe('image/png');
  });

  it('accepts utf8 text files without binary signatures', async () => {
    await expect(
      validateDocumentMimeType('requirements.txt', Buffer.from('hello flowforge'), async () => undefined),
    ).resolves.toBe('text/plain');
  });

  it('accepts docx files when the uploaded content has a zip signature', async () => {
    const zipSignatureOnly = Buffer.from('504B0304140000000000', 'hex');

    await expect(
      validateDocumentMimeType('draft.docx', zipSignatureOnly, async () => ({
        mime: 'application/zip',
      })),
    ).resolves.toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });

  it('rejects spoofed extensions whose magic bytes do not match', async () => {
    const pngBuffer = Buffer.from(
      '89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C489',
      'hex',
    );

    await expect(
      validateDocumentMimeType('report.pdf', pngBuffer, async () => ({ mime: 'image/png' })),
    ).rejects.toThrow('File content does not match the application/pdf extension.');
  });
});
