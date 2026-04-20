import { IsEmail, IsIn, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/** Invite member dto. */
export class InviteMemberDto {
  /** Email property. */
  @IsEmail()
  email: string;

  /** Role property. */
  @IsString()
  @IsIn(['ADMIN', 'MEMBER', 'VIEWER'])
  role: string;
}

/** Accept invite dto. */
export class AcceptInviteDto {
  /** Token property. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  token: string;

  /** Name property. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  /** Password property. */
  @IsString()
  @MinLength(8, { message: 'A senha deve ter pelo menos 8 caracteres' })
  @MaxLength(255)
  password: string;
}
