import { IsString, MaxLength } from 'class-validator';

/** Google people profile dto. */
export class GooglePeopleProfileDto {
  /** Access token property. */
  @IsString()
  @MaxLength(4096)
  accessToken!: string;
}
