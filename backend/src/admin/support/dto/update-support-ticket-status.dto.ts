import { IsIn, IsString } from 'class-validator';

const SUPPORT_STATUSES = ['OPEN', 'PENDING', 'CLOSED', 'SNOOZED'] as const;

export class UpdateSupportTicketStatusDto {
  @IsString()
  @IsIn(SUPPORT_STATUSES)
  status!: (typeof SUPPORT_STATUSES)[number];
}
