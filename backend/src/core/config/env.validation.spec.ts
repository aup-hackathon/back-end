import { envSchema } from './env.validation';

const validEnv = {
  NODE_ENV: 'test',
  PORT: 3000,
  DATABASE_URL: 'postgres://app:secret@localhost:5432/appdb',
  NATS_URL: 'nats://localhost:4222',
  NATS_STREAM_NAME: 'FLOWFORGE',
  JWT_ACCESS_SECRET: 'access-secret-with-at-least-32-chars',
  JWT_REFRESH_SECRET: 'refresh-secret-with-at-least-32-chars',
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL: '7d',
  MINIO_ENDPOINT: 'localhost',
  MINIO_PORT: 9000,
  MINIO_USE_SSL: false,
  MINIO_ACCESS_KEY: 'minio',
  MINIO_SECRET_KEY: 'minio-secret',
  MINIO_BUCKET_DOCUMENTS: 'documents',
  MINIO_BUCKET_EXPORTS: 'exports',
  OLLAMA_URL: 'http://localhost:11434',
  FASTAPI_HEALTH_URL: 'http://localhost:8000/health',
  FASTAPI_INTERNAL_URL: 'http://localhost:8000/internal',
  ELSA_HEALTH_URL: 'http://localhost:5000/health',
  CORS_ORIGIN: 'http://localhost:3001',
};

describe('envSchema', () => {
  it('rejects missing JWT access secret', () => {
    const env = { ...validEnv };
    delete env.JWT_ACCESS_SECRET;

    const result = envSchema.validate(env, { abortEarly: false });

    expect(result.error?.message).toContain('JWT_ACCESS_SECRET');
  });

  it('accepts a complete BE-22 environment', () => {
    const result = envSchema.validate(validEnv, { abortEarly: false });

    expect(result.error).toBeUndefined();
    expect(result.value.NATS_STREAM_NAME).toBe('FLOWFORGE');
  });
});
