export const PACKAGE_TYPES = [
  'Envelope',
  'Caixa pequena (30cm)',
  'Caixa média (60cm)',
  'Caixa grande (100cm)',
  'Tubo',
  'Saco plástico',
  'Personalizada',
];
export const CARRIERS = [
  'Correios PAC',
  'Correios SEDEX',
  'Jadlog',
  'Loggi',
  'Total Express',
  'Azul Cargo',
  'Latam Cargo',
  'Sequoia',
  'Kangu',
  'Melhor Envio',
  'Transportadora própria',
];
export const REGIONS = ['Sul', 'Sudeste', 'Centro-Oeste', 'Nordeste', 'Norte'];
export const PRAZO_OPTIONS = [
  '1-2 dias',
  '2-4 dias',
  '3-5 dias',
  '5-7 dias',
  '7-10 dias',
  '10-15 dias',
  '15-20 dias',
  '20-30 dias',
  '30-45 dias',
  '45-60 dias',
];
export const OBS_OPTIONS = [
  'Entrega normal',
  'Pode haver atrasos em feriados',
  'Sujeito a condições climáticas',
  'Entrega via transportadora local',
  'Retirada disponível',
  'Prazo pode variar',
];
export const SHIP_FROM = [
  { v: 'my_address', l: 'Meu endereço' },
  { v: 'supplier', l: 'Fornecedor' },
  { v: 'distribution', l: 'Centro de distribuição' },
  { v: 'multiple', l: 'Múltiplos endereços' },
];

export const FAQ_QUESTIONS = [
  'O que acontece se eu não estiver em casa na hora da entrega?',
  'Posso alterar o endereço de entrega após a compra?',
  'Meu pedido atrasou, o que fazer?',
  'O produto chegou danificado, como proceder?',
  'Vocês entregam para todo o Brasil?',
  'Qual o prazo de entrega para minha região?',
  'O frete é grátis?',
  'Posso retirar o produto pessoalmente?',
  'Vocês enviam para fora do Brasil?',
  'Como embalam o produto?',
];
export const FAQ_ANSWERS: Record<number, string[]> = {
  0: [
    'Tentativa de reentrega no próximo dia útil',
    'Produto fica disponível para retirada na agência',
    'Entraremos em contato para reagendar',
  ],
  1: [
    'Sim, desde que o pedido não tenha sido despachado',
    'Somente antes do envio, via suporte',
    'Não é possível alterar após confirmação',
  ],
  2: [
    'Entre em contato pelo WhatsApp que verificamos',
    'Aguarde o prazo máximo e depois nos procure',
    'Verificaremos com a transportadora',
  ],
  3: [
    'Envie fotos pelo WhatsApp para iniciarmos a troca',
    'Recusa na entrega e solicite reenvio',
    'Abra reclamação e garantimos o reenvio',
  ],
  4: [
    'Sim, entregamos em todo território nacional',
    'Sim, exceto algumas áreas rurais remotas',
    'Consulte disponibilidade para sua região',
  ],
  5: [
    'Varia conforme a região, consulte no checkout',
    'O prazo estimado aparece após informar o CEP',
    'Entre 5-15 dias úteis dependendo da localidade',
  ],
  6: [
    'Sim, frete grátis para todo o Brasil',
    'Frete grátis para compras acima de R$ 200',
    'O frete é calculado no checkout',
  ],
  7: [
    'Não trabalhamos com retirada presencial',
    'Sim, em nosso escritório com agendamento',
    'Apenas envio pelos Correios/transportadora',
  ],
  8: [
    'No momento enviamos apenas para o Brasil',
    'Sim, consulte tarifas internacionais',
    'Apenas para países do Mercosul',
  ],
  9: [
    'Embalagem reforçada com plástico bolha',
    'Caixa de papelão com proteção interna',
    'Embalagem discreta e segura',
  ],
};
