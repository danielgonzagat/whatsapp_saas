import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** Billing checkout dto. */
export class BillingCheckoutDto {
  /** Workspace id property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  workspaceId?: string;

  /** Plan property. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  plan: string;
}
