import { IsString, MaxLength } from 'class-validator';

export class GooglePeopleProfileDto {
  @IsString()
  @MaxLength(4096)
  accessToken!: string;
}
