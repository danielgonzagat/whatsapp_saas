import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ListConfigOverviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}
