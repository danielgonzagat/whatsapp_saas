/** Kloel chat capability type. */
export type KloelChatCapability = 'create_image' | 'create_site' | 'search_web';

/** Kloel chat attachment kind type. */
export type KloelChatAttachmentKind = 'image' | 'document' | 'audio';
/** Kloel chat attachment status type. */
export type KloelChatAttachmentStatus = 'uploading' | 'ready' | 'error';

/** Kloel chat attachment shape. */
export interface KloelChatAttachment {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  kind: KloelChatAttachmentKind;
  status: KloelChatAttachmentStatus;
  url?: string | null;
  previewUrl?: string | null;
  error?: string | null;
}

/** Kloel linked product shape. */
export interface KloelLinkedProduct {
  id: string;
  source: 'owned' | 'affiliate';
  name: string;
  imageUrl?: string | null;
  status: 'published' | 'draft' | 'affiliate';
  productId?: string | null;
  affiliateProductId?: string | null;
  subtitle?: string | null;
}

/** Kloel chat request metadata shape. */
export interface KloelChatRequestMetadata {
  [key: string]: unknown;
  clientRequestId?: string;
  source?: string;
  attachments?: Array<{
    id: string;
    name: string;
    size: number;
    mimeType: string;
    kind: KloelChatAttachmentKind;
    url?: string | null;
  }>;
  linkedProduct?: KloelLinkedProduct | null;
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

/** Kloel_chat_quick_actions. */
export const KLOEL_CHAT_QUICK_ACTIONS = [
  {
    id: 'create-ad',
    label: 'Criar Anúncio',
    prompt: 'Me ajude a criar um anúncio para ',
    icon: 'megaphone',
  },
  {
    id: 'write-copy',
    label: 'Escrever Copy',
    prompt: 'Escreva uma copy de vendas para ',
    icon: 'pen',
  },
  {
    id: 'sales-strategy',
    label: 'Estratégia de Vendas',
    prompt: 'Monte uma estratégia de vendas para ',
    icon: 'chart',
  },
  {
    id: 'analyze-product',
    label: 'Analisar Produto',
    prompt: 'Analise este produto e me diga como melhorar a oferta: ',
    icon: 'search',
  },
  {
    id: 'create-page',
    label: 'Criar Página',
    prompt: 'Crie a estrutura de uma página de vendas para ',
    icon: 'layout',
  },
] as const;
