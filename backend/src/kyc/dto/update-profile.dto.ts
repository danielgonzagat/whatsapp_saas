import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

/** Update profile dto. */
export class UpdateProfileDto {
  /** Name property. */
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  /** Public name property. */
  @IsOptional() @IsString() @MaxLength(100) publicName?: string;
  /** Phone property. */
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  /** Birth date property. */
  @IsOptional() @IsDateString() birthDate?: string;
  /** Document type property. */
  @IsOptional() @IsString() @MaxLength(255) documentType?: string;
  /** Document number property. */
  @IsOptional() @IsString() @MaxLength(18) documentNumber?: string;
  /** Bio property. */
  @IsOptional() @IsString() @MaxLength(500) bio?: string;
  /** Website property. */
  @IsOptional() @IsString() @MaxLength(2048) website?: string;
  /** Instagram property. */
  @IsOptional() @IsString() @MaxLength(50) instagram?: string;
}
