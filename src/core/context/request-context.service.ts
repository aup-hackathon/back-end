import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  userId?: string;
  orgId?: string;
  correlationId: string;
  role?: string;
}

@Injectable()
export class RequestContextService {
  private readonly als = new AsyncLocalStorage<RequestContext>();

  run(context: RequestContext, callback: () => void) {
    this.als.run(context, callback);
  }

  getStore(): RequestContext | undefined {
    return this.als.getStore();
  }

  getCorrelationId(): string {
    return this.getStore()?.correlationId || 'system';
  }

  getOrgId(): string | undefined {
    return this.getStore()?.orgId;
  }

  getUserId(): string | undefined {
    return this.getStore()?.userId;
  }
}
