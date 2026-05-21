/** Kloel chat capability type. */
export type KloelChatCapability = 'create_image' | 'create_site' | 'search_web';

/** Kloel chat attachment kind type. */
export type KloelChatAttachmentKind = 'image' | 'document' | 'audio';
/** Kloel chat attachment status type. */
export type KloelChatAttachmentStatus = 'uploading' | 'ready' | 'error';

/** Kloel chat attachment shape. */
export interface KloelChatAttachment {
  /** Id property. */
  id: string;
  /** Name property. */
  name: string;
  /** Size property. */
  size: number;
  /** Mime type property. */
  mimeType: string;
  /** Kind property. */
  kind: KloelChatAttachmentKind;
  /** Status property. */
  status: KloelChatAttachmentStatus;
  /** Url property. */
  url?: string | null;
  /** Preview url property. */
  previewUrl?: string | null;
  /** Error property. */
  error?: string | null;
}

/** Kloel linked product shape. */
export interface KloelLinkedProduct {
  /** Id property. */
  id: string;
  /** Source property. */
  source: 'owned' | 'affiliate';
  /** Name property. */
  name: string;
  /** Image url property. */
  imageUrl?: string | null;
  /** Status property. */
  status: 'published' | 'draft' | 'affiliate';
  /** Product id property. */
  productId?: string | null;
  /** Affiliate product id property. */
  affiliateProductId?: string | null;
  /** Subtitle property. */
  subtitle?: string | null;
}

/** Kloel chat request metadata shape. */
export interface KloelChatRequestMetadata {
  [key: string]: unknown;
  /** Client request id property. */
  clientRequestId?: string;
  /** Source property. */
  source?: string;
  /** Attachments property. */
  attachments?: Array<{
    id: string;
    name: string;
    size: number;
    mimeType: string;
    kind: KloelChatAttachmentKind;
    url?: string | null;
  }>;
  /** Linked product property. */
  linkedProduct?: KloelLinkedProduct | null;
  /** Capability property. */
  capability?: KloelChatCapability | null;
}

/** Kloel_chat_capability_labels. */
export const KLOEL_CHAT_CAPABILITY_LABELS: Record<KloelChatCapability, string> = {
  create_image: 'Criar imagem',
  create_site: 'Criar site',
  search_web: 'Buscar',
};

/** Kloel_chat_capability_placeholders. */
export const KLOEL_CHAT_CAPABILITY_PLACEHOLDERS: Record<KloelChatCapability, string> = {
  create_image: 'Descreva a imagem que deseja criar...',
  create_site: 'Descreva o site que deseja criar...',
  search_web: 'Buscar na Web...',
};

/** Kloel chat quick action shape. */
export interface KloelChatQuickAction {
  id: 'create-ad' | 'write-copy' | 'sales-strategy' | 'analyze-product' | 'create-page';
  label: string;
  prompt: string;
  icon: 'megaphone' | 'pen' | 'chart' | 'search' | 'layout';
}

/** Kloel_chat_quick_actions. */
export const KLOEL_CHAT_QUICK_ACTIONS: KloelChatQuickAction[] = [
  {
    id: 'create-ad',
    label: 'Criar anuncio',
    prompt: 'Crie uma campanha de anuncio para o produto com melhor potencial agora.',
    icon: 'megaphone',
  },
  {
    id: 'write-copy',
    label: 'Escrever copy',
    prompt:
      'Escreva uma copy de venda usando os produtos, provas e objeções atuais do meu negócio.',
    icon: 'pen',
  },
  {
    id: 'sales-strategy',
    label: 'Estrategia de venda',
    prompt: 'Analise o funil atual e proponha a próxima ação comercial com base nos dados reais.',
    icon: 'chart',
  },
  {
    id: 'analyze-product',
    label: 'Analisar produto',
    prompt: 'Analise meus produtos ativos e diga qual deles deve receber foco comercial agora.',
    icon: 'search',
  },
  {
    id: 'create-page',
    label: 'Criar pagina',
    prompt: 'Crie uma estrutura de pagina de venda para o produto com maior prioridade.',
    icon: 'layout',
  },
];
