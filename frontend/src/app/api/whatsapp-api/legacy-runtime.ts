import { NextResponse } from 'next/server';

export function createLegacyWhatsAppGoneResponse(feature: string) {
  return NextResponse.json(
    {
      statusCode: 410,
      success: false,
      provider: 'meta-cloud',
      feature,
      notSupported: true,
      reason: `${feature}_not_supported_for_meta_cloud`,
      message: 'Descontinuado. Use a integração Meta.',
    },
    { status: 410 },
  );
}
