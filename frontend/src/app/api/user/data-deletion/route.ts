import { type NextRequest } from 'next/server';
import { proxyPublicBackendRequest } from '../../_lib/public-backend-proxy';

export async function DELETE(request: NextRequest) {
  return proxyPublicBackendRequest(request, {
    path: '/user/data-deletion',
    method: 'DELETE',
    forwardHeaders: ['authorization', 'cookie', 'x-forwarded-for'],
    errorMessage: 'Falha ao solicitar a exclusão da conta.',
  });
}
