import {
  createRemoteJWKSet,
  errors,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';

export interface SecurityEventTokenPayload extends JWTPayload {
  events?: Record<string, unknown>;
}

export type SecurityEventTokenOptions = {
  issuer: string;
  audience: string | string[];
  jwks: JWTVerifyGetKey;
};

export function createGoogleRiscJwks(
  url = 'https://www.googleapis.com/oauth2/v3/certs',
): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL(url));
}

export async function validateSecurityEventToken(
  token: string,
  options: SecurityEventTokenOptions,
): Promise<SecurityEventTokenPayload> {
  try {
    const result = await jwtVerify(token, options.jwks, {
      issuer: options.issuer,
      audience: options.audience,
    });

    return result.payload as SecurityEventTokenPayload;
  } catch (error: unknown) {
    if (error instanceof errors.JWTExpired) {
      throw new Error('Expired Google RISC token.');
    }

    if (error instanceof errors.JWTClaimValidationFailed) {
      if (error.claim === 'iss') {
        throw new Error('Invalid Google RISC issuer.');
      }
      if (error.claim === 'aud') {
        throw new Error('Invalid Google RISC audience.');
      }
    }

    if (
      error instanceof errors.JWSSignatureVerificationFailed ||
      error instanceof errors.JWSInvalid
    ) {
      throw new Error('Invalid Google RISC signature.');
    }

    throw new Error('Invalid Google RISC token.');
  }
}
