import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Generate video dto. */
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
