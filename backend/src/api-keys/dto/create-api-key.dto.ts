import { IsString, MaxLength, MinLength } from 'class-validator';

/** Create api key dto. */
export class CreateApiKeyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name!: string;
}
