import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Create launcher dto. */
export class CreateLauncherDto {
  @IsString() @MaxLength(255) name: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(255) type?: string;
}

/** Add group dto. */
export class AddGroupDto {
  @IsString() @MaxLength(255) groupId: string;
  @IsOptional() @IsString() @MaxLength(255) role?: string;
}
