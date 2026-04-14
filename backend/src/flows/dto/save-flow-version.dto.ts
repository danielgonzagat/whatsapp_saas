import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class SaveFlowVersionDto {
  @IsOptional()
  @IsArray()
  nodes?: any[];

  @IsOptional()
  @IsArray()
  edges?: any[];

  @IsOptional()
  @IsString()
  @MaxLength(255)
  label?: string;
}
