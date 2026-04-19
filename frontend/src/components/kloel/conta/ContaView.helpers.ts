// Pure helpers extracted from ContaView.tsx to reduce cyclomatic complexity.
// No JSX, no React — these are data-shape transforms only.

// BrasilAPI CNPJ response subset used for auto-fill.
export interface BrasilApiCnpjResponse {
  razao_social?: string;
  nome_fantasia?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  qsa?: Array<{ nome_socio?: string; cnpj_cpf_do_socio?: string }>;
}

// ViaCEP response subset used for address auto-fill.
export interface ViaCepResponse {
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
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
