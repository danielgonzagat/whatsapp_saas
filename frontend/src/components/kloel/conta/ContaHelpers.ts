import type { KycBankAccount, KycFiscal } from './ContaTypes';

export function getErrorMessage(err: unknown): string | undefined {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'string') {
    return err;
  }
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as { message: unknown }).message;
    return typeof msg === 'string' ? msg : undefined;
  }
  return undefined;
}

export function cleanPayload<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const [k, v] of Object.entries(obj) as Array<[keyof T, T[keyof T]]>) {
    if (v !== '' && v !== undefined && v !== null) {
      result[k] = v;
    }
  }
  return result;
}

export function initialsFromName(name: string): string {
  return (name || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

export function fiscalToFormState(fiscal: KycFiscal) {
  return {
    cpf: fiscal.cpf || '',
    legalName: fiscal.fullName || '',
    cnpj: fiscal.cnpj || '',
    razaoSocial: fiscal.razaoSocial || '',
    nomeFantasia: fiscal.nomeFantasia || '',
    inscricaoEstadual: fiscal.inscricaoEstadual || '',
    inscricaoMunicipal: fiscal.inscricaoMunicipal || '',
    responsavelCpf: fiscal.responsavelCpf || '',
    responsavelNome: fiscal.responsavelNome || '',
    cep: fiscal.cep || '',
    rua: fiscal.street || '',
    numero: fiscal.number || '',
    complemento: fiscal.complement || '',
    bairro: fiscal.neighborhood || '',
    cidade: fiscal.city || '',
    uf: fiscal.state || '',
  };
}

export function bankAccountToFormState(
  bankAccount: KycBankAccount,
  autoHolderName: string,
  autoHolderDoc: string,
) {
  return {
    bankName: bankAccount.bankName || '',
    bankCode: bankAccount.bankCode || '',
    agency: bankAccount.agency || '',
    account: bankAccount.account || '',
    accountType: bankAccount.accountType || 'CHECKING',
    pixKey: bankAccount.pixKey || '',
    pixKeyType: bankAccount.pixKeyType || '',
    holderName: bankAccount.holderName || autoHolderName,
    holderDocument: bankAccount.holderDocument || autoHolderDoc,
  };
}
