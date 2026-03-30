/* ═══════════════════════════════════════════
   KLOEL CANVAS — Format & Category Data
   Single source of truth for all canvas formats
   ═══════════════════════════════════════════ */

export interface FormatItem {
  l: string;       // label
  s?: string;      // size display string
  m: string;       // mockup type
  c: [string, string]; // gradient colors
  w: number;       // width px
  h: number;       // height px
  p?: string;      // platform name (for social filter)
}

export interface CategoryItem {
  id: string;
  label: string;
  icon: string;
}

export interface PillItem {
  id: string;
  l: string;
  c: [string, string];
}

/* ═══ CATEGORIES ═══ */
export const CATEGORIES: CategoryItem[] = [
  { id: 'para-voce', label: 'Para voce', icon: 'spark' },
  { id: 'redes-sociais', label: 'Redes sociais', icon: 'heart' },
  { id: 'anuncios', label: 'Anuncios', icon: 'target' },
  { id: 'videos', label: 'Videos', icon: 'video' },
  { id: 'editor-fotos', label: 'Editor de fotos', icon: 'camera' },
  { id: 'impressao', label: 'Impressao', icon: 'printer' },
  { id: 'docs', label: 'Docs', icon: 'file' },
  { id: 'quadros', label: 'Quadros', icon: 'board' },
  { id: 'planilhas', label: 'Planilhas', icon: 'table' },
  { id: 'sites', label: 'Sites', icon: 'globe' },
  { id: 'emails', label: 'E-mails', icon: 'mail' },
  { id: 'personalizado', label: 'Tamanho personalizado', icon: 'ruler' },
  { id: 'upload', label: 'Fazer upload', icon: 'upload' },
];

/* ═══ HOME PILLS ═══ */
export const HOME_PILLS: PillItem[] = [
  { id: 'post', l: 'Post', c: ['#833AB4', '#E1306C'] },
  { id: 'story', l: 'Story', c: ['#E1306C', '#F77737'] },
  { id: 'reels', l: 'Reels', c: ['#FE2C55', '#25F4EE'] },
  { id: 'fb', l: 'Facebook', c: ['#1877F2', '#4599FF'] },
  { id: 'yt', l: 'YouTube', c: ['#FF0000', '#CC0000'] },
  { id: 'li', l: 'LinkedIn', c: ['#0A66C2', '#0077B5'] },
  { id: 'tt', l: 'TikTok', c: ['#FE2C55', '#010101'] },
  { id: 'tw', l: 'Twitter/X', c: ['#1DA1F2', '#14171A'] },
  { id: 'wa', l: 'WhatsApp', c: ['#25D366', '#128C7E'] },
  { id: 'ad', l: 'Criativo', c: ['#E85D30', '#F2784B'] },
  { id: 'em', l: 'E-mail', c: ['#8B5CF6', '#A78BFA'] },
  { id: 'm', l: 'Mais', c: ['#6E6E73', '#3A3A3F'] },
];

/* ═══ SOCIAL PLATFORMS ═══ */
export const SOCIAL_PLATFORMS = [
  'Populares', 'Facebook', 'Instagram', 'LinkedIn',
  'Pinterest', 'TikTok', 'Twitter', 'YouTube',
];

/* ═══ FORMAT DATA BY CATEGORY ═══ */
export const FORMAT_DATA: Record<string, FormatItem[]> = {
  'para-voce': [
    { l: 'Apresentacao', s: '1920x1080', m: 'desktop-chart', c: ['#F59E0B', '#FBBF24'], w: 1920, h: 1080 },
    { l: 'Post Instagram (4:5)', s: '1080x1350', m: 'phone-post', c: ['#833AB4', '#E1306C'], w: 1080, h: 1350 },
    { l: 'Documento (A4)', s: '210x297mm', m: 'doc', c: ['#8B5CF6', '#A78BFA'], w: 2480, h: 3508 },
    { l: 'Story do Instagram', s: '1080x1920', m: 'phone-story', c: ['#E1306C', '#F77737'], w: 1080, h: 1920 },
    { l: 'Doc (digital)', s: 'Livre', m: 'desktop', c: ['#06B6D4', '#22D3EE'], w: 1280, h: 720 },
    { l: 'Panfleto (A4)', s: '210x297mm', m: 'doc', c: ['#8B5CF6', '#6D28D9'], w: 2480, h: 3508 },
    { l: 'Quadro branco', s: 'Infinito', m: 'desktop', c: ['#10B981', '#34D399'], w: 1920, h: 1080 },
    { l: 'Video horizontal', s: '1920x1080', m: 'desktop', c: ['#EC4899', '#F472B6'], w: 1920, h: 1080 },
  ],
  'redes-sociais': [
    { l: 'Post Instagram (4:5)', s: '1080x1350', m: 'phone-post', c: ['#833AB4', '#E1306C'], p: 'Instagram', w: 1080, h: 1350 },
    { l: 'Story do Instagram', s: '1080x1920', m: 'phone-story', c: ['#E1306C', '#F77737'], p: 'Instagram', w: 1080, h: 1920 },
    { l: 'Video Reels', s: '1080x1920', m: 'phone-story', c: ['#833AB4', '#F77737'], p: 'Instagram', w: 1080, h: 1920 },
    { l: 'Foto de perfil IG', s: '320x320', m: 'circle', c: ['#E1306C', '#833AB4'], p: 'Instagram', w: 320, h: 320 },
    { l: 'Post Facebook', s: '1200x628', m: 'desktop', c: ['#1877F2', '#4599FF'], p: 'Facebook', w: 1200, h: 628 },
    { l: 'Capa Facebook', s: '851x315', m: 'desktop', c: ['#1877F2', '#166FE5'], p: 'Facebook', w: 851, h: 315 },
    { l: 'Story Facebook', s: '1080x1920', m: 'phone-story', c: ['#1877F2', '#4599FF'], p: 'Facebook', w: 1080, h: 1920 },
    { l: 'Anuncio Facebook', s: '1200x628', m: 'desktop', c: ['#1877F2', '#4599FF'], p: 'Facebook', w: 1200, h: 628 },
    { l: 'Foto perfil FB', s: '320x320', m: 'circle', c: ['#1877F2', '#4599FF'], p: 'Facebook', w: 320, h: 320 },
    { l: 'Post LinkedIn', s: '1200x627', m: 'desktop', c: ['#0A66C2', '#0077B5'], p: 'LinkedIn', w: 1200, h: 627 },
    { l: 'Capa LinkedIn', s: '1584x396', m: 'desktop', c: ['#0A66C2', '#0077B5'], p: 'LinkedIn', w: 1584, h: 396 },
    { l: 'Foto perfil LI', s: '400x400', m: 'circle', c: ['#0A66C2', '#004182'], p: 'LinkedIn', w: 400, h: 400 },
    { l: 'Pin Pinterest', s: '1000x1500', m: 'phone-post', c: ['#E60023', '#BD081C'], p: 'Pinterest', w: 1000, h: 1500 },
    { l: 'Video TikTok', s: '1080x1920', m: 'phone-story', c: ['#FE2C55', '#25F4EE'], p: 'TikTok', w: 1080, h: 1920 },
    { l: 'Foto perfil TT', s: '200x200', m: 'circle', c: ['#FE2C55', '#25F4EE'], p: 'TikTok', w: 200, h: 200 },
    { l: 'Post Twitter/X', s: '1600x900', m: 'desktop', c: ['#1DA1F2', '#14171A'], p: 'Twitter', w: 1600, h: 900 },
    { l: 'Cabecalho X', s: '1500x500', m: 'desktop', c: ['#1DA1F2', '#0D8BD9'], p: 'Twitter', w: 1500, h: 500 },
    { l: 'Shorts YouTube', s: '1080x1920', m: 'phone-story', c: ['#FF0000', '#CC0000'], p: 'YouTube', w: 1080, h: 1920 },
    { l: 'Miniatura YT', s: '1280x720', m: 'desktop', c: ['#FF0000', '#CC0000'], p: 'YouTube', w: 1280, h: 720 },
    { l: 'Banner YT', s: '2560x1440', m: 'desktop', c: ['#FF0000', '#CC0000'], p: 'YouTube', w: 2560, h: 1440 },
    { l: 'Foto perfil YT', s: '800x800', m: 'circle', c: ['#FF0000', '#8B0000'], p: 'YouTube', w: 800, h: 800 },
  ],
  'videos': [
    { l: 'Video horizontal', s: '1920x1080', m: 'desktop', c: ['#EC4899', '#F472B6'], w: 1920, h: 1080 },
    { l: 'Video vertical', s: '1080x1920', m: 'phone-story', c: ['#8B5CF6', '#A78BFA'], w: 1080, h: 1920 },
    { l: 'Video TikTok', s: '1080x1920', m: 'phone-story', c: ['#FE2C55', '#25F4EE'], w: 1080, h: 1920 },
    { l: 'Video YouTube', s: '1920x1080', m: 'desktop', c: ['#FF0000', '#CC0000'], w: 1920, h: 1080 },
    { l: 'Video Reels', s: '1080x1920', m: 'phone-story', c: ['#833AB4', '#E1306C'], w: 1080, h: 1920 },
    { l: 'Video quadrado', s: '1080x1080', m: 'square', c: ['#6E6E73', '#9CA3AF'], w: 1080, h: 1080 },
  ],
  'impressao': [
    { l: 'Cartaz (A2)', s: '420x594mm', m: 'doc', c: ['#8B5CF6', '#6D28D9'], w: 4961, h: 7016 },
    { l: 'Panfleto (A4)', s: '210x297mm', m: 'doc', c: ['#8B5CF6', '#A78BFA'], w: 2480, h: 3508 },
    { l: 'Convite', s: '148x210mm', m: 'doc', c: ['#8B5CF6', '#7C3AED'], w: 1748, h: 2480 },
    { l: 'Cartao visita', s: '85x55mm', m: 'desktop', c: ['#8B5CF6', '#6D28D9'], w: 1004, h: 650 },
    { l: 'Folder', s: 'A4 paisagem', m: 'desktop', c: ['#8B5CF6', '#A78BFA'], w: 3508, h: 2480 },
  ],
  'docs': [
    { l: 'Doc (digital)', s: 'Livre', m: 'desktop', c: ['#06B6D4', '#22D3EE'], w: 1280, h: 720 },
    { l: 'Doc (A4)', s: '210x297mm', m: 'doc', c: ['#06B6D4', '#22D3EE'], w: 2480, h: 3508 },
    { l: 'Doc (A3)', s: '297x420mm', m: 'doc', c: ['#06B6D4', '#0891B2'], w: 3508, h: 4961 },
  ],
  'anuncios': [
    { l: 'Criativo Feed', s: '1080x1080', m: 'square', c: ['#E85D30', '#F2784B'], w: 1080, h: 1080 },
    { l: 'Criativo Story', s: '1080x1920', m: 'phone-story', c: ['#E85D30', '#F59E0B'], w: 1080, h: 1920 },
    { l: 'Banner Display', s: '1200x628', m: 'desktop', c: ['#E85D30', '#F2784B'], w: 1200, h: 628 },
  ],
  'quadros': [
    { l: 'Quadro branco', s: 'Infinito', m: 'desktop', c: ['#10B981', '#34D399'], w: 1920, h: 1080 },
  ],
  'planilhas': [
    { l: 'Planilha', s: 'Livre', m: 'desktop-chart', c: ['#3B82F6', '#60A5FA'], w: 1920, h: 1080 },
  ],
  'sites': [
    { l: 'Site', s: '1440xauto', m: 'desktop', c: ['#6366F1', '#818CF8'], w: 1440, h: 900 },
  ],
  'emails': [
    { l: 'E-mail', s: '600xauto', m: 'doc', c: ['#8B5CF6', '#A78BFA'], w: 600, h: 800 },
  ],
};

/* ═══ EDITOR SIDEBAR TABS ═══ */
export interface EditorTabItem {
  id: string;
  l: string;
  icon: string;
}

export const EDITOR_TABS: EditorTabItem[] = [
  { id: 'modelos', l: 'Modelos', icon: 'grid' },
  { id: 'elementos', l: 'Elementos', icon: 'apps' },
  { id: 'texto', l: 'Texto', icon: 'type' },
  { id: 'marca', l: 'Marca', icon: 'crown' },
  { id: 'uploads', l: 'Uploads', icon: 'upload' },
  { id: 'ferramentas', l: 'Ferramentas', icon: 'tool' },
  { id: 'projetos', l: 'Projetos', icon: 'folder' },
  { id: 'apps', l: 'Apps', icon: 'apps' },
  { id: 'midia', l: 'Midia Magica', icon: 'wand' },
  { id: 'fundo', l: 'Fundo', icon: 'bg' },
  { id: 'graficos', l: 'Graficos', icon: 'chart' },
];

/* ═══ QUICK ACTIONS ═══ */
export const QUICK_ACTIONS = [
  { l: 'Texto Magico', c: ['#10B981', '#34D399'] as [string, string] },
  { l: 'Removedor de Fundo', c: ['#8B5CF6', '#A78BFA'] as [string, string] },
  { l: 'Gerador de Fundo', c: ['#3B82F6', '#60A5FA'] as [string, string] },
];

/* ═══ RECENT DIMENSIONS ═══ */
export const RECENT_DIMENSIONS = [
  { w: 1080, h: 1080 },
  { w: 1080, h: 1920 },
  { w: 1200, h: 628 },
  { w: 1280, h: 720 },
  { w: 800, h: 800 },
  { w: 500, h: 500 },
];

/* ═══ TEMPLATE TAGS ═══ */
export const TEMPLATE_TAGS = [
  'Marketing', 'Lancamento', 'Desconto',
  'Depoimento', 'Antes/Depois', 'Produto',
];

/* ═══ EDITOR TEMPLATES ═══ */
export const EDITOR_TEMPLATES = [
  { l: 'Marketing Plan', c: ['#10B981', '#065F46'] as [string, string] },
  { l: 'Social Media', c: ['#8B5CF6', '#4C1D95'] as [string, string] },
  { l: 'Pitch Deck', c: ['#06B6D4', '#164E63'] as [string, string] },
  { l: 'Portfolio', c: ['#EC4899', '#831843'] as [string, string] },
  { l: 'Business', c: ['#F59E0B', '#78350F'] as [string, string] },
  { l: 'Creative Brief', c: ['#3B82F6', '#1E3A5F'] as [string, string] },
];

/* ═══ PRODUCT TEMPLATES (Polotno JSON) ═══ */
export interface ProductTemplate {
  id: string;
  name: string;
  cat: string;       // category tag
  fmt: string;       // format label (e.g. "post-ig", "story-ig")
  colors: [string, string]; // gradient for card preview
  w: number;
  h: number;
  json: object;      // Polotno-compatible store JSON
}

export const PRODUCT_TEMPLATES: ProductTemplate[] = [
  /* ── 1. Anuncio Produto Premium ── */
  {
    id: 'tpl-anuncio-produto-premium',
    name: 'Anuncio Produto Premium',
    cat: 'Produto',
    fmt: 'post-ig',
    colors: ['#E85D30', '#0A0A0C'],
    w: 1080,
    h: 1080,
    json: {
      width: 1080,
      height: 1080,
      pages: [
        {
          id: 'page-produto-premium',
          children: [
            {
              id: 'premium-bg',
              type: 'figure',
              x: 0,
              y: 0,
              width: 1080,
              height: 1080,
              fill: '#0A0A0C',
              name: 'Background',
            },
            {
              id: 'premium-headline',
              type: 'text',
              x: 100,
              y: 200,
              width: 880,
              height: 80,
              text: 'Serum Premium',
              fontSize: 48,
              fontWeight: 'bold',
              fontFamily: 'Sora',
              fill: '#E0DDD8',
              align: 'left',
              name: 'Headline',
            },
            {
              id: 'premium-subtitle',
              type: 'text',
              x: 100,
              y: 270,
              width: 880,
              height: 40,
              text: 'Regeneracao celular avancada',
              fontSize: 18,
              fontFamily: 'Sora',
              fill: '#6E6E73',
              align: 'left',
              name: 'Subtitle',
            },
            {
              id: 'premium-accent',
              type: 'figure',
              x: 100,
              y: 310,
              width: 200,
              height: 4,
              fill: '#E85D30',
              name: 'Accent bar',
            },
            {
              id: 'premium-cta-bg',
              type: 'figure',
              x: 100,
              y: 885,
              width: 200,
              height: 44,
              fill: '#E85D30',
              cornerRadius: 4,
              name: 'CTA background',
            },
            {
              id: 'premium-cta',
              type: 'text',
              x: 100,
              y: 892,
              width: 200,
              height: 30,
              text: 'Comprar agora',
              fontSize: 14,
              fontWeight: 'bold',
              fontFamily: 'Sora',
              fill: '#0A0A0C',
              align: 'center',
              name: 'CTA',
            },
          ],
          background: '#0A0A0C',
        },
      ],
    },
  },

  /* ── 2. Anuncio Peptideo Bioativo ── */
  {
    id: 'tpl-anuncio-peptideo-bioativo',
    name: 'Anuncio Peptideo Bioativo',
    cat: 'Produto',
    fmt: 'post-ig',
    colors: ['#E85D30', '#111113'],
    w: 1080,
    h: 1080,
    json: {
      width: 1080,
      height: 1080,
      pages: [
        {
          id: 'page-peptideo',
          children: [
            {
              id: 'peptideo-bg',
              type: 'figure',
              x: 0,
              y: 0,
              width: 1080,
              height: 1080,
              fill: '#0A0A0C',
              name: 'Background',
            },
            {
              id: 'peptideo-headline',
              type: 'text',
              x: 100,
              y: 200,
              width: 880,
              height: 80,
              text: 'Peptideo Bioativo',
              fontSize: 48,
              fontWeight: 'bold',
              fontFamily: 'Sora',
              fill: '#E0DDD8',
              align: 'left',
              name: 'Headline',
            },
            {
              id: 'peptideo-subtitle',
              type: 'text',
              x: 100,
              y: 270,
              width: 880,
              height: 40,
              text: 'Reparacao e Rejuvenescimento',
              fontSize: 18,
              fontFamily: 'Sora',
              fill: '#6E6E73',
              align: 'left',
              name: 'Subtitle',
            },
            {
              id: 'peptideo-accent',
              type: 'figure',
              x: 100,
              y: 310,
              width: 200,
              height: 4,
              fill: '#E85D30',
              name: 'Accent bar',
            },
            {
              id: 'peptideo-cta-bg',
              type: 'figure',
              x: 100,
              y: 885,
              width: 200,
              height: 44,
              fill: '#E85D30',
              cornerRadius: 4,
              name: 'CTA background',
            },
            {
              id: 'peptideo-cta',
              type: 'text',
              x: 100,
              y: 892,
              width: 200,
              height: 30,
              text: 'Comprar agora',
              fontSize: 14,
              fontWeight: 'bold',
              fontFamily: 'Sora',
              fill: '#0A0A0C',
              align: 'center',
              name: 'CTA',
            },
          ],
          background: '#0A0A0C',
        },
      ],
    },
  },

  /* ── 3. Prova Social (Story) ── */
  {
    id: 'tpl-prova-social',
    name: 'Prova Social',
    cat: 'Depoimento',
    fmt: 'story-ig',
    colors: ['#E85D30', '#1C1C1F'],
    w: 1080,
    h: 1920,
    json: {
      width: 1080,
      height: 1920,
      pages: [
        {
          id: 'page-prova',
          children: [
            {
              id: 'prova-bg',
              type: 'figure',
              x: 0,
              y: 0,
              width: 1080,
              height: 1920,
              fill: '#0A0A0C',
              name: 'Background',
            },
            {
              id: 'prova-quote',
              type: 'text',
              x: 100,
              y: 200,
              width: 120,
              height: 120,
              text: '\u201C',
              fontSize: 120,
              fontFamily: 'Sora',
              fill: '#E85D30',
              align: 'left',
              name: 'Quote mark',
            },
            {
              id: 'prova-testimonial',
              type: 'text',
              x: 100,
              y: 300,
              width: 880,
              height: 260,
              text: 'Escreva o depoimento do cliente aqui. Resultados visiveis em poucas semanas de uso.',
              fontSize: 20,
              fontFamily: 'Sora',
              fill: '#E0DDD8',
              lineHeight: 1.6,
              align: 'left',
              name: 'Testimonial',
            },
            {
              id: 'prova-client',
              type: 'text',
              x: 100,
              y: 600,
              width: 880,
              height: 30,
              text: '— Nome da Cliente',
              fontSize: 14,
              fontFamily: 'Sora',
              fill: '#6E6E73',
              align: 'left',
              name: 'Client name',
            },
            {
              id: 'prova-star1',
              type: 'text',
              x: 100,
              y: 640,
              width: 200,
              height: 30,
              text: '\u2605 \u2605 \u2605 \u2605 \u2605',
              fontSize: 18,
              fontFamily: 'Sora',
              fill: '#E85D30',
              align: 'left',
              name: 'Rating stars',
            },
            {
              id: 'prova-logo',
              type: 'text',
              x: 100,
              y: 1800,
              width: 200,
              height: 24,
              text: 'KLOEL',
              fontSize: 10,
              fontWeight: 'bold',
              fontFamily: 'Sora',
              fill: '#3A3A3F',
              letterSpacing: 4,
              align: 'left',
              name: 'Logo',
            },
          ],
          background: '#0A0A0C',
        },
      ],
    },
  },

  /* ── 4. Antes e Depois ── */
  {
    id: 'tpl-antes-depois',
    name: 'Antes e Depois',
    cat: 'Antes/Depois',
    fmt: 'post-ig',
    colors: ['#E85D30', '#0A0A0C'],
    w: 1080,
    h: 1080,
    json: {
      width: 1080,
      height: 1080,
      pages: [
        {
          id: 'page-antesdepois',
          children: [
            {
              id: 'ad-bg',
              type: 'figure',
              x: 0,
              y: 0,
              width: 1080,
              height: 1080,
              fill: '#0A0A0C',
              name: 'Background',
            },
            {
              id: 'ad-placeholder-left',
              type: 'figure',
              x: 0,
              y: 80,
              width: 530,
              height: 1000,
              fill: '#111113',
              name: 'Image placeholder left',
            },
            {
              id: 'ad-placeholder-right',
              type: 'figure',
              x: 550,
              y: 80,
              width: 530,
              height: 1000,
              fill: '#111113',
              name: 'Image placeholder right',
            },
            {
              id: 'ad-divider',
              type: 'figure',
              x: 537,
              y: 0,
              width: 6,
              height: 1080,
              fill: '#E85D30',
              name: 'Center divider',
            },
            {
              id: 'ad-label-antes',
              type: 'text',
              x: 200,
              y: 50,
              width: 160,
              height: 30,
              text: 'ANTES',
              fontSize: 16,
              fontWeight: 'bold',
              fontFamily: 'Sora',
              fill: '#E0DDD8',
              letterSpacing: 3,
              align: 'center',
              name: 'Label ANTES',
            },
            {
              id: 'ad-label-depois',
              type: 'text',
              x: 700,
              y: 50,
              width: 160,
              height: 30,
              text: 'DEPOIS',
              fontSize: 16,
              fontWeight: 'bold',
              fontFamily: 'Sora',
              fill: '#E0DDD8',
              letterSpacing: 3,
              align: 'center',
              name: 'Label DEPOIS',
            },
          ],
          background: '#0A0A0C',
        },
      ],
    },
  },

  /* ── 5. Mockup Frasco ── */
  {
    id: 'tpl-mockup-frasco',
    name: 'Mockup Frasco',
    cat: 'Produto',
    fmt: 'post-ig',
    colors: ['#E85D30', '#111113'],
    w: 1080,
    h: 1080,
    json: {
      width: 1080,
      height: 1080,
      pages: [
        {
          id: 'page-mockup',
          children: [
            {
              id: 'mockup-bg',
              type: 'figure',
              x: 0,
              y: 0,
              width: 1080,
              height: 1080,
              fill: '#0A0A0C',
              name: 'Background',
            },
            {
              id: 'mockup-gradient-overlay',
              type: 'figure',
              x: 0,
              y: 0,
              width: 1080,
              height: 1080,
              fill: '#111113',
              opacity: 0.5,
              name: 'Gradient overlay',
            },
            {
              id: 'mockup-product-name',
              type: 'text',
              x: 240,
              y: 150,
              width: 600,
              height: 60,
              text: 'Nome do Produto',
              fontSize: 36,
              fontWeight: 'bold',
              fontFamily: 'Sora',
              fill: '#E0DDD8',
              align: 'center',
              name: 'Product name',
            },
            {
              id: 'mockup-image-placeholder',
              type: 'figure',
              x: 340,
              y: 250,
              width: 400,
              height: 600,
              fill: '#1C1C1F',
              cornerRadius: 8,
              name: 'Product image placeholder',
            },
            {
              id: 'mockup-feature1',
              type: 'text',
              x: 100,
              y: 900,
              width: 880,
              height: 24,
              text: '\u2022  Ingrediente ativo de alta performance',
              fontSize: 13,
              fontFamily: 'Sora',
              fill: '#6E6E73',
              align: 'left',
              name: 'Feature 1',
            },
            {
              id: 'mockup-feature2',
              type: 'text',
              x: 100,
              y: 930,
              width: 880,
              height: 24,
              text: '\u2022  Resultados clinicamente comprovados',
              fontSize: 13,
              fontFamily: 'Sora',
              fill: '#6E6E73',
              align: 'left',
              name: 'Feature 2',
            },
            {
              id: 'mockup-feature3',
              type: 'text',
              x: 100,
              y: 960,
              width: 880,
              height: 24,
              text: '\u2022  Tecnologia exclusiva KLOEL',
              fontSize: 13,
              fontFamily: 'Sora',
              fill: '#6E6E73',
              align: 'left',
              name: 'Feature 3',
            },
          ],
          background: '#0A0A0C',
        },
      ],
    },
  },
];

/* ═══ ELEMENT CATEGORIES ═══ */
export const ELEMENT_CATEGORIES = [
  { l: 'Formas', c: '#06B6D4' },
  { l: 'Fotos', c: '#EC4899' },
  { l: 'Videos', c: '#FF0000' },
  { l: '3D', c: '#8B5CF6' },
  { l: 'Graficos', c: '#F59E0B' },
  { l: 'Stickers', c: '#10B981' },
];

/* ═══ EDITOR TOOLS ═══ */
export const EDITOR_TOOLS = [
  { l: 'Enfeitar', c: ['#06B6D4', '#22D3EE'] as [string, string] },
  { l: 'Redimensionar', c: ['#E85D30', '#F2784B'] as [string, string] },
  { l: 'Fundo Magico', c: ['#8B5CF6', '#A78BFA'] as [string, string] },
  { l: 'Tradutor', c: ['#3B82F6', '#60A5FA'] as [string, string] },
  { l: 'Criar em lote', c: ['#10B981', '#34D399'] as [string, string] },
];
