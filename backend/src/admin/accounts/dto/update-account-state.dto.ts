import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export enum AdminAccountStateAction {
  SUSPEND = 'SUSPEND',
  BLOCK = 'BLOCK',
  UNBLOCK = 'UNBLOCK',
  FREEZE = 'FREEZE',
  UNFREEZE = 'UNFREEZE',
}

export class UpdateAccountStateDto {
  @IsEnum(AdminAccountStateAction)
  action!: AdminAccountStateAction;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  frozenBalanceInCents?: number;
}
