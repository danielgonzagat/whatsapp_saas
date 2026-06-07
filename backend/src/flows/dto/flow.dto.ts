import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

/** Create flow dto. */
export class CreateFlowDto {
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
  @IsArray()
  @Type(() => Object)
  nodes!: unknown[];

  /** Edges property. */
  @IsArray()
  @Type(() => Object)
  edges!: unknown[];
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
  @Type(() => Object)
  nodes?: unknown[];

  /** Edges property. */
  @IsOptional()
  @IsArray()
  @Type(() => Object)
  edges?: unknown[];
}
