import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional } from 'class-validator';

export enum AdminHomePeriodDto {
  TODAY = 'TODAY',
  D7 = '7D',
  D30 = '30D',
  D90 = '90D',
  M12 = '12M',
  CUSTOM = 'CUSTOM',
}

export enum AdminHomeCompareDto {
  PREVIOUS = 'PREVIOUS',
  YOY = 'YOY',
  NONE = 'NONE',
}

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
