import { PayloadTooLargeException } from '@nestjs/common';

import {
  MAX_DOCUMENT_FILE_SIZE_BYTES,
  MAX_SESSION_DOCUMENT_TOTAL_SIZE_BYTES,
} from './document.constants';

export function assertDocumentFileSizeWithinLimit(fileSizeBytes: number): void {
  if (fileSizeBytes > MAX_DOCUMENT_FILE_SIZE_BYTES) {
    throw new PayloadTooLargeException(
      `Uploaded file exceeds the 50 MB limit (${fileSizeBytes} bytes received).`,
    );
  }
}

export function assertSessionDocumentSizeWithinLimit(
  currentSessionBytes: number,
  incomingFileBytes: number,
): void {
  if (currentSessionBytes + incomingFileBytes > MAX_SESSION_DOCUMENT_TOTAL_SIZE_BYTES) {
    throw new PayloadTooLargeException(
      'Uploading this file would exceed the 200 MB document limit for the session.',
    );
  }
}
