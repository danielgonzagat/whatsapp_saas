/**
 * Shared types and re-exports for autonomy-loop workspace management.
 */
export type { PulseWorkerWorkspace, PulseRollbackGuard } from '../autonomy-loop.types';
export {
  ISOLATED_WORKSPACE_DEPENDENCY_DIRS,
  ISOLATED_WORKSPACE_EXCLUDED_PREFIXES,
  ISOLATED_WORKSPACE_EXCLUDED_SEGMENTS,
} from '../autonomy-loop.types';

export interface PulseWorkerLeaseValidationInput {
  leaseId?: string;
  leaseStatus?: string;
  leaseExpiresAt?: string;
  ownedFiles?: string[];
  forbiddenFiles?: string[];
}
