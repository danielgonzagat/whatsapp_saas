import { SetMetadata } from '@nestjs/common';

export const KYC_REQUIRED_KEY = 'kycRequired';
export const KycRequired = () => SetMetadata(KYC_REQUIRED_KEY, true);
