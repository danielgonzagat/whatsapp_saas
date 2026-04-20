import { IsOptional, IsString, MaxLength } from 'class-validator';

/** List contacts query dto. */
export class ListContactsQueryDto {
  /** Workspace id property. */
  @IsOptional() @IsString() @MaxLength(255) workspaceId?: string;
  /** Page property. */
  @IsOptional() @IsString() @MaxLength(10) page?: string;
  /** Limit property. */
  @IsOptional() @IsString() @MaxLength(10) limit?: string;
  /** Search property. */
  @IsOptional() @IsString() @MaxLength(255) search?: string;
}
