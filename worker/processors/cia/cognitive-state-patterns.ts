// Top-level regex patterns used by cognitive-state.ts.
// Extracted to keep cognitive-state.ts under the 800-line ratchet while
// honoring Biome_lint_performance_useTopLevelRegex (no RegExp allocation
// per call).

export const PAGO_PAGUEI_COMPENSADO_RE = /(pago|paguei|compensado|confirmado)/i;
export const PIX_BOLETO_LINK_PAGAMEN_RE = /(pix|boleto|link|pagamento|pagar|cartao|cartão)/i;
export const QUERO_FECHAR_QUERO_PAGA_RE = /(quero fechar|quero pagar|manda o link|me cobra)/i;
export const PRECO_PRE_O_VALOR_CARO_RE = /(preco|preço|valor|caro|desconto|parcel)/i;
export const FUNCIONA_GARANTIA_SEGUR_RE = /(funciona|garantia|seguro|confi|resultado|verdade)/i;
export const PRAZO_DEMORA_ENTREGA_QU_RE = /(prazo|demora|entrega|quando|hoje ainda)/i;
export const REEMBOLSO_CANCEL_DEVOLU_RE = /(reembolso|cancel|devolu)/i;
export const MEDIC_RECEITA_LAUDO_REA_RE = /(medic|receita|laudo|reacao|reação|dor forte)/i;
export const OBRIGAD_VALEU_PERFEITO_RE = /(obrigad|valeu|perfeito|gostei|entendi)/i;
export const QUERO_VOU_FECHAR_ME_MAN_RE = /(quero|vou fechar|me manda|pode ser)/i;
export const FUNCIONA_GARANTIA_DEPOI_RE = /(funciona|garantia|depoimento)/i;
export const ANSIOS_INSEGUR_MEDO_REC_RE = /(ansios|insegur|medo|receio)/i;
export const FRUSTR_CANSAD_RAIVA_PRO_RE =
  /(frustr|cansad|raiva|problema|erro|dificil|difícil|complicado)/i;
export const NAO_ENTENDI_N_O_ENTENDI_RE = /(nao entendi|não entendi|confuso|como assim|explica)/i;
export const PERFEITO_GOSTEI_AMEI_AN_RE = /(perfeito|gostei|amei|animad|valeu|obrigad)/i;
export const QUERO_FECHAR_MANDA_AGOR_RE = /(quero|fechar|manda|agora|partiu)/i;
export const NAO_N_O_CARO_DEMORA_DUV_RE = /(nao|não|caro|demora|duvida|dúvida)/i;
export const S_RE = /\s+/;
export const NAO_RESOLVEU_N_O_RESOLV_RE =
  /(nao resolveu|não resolveu|tentei de tudo|ja tentei|já tentei)/i;
export const COMO_FUNCIONA_COMPOSI_T_RE = /(como funciona|composi|tecnico|detalhe|explica melhor)/i;
export const PRECO_PRE_O_QUANTO_PRAZ_RE = /(preco|preço|quanto|prazo|agora)/i;

export const RX = {
  PAGO_PAGUEI_COMPENSADO_RE,
  PIX_BOLETO_LINK_PAGAMEN_RE,
  QUERO_FECHAR_QUERO_PAGA_RE,
  PRECO_PRE_O_VALOR_CARO_RE,
  FUNCIONA_GARANTIA_SEGUR_RE,
  PRAZO_DEMORA_ENTREGA_QU_RE,
  REEMBOLSO_CANCEL_DEVOLU_RE,
  MEDIC_RECEITA_LAUDO_REA_RE,
  OBRIGAD_VALEU_PERFEITO_RE,
  QUERO_VOU_FECHAR_ME_MAN_RE,
  FUNCIONA_GARANTIA_DEPOI_RE,
  ANSIOS_INSEGUR_MEDO_REC_RE,
  FRUSTR_CANSAD_RAIVA_PRO_RE,
  NAO_ENTENDI_N_O_ENTENDI_RE,
  PERFEITO_GOSTEI_AMEI_AN_RE,
  QUERO_FECHAR_MANDA_AGOR_RE,
  NAO_N_O_CARO_DEMORA_DUV_RE,
  S_RE,
  NAO_RESOLVEU_N_O_RESOLV_RE,
  COMO_FUNCIONA_COMPOSI_T_RE,
  PRECO_PRE_O_QUANTO_PRAZ_RE,
} as const;
