import { type NextRequest } from 'next/server';
import { proxyPublicBackendRequest } from '../../../_lib/public-backend-proxy';

export async function GET(request: NextRequest) {
  return proxyPublicBackendRequest(request, {
    path: '/chat/visitor/health',
    method: 'GET',
    forwardHeaders: ['x-forwarded-for'],
    errorMessage: 'Falha ao consultar a saúde do chat público.',
  });
}
