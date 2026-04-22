import { createHmac } from 'node:crypto';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator';
import { RawBodyRequest } from '../common/interfaces/authenticated-request.interface';
import { safeCompareStrings } from '../common/utils/crypto-compare.util';

type TikTokWebhookPayload = Record<string, unknown> | Array<unknown> | string | number | null;

interface ParsedTikTokSignature {
  timestamp: string;
  signature: string;
  encoding: 'hex' | 'base64';
}

function parseTikTokSignatureHeader(value: string | undefined): ParsedTikTokSignature | null {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }

  const pairs = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [key, ...rest] = part.split('=');
      return [
        String(key || '')
          .trim()
          .toLowerCase(),
        rest.join('=').trim(),
      ] as const;
    });

  const entries = new Map(pairs);
  const timestamp = entries.get('t') || '';
  const signature = (entries.get('s') || '').replace(/^"|"$/g, '').trim();

  if (!/^\d{1,20}$/.test(timestamp)) {
    return null;
  }

  if (/^[a-fA-F0-9]{64}$/.test(signature)) {
    return {
      timestamp,
      signature: signature.toLowerCase(),
      encoding: 'hex',
    };
  }

  if (/^[A-Za-z0-9+/_=-]{43,128}$/.test(signature)) {
    return {
      timestamp,
      signature,
      encoding: 'base64',
    };
  }

  return null;
}

function stringifyRawBody(req: RawBodyRequest | undefined, body: TikTokWebhookPayload): string {
  if (Buffer.isBuffer(req?.rawBody)) {
    return req.rawBody.toString('utf8');
  }

  if (typeof body === 'string') {
    return body;
  }

  if (typeof body === 'undefined') {
    return '';
  }

  return JSON.stringify(body);
}

function describeEvent(body: TikTokWebhookPayload): string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'unknown';
  }

  const event =
    (typeof body.event === 'string' && body.event) ||
    (typeof body.type === 'string' && body.type) ||
    (typeof body.challenge === 'string' && body.challenge) ||
    'unknown';

  return event.trim() || 'unknown';
}

/**
 * TikTok webhook callback used by the Developer Portal "Test" button and
 * future signed event deliveries. The test request may not carry a signature,
 * so we accept unsigned probes with HTTP 200 while still validating
 * `TikTok-Signature` whenever TikTok sends one.
 */
@Controller('webhooks/tiktok')
export class TikTokWebhookController {
  private readonly logger = new Logger(TikTokWebhookController.name);

  /** Simple health probe for manual verification in a browser/curl. */
  @Public()
  @Get()
  getStatus() {
    return {
      ok: true,
      provider: 'tiktok',
      callbackUrl: '/webhooks/tiktok',
      accepts: 'POST',
    };
  }

  /** Receive TikTok webhook events and acknowledge the callback test. */
  @Public()
  @Post()
  @Throttle({ default: { limit: 2000, ttl: 60000 } })
  @HttpCode(200)
  handleWebhook(
    @Body() body: TikTokWebhookPayload,
    @Headers('tiktok-signature') signatureHeader?: string,
    @Req() req?: RawBodyRequest,
  ) {
    const parsedSignature = parseTikTokSignatureHeader(signatureHeader);
    const hasSignatureHeader = String(signatureHeader || '').trim().length > 0;

    if (hasSignatureHeader && !parsedSignature) {
      this.logger.warn('TikTok webhook rejected: malformed TikTok-Signature header');
      throw new ForbiddenException('Malformed TikTok webhook signature');
    }

    if (parsedSignature) {
      const clientSecret = String(process.env.TIKTOK_CLIENT_SECRET || '').trim();
      const rawBody = stringifyRawBody(req, body);

      if (!clientSecret) {
        this.logger.warn(
          'TikTok webhook signature received but TIKTOK_CLIENT_SECRET is not configured',
        );
      } else {
        const expectedDigest = createHmac('sha256', clientSecret)
          .update(`${parsedSignature.timestamp}.${rawBody}`)
          .digest();
        const expectedHex = expectedDigest.toString('hex');
        const expectedBase64 = expectedDigest.toString('base64');
        const expectedBase64Url = expectedDigest.toString('base64url');
        const signatureMatches =
          safeCompareStrings(parsedSignature.signature, expectedHex) ||
          safeCompareStrings(parsedSignature.signature, expectedBase64) ||
          safeCompareStrings(parsedSignature.signature, expectedBase64Url);

        if (!signatureMatches) {
          this.logger.warn(
            `TikTok webhook rejected: invalid signature (encoding=${parsedSignature.encoding})`,
          );
          throw new ForbiddenException('Invalid TikTok webhook signature');
        }
      }
    }

    this.logger.log(`TikTok webhook acknowledged: event=${describeEvent(body)}`);

    return { received: true };
  }
}
