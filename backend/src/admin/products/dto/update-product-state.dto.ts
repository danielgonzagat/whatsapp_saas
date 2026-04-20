import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/** Admin product state action enum. */
export enum AdminProductStateAction {
  PAUSE = 'PAUSE',
  REACTIVATE = 'REACTIVATE',
}

/** Update product state dto. */
export class UpdateProductStateDto {
  @IsEnum(AdminProductStateAction)
  action!: AdminProductStateAction;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
