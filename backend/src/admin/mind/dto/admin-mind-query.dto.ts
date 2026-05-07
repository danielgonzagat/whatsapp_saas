import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class AdminMindStateQueryDto {
  @IsOptional() @IsString() @MaxLength(128) decisionType?: string;
}

export class AdminMindSurpriseQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(200) limit?: number;
}

export class AdminMindLiftQueryDto {
  @IsString() @MaxLength(128) decisionType!: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) sinceDays?: number;
}
