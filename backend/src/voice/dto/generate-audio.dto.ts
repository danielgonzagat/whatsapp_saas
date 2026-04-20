import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

/** Generate audio dto. */
export class GenerateAudioDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text: string;

  @IsUUID()
  @IsNotEmpty()
  profileId: string;
}
