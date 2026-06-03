import { SetMetadata } from '@nestjs/common';

const INTERNAL_ENDPOINT_KEY = 'kloel:internal-endpoint';

export const InternalEndpoint = (reason: string) => SetMetadata(INTERNAL_ENDPOINT_KEY, reason);
