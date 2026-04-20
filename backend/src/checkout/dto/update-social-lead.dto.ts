import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Update social lead dto. */
export class UpdateSocialLeadDto {
  /** Name property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  /** Email property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  /** Phone property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  phone?: string;

  /** Cpf property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  cpf?: string;

  /** Cep property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  cep?: string;

  /** Street property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  street?: string;

  /** Number property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  number?: string;

  /** Neighborhood property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  neighborhood?: string;

  /** City property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  city?: string;

  /** State property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  state?: string;

  /** Complement property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  complement?: string;

  /** Step reached property. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  stepReached?: number;
}
