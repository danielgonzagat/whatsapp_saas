import { type NextRequest, NextResponse } from 'next/server';
import { proxyWhatsAppRequest } from '../../../proxy';

export async function GET(request: NextRequest, context: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await context.params;
    const search = request.nextUrl.search || '';
    const upstreamPath = `/whatsapp-api/chats/${encodeURIComponent(chatId)}/messages${search}`;
    const result = await proxyWhatsAppRequest(request, 'GET', upstreamPath);
    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    console.error('[WhatsApp Proxy] chat messages error:', error);
    return NextResponse.json(
      { message: 'Falha ao carregar mensagens do WhatsApp.' },
      { status: 502 },
    );
  }
}
