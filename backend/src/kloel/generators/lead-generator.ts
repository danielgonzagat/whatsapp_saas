import { createSeededRandom } from './random';

const CHANNELS = ['whatsapp', 'instagram', 'facebook', 'tiktok', 'email'] as const;
const PROFILES = ['novo', 'recorrente', 'alto_valor', 'sensivel_preco'] as const;

export interface GeneratedLead {
  channel: string;
  hour: number;
  id: string;
  optedOut: boolean;
  profile: string;
  score: number;
}

export function generateLeads(seed: string | number, count: number): GeneratedLead[] {
  const random = createSeededRandom(seed);
  return Array.from({ length: count }, (_, index) => ({
    channel: random.pick(CHANNELS),
    hour: random.int(0, 23),
    id: `lead-${index + 1}`,
    optedOut: random.bool(0.08),
    profile: random.pick(PROFILES),
    score: random.int(0, 100),
  }));
}
