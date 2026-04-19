import { createLegacyWhatsAppGoneResponse } from '../../legacy-runtime';

export async function POST() {
  return createLegacyWhatsAppGoneResponse('viewer_action');
}
