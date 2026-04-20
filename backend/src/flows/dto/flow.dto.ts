import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

/** Create flow dto. */
export class CreateFlowDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsArray()
  nodes: unknown[];

  @IsArray()
  edges: unknown[];
}

/** Update flow dto. */
export class UpdateFlowDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsArray()
  nodes?: unknown[];

  @IsOptional()
  @IsArray()
  edges?: unknown[];
}
