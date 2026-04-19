import { type NextRequest } from 'next/server';
import { proxyPublicBackendRequest } from '../../_lib/public-backend-proxy';

export async function GET(request: NextRequest) {
  return proxyPublicBackendRequest(request, {
    path: '/webhooks/meta',
    method: 'GET',
    bodyMode: 'none',
    errorMessage: 'Falha ao verificar webhook da Meta.',
  });
}

export async function POST(request: NextRequest) {
  return proxyPublicBackendRequest(request, {
    path: '/webhooks/meta',
    method: 'POST',
    bodyMode: 'text',
    forwardHeaders: ['content-type', 'x-hub-signature-256', 'x-forwarded-for'],
    errorMessage: 'Falha ao encaminhar webhook da Meta.',
  });
}
