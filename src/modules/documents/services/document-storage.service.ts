import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';

import { DOCUMENT_PRESIGNED_URL_TTL_SECONDS } from '../utils/document.constants';
import {
  buildMinioStorageUrl,
  extractObjectKeyFromStorageUrl,
} from '../utils/document-storage.util';

interface StoreDocumentParams {
  objectKey: string;
  contentType: string;
  buffer: Buffer;
}

@Injectable()
export class DocumentStorageService {
  private readonly client: Client;
  private readonly bucketName: string;
  private bucketReadyPromise?: Promise<void>;

  constructor(private readonly configService: ConfigService) {
    this.bucketName = this.configService.getOrThrow<string>('minio.bucketDocuments');
    this.client = new Client({
      endPoint: this.configService.getOrThrow<string>('minio.endpoint'),
      port: this.configService.getOrThrow<number>('minio.port'),
      useSSL: this.configService.getOrThrow<boolean>('minio.useSsl'),
      accessKey: this.configService.getOrThrow<string>('minio.accessKey'),
      secretKey: this.configService.getOrThrow<string>('minio.secretKey'),
    });
  }

  async storeDocument(params: StoreDocumentParams): Promise<{ storageUrl: string; presignedUrl: string }> {
    await this.ensureBucketReady();

    await this.client.putObject(this.bucketName, params.objectKey, params.buffer, params.buffer.length, {
      'Content-Type': params.contentType,
    });

    return {
      storageUrl: buildMinioStorageUrl(this.bucketName, params.objectKey),
      presignedUrl: await this.client.presignedGetObject(
        this.bucketName,
        params.objectKey,
        DOCUMENT_PRESIGNED_URL_TTL_SECONDS,
      ),
    };
  }

  async createPresignedUrl(storageUrl: string): Promise<string> {
    await this.ensureBucketReady();
    const objectKey = extractObjectKeyFromStorageUrl(storageUrl, this.bucketName);

    return this.client.presignedGetObject(
      this.bucketName,
      objectKey,
      DOCUMENT_PRESIGNED_URL_TTL_SECONDS,
    );
  }

  private async ensureBucketReady(): Promise<void> {
    if (!this.bucketReadyPromise) {
      this.bucketReadyPromise = this.createBucketIfNeeded();
    }

    await this.bucketReadyPromise;
  }

  private async createBucketIfNeeded(): Promise<void> {
    const bucketExists = await this.client.bucketExists(this.bucketName);
    if (!bucketExists) {
      await this.client.makeBucket(this.bucketName);
    }

    const encryptionConfig = {
      Rule: [
        {
          ApplyServerSideEncryptionByDefault: {
            SSEAlgorithm: 'AES256',
          },
        },
      ],
    };

    await this.client.setBucketEncryption(this.bucketName, encryptionConfig);
  }
}
