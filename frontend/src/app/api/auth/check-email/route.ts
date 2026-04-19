import { revalidateTag } from 'next/cache';
// PULSE:OK — server-side proxy route, SWR cache managed by client-side callers
// Client callers invoke mutate('auth') after receiving this response
import { type NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '../../_lib/backend-url';

async function readBackendMessage(response: Response) {
  const rawText = await response.text().catch(() => '');
  if (!rawText) {
    return 'Falha ao verificar email';
  }

  try {
    const errorJson = JSON.parse(rawText);
    if (typeof errorJson?.message === 'string' && errorJson.message.trim()) {
      return errorJson.message;
    }

    if (typeof errorJson?.error === 'string' && errorJson.error.trim()) {
      return errorJson.error;
    }
  } catch {
    // Mantem o texto bruto quando o backend nao retorna JSON.
  }

  return rawText;
}

function degradedCheckEmailResponse(message?: string) {
  return NextResponse.json(
    {
      exists: false,
      degraded: true,
      message: message || 'Verificação de email temporariamente indisponível',
    },
    { status: 200 },
  );
}

function emailRequiredErrorResponse() {
  return NextResponse.json({ exists: false }, { status: 200 });
}

function backendMisconfiguredResponse() {
  return NextResponse.json(
    { message: 'Servidor não configurado corretamente. Contate o suporte.' },
    { status: 500 },
  );
}

async function interpretCheckEmailResponse(response: Response) {
  if (response.ok) {
    const data = await response.json().catch(() => null);
    return NextResponse.json({ exists: !!data?.exists }, { status: 200 });
  }
  const errorMessage = await readBackendMessage(response);
  if (response.status >= 500) {
    return degradedCheckEmailResponse(errorMessage);
  }
  return NextResponse.json({ message: errorMessage }, { status: response.status });
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const email = url.searchParams.get('email') || '';
    if (!email) return emailRequiredErrorResponse();

    const backendUrl = getBackendUrl();
    if (!backendUrl) return backendMisconfiguredResponse();

    const response = await fetch(
      `${backendUrl}/auth/check-email?email=${encodeURIComponent(email)}`,
      { method: 'GET' },
    );
    return interpretCheckEmailResponse(response);
  } catch (error) {
    console.error('Check email (GET) error:', error);
    return degradedCheckEmailResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ message: 'Email é obrigatório' }, { status: 400 });
    }

    const backendUrl = getBackendUrl();
    if (!backendUrl) {
      return NextResponse.json(
        { message: 'Servidor não configurado corretamente. Contate o suporte.' },
        { status: 500 },
      );
    }

    // Verificar se o email existe no backend
    try {
      const response = await fetch(`${backendUrl}/auth/check-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        const data = await response.json();
        revalidateTag('auth', 'max');
        return NextResponse.json({ exists: data.exists }, { status: 200 });
      }

      const errorMessage = await readBackendMessage(response);
      if (response.status >= 500) {
        return degradedCheckEmailResponse(errorMessage);
      }

      return NextResponse.json({ message: errorMessage }, { status: response.status });
    } catch (error) {
      console.error('Backend check-email error:', error);
      return degradedCheckEmailResponse();
    }
  } catch (error) {
    console.error('Check email error:', error);
    return NextResponse.json({ message: 'Erro interno' }, { status: 500 });
  }
}
