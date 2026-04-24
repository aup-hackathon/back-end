import { MessageType } from '../../../database/enums';
import { applyOptionalMessageFilters } from './message-query.util';

describe('message-query.util', () => {
  const makeQueryBuilder = () => ({
    andWhere: jest.fn().mockReturnThis(),
  });

  it('applies the type filter when requested', () => {
    const queryBuilder = makeQueryBuilder();

    applyOptionalMessageFilters(queryBuilder, {
      type: MessageType.AI_QUESTION,
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('message.type = :type', {
      type: MessageType.AI_QUESTION,
    });
  });

  it('applies a Postgres full-text search clause when search is provided', () => {
    const queryBuilder = makeQueryBuilder();

    applyOptionalMessageFilters(queryBuilder, {
      search: 'invoice approval',
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      `to_tsvector('english', coalesce(message.content, '')) @@ plainto_tsquery('english', :search)`,
      { search: 'invoice approval' },
    );
  });
});
