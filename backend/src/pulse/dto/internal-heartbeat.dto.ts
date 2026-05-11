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

/** Pulse internal heartbeat dto. */
export class PulseInternalHeartbeatDto {
  /** Node id property. */
  @IsString()
  @MaxLength(160)
  nodeId: string;

  /** Role property. */
  @IsIn(['backend', 'worker', 'frontend', 'scanner'])
  role: 'backend' | 'worker' | 'frontend' | 'scanner';

  /** Status property. */
  @IsIn(['UP', 'DEGRADED', 'DOWN'])
  status: 'UP' | 'DEGRADED' | 'DOWN';

  /** Summary property. */
  @IsString()
  @MaxLength(600)
  summary: string;

  /** Workspace id property. */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  workspaceId?: string;

  /** Surface property. */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  surface?: string;

  /** Ttl ms property. */
  @IsOptional()
  @IsInt()
  @Min(5_000)
  @Max(600_000)
  ttlMs?: number;

  /** Critical property. */
  @IsOptional()
  @IsBoolean()
  critical?: boolean;

  /** Version property. */
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
