import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class SupplierInputDto {
  @IsString()
  @MaxLength(255)
  accountId: string;

  @IsString()
  @MaxLength(32)
  amountCents: string;
}

export class PercentRoleInputDto {
  @IsString()
  @MaxLength(255)
  accountId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10_000)
  percentBp: number;
}

export class SellerInputDto {
  @IsString()
  @MaxLength(255)
  accountId: string;
}

export class SplitPreviewDto {
  @IsString()
  @MaxLength(32)
  buyerPaidCents: string;

  @IsString()
  @MaxLength(32)
  saleValueCents: string;

  @IsString()
  @MaxLength(32)
  interestCents: string;

  @IsString()
  @MaxLength(32)
  marketplaceFeeCents: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SupplierInputDto)
  supplier?: SupplierInputDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PercentRoleInputDto)
  affiliate?: PercentRoleInputDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PercentRoleInputDto)
  coproducer?: PercentRoleInputDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PercentRoleInputDto)
  manager?: PercentRoleInputDto;

  @ValidateNested()
  @Type(() => SellerInputDto)
  seller: SellerInputDto;
}
