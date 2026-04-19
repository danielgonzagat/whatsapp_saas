import { type NextRequest } from 'next/server';
import { proxyPublicBackendRequest } from '../../../_lib/public-backend-proxy';

export async function POST(request: NextRequest) {
  return proxyPublicBackendRequest(request, {
    path: '/auth/google/risc-events',
    method: 'POST',
    bodyMode: 'text',
    forwardHeaders: ['content-type', 'x-forwarded-for'],
    errorMessage: 'Falha ao encaminhar evento de segurança do Google.',
  });
}
