import { IsString, Length } from 'class-validator';

export class ConfirmDestructiveIntentDto {
  @IsString()
  @Length(6, 6)
  challenge!: string;
}
