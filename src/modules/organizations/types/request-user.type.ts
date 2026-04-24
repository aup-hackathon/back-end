import { UserRole } from '../../../database/enums';

export type RequestUser = {
  id: string;
  orgId: string;
  role: UserRole | string;
};
