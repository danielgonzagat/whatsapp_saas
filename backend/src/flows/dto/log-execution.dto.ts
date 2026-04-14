import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class LogExecutionDto {
  @IsOptional()
  @IsArray()
  logs?: any[];

  @IsOptional()
  @IsString()
  @MaxLength(255)
  user?: string;
}
