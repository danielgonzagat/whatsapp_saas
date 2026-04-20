import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** Billing checkout dto. */
export class BillingCheckoutDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  workspaceId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  plan: string;
}
