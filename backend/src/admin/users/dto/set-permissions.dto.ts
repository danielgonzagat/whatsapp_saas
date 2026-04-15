import { AdminAction, AdminModule } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  ValidateNested,
} from 'class-validator';

class PermissionEntry {
  @IsEnum(AdminModule)
  module!: AdminModule;

  @IsEnum(AdminAction)
  action!: AdminAction;

  @IsBoolean()
  allowed!: boolean;
}

export class SetPermissionsDto {
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PermissionEntry)
  permissions!: PermissionEntry[];
}
