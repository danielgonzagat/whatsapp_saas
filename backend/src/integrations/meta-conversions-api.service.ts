import { Injectable, Logger, Optional } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { decryptMetaToken } from './meta-token-crypto';
import { getTraceHeaders } from '../common/trace-headers';
import { OpsAlertService } from '../observability/ops-alert.service';

interface CapiUserData {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  clientIpAddress?: string;
  clientUserAgent?: string;
  fbc?: string;
  fbp?: string;
}

interface CapiCustomData {
  value?: number;
  currency?: string;
  contentName?: string;
  contentCategory?: string;
  contentIds?: string[];
  contentType?: string;
  orderId?: string;
  predictedLtv?: number;
  numItems?: number;
  searchString?: string;
  status?: string;
}

interface CapiEventData {
  eventName: string;
  eventTime?: number;
  eventSourceUrl?: string;
  actionSource?: string;
  eventId?: string;
  userData: CapiUserData;
  customData?: CapiCustomData;
  dataProcessingOptions?: string[];
}

interface CapiPayload {
  data: Array<{
    event_name: string;
    event_time: number;
    event_source_url?: string;
    action_source: string;
    event_id?: string;
    user_data: Record<string, string>;
    custom_data?: Record<string, unknown>;
    data_processing_options?: string[];
  }>;
  test_event_code?: string;
}

interface CapiResponse {
  events_received?: number;
  error?: { message?: string; code?: number };
  [key: string]: unknown;
}

function hashPii(value: string | undefined | null): string {
  if (!value) {
    return '';
  }
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) {
    return '';
  }
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function buildUserDataPayload(userData: CapiUserData): Record<string, string> {
  const payload: Record<string, string> = {};

  const emailHash = hashPii(userData.email);
  if (emailHash) {
    payload.em = emailHash;
  }

  const phoneHash = hashPii(userData.phone);
  if (phoneHash) {
    payload.ph = phoneHash;
  }

  const firstNameHash = hashPii(userData.firstName);
  if (firstNameHash) {
    payload.fn = firstNameHash;
  }

  const lastNameHash = hashPii(userData.lastName);
  if (lastNameHash) {
    payload.ln = lastNameHash;
  }

  if (userData.city) {
    payload.ct = hashPii(userData.city);
  }
  if (userData.state) {
    payload.st = hashPii(userData.state);
  }
  if (userData.zip) {
    payload.zp = hashPii(userData.zip);
  }
  if (userData.country) {
    payload.country = hashPii(userData.country);
  }
  if (userData.clientIpAddress) {
    payload.client_ip_address = userData.clientIpAddress;
  }
  if (userData.clientUserAgent) {
    payload.client_user_agent = userData.clientUserAgent;
  }
  if (userData.fbc) {
    payload.fbc = userData.fbc;
  }
  if (userData.fbp) {
    payload.fbp = userData.fbp;
  }

  return payload;
}

@Injectable()
export class MetaConversionsApiService {
  private readonly logger = new Logger(MetaConversionsApiService.name);
  private readonly apiVersion = process.env.META_GRAPH_API_VERSION || 'v21.0';

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  async sendEvent(
    workspaceId: string,
    pixelId: string,
    event: CapiEventData,
  ): Promise<{ success: boolean; eventId?: string; error?: string }> {
    const connection = await this.prisma.metaConnection.findUnique({
      where: { workspaceId },
      select: { accessToken: true },
    });

    if (!connection?.accessToken) {
      return { success: false, error: 'no_meta_connection' };
    }

    const accessToken = decryptMetaToken(connection.accessToken) || connection.accessToken;

    const eventId = event.eventId || crypto.randomUUID();
    const eventTime = event.eventTime || Math.floor(Date.now() / 1000);

    const userData = buildUserDataPayload(event.userData);

    const eventItem: CapiPayload['data'][number] = {
      event_name: event.eventName,
      event_time: eventTime,
      action_source: event.actionSource || 'website',
      event_id: eventId,
      user_data: userData,
    };

    if (event.eventSourceUrl) {
      eventItem.event_source_url = event.eventSourceUrl;
    }

    if (event.dataProcessingOptions && event.dataProcessingOptions.length > 0) {
      eventItem.data_processing_options = event.dataProcessingOptions;
    }

    if (event.customData) {
      eventItem.custom_data = {
        value: event.customData.value,
        currency: event.customData.currency,
        content_name: event.customData.contentName,
        content_category: event.customData.contentCategory,
        content_ids: event.customData.contentIds,
        content_type: event.customData.contentType,
        order_id: event.customData.orderId,
        predicted_ltv: event.customData.predictedLtv,
        num_items: event.customData.numItems,
        search_string: event.customData.searchString,
        status: event.customData.status,
      };
    }

    const payload: CapiPayload = {
      data: [eventItem],
    };

    const isProduction = process.env.NODE_ENV === 'production' && !process.env.META_TEST_EVENT_CODE;
    if (!isProduction) {
      payload.test_event_code = process.env.META_TEST_EVENT_CODE || 'TEST12345';
    }

    const url = `https://graph.facebook.com/${this.apiVersion}/${pixelId}/events`;

    this.logger.log(`CAPI send event: ${event.eventName} id=${eventId} pixel=${pixelId}`);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          ...getTraceHeaders(),
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });

      const body = (await res.json()) as CapiResponse;

      const errorObj = body.error;
      if (!res.ok || errorObj) {
        this.logger.error(
          `CAPI event failed: ${event.eventName} status=${res.status} error=${JSON.stringify(errorObj || body)}`,
        );
        void this.opsAlert?.alertOnCriticalError(
          new Error(`CAPI event failed: ${JSON.stringify(errorObj || body)}`),
          'MetaConversionsApiService.sendEvent',
        );
        return { success: false, eventId, error: String(errorObj?.message || 'http_error') };
      }

      this.logger.log(`CAPI event sent: ${event.eventName} id=${eventId}`);
      return { success: true, eventId };
    } catch (err: unknown) {
      void this.opsAlert?.alertOnCriticalError(err, 'MetaConversionsApiService.sendEvent');
      this.logger.error(
        `CAPI event error: ${event.eventName} error=${err instanceof Error ? err.message : 'unknown'}`,
      );

      if (err instanceof Error && err.message.includes('timeout')) {
        return { success: false, eventId, error: 'timeout' };
      }

      return { success: false, eventId, error: err instanceof Error ? err.message : 'unknown' };
    }
  }

  async sendBatchEvents(
    workspaceId: string,
    pixelId: string,
    events: CapiEventData[],
  ): Promise<Array<{ eventId: string; success: boolean; error?: string | undefined }>> {
    const results: Array<{ eventId: string; success: boolean; error?: string | undefined }> = [];

    for (const event of events) {
      const result = await this.sendEvent(workspaceId, pixelId, event);
      results.push({
        eventId: result.eventId || 'unknown',
        success: result.success,
        error: result.error || undefined,
      });
    }

    return results;
  }

  static hashEmail(email: string): string {
    return hashPii(email);
  }

  static hashPhone(phone: string): string {
    return hashPii(phone);
  }
}
