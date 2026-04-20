import { IsIn, IsString } from 'class-validator';

const SUPPORT_STATUSES = ['OPEN', 'PENDING', 'CLOSED', 'SNOOZED'] as const;

/** Update support ticket status dto. */
export class UpdateSupportTicketStatusDto {
  /** Status property. */
  @IsString()
  @IsIn(SUPPORT_STATUSES)
  status!: (typeof SUPPORT_STATUSES)[number];
}
