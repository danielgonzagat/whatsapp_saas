import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Body shape for `POST /marketing/instagram/send`.
 *
 * `text` must be non-empty and respect the Meta DM character ceiling (1000 by
 * policy — Instagram's Graph API truncates beyond that). The recipient is the
 * IG-scoped user id (a.k.a. IGSID) returned by webhook events / conversation
 * threads — never a username.
 */
export class SendInstagramMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  recipientId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  text!: string;
}

/**
 * Query shape for `GET /marketing/instagram/messages`.
 *
 * `conversationId` is optional — when omitted, the service returns all
 * persisted messages for the workspace's IG account (currently honest-empty
 * until the `IgMessage` model + webhook persistence land).
 */
export class ListInstagramMessagesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  conversationId?: string;
}
