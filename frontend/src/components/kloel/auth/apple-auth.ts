type BuildAppleAuthorizationUrlParams = {
  clientId: string;
  origin: string;
  nextPath: string;
};

export function buildAppleAuthorizationUrl({
  clientId,
  origin,
  nextPath,
}: BuildAppleAuthorizationUrlParams) {
  const appleAuthUrl = new URL('https://appleid.apple.com/auth/authorize');
  appleAuthUrl.searchParams.set('client_id', clientId);
  appleAuthUrl.searchParams.set('redirect_uri', `${origin}/api/auth/callback/apple`);
  appleAuthUrl.searchParams.set('response_type', 'code id_token');
  appleAuthUrl.searchParams.set('scope', 'name email');
  appleAuthUrl.searchParams.set('response_mode', 'form_post');
  appleAuthUrl.searchParams.set('state', nextPath);
  return appleAuthUrl;
}
