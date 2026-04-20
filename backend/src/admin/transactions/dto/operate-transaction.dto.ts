import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/** Admin transaction action enum. */
export enum AdminTransactionAction {
  REFUND = 'REFUND',
  CHARGEBACK = 'CHARGEBACK',
}

/** Operate transaction dto. */
export class OperateTransactionDto {
  @IsEnum(AdminTransactionAction)
  action!: AdminTransactionAction;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
