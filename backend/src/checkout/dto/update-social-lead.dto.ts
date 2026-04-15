import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateSocialLeadDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  cpf?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  stepReached?: number;
}
