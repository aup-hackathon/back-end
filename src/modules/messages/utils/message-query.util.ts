import { MessageType } from '../../../database/enums';
import { MessageCursor } from './message-pagination.util';

type QueryBuilderWithAndWhere = {
  andWhere(sql: string, parameters?: Record<string, unknown>): QueryBuilderWithAndWhere;
};

export function applyOptionalMessageFilters(
  queryBuilder: QueryBuilderWithAndWhere,
  filters: {
    type?: MessageType;
    search?: string;
    cursor?: MessageCursor;
  },
): QueryBuilderWithAndWhere {
  if (filters.type) {
    queryBuilder.andWhere('message.type = :type', { type: filters.type });
  }

  if (filters.search) {
    queryBuilder.andWhere(
      `to_tsvector('english', coalesce(message.content, '')) @@ plainto_tsquery('english', :search)`,
      { search: filters.search },
    );
  }

  if (filters.cursor) {
    queryBuilder.andWhere(
      `(
        message.created_at > :cursorCreatedAt
        OR (message.created_at = :cursorCreatedAt AND message.id > :cursorId)
      )`,
      {
        cursorCreatedAt: filters.cursor.createdAt.toISOString(),
        cursorId: filters.cursor.id,
      },
    );
  }

  return queryBuilder;
}
