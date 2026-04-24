import { UnsupportedMediaTypeException } from '@nestjs/common';
import * as path from 'node:path';

import {
  ALLOWED_DOCUMENT_EXTENSIONS,
  ALLOWED_DOCUMENT_MIME_TYPES,
  AllowedDocumentMimeType,
  MAGIC_MIME_EQUIVALENTS,
} from './document.constants';

type FileTypeDetectionResult = {
  mime: string;
} | undefined;

type FileTypeDetector = (buffer: Buffer) => Promise<FileTypeDetectionResult>;

function getMimeTypeFromFilename(filename: string): AllowedDocumentMimeType | null {
  const extension = path.extname(filename).toLowerCase();
  return ALLOWED_DOCUMENT_EXTENSIONS[extension] ?? null;
}

function bufferLooksLikeUtf8Text(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));

  if (sample.includes(0)) {
    return false;
  }

  const content = sample.toString('utf8');
  if (content.includes('\ufffd')) {
    return false;
  }

  const printableBytes = [...sample].filter((byte) => {
    return byte === 0x09 || byte === 0x0a || byte === 0x0d || (byte >= 0x20 && byte <= 0x7e);
  }).length;

  return printableBytes / Math.max(sample.length, 1) >= 0.85;
}

function assertAllowedMimeType(extensionMimeType: string | null): asserts extensionMimeType is AllowedDocumentMimeType {
  if (!extensionMimeType || !ALLOWED_DOCUMENT_MIME_TYPES.includes(extensionMimeType as AllowedDocumentMimeType)) {
    throw new UnsupportedMediaTypeException('File extension is not supported.');
  }
}

export async function validateDocumentMimeType(
  filename: string,
  buffer: Buffer,
  detectFileType: FileTypeDetector = async (fileBuffer) => {
    const { fileTypeFromBuffer } = await new Function('return import("file-type")')();
    return fileTypeFromBuffer(fileBuffer);
  },
): Promise<AllowedDocumentMimeType> {
  const extensionMimeType = getMimeTypeFromFilename(filename);
  assertAllowedMimeType(extensionMimeType);

  const detectedType = await detectFileType(buffer);

  if (extensionMimeType === 'text/plain' || extensionMimeType === 'text/markdown') {
    if (detectedType && !MAGIC_MIME_EQUIVALENTS[extensionMimeType].includes(detectedType.mime)) {
      throw new UnsupportedMediaTypeException(
        `File content does not match the ${extensionMimeType} extension.`,
      );
    }

    if (!detectedType && !bufferLooksLikeUtf8Text(buffer)) {
      throw new UnsupportedMediaTypeException(
        `File content does not match the ${extensionMimeType} extension.`,
      );
    }

    return extensionMimeType;
  }

  if (!detectedType) {
    throw new UnsupportedMediaTypeException('Could not verify the uploaded file signature.');
  }

  if (!MAGIC_MIME_EQUIVALENTS[extensionMimeType].includes(detectedType.mime)) {
    throw new UnsupportedMediaTypeException(
      `File content does not match the ${extensionMimeType} extension.`,
    );
  }

  return extensionMimeType;
}
