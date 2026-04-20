import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

/** Create flow dto. */
export class CreateFlowDto {
  /** Name property. */
  @IsString()
  @MaxLength(255)
  name: string;

  /** Description property. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** Nodes property. */
  @IsArray()
  nodes: unknown[];

  /** Edges property. */
  @IsArray()
  edges: unknown[];
}

/** Update flow dto. */
export class UpdateFlowDto {
  /** Name property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  /** Description property. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** Nodes property. */
  @IsOptional()
  @IsArray()
  nodes?: unknown[];

  /** Edges property. */
  @IsOptional()
  @IsArray()
  edges?: unknown[];
}
