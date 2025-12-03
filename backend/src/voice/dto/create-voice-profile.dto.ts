import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUrl,
  IsEnum,
} from 'class-validator';

export enum VoiceProvider {
  ELEVENLABS = 'ELEVENLABS',
  OPENAI = 'OPENAI',
}

export class CreateVoiceProfileDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(VoiceProvider)
  @IsNotEmpty()
  provider: VoiceProvider;

  @IsString()
  @IsNotEmpty()
  voiceId: string;

  @IsUrl()
  @IsOptional()
  sampleUrl?: string;
}
