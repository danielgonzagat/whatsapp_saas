import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional } from 'class-validator';

/** Admin home period dto enum. */
export enum AdminHomePeriodDto {
  TODAY = 'TODAY',
  D30 = '30D',
  CUSTOM = 'CUSTOM',
}

/** Admin home compare dto enum. */
export enum AdminHomeCompareDto {
  PREVIOUS = 'PREVIOUS',
  YOY = 'YOY',
  NONE = 'NONE',
}

/** List home query dto. */
export class ListHomeQueryDto {
  @IsEnum(AdminHomePeriodDto)
  period!: AdminHomePeriodDto;

  @IsOptional()
  @IsEnum(AdminHomeCompareDto)
  compare?: AdminHomeCompareDto;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}
