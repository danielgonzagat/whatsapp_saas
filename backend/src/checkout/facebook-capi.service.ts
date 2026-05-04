import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { getTraceHeaders } from '../common/trace-headers';

interface CAPIEventData {
  pixelId: string;
  accessToken: string;
  eventName: string;
  email?: string;
  phone?: string;
  amount: number;
  currency: string;
  productId?: string;
  ip?: string;
  userAgent?: string;
}

/** Facebook capi service. */
@Injectable()
export class FacebookCAPIService {
  private readonly logger = new Logger(FacebookCAPIService.name);

  private sha256(value: string): string {
    return createHash('sha256').update(value.toLowerCase().trim()).digest('hex');
  }

  /** Send event. */
  // PULSE_OK: rate-limited by CheckoutPublicController
  async sendEvent(data: CAPIEventData): Promise<void> {
    try {
      const userData: Record<string, unknown> = {};
      if (data.email) {
        userData.em = [this.sha256(data.email)];
      }
      if (data.phone) {
        userData.ph = [this.sha256(data.phone)];
      }
      if (data.ip) {
        userData.client_ip_address = data.ip;
      }
      if (data.userAgent) {
        userData.client_user_agent = data.userAgent;
      }

      const body = {
        data: [
          {
            event_name: data.eventName,
            event_time: Math.floor(Date.now() / 1000),
            action_source: 'website',
            user_data: userData,
            custom_data: {
              value: data.amount / 100, // convert cents to currency
              currency: data.currency,
              content_ids: data.productId ? [data.productId] : [],
              content_type: 'product',
            },
          },
        ],
        access_token: data.accessToken,
      };

      // Not SSRF: hardcoded Meta Graph API endpoint; pixelId from workspace config
      const response = await fetch(`https://graph.facebook.com/v18.0/${data.pixelId}/events`, {
        method: 'POST',
        headers: { ...getTraceHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const text = await response.text();
        this.logger.warn(
          `Facebook CAPI failed for pixel ${data.pixelId}: ${response.status} ${text}`,
        );
      } else {
        this.logger.log(`Facebook CAPI Purchase event sent for pixel ${data.pixelId}`);
      }
      // PULSE:OK — CAPI is a best-effort analytics side-effect; webhook processing must not fail because of it
    } catch (error: unknown) {
      this.logger.error(`Facebook CAPI error: ${String(error)}`);
      Sentry.captureException(error, {
        tags: { type: 'analytics_alert', operation: 'facebook_capi' },
        extra: {
          pixelId: data.pixelId,
          eventName: data.eventName,
          productId: data.productId,
        },
        level: 'warning',
      });
      // Never throw - webhook must not fail because of CAPI
    }
  }
}
