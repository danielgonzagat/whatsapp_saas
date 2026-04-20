import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

class PulseFrontendViewportDto {
  @IsInt()
  @Min(0)
  @Max(8192)
  width: number;

  @IsInt()
  @Min(0)
  @Max(8192)
  height: number;
}

/** Pulse frontend heartbeat dto. */
export class PulseFrontendHeartbeatDto {
  /** Session id property. */
  @IsString()
  @MaxLength(128)
  sessionId: string;

  /** Route property. */
  @IsString()
  @MaxLength(512)
  route: string;

  /** Visible property. */
  @IsBoolean()
  visible: boolean;

  /** Online property. */
  @IsBoolean()
  online: boolean;

  /** Connection type property. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  connectionType?: string;

  /** Viewport property. */
  @IsOptional()
  @ValidateNested()
  @Type(() => PulseFrontendViewportDto)
  viewport?: PulseFrontendViewportDto;
}
