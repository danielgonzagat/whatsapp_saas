import { NextResponse } from 'next/server';

/** Legacy session-recreate route intentionally retired: WhatsApp uses official Meta Cloud API only. */
export async function POST() {
  return NextResponse.json(
    {
      success: false,
      provider: 'meta-cloud',
      notSupported: true,
      message: 'Recriação de sessão legada não existe no modo Meta Cloud oficial.',
    },
    { status: 410 },
  );
}
