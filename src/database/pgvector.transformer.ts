import { ValueTransformer } from 'typeorm';

export const pgvectorTransformer = (dimensions: number): ValueTransformer => ({
  to: (value: number[] | null): string | null => {
    if (value == null) return null;
    if (value.length !== dimensions) {
      throw new Error(`vector length ${value.length} != expected ${dimensions}`);
    }

    return `[${value.join(',')}]`;
  },
  from: (value: string | null): number[] | null => {
    if (value == null) return null;
    return value
      .replace(/^\[|\]$/g, '')
      .split(',')
      .filter(Boolean)
      .map(Number);
  },
});
