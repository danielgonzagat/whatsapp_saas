import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateFiscalDto {
  @IsString() @IsIn(['PF', 'PJ']) type: string;
  @IsOptional() @IsString() @MaxLength(14) cpf?: string;
  @IsOptional() @IsString() @MaxLength(200) fullName?: string;
  @IsOptional() @IsString() @MaxLength(18) cnpj?: string;
  @IsOptional() @IsString() @MaxLength(200) razaoSocial?: string;
  @IsOptional() @IsString() @MaxLength(200) nomeFantasia?: string;
  @IsOptional() @IsString() @MaxLength(255) inscricaoEstadual?: string;
  @IsOptional() @IsString() @MaxLength(255) inscricaoMunicipal?: string;
  @IsOptional() @IsString() @MaxLength(14) responsavelCpf?: string;
  @IsOptional() @IsString() @MaxLength(200) responsavelNome?: string;
  @IsOptional() @IsString() @MaxLength(9) cep?: string;
  @IsOptional() @IsString() @MaxLength(200) street?: string;
  @IsOptional() @IsString() @MaxLength(20) number?: string;
  @IsOptional() @IsString() @MaxLength(200) complement?: string;
  @IsOptional() @IsString() @MaxLength(100) neighborhood?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(2) state?: string;
}
