import { IsString, MaxLength, MinLength } from 'class-validator';

export class UndoDestructiveIntentDto {
  @IsString()
  @MinLength(16)
  @MaxLength(128)
  undoToken!: string;
}
