import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateInstagramPostDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  imageUrl: string;

  @IsOptional()
  @IsString()
  @MaxLength(2200)
  caption?: string;
}
