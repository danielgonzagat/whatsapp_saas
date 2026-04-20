import { IsString, MaxLength } from 'class-validator';

/** Google people profile dto. */
export class GooglePeopleProfileDto {
  @IsString()
  @MaxLength(4096)
  accessToken!: string;
}
