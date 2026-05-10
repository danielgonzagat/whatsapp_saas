import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

/** Voice provider enum. */
export enum VoiceProvider {
  OPENAI = 'OPENAI',
}

/** Create voice profile dto. */
export class CreateVoiceProfileDto {
  /** Name property. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  /** Provider property. */
  @IsEnum(VoiceProvider)
  @IsNotEmpty()
  provider: VoiceProvider;

  /** Voice id property. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  voiceId: string;

  /** Sample url property. */
  @IsUrl()
  @IsOptional()
  @MaxLength(2048)
  sampleUrl?: string;
}
