import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AdminRole, AdminUserStatus } from '@prisma/client';

/** Update admin user dto. */
export class UpdateAdminUserDto {
  /** Name property. */
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  /** Role property. */
  @IsOptional()
  @IsEnum(AdminRole)
  role?: AdminRole;

  /** Status property. */
  @IsOptional()
  @IsEnum(AdminUserStatus)
  status?: AdminUserStatus;
}
