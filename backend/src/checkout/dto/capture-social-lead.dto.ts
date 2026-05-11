import { IsIn, IsOptional, IsString, IsUrl, MaxLength, ValidateIf } from 'class-validator';

const SOCIAL_PROVIDERS = ['google', 'facebook', 'apple'] as const;

/** Capture social lead dto. */
export class CaptureSocialLeadDto {
  /** Slug property. */
  @IsString()
  @MaxLength(255)
  slug: string;

  /** Provider property. */
  @IsIn(SOCIAL_PROVIDERS)
  provider: (typeof SOCIAL_PROVIDERS)[number];

  /** Credential property. */
  @ValidateIf((value: CaptureSocialLeadDto) => value.provider === 'google')
  @IsString()
  @MaxLength(4096)
  credential?: string;

  /** Identity token property. */
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  identityToken?: string;

  /** Authorization code property. */
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  authorizationCode?: string;

  /** Redirect uri property. */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  redirectUri?: string;

  /** Access token property. */
  @ValidateIf((value: CaptureSocialLeadDto) => value.provider === 'facebook')
  @IsString()
  @MaxLength(4096)
  accessToken?: string;

  /** Apple user hint property. */
  @IsOptional()
  user?: { name?: { firstName?: string; lastName?: string }; email?: string };

  /** User id property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  userId?: string;

  /** Checkout code property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  checkoutCode?: string;

  /** Device fingerprint property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceFingerprint?: string;

  /** Source url property. */
  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'sourceUrl deve ser uma URL válida.' })
  sourceUrl?: string;

  /** Referer url property. */
  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'refererUrl deve ser uma URL válida.' })
  refererUrl?: string;

  /** Utm source property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  utmSource?: string;

  /** Utm medium property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  utmMedium?: string;

  /** Utm campaign property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  utmCampaign?: string;

  /** Utm content property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  utmContent?: string;

  /** Utm term property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  utmTerm?: string;

  /** Fbclid property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fbclid?: string;

  /** Gclid property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  gclid?: string;
}
