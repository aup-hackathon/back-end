import { BadRequestException } from '@nestjs/common';

export const DEFAULT_MESSAGE_PAGE_SIZE = 50;

export type MessageCursor = {
  createdAt: Date;
  id: string;
};

type CursorPageItem = {
  createdAt: Date;
  id: string;
};

export function encodeMessageCursor(cursor: MessageCursor): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id,
    }),
  ).toString('base64url');
}

export function decodeMessageCursor(encodedCursor: string): MessageCursor {
  try {
    const decoded = Buffer.from(encodedCursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as { createdAt?: string; id?: string };

    if (!parsed.createdAt || !parsed.id) {
      throw new Error('Missing cursor fields');
    }

    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      throw new Error('Invalid cursor timestamp');
    }

    return {
      createdAt,
      id: parsed.id,
    };
  } catch {
    throw new BadRequestException('Invalid cursor token.');
  }
}

export function getMessagePageWindow<T extends CursorPageItem>(
  rows: T[],
  pageSize: number = DEFAULT_MESSAGE_PAGE_SIZE,
): { items: T[]; nextCursor: string | null } {
  if (rows.length === 0) {
    return {
      items: [],
      nextCursor: null,
    };
  }

  const hasMore = rows.length > pageSize;
  const items = hasMore ? rows.slice(0, pageSize) : rows;
  const lastItem = items.at(-1) ?? null;

  return {
    items,
    nextCursor:
      hasMore && lastItem
        ? encodeMessageCursor({
            createdAt: lastItem.createdAt,
            id: lastItem.id,
          })
        : null,
  };
}
