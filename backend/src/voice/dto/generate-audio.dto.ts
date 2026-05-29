import { Expose, Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

/**
 * Generate audio dto.
 *
 * Accepts both the canonical `profileId` and the legacy/frontend alias
 * `voiceProfileId`. The aliased value is normalized into `profileId` so the
 * service layer stays single-source-of-truth. Keeping the alias preserves the
 * existing UI contract (frontend `voiceApi.generate({ voiceProfileId })`)
 * without inventing a new behavior — the visual shell is unchanged, only the
 * wire-up is closed.
 */
export class GenerateAudioDto {
  /** Text property. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text!: string;

  /**
   * Canonical UUID of the voice profile. Frontend may send `voiceProfileId`
   * instead; in that case the @Transform on `profileId` mirrors the value so
   * downstream code only has to read one field.
   */
  @Expose()
  @Transform(({ value, obj }: { value: unknown; obj: { voiceProfileId?: unknown } }) => {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
    if (typeof obj.voiceProfileId === 'string' && obj.voiceProfileId.length > 0) {
      return obj.voiceProfileId;
    }
    return value;
  })
  @IsUUID()
  @IsNotEmpty()
  profileId!: string;

  /**
   * Frontend alias accepted for backwards compatibility with
   * `frontend/src/lib/api/media.ts:voiceApi.generate`. Always optional — if
   * provided, the value is mirrored into `profileId` via the @Transform above.
   */
  @Expose()
  @IsOptional()
  @ValidateIf(
    (o: { profileId?: unknown; voiceProfileId?: unknown }) =>
      typeof o.voiceProfileId === 'string' && o.voiceProfileId.length > 0,
  )
  @IsUUID()
  voiceProfileId?: string;
}
