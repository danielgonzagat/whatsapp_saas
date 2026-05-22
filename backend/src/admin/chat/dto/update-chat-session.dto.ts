import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateChatSessionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;
}
