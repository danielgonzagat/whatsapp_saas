import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { OrderStatus, PaymentMethod } from '@prisma/client';

/** List transactions query dto. */
export class ListTransactionsQueryDto {
  /** Search property. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  /** Status property. */
  @IsOptional()
  @IsEnum(OrderStatus, { each: true })
  status?: OrderStatus;

  /** Method property. */
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  /** Gateway property. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  gateway?: string;

  /** Workspace id property. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  workspaceId?: string;

  /** From property. */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  /** To property. */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  /** Skip property. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  /** Take property. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;
}
