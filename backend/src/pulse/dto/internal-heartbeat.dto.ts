import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class PulseInternalHeartbeatDto {
  @IsString()
  @MaxLength(160)
  nodeId: string;

  @IsIn(['backend', 'worker', 'frontend', 'scanner'])
  role: 'backend' | 'worker' | 'frontend' | 'scanner';

  @IsIn(['UP', 'DEGRADED', 'DOWN'])
  status: 'UP' | 'DEGRADED' | 'DOWN';

  @IsString()
  @MaxLength(600)
  summary: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  workspaceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  surface?: string;

  @IsOptional()
  @IsInt()
  @Min(5_000)
  @Max(600_000)
  ttlMs?: number;

  @IsOptional()
  @IsBoolean()
  critical?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  version?: string;

  // Runtime signals are intentionally free-form telemetry keys. The outer
  // payload is authenticated and validated, but nested signal names vary by
  // runtime (worker/backend/scanner), so we accept any plain object here.
  @IsOptional()
  @IsObject()
  signals?: Record<string, string | number | boolean | null>;
}
