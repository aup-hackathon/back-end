import {
  decodeMessageCursor,
  encodeMessageCursor,
  getMessagePageWindow,
} from './message-pagination.util';

describe('message-pagination.util', () => {
  it('returns the first page and a next cursor when more rows exist', () => {
    const rows = [
      {
        id: '1',
        createdAt: new Date('2026-01-01T10:00:00.000Z'),
      },
      {
        id: '2',
        createdAt: new Date('2026-01-01T10:01:00.000Z'),
      },
      {
        id: '3',
        createdAt: new Date('2026-01-01T10:02:00.000Z'),
      },
    ];

    const result = getMessagePageWindow(rows, 2);

    expect(result.items).toEqual(rows.slice(0, 2));
    expect(result.nextCursor).toBeTruthy();
    expect(decodeMessageCursor(result.nextCursor!)).toEqual({
      createdAt: rows[1].createdAt,
      id: rows[1].id,
    });
  });

  it('returns no next cursor on the last page', () => {
    const rows = [
      {
        id: '1',
        createdAt: new Date('2026-01-01T10:00:00.000Z'),
      },
      {
        id: '2',
        createdAt: new Date('2026-01-01T10:01:00.000Z'),
      },
    ];

    const result = getMessagePageWindow(rows, 2);

    expect(result.items).toEqual(rows);
    expect(result.nextCursor).toBeNull();
  });

  it('returns an empty page when there are no rows', () => {
    const result = getMessagePageWindow([], 2);

    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  it('round-trips opaque cursor tokens', () => {
    const cursor = {
      createdAt: new Date('2026-01-01T10:00:00.000Z'),
      id: 'message-1',
    };

    expect(decodeMessageCursor(encodeMessageCursor(cursor))).toEqual(cursor);
  });
});
