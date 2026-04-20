import { IsString, MaxLength, MinLength } from 'class-validator';

/** Undo destructive intent dto. */
export class UndoDestructiveIntentDto {
  @IsString()
  @MinLength(16)
  @MaxLength(128)
  undoToken!: string;
}
