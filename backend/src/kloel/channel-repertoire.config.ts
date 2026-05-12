export type ChannelKey = 'whatsapp' | 'instagram' | 'messenger' | 'facebook' | 'tiktok' | 'email';

export type ActionId =
  | 'send_text'
  | 'send_audio'
  | 'send_image'
  | 'send_video'
  | 'send_template'
  | 'send_document'
  | 'proactive_outbound'
  | 'broadcast'
  | 'transfer_to_human'
  | 'apply_discount'
  | 'schedule_followup'
  | 'create_payment_link';

export type ToneId = 'consultivo' | 'formal' | 'direto' | 'acolhedor' | 'coloquial';

export type FormatId = 'text' | 'audio' | 'image' | 'video' | 'document' | 'template' | 'html_rich';

export interface ChannelRepertoire {
  channel: ChannelKey;
  actions: ActionId[];
  tones: ToneId[];
  formats: FormatId[];
  proactiveOutboundAllowed: boolean;
  proactiveWindowHours: number | null;
  audioInboundOnly: boolean;
}

const ALL_TONES: ToneId[] = ['consultivo', 'formal', 'direto', 'acolhedor', 'coloquial'];

const TIKTOK_TONES: ToneId[] = ['consultivo', 'coloquial', 'direto'];

function tiktokOutboundApproved(): boolean {
  return String(process.env.TIKTOK_OUTBOUND_APPROVED || '').trim().toLowerCase() === 'true';
}

export const CHANNEL_REPERTOIRE: Record<ChannelKey, ChannelRepertoire> = {
  whatsapp: {
    channel: 'whatsapp',
    actions: [
      'send_text',
      'send_audio',
      'send_image',
      'send_video',
      'send_template',
      'send_document',
      'proactive_outbound',
      'broadcast',
      'transfer_to_human',
      'apply_discount',
      'schedule_followup',
      'create_payment_link',
    ],
    tones: ALL_TONES,
    formats: ['text', 'audio', 'image', 'video', 'document', 'template'],
    proactiveOutboundAllowed: true,
    proactiveWindowHours: null,
    audioInboundOnly: false,
  },
  instagram: {
    channel: 'instagram',
    actions: [
      'send_text',
      'send_audio',
      'send_image',
      'send_video',
      'proactive_outbound',
      'transfer_to_human',
      'apply_discount',
      'schedule_followup',
      'create_payment_link',
    ],
    tones: ALL_TONES,
    formats: ['text', 'audio', 'image', 'video'],
    proactiveOutboundAllowed: true,
    proactiveWindowHours: 24,
    audioInboundOnly: false,
  },
  messenger: {
    channel: 'messenger',
    actions: [
      'send_text',
      'send_audio',
      'send_image',
      'send_video',
      'send_template',
      'proactive_outbound',
      'transfer_to_human',
      'apply_discount',
      'schedule_followup',
      'create_payment_link',
    ],
    tones: ALL_TONES,
    formats: ['text', 'audio', 'image', 'video', 'template'],
    proactiveOutboundAllowed: true,
    proactiveWindowHours: 24,
    audioInboundOnly: false,
  },
  facebook: {
    channel: 'facebook',
    actions: [
      'send_text',
      'send_image',
      'send_video',
      'send_template',
      'proactive_outbound',
      'transfer_to_human',
      'apply_discount',
      'schedule_followup',
    ],
    tones: ALL_TONES,
    formats: ['text', 'image', 'video', 'template'],
    proactiveOutboundAllowed: true,
    proactiveWindowHours: 24,
    audioInboundOnly: false,
  },
  tiktok: {
    channel: 'tiktok',
    actions: [
      'send_text',
      'send_video',
      'transfer_to_human',
      'apply_discount',
      'schedule_followup',
      'create_payment_link',
    ],
    tones: TIKTOK_TONES,
    formats: ['text', 'video'],
    proactiveOutboundAllowed: tiktokOutboundApproved(),
    proactiveWindowHours: null,
    audioInboundOnly: true,
  },
  email: {
    channel: 'email',
    actions: [
      'send_text',
      'send_template',
      'proactive_outbound',
      'broadcast',
      'transfer_to_human',
      'apply_discount',
      'schedule_followup',
      'create_payment_link',
    ],
    tones: ALL_TONES,
    formats: ['text', 'html_rich'],
    proactiveOutboundAllowed: true,
    proactiveWindowHours: null,
    audioInboundOnly: false,
  },
};

function normalizeKey(channel: string): ChannelKey | null {
  const key = String(channel || '').trim().toLowerCase();
  if (key in CHANNEL_REPERTOIRE) return key as ChannelKey;
  return null;
}

export function repertoireFor(channel: string): ChannelRepertoire | null {
  const key = normalizeKey(channel);
  if (!key) return null;
  return CHANNEL_REPERTOIRE[key];
}

export function canChannelDoAction(channel: string, action: ActionId): boolean {
  const rep = repertoireFor(channel);
  if (!rep) return false;
  return rep.actions.includes(action);
}

export function allowedFormatsFor(channel: string): FormatId[] {
  const rep = repertoireFor(channel);
  if (!rep) return ['text'];
  return [...rep.formats];
}

export function allowedTonesFor(channel: string): ToneId[] {
  const rep = repertoireFor(channel);
  if (!rep) return ALL_TONES;
  return [...rep.tones];
}
