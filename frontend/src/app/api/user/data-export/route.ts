import { type NextRequest } from 'next/server';
import { proxyPublicBackendRequest } from '../../_lib/public-backend-proxy';

export async function GET(request: NextRequest) {
  return proxyPublicBackendRequest(request, {
    path: '/user/data-export',
    method: 'GET',
    forwardHeaders: ['authorization', 'cookie', 'x-forwarded-for'],
    errorMessage: 'Falha ao exportar os dados da conta.',
  });
}
