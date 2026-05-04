import { createSign } from 'node:crypto';
import { APPLE_CLIENT_SECRET_TTL_SECONDS, APPLE_ISSUER } from '../apple-auth.support';

export function encodeAuthJson(value: Record<string, string | number>): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function buildClientSecret(input: {
  clientId: string;
  teamId: string;
  keyId: string;
  privateKey: string;
}): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: input.keyId };
  const payload = {
    iss: input.teamId,
    iat: issuedAt,
    exp: issuedAt + APPLE_CLIENT_SECRET_TTL_SECONDS,
    aud: APPLE_ISSUER,
    sub: input.clientId,
  };
  const signingInput = `${encodeAuthJson(header)}.${encodeAuthJson(payload)}`;
  const signer = createSign('SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign({
    key: input.privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  return `${signingInput}.${signature.toString('base64url')}`;
}
