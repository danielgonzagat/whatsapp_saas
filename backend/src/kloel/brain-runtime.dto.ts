import { IsArray, IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export type BrainSource =
  | 'chat'
  | 'dashboard'
  | 'vendas'
  | 'relatorios'
  | 'settings'
  | 'crm'
  | 'checkout'
  | 'system';

export interface BrainMessage {
  content: string;
  role: 'assistant' | 'system' | 'user';
}

export class BrainMessageDto implements BrainMessage {
  @IsIn(['assistant', 'system', 'user'])
  role: 'assistant' | 'system' | 'user';

  @IsString()
  @MaxLength(12000)
  content: string;
}

export class BrainDecideDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  intent?: string;

  @IsOptional()
  @IsIn(['chat', 'dashboard', 'vendas', 'relatorios', 'settings', 'crm', 'checkout', 'system'])
  source?: BrainSource;

  @IsOptional()
  @IsArray()
  messages?: BrainMessageDto[];

  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  contactId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;
}

export class BrainObserveDto {
  @IsOptional()
  @IsIn(['chat', 'dashboard', 'vendas', 'relatorios', 'settings', 'crm', 'checkout', 'system'])
  source?: BrainSource;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  question?: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}
