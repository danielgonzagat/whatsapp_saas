import { IsIn, IsOptional, IsString, IsUrl, MaxLength, ValidateIf } from 'class-validator';

const SOCIAL_PROVIDERS = ['google', 'facebook', 'apple'] as const;

export class CaptureSocialLeadDto {
  @IsString()
  @MaxLength(255)
  slug: string;

  @IsIn(SOCIAL_PROVIDERS)
  provider: (typeof SOCIAL_PROVIDERS)[number];

  @ValidateIf((value: CaptureSocialLeadDto) => value.provider === 'google')
  @IsString()
  @MaxLength(4096)
  credential?: string;

  @ValidateIf((value: CaptureSocialLeadDto) => value.provider === 'facebook')
  @IsString()
  @MaxLength(4096)
  accessToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  userId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  checkoutCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceFingerprint?: string;

  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'sourceUrl deve ser uma URL válida.' })
  sourceUrl?: string;

  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'refererUrl deve ser uma URL válida.' })
  refererUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  utmSource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  utmMedium?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  utmCampaign?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  utmContent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  utmTerm?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fbclid?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  gclid?: string;
}
