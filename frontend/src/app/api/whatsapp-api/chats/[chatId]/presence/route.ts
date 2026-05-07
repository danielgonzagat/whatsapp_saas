import { type NextRequest, NextResponse } from 'next/server';
import { proxyWhatsAppRequest } from '../../../proxy';

/** Post. */
export async function POST(request: NextRequest, context: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await context.params;
    const upstreamPath = `/whatsapp-api/chats/${encodeURIComponent(chatId)}/presence`;
    const result = await proxyWhatsAppRequest(request, 'POST', upstreamPath);
    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    console.error('[WhatsApp Proxy] set presence error:', error);
    return NextResponse.json(
      { message: 'Falha ao definir presença no WhatsApp.' },
      { status: 502 },
    );
  }
}
