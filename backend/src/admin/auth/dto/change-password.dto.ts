import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Password policy:
 *  - min 12 chars
 *  - at least one lowercase, one uppercase, one digit, one symbol
 *  - max 128 chars
 *
 * Kept deliberately simple and deterministic so the frontend can mirror the
 * same checks without diverging.
 */
export class ChangePasswordDto {
  /** New password property. */
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message:
      'A senha precisa ter pelo menos 12 caracteres, incluindo minúscula, maiúscula, número e símbolo.',
  })
  newPassword!: string;
}
