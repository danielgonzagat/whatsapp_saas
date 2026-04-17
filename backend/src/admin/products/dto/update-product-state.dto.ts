import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum AdminProductStateAction {
  PAUSE = 'PAUSE',
  REACTIVATE = 'REACTIVATE',
}

export class UpdateProductStateDto {
  @IsEnum(AdminProductStateAction)
  action!: AdminProductStateAction;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
