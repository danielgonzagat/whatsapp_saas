import { colors } from '@/lib/design-tokens';

export const F = "var(--font-sora), 'Sora', sans-serif";
export const M = "var(--font-jetbrains), 'JetBrains Mono', monospace";
export const E = colors.ember.primary;
export const SURFACE = colors.background.surface;
export const ELEVATED = colors.background.elevated;
export const SUCCESS = colors.state.success;
export const THANOS_TITLE = 'Elas não escalam por você.';
export const SALES_DELAY_MS = 1400;

export const THANOS_STYLES = [
  '@keyframes thanosIn{from{opacity:0;transform:translate3d(0,8px,0)}to{opacity:1;transform:translate3d(0,0,0)}}',
  '@keyframes thanosIconHide{to{opacity:0}}',
  '.thanos-icons{position:absolute;inset:0;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:40px;pointer-events:none;contain:layout paint;transition:opacity .45s ease,transform .45s ease}',
  ".thanos-icons h2{margin:0;color:rgba(224,221,216,.75);font-family:var(--font-sora), 'Sora', sans-serif;font-size:clamp(18px,4.5vw,38px);font-weight:800;letter-spacing:0;text-align:center}",
  '.thanos-icons>div{display:grid;grid-template-columns:repeat(5,minmax(72px,1fr));gap:22px;width:min(100%,760px)}',
  '.thanos-icons span{display:grid;place-items:center;aspect-ratio:1;border-radius:16px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.06);box-shadow:0 14px 38px rgba(0,0,0,.2);will-change:transform,opacity;transform:translate3d(0,0,0)}',
  '.thanos-icons span:nth-child(odd){--x:-18px}.thanos-icons span:nth-child(even){--x:18px}.thanos-icons img{width:72%;height:72%;object-fit:contain;display:block;opacity:.68;filter:saturate(.88)}',
  '.thanos-icons--dusting span,.thanos-icons--exit span{visibility:hidden}.thanos-icons--exit{opacity:0;transform:translate3d(0,-6px,0)}',
  "html[data-visual-capture='true'] .thanos-sales-message{display:none}",
  '@media(max-width:640px){.thanos-icons{gap:28px}.thanos-icons>div{grid-template-columns:repeat(2,minmax(86px,1fr));gap:14px;max-width:260px}.thanos-icons span{border-radius:14px}.thanos-icons img{width:68%;height:68%}}',
  '@media(prefers-reduced-motion:reduce){.thanos-icons,.thanos-icons span,.thanos-reveal{animation:none;transition:none}.thanos-icons{display:none}}',
].join('\n');

export type ChannelKey = 'wa' | 'ig' | 'fb' | 'em' | 'sms' | 'tt';

export type SalesMessage = {
  ch: ChannelKey;
  f: 'l' | 'a' | '$';
  t: string;
};

export const SALES_CHANNELS: Record<ChannelKey, { n: string; c: string }> = {
  wa: { n: 'WhatsApp', c: E },
  ig: { n: 'Instagram', c: E },
  fb: { n: 'Messenger', c: E },
  em: { n: 'Email', c: E },
  sms: { n: 'SMS', c: E },
  tt: { n: 'TikTok', c: E },
};

export const SALES_FLOW: SalesMessage[] = [
  { ch: 'wa', f: 'l', t: 'Oi, vi o anúncio!' },
  { ch: 'ig', f: 'l', t: 'Amei o produto!' },
  { ch: 'wa', f: 'a', t: 'Olá! R$497 ou 12x.' },
  { ch: 'fb', f: 'l', t: 'Tem disponível?' },
  { ch: 'em', f: 'a', t: 'Julia, bônus expira - 30% OFF' },
  { ch: 'ig', f: 'a', t: 'Cupom INSTA20 = 20% OFF!' },
  { ch: 'sms', f: 'a', t: 'Carrinho aberto!' },
  { ch: 'tt', f: 'l', t: 'Vi no TikTok!' },
  { ch: 'fb', f: 'a', t: 'R$497, acesso vitalício.' },
  { ch: 'wa', f: 'l', t: 'Quero!' },
  { ch: 'tt', f: 'a', t: 'Últimas vagas!' },
  { ch: 'wa', f: 'a', t: 'pay.kloel.com/ck/abc' },
  { ch: 'ig', f: 'l', t: 'Me manda!' },
  { ch: 'ig', f: 'a', t: 'pay.kloel.com/ck/pedro' },
  { ch: 'wa', f: '$', t: 'R$397 Pix' },
  { ch: 'em', f: '$', t: 'R$347 Pix' },
  { ch: 'ig', f: '$', t: 'R$397 cartão' },
  { ch: 'fb', f: '$', t: 'R$497 Pix' },
  { ch: 'sms', f: '$', t: 'R$297 recuperado' },
  { ch: 'tt', f: '$', t: 'R$397 Pix' },
];

export const EMPTY_MESSAGES: Record<ChannelKey, SalesMessage[]> = {
  wa: [],
  ig: [],
  fb: [],
  em: [],
  sms: [],
  tt: [],
};
