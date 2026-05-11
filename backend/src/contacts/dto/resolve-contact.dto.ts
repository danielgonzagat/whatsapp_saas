import { IsOptional, IsString, IsBoolean, IsObject } from 'class-validator';

export class ResolveContactDto {
  @IsString()
  channel: string;

  @IsString()
  value: string;

  @IsString()
  workspaceId: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class LinkIdentifierDto {
  @IsString()
  channel: string;

  @IsString()
  value: string;

  @IsString()
  contactId: string;

  @IsString()
  workspaceId: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
