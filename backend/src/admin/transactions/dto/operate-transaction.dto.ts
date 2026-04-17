import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum AdminTransactionAction {
  REFUND = 'REFUND',
  CHARGEBACK = 'CHARGEBACK',
}

export class OperateTransactionDto {
  @IsEnum(AdminTransactionAction)
  action!: AdminTransactionAction;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
