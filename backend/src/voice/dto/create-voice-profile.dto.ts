import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

/** Voice provider enum. */
export enum VoiceProvider {
  OPENAI = 'OPENAI',
}

/** Create voice profile dto. */
export class CreateVoiceProfileDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsEnum(VoiceProvider)
  @IsNotEmpty()
  provider: VoiceProvider;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  voiceId: string;

  @IsUrl()
  @IsOptional()
  @MaxLength(2048)
  sampleUrl?: string;
}
