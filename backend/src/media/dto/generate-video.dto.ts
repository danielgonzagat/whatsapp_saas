import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Generate video dto. */
export class GenerateVideoDto {
  /** Image url property. */
  @IsString()
  @MaxLength(2048)
  imageUrl: string;

  /** Prompt property. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  prompt?: string;

  /** Workspace id property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  workspaceId?: string;
}
