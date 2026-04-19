import { type NextRequest } from 'next/server';
import { proxyPublicBackendRequest } from '../../../_lib/public-backend-proxy';

export async function GET(request: NextRequest) {
  return proxyPublicBackendRequest(request, {
    path: '/chat/guest/health',
    method: 'GET',
    forwardHeaders: ['x-forwarded-for'],
    errorMessage: 'Falha ao consultar a saúde do alias guest do chat público.',
  });
}
