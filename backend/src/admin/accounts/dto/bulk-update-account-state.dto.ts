import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';
import { UpdateAccountStateDto } from './update-account-state.dto';

/** Bulk update account state dto. */
export class BulkUpdateAccountStateDto extends UpdateAccountStateDto {
  /** Workspace ids property. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  workspaceIds!: string[];
}
