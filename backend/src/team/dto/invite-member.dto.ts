import { IsEmail, IsIn, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class InviteMemberDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsIn(['ADMIN', 'MEMBER', 'VIEWER'])
  role: string;
}

export class AcceptInviteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  token: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsString()
  @MinLength(8, { message: 'A senha deve ter pelo menos 8 caracteres' })
  @MaxLength(255)
  password: string;
}
