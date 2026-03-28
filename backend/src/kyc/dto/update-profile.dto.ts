import { IsOptional, IsString, IsDateString, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(100) publicName?: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsDateString() birthDate?: string;
  @IsOptional() @IsString() documentType?: string;
  @IsOptional() @IsString() @MaxLength(18) documentNumber?: string;
  @IsOptional() @IsString() @MaxLength(500) bio?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() @MaxLength(50) instagram?: string;
}
