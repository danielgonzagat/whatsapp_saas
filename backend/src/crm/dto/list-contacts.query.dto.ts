import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ListContactsQueryDto {
  @IsOptional() @IsString() @MaxLength(255) workspaceId?: string;
  @IsOptional() @IsString() @MaxLength(10) page?: string;
  @IsOptional() @IsString() @MaxLength(10) limit?: string;
  @IsOptional() @IsString() @MaxLength(255) search?: string;
}
