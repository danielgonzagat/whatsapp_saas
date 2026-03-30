import { IsString, IsOptional, IsEmail } from 'class-validator';
export class CreateContactDto {
  @IsOptional() @IsString() workspaceId?: string;
  @IsString() name: string;
  @IsString() phone: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() source?: string;
}
