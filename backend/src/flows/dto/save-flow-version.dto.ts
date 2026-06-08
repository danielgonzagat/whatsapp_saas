import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

/** Save flow version dto. */
export class SaveFlowVersionDto {
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

  /** Label property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  label?: string;
}
