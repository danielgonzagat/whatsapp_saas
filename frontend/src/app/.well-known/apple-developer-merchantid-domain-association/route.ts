import { type NextRequest, NextResponse } from 'next/server';

const APPLE_PAY_ASSOCIATION_CONTENT_TYPES = [
  'application/octet-stream',
  'text/plain; charset=utf-8',
] as const;

function normalizeHost(host: string | null): string {
  return String(host || '')
    .split(':')[0]
    .trim()
    .toLowerCase();
}

function isAllowedApplePayHost(host: string) {
  return (
    host === 'pay.kloel.com' ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.localhost')
  );
}

function readAssociationFile(): string {
  return (
    process.env.APPLE_PAY_DOMAIN_ASSOCIATION?.trim() ||
    process.env.APPLE_DEVELOPER_MERCHANTID_DOMAIN_ASSOCIATION?.trim() ||
    ''
  );
}

/** Apple Pay merchant-domain verification file. */
export async function GET(request: NextRequest) {
  const host = normalizeHost(request.headers.get('host') || request.nextUrl.host);
  if (!isAllowedApplePayHost(host)) {
    return new NextResponse('not_found', { status: 404 });
  }

  const body = readAssociationFile();
  if (!body) {
    return new NextResponse('apple_pay_domain_association_not_configured', { status: 503 });
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'Content-Type': APPLE_PAY_ASSOCIATION_CONTENT_TYPES[0],
    },
  });
}
