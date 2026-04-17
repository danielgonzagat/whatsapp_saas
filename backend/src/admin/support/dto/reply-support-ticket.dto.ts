import { IsString, MaxLength, MinLength } from 'class-validator';

export class ReplySupportTicketDto {
  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  content!: string;
}
