import { IsString, IsOptional } from 'class-validator';

export class GenerateVideoDto {
  @IsString()
  imageUrl: string;

  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsString()
  workspaceId?: string;
}
