import { IsString, IsOptional, IsNumber } from 'class-validator';
export class CreateDealDto {
  @IsOptional() @IsString() workspaceId?: string;
  @IsString() title: string;
  @IsOptional() @IsString() contactId?: string;
  @IsOptional() @IsNumber() value?: number;
  @IsOptional() @IsString() stageId?: string;
  @IsOptional() @IsString() description?: string;
}
