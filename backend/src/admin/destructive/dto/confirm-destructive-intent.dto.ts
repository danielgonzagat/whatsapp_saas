import { IsString, Length } from 'class-validator';

/** Confirm destructive intent dto. */
export class ConfirmDestructiveIntentDto {
  /** Challenge property. */
  @IsString()
  @Length(6, 6)
  challenge!: string;
}
