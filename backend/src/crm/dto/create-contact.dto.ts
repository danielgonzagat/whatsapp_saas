import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
/** Create contact dto. */
export class CreateContactDto {
  @IsOptional() @IsString() @MaxLength(255) workspaceId?: string;
  @IsString() @MaxLength(255) name: string;
  @IsString() @MaxLength(255) phone: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(255) source?: string;
}
