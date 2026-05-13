import { SetMetadata } from '@nestjs/common';

export const WEBHOOK_ENDPOINT_KEY = 'pulse:webhook-endpoint';

export const WebhookEndpoint = (reason: string) =>
  SetMetadata(WEBHOOK_ENDPOINT_KEY, reason);
