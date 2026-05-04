import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

/** Admin carteira ledger query dto. */
export class AdminCarteiraLedgerQueryDto {
  /** Currency property. */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  /** Kind property. */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  kind?: string;

  /** From property (ISO 8601 date string). */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** To property (ISO 8601 date string). */
  @IsOptional()
  @IsDateString()
  to?: string;

  /** Skip property. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  skip?: string;

  /** Take property. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  take?: string;
}
