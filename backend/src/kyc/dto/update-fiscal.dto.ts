import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** Update fiscal dto. */
export class UpdateFiscalDto {
  /** Type property. */
  @IsString() @IsIn(['PF', 'PJ']) type: string;
  /** Cpf property. */
  @IsOptional() @IsString() @MaxLength(14) cpf?: string;
  /** Full name property. */
  @IsOptional() @IsString() @MaxLength(200) fullName?: string;
  /** Cnpj property. */
  @IsOptional() @IsString() @MaxLength(18) cnpj?: string;
  /** Razao social property. */
  @IsOptional() @IsString() @MaxLength(200) razaoSocial?: string;
  /** Nome fantasia property. */
  @IsOptional() @IsString() @MaxLength(200) nomeFantasia?: string;
  /** Inscricao estadual property. */
  @IsOptional() @IsString() @MaxLength(255) inscricaoEstadual?: string;
  /** Inscricao municipal property. */
  @IsOptional() @IsString() @MaxLength(255) inscricaoMunicipal?: string;
  /** Responsavel cpf property. */
  @IsOptional() @IsString() @MaxLength(14) responsavelCpf?: string;
  /** Responsavel nome property. */
  @IsOptional() @IsString() @MaxLength(200) responsavelNome?: string;
  /** Cep property. */
  @IsOptional() @IsString() @MaxLength(9) cep?: string;
  /** Street property. */
  @IsOptional() @IsString() @MaxLength(200) street?: string;
  /** Number property. */
  @IsOptional() @IsString() @MaxLength(20) number?: string;
  /** Complement property. */
  @IsOptional() @IsString() @MaxLength(200) complement?: string;
  /** Neighborhood property. */
  @IsOptional() @IsString() @MaxLength(100) neighborhood?: string;
  /** City property. */
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  /** State property. */
  @IsOptional() @IsString() @MaxLength(2) state?: string;
}
