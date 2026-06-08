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

function inferPixKeyType(pixKey: string | null | undefined): string {
  const key = pixKey?.trim() ?? '';
  if (!key) {
    return '';
  }

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) {
    return 'EMAIL';
  }

  const digits = key.replace(/\D/g, '');
  if (/^\d{11}$/.test(digits) && /^[\d.-]+$/.test(key)) {
    return 'CPF';
  }
  if (/^\d{14}$/.test(digits) && /^[\d./-]+$/.test(key)) {
    return 'CNPJ';
  }

  const compactPhone = key.replace(/[\s().-]/g, '');
  if (/^\+\d{10,15}$/.test(compactPhone)) {
    return 'PHONE';
  }

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
    return 'RANDOM';
  }

  return '';
}

export function bankAccountToFormState(
  bankAccount: KycBankAccount,
  autoHolderName: string,
  autoHolderDoc: string,
) {
  const explicitPixKeyType = bankAccount.pixKeyType?.trim().toUpperCase() || '';

  return {
    bankName: bankAccount.bankName || '',
    bankCode: bankAccount.bankCode || '',
    agency: bankAccount.agency || '',
    account: bankAccount.account || '',
    accountType: bankAccount.accountType || 'CHECKING',
    pixKey: bankAccount.pixKey || '',
    pixKeyType: explicitPixKeyType || inferPixKeyType(bankAccount.pixKey),
    holderName: bankAccount.holderName || autoHolderName,
    holderDocument: bankAccount.holderDocument || autoHolderDoc,
  };
}
