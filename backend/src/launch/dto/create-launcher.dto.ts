import { IsString, IsOptional } from 'class-validator';

export class CreateLauncherDto {
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() type?: string;
}

export class AddGroupDto {
  @IsString() groupId: string;
  @IsOptional() @IsString() role?: string;
}
