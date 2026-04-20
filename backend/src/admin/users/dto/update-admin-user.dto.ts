import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AdminRole, AdminUserStatus } from '@prisma/client';

/** Update admin user dto. */
export class UpdateAdminUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEnum(AdminRole)
  role?: AdminRole;

  @IsOptional()
  @IsEnum(AdminUserStatus)
  status?: AdminUserStatus;
}
