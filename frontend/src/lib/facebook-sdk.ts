export type FacebookStatusResponse = {
  status?: 'connected' | 'not_authorized' | 'unknown';
  authResponse?: {
    accessToken?: string;
    userID?: string;
    expiresIn?: number;
    signedRequest?: string;
  };
  grantedScopes?: string;
};

type FacebookPermissionsResponse = {
  data?: Array<{
    permission?: string;
    status?: string;
  }>;
};

export type FacebookAuthResult = {
  accessToken: string;
  userId?: string;
};

const FACEBOOK_REQUIRED_SCOPE = 'email';
const FACEBOOK_LOGIN_SCOPE = 'public_profile,email';

function resolveSdk(): NonNullable<Window['FB']> {
  if (typeof window === 'undefined' || !window.FB) {
    throw new Error('Login com Facebook indisponível no momento.');
  }

  return window.FB;
}

function normalizeAuthResponse(response?: FacebookStatusResponse | null): FacebookAuthResult {
  const accessToken = response?.authResponse?.accessToken?.trim();
  if (!accessToken) {
    throw new Error('Login com Facebook cancelado ou não autorizado.');
  }

  return {
    accessToken,
    userId: response?.authResponse?.userID?.trim() || undefined,
  };
}

async function getLoginStatus(facebook = resolveSdk()): Promise<FacebookStatusResponse> {
  return await new Promise<FacebookStatusResponse>((resolve) => {
    facebook.getLoginStatus((response) => resolve(response));
  });
}

async function loginWithRequiredScopes(
  rerequestEmail: boolean,
  facebook = resolveSdk(),
): Promise<FacebookStatusResponse> {
  return await new Promise<FacebookStatusResponse>((resolve) => {
    facebook.login((response) => resolve(response), {
      scope: FACEBOOK_LOGIN_SCOPE,
      return_scopes: true,
      ...(rerequestEmail ? { auth_type: 'rerequest' } : {}),
    });
  });
}

async function getGrantedPermissions(facebook = resolveSdk()): Promise<Map<string, string>> {
  const payload = await new Promise<FacebookPermissionsResponse>((resolve) => {
    facebook.api('/me/permissions', (response) =>
      resolve((response || {}) as FacebookPermissionsResponse),
    );
  });

  const entries: Array<[string, string]> = [];
  for (const entry of payload.data || []) {
    const permission = String(entry.permission || '').trim();
    if (!permission) {
      continue;
    }
    entries.push([permission, String(entry.status || '').trim()]);
  }

  return new Map(entries);
}

async function hasGrantedEmailPermission(
  response?: FacebookStatusResponse | null,
  facebook = resolveSdk(),
): Promise<boolean> {
  const grantedScopes = String(response?.grantedScopes || '')
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean);
  if (grantedScopes.includes(FACEBOOK_REQUIRED_SCOPE)) {
    return true;
  }

  const permissions = await getGrantedPermissions(facebook);
  return permissions.get(FACEBOOK_REQUIRED_SCOPE) === 'granted';
}

export async function requestFacebookAccessTokenWithEmailScope(): Promise<FacebookAuthResult> {
  const facebook = resolveSdk();
  const currentStatus = await getLoginStatus(facebook);

  if (
    currentStatus.status === 'connected' &&
    currentStatus.authResponse?.accessToken?.trim() &&
    (await hasGrantedEmailPermission(currentStatus, facebook))
  ) {
    return normalizeAuthResponse(currentStatus);
  }

  const loginResponse = await loginWithRequiredScopes(
    currentStatus.status === 'connected',
    facebook,
  );
  const auth = normalizeAuthResponse(loginResponse);

  if (!(await hasGrantedEmailPermission(loginResponse, facebook))) {
    throw new Error(
      'O Facebook precisa liberar a permissão de email para continuar. Revise as permissões e tente novamente.',
    );
  }

  return auth;
}
