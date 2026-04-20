import { SetMetadata } from '@nestjs/common';

/** Kyc_required_key. */
export const KYC_REQUIRED_KEY = 'kycRequired';
/** Kyc required. */
export const KycRequired = () => SetMetadata(KYC_REQUIRED_KEY, true);
