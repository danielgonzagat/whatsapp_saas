import { IsOptional, IsString } from 'class-validator';

export class ExportRequestDto {
  @IsOptional()
  @IsString()
  workspaceId?: string;
}
