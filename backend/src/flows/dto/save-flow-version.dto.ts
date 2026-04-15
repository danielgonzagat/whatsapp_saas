import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class SaveFlowVersionDto {
  @IsOptional()
  @IsArray()
  nodes?: unknown[];

  @IsOptional()
  @IsArray()
  edges?: unknown[];

  @IsOptional()
  @IsString()
  @MaxLength(255)
  label?: string;
}
