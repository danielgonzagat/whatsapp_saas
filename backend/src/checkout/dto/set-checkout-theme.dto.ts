import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** Set checkout theme dto. */
export class SetCheckoutThemeDto {
  /** Theme property. */
  @IsOptional() @IsIn(['NOIR', 'BLANC']) theme?: 'NOIR' | 'BLANC';
  /** Accent color property. */
  @IsOptional() @IsString() @MaxLength(255) accentColor?: string;
  /** Accent color2 property. */
  @IsOptional() @IsString() @MaxLength(255) accentColor2?: string;
  /** Background color property. */
  @IsOptional() @IsString() @MaxLength(255) backgroundColor?: string;
  /** Card color property. */
  @IsOptional() @IsString() @MaxLength(255) cardColor?: string;
  /** Text color property. */
  @IsOptional() @IsString() @MaxLength(255) textColor?: string;
  /** Muted text color property. */
  @IsOptional() @IsString() @MaxLength(255) mutedTextColor?: string;
  /** Font body property. */
  @IsOptional() @IsString() @MaxLength(255) fontBody?: string;
  /** Font display property. */
  @IsOptional() @IsString() @MaxLength(255) fontDisplay?: string;
  /** Brand name property. */
  @IsOptional() @IsString() @MaxLength(255) brandName?: string;
  /** Brand logo property. */
  @IsOptional() @IsString() @MaxLength(2048) brandLogo?: string;
  /** Header message property. */
  @IsOptional() @IsString() @MaxLength(2000) headerMessage?: string;
  /** Header sub message property. */
  @IsOptional() @IsString() @MaxLength(2000) headerSubMessage?: string;
  /** Button step1 text property. */
  @IsOptional() @IsString() @MaxLength(255) btnStep1Text?: string;
  /** Button step2 text property. */
  @IsOptional() @IsString() @MaxLength(255) btnStep2Text?: string;
  /** Button finalize text property. */
  @IsOptional() @IsString() @MaxLength(255) btnFinalizeText?: string;
  /** Button finalize icon property. */
  @IsOptional() @IsString() @MaxLength(255) btnFinalizeIcon?: string;
}