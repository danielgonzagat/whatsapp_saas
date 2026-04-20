import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
/** Upsert contact dto. */
export class UpsertContactDto {
  /** Workspace id property. */
  @IsOptional() @IsString() @MaxLength(255) workspaceId?: string;
  /** Name property. */
  @IsString() @MaxLength(255) name: string;
  /** Phone property. */
  @IsString() @MaxLength(255) phone: string;
  /** Email property. */
  @IsOptional() @IsEmail() email?: string;
  /** Source property. */
  @IsOptional() @IsString() @MaxLength(255) source?: string;
}
