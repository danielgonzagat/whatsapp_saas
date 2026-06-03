import { NextResponse } from 'next/server';

/** Legacy session-code route intentionally retired: WhatsApp uses official Meta Cloud API only. */
export async function GET() {
  return NextResponse.json(
    {
      success: false,
      provider: 'meta-cloud',
      notSupported: true,
      message: 'WhatsApp agora conecta somente pela API oficial da Meta.',
      use: '/meta/auth/url?channel=whatsapp&returnTo=/whatsapp',
    },
    { status: 410 },
  );
}
