import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Send message dto. */
export class SendMessageDto {
  /** Session id property. */
  @IsOptional()
  @IsString()
  sessionId?: string;

  /** Content property. */
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content!: string;
}
