import { IsString, MaxLength } from 'class-validator';

/** Add custom domain dto. */
export class AddSiteDomainDto {
  /** Hostname (e.g. www.mysite.com). */
  @IsString()
  @MaxLength(255)
  hostname!: string;
}
