import { BadRequestException } from '@nestjs/common';

const PATTERN_RE = /-/g;
const W_RE = /[\W_]+/g;

type AppleIdentityPayload = {
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
};

type AppleUserName = {
  firstName?: string;
  lastName?: string;
};

type AppleUserInput = {
  name?: AppleUserName;
  email?: string;
};

export type AppleIdentityProfile = {
  provider: 'apple';
  providerId: string;
  email: string;
  name: string;
  image: null;
  emailVerified: boolean;
};

function decodeBase64Url(input: string) {
  const normalized = input.replace(/_/g, '/').replace(PATTERN_RE, '+');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8');
}

function decodeAppleIdentityPayload(identityToken: string): AppleIdentityPayload {
  const segments = identityToken.split('.');
  const payloadSegment = segments[1]?.trim();

  if (!payloadSegment) {
    throw new BadRequestException({
      error: 'invalid_apple_token',
      message: 'Apple identity token invalido ou expirado.',
    });
  }

  try {
    const payload = JSON.parse(decodeBase64Url(payloadSegment)) as AppleIdentityPayload;
    return payload && typeof payload === 'object' ? payload : {};
  } catch {
    throw new BadRequestException({
      error: 'invalid_apple_token',
      message: 'Apple identity token invalido ou expirado.',
    });
  }
}

function readEmailVerified(value: AppleIdentityPayload['email_verified']) {
  if (typeof value === 'boolean') return value;
  return String(value || '').trim().toLowerCase() === 'true';
}

export function extractAppleIdentityProfile(
  identityToken: string,
  user?: AppleUserInput,
): AppleIdentityProfile {
  const decodedPayload = decodeAppleIdentityPayload(identityToken);
  if (!decodedPayload.sub) {
    throw new BadRequestException({
      error: 'invalid_apple_token',
      message: 'Apple identity token invalido ou expirado.',
    });
  }

  const email =
    decodedPayload.email?.trim() ||
    user?.email?.trim() ||
    `${decodedPayload.sub}@privaterelay.appleid.com`;
  const providedName = user?.name
    ? `${user.name.firstName || ''} ${user.name.lastName || ''}`.trim()
    : '';
  const fallbackName = (() => {
    const local = email.split('@')[0] || 'Apple User';
    const cleaned = local.replace(W_RE, ' ').trim();
    const candidate = cleaned || 'Apple User';
    return candidate.charAt(0).toUpperCase() + candidate.slice(1);
  })();

  return {
    provider: 'apple',
    providerId: decodedPayload.sub,
    email,
    name: providedName || fallbackName,
    image: null,
    emailVerified: readEmailVerified(decodedPayload.email_verified),
  };
}
