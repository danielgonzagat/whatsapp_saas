import { IsString, IsNotEmpty, IsOptional, IsUrl, IsEnum, MaxLength } from 'class-validator';

export enum VoiceProvider {
  OPENAI = 'OPENAI',
}

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
