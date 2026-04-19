import { createLegacyWhatsAppGoneResponse } from '../../legacy-runtime';

export async function POST() {
  return createLegacyWhatsAppGoneResponse('legacy_session_link');
}
