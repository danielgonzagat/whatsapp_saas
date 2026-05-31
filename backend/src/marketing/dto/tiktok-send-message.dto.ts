import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * DTO for `POST /marketing/tiktok/send`.
 *
 * Even though the underlying send is pending (channel_pending), the DTO is
 * enforced strictly so the frontend integration can be developed against the
 * final contract and so we never accept untyped payloads.
 */
export class TikTokSendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  recipientId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2200)
  text!: string;
}
