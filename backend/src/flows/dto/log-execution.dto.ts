import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

/** Log execution dto. */
export class LogExecutionDto {
  /** Logs property. */
  @IsOptional()
  @IsArray()
  logs?: Array<{ nodeId?: string; message: string; level?: string }>;

  /** User property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  user?: string;
}
