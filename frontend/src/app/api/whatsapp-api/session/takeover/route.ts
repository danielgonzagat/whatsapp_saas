import { NextResponse } from 'next/server';

/** Legacy session-control route intentionally retired: WhatsApp uses official Meta Cloud API only. */
export async function POST() {
  return NextResponse.json(
    {
      success: false,
      provider: 'meta-cloud',
      notSupported: true,
      message: 'Controle de sessão legado não existe no modo Meta Cloud oficial.',
    },
    { status: 410 },
  );
}
