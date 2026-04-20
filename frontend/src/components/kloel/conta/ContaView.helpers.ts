// Pure helpers extracted from ContaView.tsx to reduce cyclomatic complexity.
// No JSX, no React — these are data-shape transforms only.

// BrasilAPI CNPJ response subset used for auto-fill.
export interface BrasilApiCnpjResponse {
  /** Razao_social property. */
  razao_social?: string;
  /** Nome_fantasia property. */
  nome_fantasia?: string;
  /** Cep property. */
  cep?: string;
  /** Logradouro property. */
  logradouro?: string;
  /** Numero property. */
  numero?: string;
  /** Complemento property. */
  complemento?: string;
  /** Bairro property. */
  bairro?: string;
  /** Municipio property. */
  municipio?: string;
  /** Uf property. */
  uf?: string;
  /** Qsa property. */
  qsa?: Array<{ nome_socio?: string; cnpj_cpf_do_socio?: string }>;
}

// ViaCEP response subset used for address auto-fill.
export interface ViaCepResponse {
  /** Logradouro property. */
  logradouro?: string;
  /** Complemento property. */
  complemento?: string;
  /** Bairro property. */
  bairro?: string;
  /** Localidade property. */
  localidade?: string;
  /** Uf property. */
  uf?: string;
  /** Erro property. */
  erro?: boolean;
}

/**
 * Merge ViaCEP response onto an existing form state without overwriting
 * values the user already filled in. Preserves prev values when the API
 * response is missing a field.
 */
export function mergeCepIntoForm<
  T extends {
    rua: string;
    complemento: string;
    bairro: string;
    cidade: string;
    uf: string;
  },
>(prev: T, data: ViaCepResponse): T {
  return {
    ...prev,
    rua: data.logradouro || prev.rua,
    complemento: data.complemento || prev.complemento,
    bairro: data.bairro || prev.bairro,
    cidade: data.localidade || prev.cidade,
    uf: data.uf || prev.uf,
  };
}

/**
 * Merge BrasilAPI CNPJ response onto an existing fiscal form state without
 * overwriting values the user already filled in. Preserves prev values when
 * the API response is missing a field.
 */
export function mergeCnpjIntoForm<
  T extends {
    razaoSocial: string;
    nomeFantasia: string;
    cep: string;
    rua: string;
    numero: string;
    complemento: string;
    bairro: string;
    cidade: string;
    uf: string;
    responsavelNome: string;
    responsavelCpf: string;
  },
>(prev: T, data: BrasilApiCnpjResponse): T {
  return {
    ...prev,
    razaoSocial: data.razao_social || prev.razaoSocial,
    nomeFantasia: data.nome_fantasia || prev.nomeFantasia,
    cep: data.cep || prev.cep,
    rua: data.logradouro || prev.rua,
    numero: data.numero || prev.numero,
    complemento: data.complemento || prev.complemento,
    bairro: data.bairro || prev.bairro,
    cidade: data.municipio || prev.cidade,
    uf: data.uf || prev.uf,
    responsavelNome: data.qsa?.[0]?.nome_socio || prev.responsavelNome,
    responsavelCpf: data.qsa?.[0]?.cnpj_cpf_do_socio || prev.responsavelCpf,
  };
}
