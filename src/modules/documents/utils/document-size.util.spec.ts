import {
  assertDocumentFileSizeWithinLimit,
  assertSessionDocumentSizeWithinLimit,
} from './document-size.util';

describe('document-size.util', () => {
  it('accepts files up to 50 MB', () => {
    expect(() => assertDocumentFileSizeWithinLimit(50 * 1024 * 1024)).not.toThrow();
  });

  it('rejects files larger than 50 MB', () => {
    expect(() => assertDocumentFileSizeWithinLimit(50 * 1024 * 1024 + 1)).toThrow(
      'Uploaded file exceeds the 50 MB limit',
    );
  });

  it('accepts sessions up to 200 MB total', () => {
    expect(() =>
      assertSessionDocumentSizeWithinLimit(150 * 1024 * 1024, 50 * 1024 * 1024),
    ).not.toThrow();
  });

  it('rejects sessions above 200 MB total', () => {
    expect(() =>
      assertSessionDocumentSizeWithinLimit(180 * 1024 * 1024, 30 * 1024 * 1024),
    ).toThrow('Uploading this file would exceed the 200 MB document limit for the session.');
  });
});
