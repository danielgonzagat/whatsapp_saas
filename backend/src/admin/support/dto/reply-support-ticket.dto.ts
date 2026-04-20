import { IsString, MaxLength, MinLength } from 'class-validator';

/** Reply support ticket dto. */
export class ReplySupportTicketDto {
  /** Content property. */
  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  content!: string;
}
