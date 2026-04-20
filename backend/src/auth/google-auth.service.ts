import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoginTicket, OAuth2Client, TokenPayload } from 'google-auth-library';

const W_RE = /[\W_]+/g;

const AUDIENCE_ISSUER_TOKEN_US_RE =
  /audience|issuer|token used too late|wrong number of segments|invalid token|No pem found|Token used too early|Wrong recipient/i;

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || 'unknown_error';
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'unknown_error';
}

function pickPrimary<T extends { metadata?: { primary?: boolean } }>(entries?: T[]) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return null;
  }

  return entries.find((entry) => entry?.metadata?.primary) || entries[0];
}

/** Google verified profile shape. */
export interface GoogleVerifiedProfile {
  /** Provider property. */
  provider: 'google' | 'apple' | 'facebook';
  /** Provider id property. */
  providerId: string;
  /** Email property. */
  email: string;
  /** Name property. */
  name: string;
  /** Image property. */
  image?: string | null;
  /** Email verified property. */
  emailVerified: boolean;
  /** Access token property. */
  accessToken?: string | null;
  /** Refresh token property. */
  refreshToken?: string | null;
  /** Token expires at property. */
  tokenExpiresAt?: Date | null;
  /** Profile data property. */
  profileData?: Record<string, unknown> | null;
}

/** Google people profile shape. */
export interface GooglePeopleProfile {
  /** Email property. */
  email: string | null;
  /** Phone property. */
  phone: string | null;
  /** Address property. */
  address: {
    street: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    countryCode: string | null;
    formattedValue: string | null;
  } | null;
  /** Raw property. */
  raw: unknown;
}

/** Google auth service. */
@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private static readonly PEOPLE_API_URL =
    'https://people.googleapis.com/v1/people/me?personFields=names,emailAddresses,phoneNumbers,addresses';

  constructor(private readonly config: ConfigService) {}

  /** Verify credential. */
  async verifyCredential(credential: string): Promise<GoogleVerifiedProfile> {
    const idToken = credential?.trim();
    if (!idToken) {
      throw new UnauthorizedException('Credencial Google ausente.');
    }

    const allowedClientIds = this.requireAllowedClientIds();
    const ticket = await this.verifyIdTokenSafely(idToken, allowedClientIds);
    const payload = ticket.getPayload();
    if (!payload) {
      throw new UnauthorizedException('Credencial Google inválida.');
    }

    this.assertPayload(payload);
    return this.buildVerifiedProfile(payload);
  }

  private requireAllowedClientIds(): string[] {
    const allowed = this.getAllowedClientIds();
    if (!allowed.length) {
      this.logger.error(
        'google_auth_not_configured: GOOGLE_CLIENT_ID/NEXT_PUBLIC_GOOGLE_CLIENT_ID ausente',
      );
      throw new ServiceUnavailableException('Login com Google não configurado no servidor.');
    }
    return allowed;
  }

  private async verifyIdTokenSafely(
    idToken: string,
    allowedClientIds: string[],
  ): Promise<LoginTicket> {
    const client = new OAuth2Client();
    try {
      return await client.verifyIdToken({ idToken, audience: allowedClientIds });
    } catch (error: unknown) {
      const message = extractErrorMessage(error);
      this.logger.warn(`google_token_rejected: ${JSON.stringify({ message })}`);
      if (AUDIENCE_ISSUER_TOKEN_US_RE.test(message)) {
        throw new UnauthorizedException('Credencial Google inválida.');
      }
      throw new ServiceUnavailableException(`Falha ao validar credencial Google: ${message}`);
    }
  }

  private extractVerifiedGoogleIdentity(payload: TokenPayload): {
    providerId: string;
    email: string;
    emailVerified: true;
  } {
    const providerId = payload.sub?.trim();
    const email = payload.email?.trim().toLowerCase();
    const emailVerified = payload.email_verified === true;

    if (!providerId || !email || !emailVerified) {
      throw new UnauthorizedException('Perfil Google inválido ou email não verificado.');
    }

    return { providerId, email, emailVerified };
  }

  private buildVerifiedProfile(payload: TokenPayload): GoogleVerifiedProfile {
    const { providerId, email, emailVerified } = this.extractVerifiedGoogleIdentity(payload);

    const derivedName = this.deriveName(email);
    const trimmedName = payload.name?.trim();
    const trimmedPicture = payload.picture?.trim();

    return {
      provider: 'google',
      providerId,
      email,
      name: trimmedName || derivedName,
      image: trimmedPicture || undefined,
      emailVerified,
    };
  }

  /** Fetch people profile. */
  async fetchPeopleProfile(accessToken: string): Promise<GooglePeopleProfile> {
    const token = accessToken?.trim();
    if (!token) {
      throw new UnauthorizedException('Access token Google ausente.');
    }

    // Not SSRF: hardcoded Google People API endpoint (static readonly constant)
    const response = await fetch(GoogleAuthService.PEOPLE_API_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(15000),
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'unknown_error';
      throw new ServiceUnavailableException(`Falha ao consultar perfil Google: ${message}`);
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      if (response.status === 401 || response.status === 403) {
        throw new UnauthorizedException('Google negou acesso aos escopos adicionais.');
      }

      throw new ServiceUnavailableException(
        `Falha ao consultar perfil Google: status ${response.status}${body ? ` ${body}` : ''}`,
      );
    }

    const raw = (await response.json()) as {
      emailAddresses?: Array<{ value?: string; metadata?: { primary?: boolean } }>;
      phoneNumbers?: Array<{
        value?: string;
        canonicalForm?: string;
        metadata?: { primary?: boolean };
      }>;
      addresses?: Array<{
        streetAddress?: string;
        city?: string;
        region?: string;
        postalCode?: string;
        countryCode?: string;
        formattedValue?: string;
        metadata?: { primary?: boolean };
      }>;
    };

    const email = pickPrimary(raw.emailAddresses)?.value?.trim().toLowerCase() || null;
    const phoneEntry = pickPrimary(raw.phoneNumbers);
    const addressEntry = pickPrimary(raw.addresses);

    return {
      email,
      phone: phoneEntry?.canonicalForm?.trim() || phoneEntry?.value?.trim() || null,
      address: addressEntry
        ? {
            street: addressEntry.streetAddress?.trim() || null,
            city: addressEntry.city?.trim() || null,
            state: addressEntry.region?.trim() || null,
            postalCode: addressEntry.postalCode?.trim() || null,
            countryCode: addressEntry.countryCode?.trim() || null,
            formattedValue: addressEntry.formattedValue?.trim() || null,
          }
        : null,
      raw,
    };
  }

  private assertPayload(payload: TokenPayload) {
    const issuer = payload.iss?.trim();
    if (issuer !== 'accounts.google.com' && issuer !== 'https://accounts.google.com') {
      throw new UnauthorizedException('Issuer Google inválido.');
    }

    const expiresAt = Number(payload.exp);
    if (!Number.isFinite(expiresAt) || expiresAt * 1000 <= Date.now()) {
      throw new UnauthorizedException('Credencial Google expirada.');
    }
  }

  private getAllowedClientIds(): string[] {
    const csv = this.config.get<string>('GOOGLE_ALLOWED_CLIENT_IDS');
    const raw = [
      this.config.get<string>('GOOGLE_CLIENT_ID'),
      this.config.get<string>('NEXT_PUBLIC_GOOGLE_CLIENT_ID'),
      csv,
    ]
      .filter((value): value is string => typeof value === 'string')
      .flatMap((value) => value.split(','))
      .map((value) => value.trim())
      .filter(Boolean);

    return [...new Set(raw)];
  }

  private deriveName(email: string) {
    const local = email.split('@')[0] || 'User';
    const cleaned = local.replace(W_RE, ' ').trim();
    const candidate = cleaned || 'User';
    return candidate.charAt(0).toUpperCase() + candidate.slice(1);
  }
}
