import { IsString, Length } from 'class-validator';

/** Confirm destructive intent dto. */
export class ConfirmDestructiveIntentDto {
  @IsString()
  @Length(6, 6)
  challenge!: string;
}
