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
  @IsString()
  @MaxLength(128)
  sessionId: string;

  @IsString()
  @MaxLength(512)
  route: string;

  @IsBoolean()
  visible: boolean;

  @IsBoolean()
  online: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  connectionType?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PulseFrontendViewportDto)
  viewport?: PulseFrontendViewportDto;
}
