import type { Metadata } from 'next';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://kloel.com').replace(/\/+$/, '');
const LEGAL_LAST_UPDATED = process.env.NEXT_PUBLIC_LEGAL_LAST_UPDATED || '2026-04-19';
const LEGAL_COMPANY = process.env.NEXT_PUBLIC_LEGAL_COMPANY || 'Kloel Tecnologia LTDA';

export const legalConstants = {
  siteUrl: SITE_URL,
  lastUpdated: LEGAL_LAST_UPDATED,
  company: {
    legalName: LEGAL_COMPANY,
    tradeName: 'Kloel Tecnologia',
    cnpj: '66.303.607/0001-59',
    emailDpo: 'privacy@kloel.com',
    emailSupport: 'ajuda@kloel.com',
    emailGeneral: 'ajuda@kloel.com',
    addressLine1: 'Alameda Carajás, s/n, Quadra 5, Lote 11',
    addressLine2: 'Residencial Aldeia das Thermas, Caldas Novas/GO, CEP 75.694-720, Brasil',
  },
  urls: {
    home: SITE_URL,
    privacy: `${SITE_URL}/privacy`,
    privacyEn: `${SITE_URL}/privacy/en`,
    terms: `${SITE_URL}/terms`,
    termsEn: `${SITE_URL}/terms/en`,
    dataDeletion: `${SITE_URL}/data-deletion`,
    dataDeletionEn: `${SITE_URL}/data-deletion/en`,
    cookies: `${SITE_URL}/cookies`,
    facebookDeletion: 'https://app.kloel.com/api/auth/facebook/data-deletion',
    facebookDeauthorize: 'https://app.kloel.com/api/auth/facebook/deauthorize',
    facebookCallback: 'https://app.kloel.com/api/auth/callback/facebook',
    googleRisc: 'https://app.kloel.com/api/auth/google/risc-events',
  },
} as const;

export const legalContentTables = {
  thirdParties: [
    [
      'Railway',
      'Infraestrutura de backend e serviços de aplicação',
      'US/EU',
      'Execução de contrato e cláusulas contratuais padrão',
    ],
    [
      'Vercel',
      'Hospedagem do frontend, edge delivery e deploy previews',
      'US',
      'Execução de contrato e cláusulas contratuais padrão',
    ],
    [
      'Cloudflare R2',
      'Armazenamento de arquivos e ativos',
      'Global',
      'Execução de contrato e medidas contratuais adequadas',
    ],
    [
      'Resend',
      'Envio de emails transacionais',
      'US',
      'Execução de contrato e cláusulas contratuais padrão',
    ],
    [
      'Sentry',
      'Monitoramento de erros e incidentes',
      'US',
      'Legítimo interesse e cláusulas contratuais padrão',
    ],
    [
      'Asaas',
      'Processamento de pagamentos no Brasil',
      'BR',
      'Execução de contrato e obrigação regulatória',
    ],
    [
      'Stripe',
      'Pagamentos internacionais e métodos acelerados',
      'US',
      'Execução de contrato e cláusulas contratuais padrão',
    ],
    [
      'OpenAI',
      'Processamento de linguagem natural e automações assistidas por IA',
      'US',
      'Execução de contrato e cláusulas contratuais padrão',
    ],
    [
      'Anthropic',
      'Processamento complementar de IA e classificação de contexto',
      'US',
      'Execução de contrato e cláusulas contratuais padrão',
    ],
  ],
  retention: [
    [
      'Conta, perfil e autenticação',
      'Durante a conta ativa e até 30 dias após solicitação de exclusão',
      'Recuperação de conta, segurança e suporte',
    ],
    [
      'Logs de segurança e acesso',
      '6 meses',
      'Marco Civil da Internet, resposta a incidentes e prevenção à fraude',
    ],
    [
      'Dados financeiros, fiscais e comprovantes',
      '5 anos ou prazo legal superior aplicável',
      'Obrigações tributárias, contábeis e de auditoria',
    ],
    [
      'Conteúdo operacional de workspace e automações',
      'Enquanto houver contrato vigente ou instrução do cliente-controlador',
      'Execução do serviço',
    ],
    [
      'Dados importados de Google/Meta para autenticação',
      'Enquanto a conexão estiver ativa ou até revogação/exclusão',
      'Autenticação, personalização e operação da integração',
    ],
    [
      'Dados de checkout social e recuperação',
      'Até 180 dias após captura ou até conversão/exclusão',
      'Otimização de conversão e prevenção à fraude',
    ],
  ],
  legalBases: [
    [
      'Operação do serviço SaaS',
      'Cadastro, autenticação, gerenciamento de workspace e entrega do produto',
      'Execução de contrato, art. 7º, V, LGPD / art. 6(1)(b) GDPR',
    ],
    [
      'Comunicações transacionais',
      'Alertas de segurança, faturamento, onboarding e suporte',
      'Legítimo interesse, art. 7º, IX, LGPD / art. 6(1)(f) GDPR',
    ],
    [
      'Marketing e campanhas opcionais',
      'Newsletters, convites e materiais promocionais',
      'Consentimento, art. 7º, I, LGPD / art. 6(1)(a) GDPR',
    ],
    [
      'Segurança e antifraude',
      'Monitoramento, trilhas de auditoria, rate limiting e resposta a incidentes',
      'Legítimo interesse e obrigação legal',
    ],
    [
      'Compliance regulatório',
      'Atendimento a ordens legais, fiscalizações e retenções obrigatórias',
      'Obrigação legal ou regulatória, art. 7º, II, LGPD / art. 6(1)(c) GDPR',
    ],
  ],
  googleScopes: [
    [
      'openid',
      'Google account ID',
      'Identificar a conta da pessoa usuária na Kloel',
      'Hash/identificador interno com criptografia em repouso',
    ],
    [
      'email',
      'Endereço de email',
      'Login, comunicações transacionais e prevenção a contas duplicadas',
      'Criptografado em repouso',
    ],
    [
      'profile',
      'Nome, foto de perfil e idioma',
      'Personalização da interface e identificação visual da conta',
      'Cache operacional com retenção de até 30 dias após revogação',
    ],
    [
      'https://www.googleapis.com/auth/user.phonenumbers.read',
      'Telefone principal da Conta Google',
      'Preenchimento acelerado de checkout e atualização de lead, apenas quando a feature estiver habilitada e houver consentimento separado',
      'Criptografado em repouso e armazenado apenas pelo tempo necessário para o checkout',
    ],
    [
      'https://www.googleapis.com/auth/user.addresses.read',
      'Endereço postal associado à Conta Google',
      'Preenchimento acelerado de checkout, apenas quando a feature estiver habilitada e houver consentimento separado',
      'Criptografado em repouso e armazenado apenas pelo tempo necessário para o checkout',
    ],
  ],
  metaPermissions: [
    ['email, public_profile', 'Autenticação da conta Kloel e personalização básica do perfil'],
    ['pages_show_list', 'Descobrir Pages elegíveis para conexão do cliente dentro da Kloel'],
    ['pages_manage_metadata', 'Assinar webhooks e administrar metadados da Page conectada'],
    ['pages_messaging', 'Enviar e receber mensagens do Messenger em nome do cliente'],
    ['instagram_basic', 'Ler identificadores básicos da conta Instagram profissional conectada'],
    ['instagram_manage_messages', 'Receber e responder mensagens do Instagram Direct'],
    ['instagram_manage_comments', 'Ler e responder comentários vinculados ao fluxo comercial'],
    [
      'instagram_content_publish',
      'Publicar conteúdo quando a funcionalidade estiver habilitada pelo cliente',
    ],
    ['business_management', 'Gerenciar Business Assets e Embedded Signup do cliente'],
    ['ads_management', 'Apoiar integrações de campanhas e ativos de mídia paga quando aplicável'],
    ['catalog_management', 'Gerenciar catálogos sincronizados usados em experiências comerciais'],
    ['whatsapp_business_management', 'Configurar ativos do WhatsApp Business do cliente'],
    [
      'whatsapp_business_messaging',
      'Enviar e receber mensagens do WhatsApp Cloud API em nome do cliente',
    ],
  ],
} as const;

export function formatLastUpdated(date = LEGAL_LAST_UPDATED, locale: 'pt-BR' | 'en-US' = 'pt-BR') {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00.000Z`));
}

export function buildLegalMetadata(input: {
  title: string;
  description: string;
  path: string;
  locale: 'pt_BR' | 'en_US';
}): Metadata {
  const canonical = `${SITE_URL}${input.path}`;
  return {
    title: input.title,
    description: input.description,
    alternates: {
      canonical,
    },
    openGraph: {
      title: input.title,
      description: input.description,
      type: 'article',
      url: canonical,
      siteName: 'Kloel',
      locale: input.locale,
    },
    twitter: {
      card: 'summary_large_image',
      title: input.title,
      description: input.description,
    },
  };
}
