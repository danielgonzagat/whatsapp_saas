import { type NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '../../_lib/backend-url';

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(`${getBackendUrl()}/user/google-profile-extended`, {
      method: 'GET',
      headers: {
        Cookie: request.headers.get('cookie') || '',
        Authorization: request.headers.get('authorization') || '',
        'X-Forwarded-For': request.headers.get('x-forwarded-for') || '',
        'X-Google-Access-Token': request.headers.get('x-google-access-token') || '',
      },
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[User Proxy] google-profile-extended error:', error);
    return NextResponse.json(
      { message: 'Falha ao carregar o perfil estendido do Google.' },
      { status: 502 },
    );
  }
}
