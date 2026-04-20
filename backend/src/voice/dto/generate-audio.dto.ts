import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

/** Generate audio dto. */
export class GenerateAudioDto {
  /** Text property. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text: string;

  /** Profile id property. */
  @IsUUID()
  @IsNotEmpty()
  profileId: string;
}
