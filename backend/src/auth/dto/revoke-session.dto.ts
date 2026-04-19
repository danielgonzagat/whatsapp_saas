import { IsString, IsUUID } from 'class-validator';

export class RevokeSessionDto {
  @IsString()
  @IsUUID()
  sessionId: string;
}
