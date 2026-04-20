import { IsEmail, IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { AdminRole } from '@prisma/client';

/** Create admin user dto. */
export class CreateAdminUserDto {
  /** Name property. */
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  /** Email property. */
  @IsEmail()
  @MaxLength(320)
  email!: string;

  /** Temporary password property. */
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  temporaryPassword!: string;

  /** Role property. */
  @IsEnum(AdminRole)
  role!: AdminRole;
}
