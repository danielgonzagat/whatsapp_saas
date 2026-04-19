import { createLegacyWhatsAppGoneResponse } from '../../legacy-runtime';

export async function GET() {
  return createLegacyWhatsAppGoneResponse('qr_code');
}
