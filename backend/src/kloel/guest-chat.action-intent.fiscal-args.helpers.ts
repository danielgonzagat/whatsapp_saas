// Wave 67 Phase 1 split — see docs/architecture/WAVE_60_GUEST_CHAT_ACTION_INTENT_DECOMP_PLAN.md.
export function extractFiscalArgs(msg: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  const cnpj = msg.match(/(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/);
  if (cnpj?.[1]) {
    args.cnpj = cnpj[1];
  }
  const cpf = msg.match(/(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/);
  if (cpf?.[1] && !cnpj) {
    args.cpf = cpf[1];
  }
  const fullName = msg.match(
    /(?:nome|raz[aã]o|respons[aá]vel)\s*:?\s*([A-Za-zÀ-ÿ\s]{5,60}?)(?:\s*(?:,|\.|CNPJ|CPF|cep|endereço|banco|$))/i,
  );
  if (fullName?.[1]) {
    args.businessName = fullName[1].trim();
  }
  const cep = msg.match(/(?:cep\s*:?\s*)(\d{5}-?\d{3})/i);
  if (cep?.[1]) {
    args.cep = cep[1];
  }
  const bank = msg.match(/(?:banco\s*:?\s*)(\d{3})/i);
  if (bank?.[1]) {
    args.bankCode = bank[1];
  }
  const ag = msg.match(/(?:ag[eê]ncia\s*:?\s*)(\d+)/i);
  if (ag?.[1]) {
    args.agency = ag[1];
  }
  const cc = msg.match(/(?:conta\s*:?\s*)(\d+[-\d]*)/i);
  if (cc?.[1]) {
    args.account = cc[1];
  }
  return args;
}
