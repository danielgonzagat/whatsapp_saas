import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

/** Runtime. */
export const runtime = 'nodejs';

interface ParsedTikTokSignature {
  timestamp: string;
  signature: string;
}

function safeCompareStrings(a: string, b: string): boolean {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

function parseTikTokSignatureHeader(value: string | null): ParsedTikTokSignature | null {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }

  const entries = new Map(
    raw
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
      }),
  );

  const timestamp = entries.get('t') || '';
  const signature = String(entries.get('s') || '')
    .replace(/^"|"$/g, '')
    .trim();

  if (!/^\d{1,20}$/.test(timestamp) || signature.length < 16 || signature.length > 256) {
    return null;
  }

  return { timestamp, signature };
}

function matchesTikTokSignature(
  signature: string,
  timestamp: string,
  rawBody: string,
  secret: string,
) {
  const digest = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest();

  const expectedHex = digest.toString('hex');
  const expectedBase64 = digest.toString('base64');
  const expectedBase64NoPadding = expectedBase64.replace(/=+$/g, '');
  const expectedBase64Url = digest.toString('base64url');
  const normalizedProvided = signature.replace(/\s+/g, '+');

  return (
    safeCompareStrings(signature, expectedHex) ||
    safeCompareStrings(signature, expectedBase64) ||
    safeCompareStrings(signature, expectedBase64NoPadding) ||
    safeCompareStrings(signature, expectedBase64Url) ||
    safeCompareStrings(normalizedProvided, expectedBase64) ||
    safeCompareStrings(normalizedProvided, expectedBase64NoPadding)
  );
}

/** Get. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    provider: 'tiktok',
    callbackUrl: '/api/webhooks/tiktok',
    accepts: ['GET', 'HEAD', 'OPTIONS', 'POST'],
  });
}

/** Head. */
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}

/** Options. */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

/** Post. */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get('tiktok-signature');
  const parsedSignature = parseTikTokSignatureHeader(signatureHeader);
  const clientSecret = String(process.env.TIKTOK_CLIENT_SECRET || '').trim();

  if (signatureHeader && !parsedSignature) {
    return NextResponse.json(
      {
        message: 'Malformed TikTok webhook signature',
      },
      { status: 403 },
    );
  }

  if (parsedSignature && clientSecret) {
    const isValid = matchesTikTokSignature(
      parsedSignature.signature,
      parsedSignature.timestamp,
      rawBody,
      clientSecret,
    );

    if (!isValid) {
      return NextResponse.json(
        {
          message: 'Invalid TikTok webhook signature',
        },
        { status: 403 },
      );
    }
  }

  return NextResponse.json({ received: true });
}
