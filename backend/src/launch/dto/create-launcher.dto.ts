import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Create launcher dto. */
export class CreateLauncherDto {
  /** Name property. */
  @IsString() @MaxLength(255) name: string;
  /** Description property. */
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  /** Type property. */
  @IsOptional() @IsString() @MaxLength(255) type?: string;
}

/** Add group dto. */
export class AddGroupDto {
  /** Group id property. */
  @IsString() @MaxLength(255) groupId: string;
  /** Role property. */
  @IsOptional() @IsString() @MaxLength(255) role?: string;
}
