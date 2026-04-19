import { Type } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const SOCIAL_PROVIDERS = ['google', 'facebook', 'apple'] as const;

class CaptureAppleUserNameDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  lastName?: string;
}

class CaptureAppleUserDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => CaptureAppleUserNameDto)
  name?: CaptureAppleUserNameDto;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;
}

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

  @ValidateIf((value: CaptureSocialLeadDto) => value.provider === 'apple')
  @IsString()
  @MaxLength(4096)
  identityToken?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CaptureAppleUserDto)
  user?: CaptureAppleUserDto;

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
