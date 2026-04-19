import { revalidateTag } from 'next/cache';
// PULSE:OK — server-side proxy route, SWR cache managed by client-side callers
// Client callers invoke mutate('auth') after receiving this response
import { type NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '../../_lib/backend-url';
import { setSharedAuthCookies } from '../_lib/shared-auth-cookies';

const W_RE = /[^\w]+/g;

interface RegisterRequestBody {
  name?: string;
  email?: string;
  password?: string;
  workspaceName?: string;
}

function deriveNameFromEmail(addr: string): string {
  const localPart = addr.split('@')[0] || 'User';
  const cleaned = localPart.replace(W_RE, ' ').trim();
  const candidate = cleaned || 'User';
  return candidate.charAt(0).toUpperCase() + candidate.slice(1);
}

function validateRegisterInput(body: RegisterRequestBody): NextResponse | null {
  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json({ message: 'Email e senha são obrigatórios' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { message: 'A senha deve ter no mínimo 8 caracteres' },
      { status: 400 },
    );
  }
  return null;
}

function resolveRegisterPayload(body: RegisterRequestBody) {
  const email = body.email || '';
  const finalName = body.name?.trim() || deriveNameFromEmail(email);
  const finalWorkspaceName = body.workspaceName?.trim() || `${finalName}'s Workspace`;
  return {
    name: finalName,
    email,
    password: body.password || '',
    workspaceName: finalWorkspaceName,
  };
}

async function callBackendRegister(
  backendUrl: string,
  request: NextRequest,
  payload: ReturnType<typeof resolveRegisterPayload>,
) {
  return fetch(`${backendUrl}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': request.headers.get('x-forwarded-for') || '',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
}

async function buildRegisterSuccessResponse(request: NextRequest, backendResponse: Response) {
  const user = await backendResponse.json();
  revalidateTag('auth', 'max');
  const res = NextResponse.json(user, { status: 201 });
  if (user.access_token) {
    setSharedAuthCookies(request, res, user);
  }
  return res;
}

async function buildRegisterErrorResponse(backendResponse: Response) {
  const error = await backendResponse.json();
  return NextResponse.json(
    { message: error.message || 'Erro ao criar conta' },
    { status: backendResponse.status },
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RegisterRequestBody;

    const backendUrl = getBackendUrl();
    if (!backendUrl) {
      console.error('[Register] BACKEND_URL e NEXT_PUBLIC_API_URL não configurados');
      return NextResponse.json(
        { message: 'Servidor não configurado corretamente. Contate o suporte.' },
        { status: 500 },
      );
    }

    const invalid = validateRegisterInput(body);
    if (invalid) return invalid;

    const payload = resolveRegisterPayload(body);
    const response = await callBackendRegister(backendUrl, request, payload);

    if (!response.ok) {
      return buildRegisterErrorResponse(response);
    }

    return buildRegisterSuccessResponse(request, response);
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json({ message: 'Erro interno do servidor' }, { status: 500 });
  }
}
