import { SetMetadata } from '@nestjs/common';

const INTERNAL_ENDPOINT_KEY = 'pulse:internal-endpoint';

export const InternalEndpoint = (reason: string) => SetMetadata(INTERNAL_ENDPOINT_KEY, reason);
