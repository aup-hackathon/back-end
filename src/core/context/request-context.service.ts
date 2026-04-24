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
  private static readonly als = new AsyncLocalStorage<RequestContext>();

  run<T>(context: RequestContext, callback: () => T): T {
    return RequestContextService.als.run(context, callback);
  }

  getStore(): RequestContext | undefined {
    return RequestContextService.als.getStore();
  }

  setContext(patch: Partial<RequestContext>): void {
    const store = this.getStore();
    if (store) Object.assign(store, patch);
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
