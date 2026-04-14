export interface BrazilianBank {
  code: number;
  name: string;
  fullName: string;
  ispb: string;
}

/** Top ~15 banks shown when the user opens the dropdown without typing */
export const POPULAR_BANK_CODES = new Set([
  1, 33, 77, 104, 212, 237, 260, 290, 323, 336, 341, 380, 422, 748, 756,
]);

/**
 * Brazilian banks registered with Banco Central (COMPE codes).
 * Source: BrasilAPI /api/banks/v1 — filtered to banks with code, sorted by code.
 * Last updated: 2026-03-28.
 */
export const BRAZILIAN_BANKS: BrazilianBank[] = [
  { code: 1, name: 'BCO DO BRASIL S.A.', fullName: 'Banco do Brasil S.A.', ispb: '00000000' },
  { code: 3, name: 'BCO DA AMAZONIA S.A.', fullName: 'Banco da Amazônia S.A.', ispb: '04902979' },
  {
    code: 4,
    name: 'BCO DO NORDESTE DO BRASIL S.A.',
    fullName: 'Banco do Nordeste do Brasil S.A.',
    ispb: '07237373',
  },
  {
    code: 10,
    name: 'CREDICOAMO',
    fullName: 'Credicoamo Crédito Rural Cooperativa',
    ispb: '81723108',
  },
  { code: 12, name: 'BCO INBURSA', fullName: 'Banco Inbursa S.A.', ispb: '04866275' },
  {
    code: 21,
    name: 'BANESTES S.A.',
    fullName: 'Banestes S.A. Banco do Estado do Espírito Santo',
    ispb: '28127603',
  },
  { code: 25, name: 'BCO VOTORANTIM S.A.', fullName: 'Banco Votorantim S.A.', ispb: '59588111' },
  { code: 33, name: 'SANTANDER', fullName: 'Banco Santander (Brasil) S.A.', ispb: '90400888' },
  { code: 36, name: 'BCO BBI S.A.', fullName: 'Banco Bradesco BBI S.A.', ispb: '06271464' },
  {
    code: 37,
    name: 'BCO DO ESTADO DO PA S.A.',
    fullName: 'Banco do Estado do Pará S.A.',
    ispb: '04913711',
  },
  {
    code: 41,
    name: 'BANRISUL',
    fullName: 'Banco do Estado do Rio Grande do Sul S.A.',
    ispb: '92702067',
  },
  {
    code: 47,
    name: 'BCO DO EST. DE SE S.A.',
    fullName: 'Banco do Estado de Sergipe S.A.',
    ispb: '13009717',
  },
  { code: 63, name: 'BRADESCARD', fullName: 'Banco Bradescard S.A.', ispb: '04184779' },
  { code: 65, name: 'BCO ANDBANK S.A.', fullName: 'Banco Andbank (Brasil) S.A.', ispb: '48795256' },
  {
    code: 69,
    name: 'CREFISA S.A.',
    fullName: 'Crefisa S.A. Crédito, Financiamento e Investimentos',
    ispb: '61033106',
  },
  {
    code: 70,
    name: 'BRB - BCO DE BRASILIA S.A.',
    fullName: 'BRB - Banco de Brasília S.A.',
    ispb: '00000208',
  },
  { code: 77, name: 'BCO INTER S.A.', fullName: 'Banco Inter S.A.', ispb: '00416968' },
  { code: 82, name: 'TOPÁZIO S.A.', fullName: 'Banco Topázio S.A.', ispb: '07679404' },
  {
    code: 84,
    name: 'UNIPRIME NORTE DO PARANÁ',
    fullName: 'Uniprime Norte do Paraná',
    ispb: '02398976',
  },
  {
    code: 85,
    name: 'COOPCENTRAL AILOS',
    fullName: 'Cooperativa Central de Crédito - Ailos',
    ispb: '05463212',
  },
  {
    code: 89,
    name: 'CCR REG MOGIANA',
    fullName: 'Cooperativa de Crédito Rural da Região da Mogiana',
    ispb: '62109566',
  },
  { code: 93, name: 'POLOCRED SCMEPP LTDA.', fullName: 'Pólocred SCMEPP Ltda.', ispb: '07945233' },
  { code: 94, name: 'BCO FINAXIS S.A.', fullName: 'Banco Finaxis S.A.', ispb: '11758741' },
  { code: 96, name: 'BCO B3 S.A.', fullName: 'Banco B3 S.A.', ispb: '00997185' },
  { code: 99, name: 'UNIPRIME CENTRAL', fullName: 'Uniprime Central Nacional', ispb: '03046391' },
  {
    code: 102,
    name: 'XP INVESTIMENTOS',
    fullName: 'XP Investimentos CCTVM S.A.',
    ispb: '02332886',
  },
  {
    code: 104,
    name: 'CAIXA ECONOMICA FEDERAL',
    fullName: 'Caixa Econômica Federal',
    ispb: '00360305',
  },
  { code: 107, name: 'BCO BOCOM BBM S.A.', fullName: 'Banco Bocom BBM S.A.', ispb: '15114366' },
  {
    code: 119,
    name: 'BCO WESTERN UNION',
    fullName: 'Banco Western Union do Brasil S.A.',
    ispb: '13720915',
  },
  { code: 120, name: 'BCO RODOBENS S.A.', fullName: 'Banco Rodobens S.A.', ispb: '33603457' },
  { code: 121, name: 'BCO AGIBANK S.A.', fullName: 'Banco Agibank S.A.', ispb: '10664513' },
  { code: 125, name: 'PLURAL S.A.', fullName: 'Plural S.A. Banco Múltiplo', ispb: '45246410' },
  {
    code: 133,
    name: 'CRESOL CONFEDERAÇÃO',
    fullName:
      'Confederação Nacional das Cooperativas Centrais de Crédito e Economia Familiar e Solidária - Cresol Confederação',
    ispb: '10398952',
  },
  {
    code: 136,
    name: 'CONF NAC COOP CENTRAIS UNICRED',
    fullName: 'Unicred do Brasil',
    ispb: '00315557',
  },
  {
    code: 174,
    name: 'PEFISA S.A.',
    fullName: 'Pefisa S.A. - Crédito, Financiamento e Investimento',
    ispb: '43180355',
  },
  { code: 197, name: 'STONE PAGAMENTOS S.A.', fullName: 'Stone Pagamentos S.A.', ispb: '16501555' },
  { code: 208, name: 'BCO BTG PACTUAL S.A.', fullName: 'Banco BTG Pactual S.A.', ispb: '30306294' },
  { code: 212, name: 'BCO ORIGINAL S.A.', fullName: 'Banco Original S.A.', ispb: '92894922' },
  { code: 218, name: 'BCO BS2 S.A.', fullName: 'Banco BS2 S.A.', ispb: '71027866' },
  { code: 237, name: 'BRADESCO S.A.', fullName: 'Banco Bradesco S.A.', ispb: '60746948' },
  { code: 246, name: 'BCO ABC BRASIL S.A.', fullName: 'Banco ABC Brasil S.A.', ispb: '28195667' },
  { code: 254, name: 'PARANA BCO S.A.', fullName: 'Paraná Banco S.A.', ispb: '14388334' },
  {
    code: 260,
    name: 'NU PAGAMENTOS S.A.',
    fullName: 'Nu Pagamentos S.A. (Nubank)',
    ispb: '18236120',
  },
  { code: 274, name: 'BMP SCMEPP LTDA', fullName: 'Money Plus SCMEPP Ltda', ispb: '11581339' },
  {
    code: 280,
    name: 'WILL FINANCEIRA S.A.',
    fullName: 'Avista S.A. Crédito, Financiamento e Investimento (Will Bank)',
    ispb: '23862762',
  },
  {
    code: 290,
    name: 'PAGSEGURO S.A.',
    fullName: 'PagSeguro Internet S.A. (PagBank)',
    ispb: '08561701',
  },
  { code: 318, name: 'BCO BMG S.A.', fullName: 'Banco BMG S.A.', ispb: '61186680' },
  {
    code: 323,
    name: 'MERCADO PAGO',
    fullName: 'Mercado Pago - Instituição de Pagamento',
    ispb: '10573521',
  },
  {
    code: 332,
    name: 'ACESSO SOLUÇÕES',
    fullName: 'Acesso Soluções de Pagamento S.A. (Will Bank)',
    ispb: '13140088',
  },
  { code: 336, name: 'BCO C6 S.A.', fullName: 'Banco C6 S.A.', ispb: '31872495' },
  { code: 341, name: 'ITAÚ UNIBANCO S.A.', fullName: 'Itaú Unibanco S.A.', ispb: '60701190' },
  { code: 376, name: 'BCO J.P. MORGAN S.A.', fullName: 'Banco J.P. Morgan S.A.', ispb: '33172537' },
  { code: 380, name: 'PICPAY', fullName: 'PicPay Serviços S.A.', ispb: '22896431' },
  {
    code: 389,
    name: 'BCO MERCANTIL DO BRASIL S.A.',
    fullName: 'Banco Mercantil do Brasil S.A.',
    ispb: '17184037',
  },
  {
    code: 399,
    name: 'KIRTON BANK S.A.',
    fullName: 'Kirton Bank S.A. - Banco Múltiplo',
    ispb: '01701201',
  },
  {
    code: 403,
    name: 'CORA SCD S.A.',
    fullName: 'Cora Sociedade de Crédito Direto S.A.',
    ispb: '37880206',
  },
  { code: 422, name: 'BCO SAFRA S.A.', fullName: 'Banco Safra S.A.', ispb: '58160789' },
  {
    code: 600,
    name: 'BCO LUSO BRASILEIRO S.A.',
    fullName: 'Banco Luso Brasileiro S.A.',
    ispb: '59118133',
  },
  {
    code: 604,
    name: 'BCO INDUSTRIAL DO BRASIL S.A.',
    fullName: 'Banco Industrial do Brasil S.A.',
    ispb: '31895683',
  },
  { code: 610, name: 'BCO VR S.A.', fullName: 'Banco VR S.A.', ispb: '78626983' },
  { code: 611, name: 'BCO PAULISTA S.A.', fullName: 'Banco Paulista S.A.', ispb: '61820817' },
  { code: 612, name: 'BCO GUANABARA S.A.', fullName: 'Banco Guanabara S.A.', ispb: '31880826' },
  { code: 613, name: 'BCO PECÚNIA S.A.', fullName: 'Banco Pecúnia S.A.', ispb: '60850229' },
  { code: 623, name: 'BCO PAN S.A.', fullName: 'Banco Pan S.A.', ispb: '59285411' },
  { code: 633, name: 'BCO RENDIMENTO S.A.', fullName: 'Banco Rendimento S.A.', ispb: '68900810' },
  { code: 637, name: 'BCO SOFISA S.A.', fullName: 'Banco Sofisa S.A.', ispb: '60889128' },
  { code: 643, name: 'BCO PINE S.A.', fullName: 'Banco Pine S.A.', ispb: '62144175' },
  {
    code: 652,
    name: 'ITAÚ UNIBANCO HOLDING S.A.',
    fullName: 'Itaú Unibanco Holding S.A.',
    ispb: '60872504',
  },
  { code: 653, name: 'BCO INDUSVAL S.A.', fullName: 'Banco Indusval S.A.', ispb: '61024352' },
  { code: 654, name: 'BCO DIGIMAIS S.A.', fullName: 'Banco Digimais S.A.', ispb: '92874270' },
  {
    code: 655,
    name: 'BCO VOTORANTIM S.A.',
    fullName: 'Banco Votorantim S.A. (Neon)',
    ispb: '59588111',
  },
  { code: 707, name: 'BCO DAYCOVAL S.A.', fullName: 'Banco Daycoval S.A.', ispb: '62232889' },
  { code: 739, name: 'BCO CETELEM S.A.', fullName: 'Banco Cetelem S.A.', ispb: '00558456' },
  {
    code: 741,
    name: 'BCO RIBEIRÃO PRETO S.A.',
    fullName: 'Banco Ribeirão Preto S.A.',
    ispb: '00517645',
  },
  { code: 743, name: 'BCO SEMEAR S.A.', fullName: 'Banco Semear S.A.', ispb: '00795423' },
  { code: 745, name: 'BCO CITIBANK S.A.', fullName: 'Banco Citibank S.A.', ispb: '33479023' },
  { code: 746, name: 'BCO MODAL S.A.', fullName: 'Banco Modal S.A.', ispb: '30723886' },
  { code: 748, name: 'SICREDI S.A.', fullName: 'Banco Cooperativo Sicredi S.A.', ispb: '01181521' },
  {
    code: 752,
    name: 'BCO BNP PARIBAS BRASIL S.A.',
    fullName: 'Banco BNP Paribas Brasil S.A.',
    ispb: '01522368',
  },
  {
    code: 755,
    name: 'BOFA MERRILL LYNCH',
    fullName: 'Bank of America Merrill Lynch Banco Múltiplo S.A.',
    ispb: '62073200',
  },
  {
    code: 756,
    name: 'SICOOB',
    fullName: 'Banco Cooperativo do Brasil S.A. (Sicoob)',
    ispb: '02038232',
  },
  {
    code: 757,
    name: 'BCO KEB HANA DO BRASIL S.A.',
    fullName: 'Banco KEB Hana do Brasil S.A.',
    ispb: '02318507',
  },
];

/** Format bank code with zero-fill to 3 digits */
export function formatBankCode(code: number): string {
  return String(code).padStart(3, '0');
}
