import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Upload document dto. */
export class UploadDocumentDto {
  /** Name property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  /** Description property. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** Category property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  category?: string;

  /** Workspace id property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  workspaceId?: string;
}
