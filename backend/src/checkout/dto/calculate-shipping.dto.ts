import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

/** Calculate shipping dto. */
export class CalculateShippingDto {
  /** Slug property. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  slug: string;

  /** Cep property (Brazilian postal code). */
  @IsString()
  @IsNotEmpty()
  @MaxLength(9)
  @Matches(/^\d{5}-?\d{3}$/, { message: 'CEP deve ser válido (ex: 12345-678)' })
  cep: string;
}
