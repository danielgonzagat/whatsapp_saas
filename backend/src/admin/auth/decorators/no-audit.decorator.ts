import { SetMetadata } from '@nestjs/common';

export const NO_AUDIT_KEY = 'adminNoAudit';

/**
 * Opt-out of automatic audit logging for a route. Only use when the route is
 * a high-volume read that genuinely does not need to be recorded (e.g. GET
 * /admin/audit itself, to avoid a recursive explosion).
 */
export const NoAudit = () => SetMetadata(NO_AUDIT_KEY, true);
