import { IsOptional, IsString, MaxLength } from 'class-validator';

export class GenerateVideoDto {
  @IsString()
  @MaxLength(2048)
  imageUrl: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  prompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  workspaceId?: string;
}
