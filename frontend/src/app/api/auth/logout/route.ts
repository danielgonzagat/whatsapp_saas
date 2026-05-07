// PULSE:OK — server-side proxy route, client callers invoke mutate('auth') after receiving this response
import { type NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '../../_lib/backend-url';
import { clearSharedAuthCookies } from '../_lib/shared-auth-cookies';

/** Post. */
export async function POST(request: NextRequest) {
  const res = NextResponse.json({ success: true });
  clearSharedAuthCookies(request, res);

  // Best-effort: notify backend to revoke refresh tokens
  const backendUrl = getBackendUrl();
  if (backendUrl) {
    try {
      const authorization = request.headers.get('authorization');
      const workspaceHeader = request.headers.get('x-workspace-id');
      await fetch(`${backendUrl}/auth/logout`, {
        method: 'POST',
        headers: {
          ...(authorization ? { authorization } : {}),
          ...(workspaceHeader ? { 'x-workspace-id': workspaceHeader } : {}),
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // ignore backend logout failures — tokens are already cleared client-side
    }
  }

  return res;
}
