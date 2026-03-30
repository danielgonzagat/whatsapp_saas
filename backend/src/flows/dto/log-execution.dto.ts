import { IsOptional, IsArray, IsString } from 'class-validator';

export class LogExecutionDto {
  @IsOptional()
  @IsArray()
  logs?: any[];

  @IsOptional()
  @IsString()
  user?: string;
}
