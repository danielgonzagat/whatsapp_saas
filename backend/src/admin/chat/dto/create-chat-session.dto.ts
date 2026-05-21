import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateChatSessionDto {
  @IsString()
  workspaceId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}
