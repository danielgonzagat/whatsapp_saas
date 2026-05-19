import { Injectable, Logger, Optional } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { decryptTikTokToken } from './tiktok-token-crypto';
import { tiktokCredentialWhere } from './tiktok-ads.helpers';
import { OpsAlertService } from '../observability/ops-alert.service';

interface TikTokUserData {
  email?: string;
  phone?: string;
  externalId?: string;
  ttclid?: string;
  ip?: string;
  userAgent?: string;
}

interface TikTokCustomData {
  value?: number;
  currency?: string;
  contentName?: string;
  contentCategory?: string;
  contentId?: string;
  contentType?: string;
  orderId?: string;
  numItems?: number;
  searchString?: string;
  status?: string;
}

interface TikTokEventData {
  eventName: string;
  eventTime?: number;
  eventSourceUrl?: string;
  eventId?: string;
  userData: TikTokUserData;
  customData?: TikTokCustomData;
}

interface TikTokTrackPayload {
  pixel_code: string;
  event: string;
  event_id?: string;
  timestamp?: string;
  context: {
    user: Record<string, string>;
    page?: {
      url?: string;
      referrer?: string;
    };
    user_agent?: string;
    ip?: string;
    ad?: {
      callback?: string;
    };
  };
  properties?: Record<string, unknown>;
}

interface TikTokTrackResponse {
  code?: number;
  message?: string;
  request_id?: string;
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

function buildUserDataPayload(userData: TikTokUserData): Record<string, string> {
  const payload: Record<string, string> = {};

  if (userData.email) {
    payload.email = hashPii(userData.email);
  }
  if (userData.phone) {
    payload.phone = hashPii(userData.phone);
  }
  if (userData.externalId) {
    payload.external_id = hashPii(userData.externalId);
  }
  if (userData.ttclid) {
    payload.ttclid = userData.ttclid;
  }

  return payload;
}

function buildPropertiesPayload(customData?: TikTokCustomData): Record<string, unknown> {
  if (!customData) {
    return {};
  }

  const properties: Record<string, unknown> = {};

  if (customData.value !== undefined) {
    properties.value = customData.value;
  }
  if (customData.currency) {
    properties.currency = customData.currency;
  }
  if (customData.contentName) {
    properties.content_name = customData.contentName;
  }
  if (customData.contentCategory) {
    properties.content_category = customData.contentCategory;
  }
  if (customData.contentId) {
    properties.content_id = customData.contentId;
  }
  if (customData.contentType) {
    properties.content_type = customData.contentType;
  }
  if (customData.orderId) {
    properties.order_id = customData.orderId;
  }
  if (customData.numItems !== undefined) {
    properties.num_items = customData.numItems;
  }
  if (customData.searchString) {
    properties.search_string = customData.searchString;
  }
  if (customData.status) {
    properties.status = customData.status;
  }

  return properties;
}

@Injectable()
export class TikTokEventsApiService {
  private readonly logger = new Logger(TikTokEventsApiService.name);
  private readonly trackUrl = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  async sendEvent(
    workspaceId: string,
    pixelCode: string,
    event: TikTokEventData,
  ): Promise<{ success: boolean; requestId?: string; error?: string }> {
    const credential = await this.prisma.integrationCredential.findUnique({
      where: tiktokCredentialWhere(workspaceId),
      select: { accessToken: true, status: true },
    });

    const encryptedToken =
      credential?.status === 'connected' && credential.accessToken ? credential.accessToken : '';
    const accessToken = decryptTikTokToken(encryptedToken) || encryptedToken;

    if (!accessToken) {
      return { success: false, error: 'tiktok_token_not_configured' };
    }

    const userData = buildUserDataPayload(event.userData);
    const properties = buildPropertiesPayload(event.customData);

    const payload: TikTokTrackPayload = {
      pixel_code: pixelCode,
      event: event.eventName,
      context: {
        user: userData,
      },
    };

    if (event.eventId) {
      payload.event_id = event.eventId;
    }
    if (event.eventTime) {
      payload.timestamp = new Date(event.eventTime).toISOString();
    }
    if (event.eventSourceUrl) {
      payload.context.page = { url: event.eventSourceUrl };
    }
    if (event.userData.userAgent) {
      payload.context.user_agent = event.userData.userAgent;
    }
    if (event.userData.ip) {
      payload.context.ip = event.userData.ip;
    }

    if (Object.keys(properties).length > 0) {
      payload.properties = properties;
    }

    try {
      const response = await fetch(this.trackUrl, {
        method: 'POST',
        headers: {
          'Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });

      const body = (await response.json()) as TikTokTrackResponse;

      if (body.code !== 0) {
        const errorMsg = `TikTok Events API error [${body.code ?? 'unknown'}]: ${body.message ?? 'unknown error'}`;
        this.logger.error(errorMsg, { workspaceId, eventName: event.eventName });

        if (this.opsAlert) {
          this.opsAlert
            .alertOnDegradation(errorMsg, 'TikTokEventsApiService.sendEvent', {
              workspaceId,
              metadata: {
                eventName: event.eventName,
                pixelCode,
                requestId: body.request_id,
              },
            })
            .catch(() => undefined);
        }

        const result: { success: boolean; requestId?: string; error?: string } = {
          success: false,
        };
        if (body.message) {
          result.error = body.message;
        }
        if (body.request_id) {
          result.requestId = body.request_id;
        }
        return result;
      }

      const result: { success: boolean; requestId?: string; error?: string } = {
        success: true,
      };
      if (body.request_id) {
        result.requestId = body.request_id;
      }
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`TikTok Events API call failed: ${errorMsg}`, {
        workspaceId,
        eventName: event.eventName,
      });
      return { success: false, error: errorMsg };
    }
  }

  async sendEvents(
    workspaceId: string,
    pixelCode: string,
    events: TikTokEventData[],
  ): Promise<{ successCount: number; failureCount: number; errors: string[] }> {
    let successCount = 0;
    let failureCount = 0;
    const errors: string[] = [];

    for (const event of events) {
      const result = await this.sendEvent(workspaceId, pixelCode, event);
      if (result.success) {
        successCount += 1;
      } else {
        failureCount += 1;
        if (result.error) {
          errors.push(result.error);
        }
      }
    }

    return { successCount, failureCount, errors };
  }
}
