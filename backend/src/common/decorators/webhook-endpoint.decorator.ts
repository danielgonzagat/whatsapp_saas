import { SetMetadata } from '@nestjs/common';

const WEBHOOK_ENDPOINT_KEY = 'kloel:webhook-endpoint';

export const WebhookEndpoint = (reason: string) => SetMetadata(WEBHOOK_ENDPOINT_KEY, reason);
