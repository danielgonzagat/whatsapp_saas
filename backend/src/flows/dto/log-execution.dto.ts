import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class LogExecutionDto {
  @IsOptional()
  @IsArray()
  logs?: Array<{ nodeId?: string; message: string; level?: string }>;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  user?: string;
}
