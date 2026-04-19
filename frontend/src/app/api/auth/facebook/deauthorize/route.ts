import { type NextRequest } from 'next/server';
import { proxyPublicBackendRequest } from '../../../_lib/public-backend-proxy';

export async function POST(request: NextRequest) {
  return proxyPublicBackendRequest(request, {
    path: '/auth/facebook/deauthorize',
    method: 'POST',
    bodyMode: 'text',
    forwardHeaders: ['content-type', 'x-forwarded-for'],
    errorMessage: 'Falha ao processar callback de desautorização do Facebook.',
  });
}
