import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
/** Create deal dto. */
export class CreateDealDto {
  @IsOptional() @IsString() @MaxLength(255) workspaceId?: string;
  @IsString() @MaxLength(255) title: string;
  @IsOptional() @IsString() @MaxLength(255) contactId?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) value?: number;
  @IsOptional() @IsString() @MaxLength(255) stageId?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
}
