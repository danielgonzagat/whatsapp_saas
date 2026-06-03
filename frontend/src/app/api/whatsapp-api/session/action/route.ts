import { NextResponse } from 'next/server';

/** Legacy visual-session action route intentionally retired: WhatsApp uses official Meta Cloud API only. */
export async function POST() {
  return NextResponse.json(
    {
      success: false,
      provider: 'meta-cloud',
      notSupported: true,
      message: 'Ações de sessão visual não existem no modo Meta Cloud oficial.',
    },
    { status: 410 },
  );
}
