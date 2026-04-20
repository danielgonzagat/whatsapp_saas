import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/** Admin account state action enum. */
export enum AdminAccountStateAction {
  SUSPEND = 'SUSPEND',
  BLOCK = 'BLOCK',
  UNBLOCK = 'UNBLOCK',
  FREEZE = 'FREEZE',
  UNFREEZE = 'UNFREEZE',
}

/** Update account state dto. */
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
