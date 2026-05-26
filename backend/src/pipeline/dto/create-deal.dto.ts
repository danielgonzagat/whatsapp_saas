import { IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
/** Create deal dto. */
export class CreateDealDto {
  /** Workspace id property. */
  @IsOptional() @IsString() @MaxLength(255) workspaceId?: string;
  /** Title property. */
  @IsString() @MaxLength(255) title!: string;
  /** Contact id property. */
  @IsOptional() @IsString() @MaxLength(255) contactId?: string;
  /** Value property. */
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) value?: number;
  /** Stage id property. */
  @IsOptional() @IsString() @MaxLength(255) stageId?: string;
  /** Description property. */
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  /** Priority property (LOW | MEDIUM | HIGH; defaults to MEDIUM when omitted). */
  @IsOptional() @IsIn(['LOW', 'MEDIUM', 'HIGH']) priority?: string;
}
