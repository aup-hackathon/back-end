export function buildMinioStorageUrl(bucket: string, objectKey: string): string {
  return `minio://${bucket}/${objectKey}`;
}

export function extractObjectKeyFromStorageUrl(storageUrl: string, bucket: string): string {
  const prefix = `minio://${bucket}/`;
  if (!storageUrl.startsWith(prefix)) {
    throw new Error(`Storage URL "${storageUrl}" does not match MinIO bucket "${bucket}".`);
  }

  return storageUrl.slice(prefix.length);
}

export function buildSafeObjectKey(
  orgId: string,
  workflowId: string,
  sessionId: string,
  docVersion: number,
  uniqueId: string,
  originalFilename: string,
): string {
  const sanitizedFilename = originalFilename
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const fallbackFilename = sanitizedFilename || 'document';

  return `${orgId}/${workflowId}/${sessionId}/v${docVersion}-${uniqueId}-${fallbackFilename}`;
}
