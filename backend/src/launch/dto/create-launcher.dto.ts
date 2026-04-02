import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateLauncherDto {
  @IsString() @MaxLength(255) name: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(255) type?: string;
}

export class AddGroupDto {
  @IsString() @MaxLength(255) groupId: string;
  @IsOptional() @IsString() @MaxLength(255) role?: string;
}
