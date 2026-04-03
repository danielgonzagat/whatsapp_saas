import { NextRequest, NextResponse } from 'next/server';
import { apiUrl } from '@/lib/http';

function buildWebhookUrl(request: NextRequest) {
  const target = apiUrl(
    request.headers.get('x-signature')
      ? '/checkout/webhooks/mercado-pago'
      : '/checkout/webhooks/mercado-pago/ipn',
  );
  if (!target) {
    return null;
  }

  const url = new URL(target);
  url.search = request.nextUrl.search;
  return url;
}

async function proxyIpn(request: NextRequest) {
  const targetUrl = buildWebhookUrl(request);
  if (!targetUrl) {
    return NextResponse.json(
      { message: 'Backend URL do webhook do Mercado Pago não está configurada.' },
      { status: 500 },
    );
  }

  const body = request.method === 'POST' ? await request.text() : undefined;
  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers: {
      Accept: 'application/json',
      ...(request.headers.get('content-type')
        ? { 'Content-Type': request.headers.get('content-type') as string }
        : {}),
      ...(request.headers.get('x-signature')
        ? { 'x-signature': request.headers.get('x-signature') as string }
        : {}),
      ...(request.headers.get('x-request-id')
        ? { 'x-request-id': request.headers.get('x-request-id') as string }
        : {}),
      ...(request.headers.get('user-agent')
        ? { 'user-agent': request.headers.get('user-agent') as string }
        : {}),
    },
    body,
    cache: 'no-store',
  });

  const responseText = await upstream.text();
  return new NextResponse(responseText || JSON.stringify({ received: true }), {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') || 'application/json',
    },
  });
}

export async function POST(request: NextRequest) {
  return proxyIpn(request);
}

export async function GET(request: NextRequest) {
  return proxyIpn(request);
}
