import { ArgumentsHost, BadRequestException } from '@nestjs/common';

import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  it('returns the standardized error envelope', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const setHeader = jest.fn();
    const logger = { warn: jest.fn(), error: jest.fn() };
    const filter = new HttpExceptionFilter(logger as any);
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status, setHeader }),
        getRequest: () => ({
          url: '/api/auth/register',
          headers: { 'x-correlation-id': 'client-correlation-id' },
        }),
      }),
    } as ArgumentsHost;

    filter.catch(new BadRequestException('email must be a valid email'), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(setHeader).toHaveBeenCalledWith('x-correlation-id', 'client-correlation-id');
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        error: 'ValidationError',
        message: 'email must be a valid email',
        correlationId: 'client-correlation-id',
        path: '/api/auth/register',
      }),
    );
    expect(json.mock.calls[0][0]).toHaveProperty('timestamp');
  });
});
