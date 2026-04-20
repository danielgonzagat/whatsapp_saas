import { type NextRequest, NextResponse } from 'next/server';
import { proxyWhatsAppRequest } from '../../proxy';

/** Post. */
export async function POST(request: NextRequest) {
  try {
    const result = await proxyWhatsAppRequest(request, 'POST', '/whatsapp-api/session/start');
    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    console.error('[WhatsApp Proxy] start session error:', error);
    const status =
      typeof (error as { status?: number })?.status === 'number'
        ? (error as { status: number }).status
        : 502;
    return NextResponse.json(
      {
        message:
          status === 401
            ? 'Sua sessão expirou. Faça login novamente para iniciar o WhatsApp.'
            : 'Falha ao iniciar sessão do WhatsApp.',
      },
      { status },
    );
  }
}
