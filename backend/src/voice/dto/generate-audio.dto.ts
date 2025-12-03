import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class GenerateAudioDto {
  @IsString()
  @IsNotEmpty()
  text: string;

  @IsUUID()
  @IsNotEmpty()
  profileId: string;
}
