import { SetMetadata } from '@nestjs/common';

/** Allow_pending_mfa_key. */
export const ALLOW_PENDING_MFA_KEY = 'adminAllowPendingMfa';

/**
 * Marks a route as accessible using a short-lived setup/change token even
 * though the admin has not yet completed MFA setup or password change.
 *
 * Used on `/admin/auth/mfa/setup`, `/admin/auth/mfa/verify-initial`,
 * `/admin/auth/change-password`, etc. AdminAuthGuard relaxes the MFA check
 * for routes bearing this metadata, as long as the short-lived token is
 * valid.
 */
export const AllowPendingMfa = () => SetMetadata(ALLOW_PENDING_MFA_KEY, true);
