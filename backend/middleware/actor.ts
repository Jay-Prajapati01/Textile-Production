import { AuthenticatedRequest } from './auth';

export interface Actor {
  role: 'admin' | 'factory_owner';
  email: string;
  name: string;
}

export const getActor = (req: AuthenticatedRequest): Actor => ({
  role: req.actor!.role,
  email: req.actor!.email,
  name: req.actor!.name,
});
