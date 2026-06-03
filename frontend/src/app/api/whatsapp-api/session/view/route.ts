import { NextResponse } from 'next/server';

/** Legacy visual-session route intentionally retired: WhatsApp uses official Meta Cloud API only. */
export async function GET() {
  return NextResponse.json(
    {
      success: false,
      provider: 'meta-cloud',
      notSupported: true,
      message: 'Sessão visual não existe no modo Meta Cloud oficial.',
    },
    { status: 410 },
  );
}
