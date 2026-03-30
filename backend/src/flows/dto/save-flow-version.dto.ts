import { IsOptional, IsArray, IsString } from 'class-validator';

export class SaveFlowVersionDto {
  @IsOptional()
  @IsArray()
  nodes?: any[];

  @IsOptional()
  @IsArray()
  edges?: any[];

  @IsOptional()
  @IsString()
  label?: string;
}
