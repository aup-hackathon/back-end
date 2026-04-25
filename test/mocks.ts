import { ExecutionContext, Injectable, CanActivate, setMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

// Mock CurrentUser decorator
export const mockCurrentUser = {
  id: 'test-user-id',
  orgId: 'test-org-id',
  role: 'ADMIN',
};

// Mock AuthGuard that allows all
@Injectable()
export class MockAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    request.user = mockCurrentUser;
    return true;
  }
}

// Public decorator mock  
export const MockPublic = () => (target: any, key: string, descriptor: PropertyDescriptor) => {
  return descriptor;
};

// Roles decorator mock
export const MockRoles = (..._roles: string[]) => setMetadata('roles', _roles);