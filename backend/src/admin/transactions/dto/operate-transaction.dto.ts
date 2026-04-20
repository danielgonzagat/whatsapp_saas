import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/** Admin transaction action enum. */
export enum AdminTransactionAction {
  REFUND = 'REFUND',
  CHARGEBACK = 'CHARGEBACK',
}

/** Operate transaction dto. */
export class OperateTransactionDto {
  /** Action property. */
  @IsEnum(AdminTransactionAction)
  action!: AdminTransactionAction;

  /** Note property. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
