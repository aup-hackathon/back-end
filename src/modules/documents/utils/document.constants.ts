export const MAX_DOCUMENT_FILE_SIZE_BYTES = 50 * 1024 * 1024;
export const MAX_SESSION_DOCUMENT_TOTAL_SIZE_BYTES = 200 * 1024 * 1024;
export const DOCUMENT_PRESIGNED_URL_TTL_SECONDS = 60 * 15;

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'text/plain',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
  'image/webp',
  'audio/mpeg',
  'audio/wav',
  'audio/x-m4a',
  'text/markdown',
] as const;

export type AllowedDocumentMimeType = (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number];

export const ALLOWED_DOCUMENT_EXTENSIONS: Record<string, AllowedDocumentMimeType> = {
  '.txt': 'text/plain',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/x-m4a',
  '.md': 'text/markdown',
};

export const MAGIC_MIME_EQUIVALENTS: Record<AllowedDocumentMimeType, string[]> = {
  'text/plain': [],
  'application/pdf': ['application/pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['application/zip'],
  'image/png': ['image/png'],
  'image/jpeg': ['image/jpeg'],
  'image/webp': ['image/webp'],
  'audio/mpeg': ['audio/mpeg'],
  'audio/wav': ['audio/wav', 'audio/vnd.wave', 'audio/x-wav'],
  'audio/x-m4a': ['audio/x-m4a', 'audio/mp4', 'video/mp4'],
  'text/markdown': [],
};
