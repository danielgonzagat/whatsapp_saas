
/* ═══════════════════════════════════════════
   KLOEL CANVAS — Format & Category Data
   Single source of truth for all canvas formats
   ═══════════════════════════════════════════ */

import { colors } from './design-tokens';
import { externalBrands } from './external-brand-tokens';
import { canvasPalette } from './canvas-palette-tokens';

export interface FormatItem {
  /** L property. */
  l: string; // label
  /** S property. */
  s?: string; // size display string
  /** M property. */
  m: string; // mockup type
  /** C property. */
  c: [string, string]; // gradient colors
  /** W property. */
  w: number; // width px
  /** H property. */
  h: number; // height px
  /** P property. */
  p?: string; // platform name (for social filter)
}

/** Category item shape. */
export interface CategoryItem {
  /** Id property. */
  id: string;
  /** Label property. */
  label: string;
  /** Icon property. */
  icon: string;
}

/** Pill item shape. */
export interface PillItem {
  /** Id property. */
  id: string;
  /** L property. */
  l: string;
  /** C property. */
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
  { id: 'post', l: 'Post', c: [externalBrands.instagramPurple, externalBrands.instagramPink] },
  { id: 'story', l: 'Story', c: [externalBrands.instagramPink, externalBrands.instagramOrange] },
  { id: 'reels', l: 'Reels', c: [externalBrands.tiktokPink, externalBrands.tiktokTeal] },
  { id: 'fb', l: 'Facebook', c: [externalBrands.facebook, externalBrands.fbBlueLight] },
  { id: 'yt', l: 'YouTube', c: [externalBrands.youtubeRed, externalBrands.youtubeDarkRed] },
  { id: 'li', l: 'LinkedIn', c: [externalBrands.linkedinBlue, externalBrands.linkedinDark] },
  { id: 'tt', l: 'TikTok', c: [externalBrands.tiktokPink, externalBrands.tiktokBlack] },
  { id: 'tw', l: 'Twitter/X', c: [externalBrands.twitterBlue, externalBrands.twitterDark] },
  { id: 'wa', l: 'WhatsApp', c: [externalBrands.whatsappGreen, externalBrands.whatsappDark] },
  { id: 'ad', l: 'Criativo', c: [colors.ember.primary, colors.canvas.accent] },
  { id: 'em', l: 'E-mail', c: [externalBrands.emailPurple, colors.semantic.purpleText] },
  { id: 'm', l: 'Mais', c: [colors.text.muted, colors.text.dim] },
];

/* ═══ SOCIAL PLATFORMS ═══ */
export const SOCIAL_PLATFORMS = [
  'Populares',
  'Facebook',
  'Instagram',
  'LinkedIn',
  'Pinterest',
  'TikTok',
  'Twitter',
  'YouTube',
];

/* ═══ FORMAT DATA BY CATEGORY ═══ */
export const FORMAT_DATA: Record<string, FormatItem[]> = {
  'para-voce': [
    {
      l: 'Apresentacao',
      s: '1920x1080',
      m: 'desktop-chart',
      c: [colors.semantic.warning, canvasPalette.amberLight],
      w: 1920,
      h: 1080,
    },
    {
      l: 'Post Instagram (4:5)',
      s: '1080x1350',
      m: 'phone-post',
      c: [externalBrands.instagramPurple, externalBrands.instagramPink],
      w: 1080,
      h: 1350,
    },
    { l: 'Documento (A4)', s: '210x297mm', m: 'doc', c: [externalBrands.emailPurple, colors.semantic.purpleText], w: 2480, h: 3508 },
    {
      l: 'Story do Instagram',
      s: '1080x1920',
      m: 'phone-story',
      c: [externalBrands.instagramPink, externalBrands.instagramOrange],
      w: 1080,
      h: 1920,
    },
    { l: 'Doc (digital)', s: 'Livre', m: 'desktop', c: [colors.canvas.cyan, canvasPalette.cyanLight], w: 1280, h: 720 },
    { l: 'Panfleto (A4)', s: '210x297mm', m: 'doc', c: [externalBrands.emailPurple, canvasPalette.violetDeep], w: 2480, h: 3508 },
    {
      l: 'Quadro branco',
      s: 'Infinito',
      m: 'desktop',
      c: [colors.semantic.success, canvasPalette.emeraldLight],
      w: 1920,
      h: 1080,
    },
    {
      l: 'Video horizontal',
      s: '1920x1080',
      m: 'desktop',
      c: [colors.canvas.pink, canvasPalette.pinkLight],
      w: 1920,
      h: 1080,
    },
  ],
  'redes-sociais': [
    {
      l: 'Post Instagram (4:5)',
      s: '1080x1350',
      m: 'phone-post',
      c: [externalBrands.instagramPurple, externalBrands.instagramPink],
      p: 'Instagram',
      w: 1080,
      h: 1350,
    },
    {
      l: 'Story do Instagram',
      s: '1080x1920',
      m: 'phone-story',
      c: [externalBrands.instagramPink, externalBrands.instagramOrange],
      p: 'Instagram',
      w: 1080,
      h: 1920,
    },
    {
      l: 'Video Reels',
      s: '1080x1920',
      m: 'phone-story',
      c: [externalBrands.instagramPurple, externalBrands.instagramOrange],
      p: 'Instagram',
      w: 1080,
      h: 1920,
    },
    {
      l: 'Foto de perfil IG',
      s: '320x320',
      m: 'circle',
      c: [externalBrands.instagramPink, externalBrands.instagramPurple],
      p: 'Instagram',
      w: 320,
      h: 320,
    },
    {
      l: 'Post Facebook',
      s: '1200x628',
      m: 'desktop',
      c: [externalBrands.facebook, externalBrands.fbBlueLight],
      p: 'Facebook',
      w: 1200,
      h: 628,
    },
    {
      l: 'Capa Facebook',
      s: '851x315',
      m: 'desktop',
      c: [externalBrands.facebook, externalBrands.fbBlueDark],
      p: 'Facebook',
      w: 851,
      h: 315,
    },
    {
      l: 'Story Facebook',
      s: '1080x1920',
      m: 'phone-story',
      c: [externalBrands.facebook, externalBrands.fbBlueLight],
      p: 'Facebook',
      w: 1080,
      h: 1920,
    },
    {
      l: 'Anuncio Facebook',
      s: '1200x628',
      m: 'desktop',
      c: [externalBrands.facebook, externalBrands.fbBlueLight],
      p: 'Facebook',
      w: 1200,
      h: 628,
    },
    {
      l: 'Foto perfil FB',
      s: '320x320',
      m: 'circle',
      c: [externalBrands.facebook, externalBrands.fbBlueLight],
      p: 'Facebook',
      w: 320,
      h: 320,
    },
    {
      l: 'Post LinkedIn',
      s: '1200x627',
      m: 'desktop',
      c: [externalBrands.linkedinBlue, externalBrands.linkedinDark],
      p: 'LinkedIn',
      w: 1200,
      h: 627,
    },
    {
      l: 'Capa LinkedIn',
      s: '1584x396',
      m: 'desktop',
      c: [externalBrands.linkedinBlue, externalBrands.linkedinDark],
      p: 'LinkedIn',
      w: 1584,
      h: 396,
    },
    {
      l: 'Foto perfil LI',
      s: '400x400',
      m: 'circle',
      c: [externalBrands.linkedinBlue, externalBrands.linkedinDarker],
      p: 'LinkedIn',
      w: 400,
      h: 400,
    },
    {
      l: 'Pin Pinterest',
      s: '1000x1500',
      m: 'phone-post',
      c: [externalBrands.pinterestRed, externalBrands.pinterestDarkRed],
      p: 'Pinterest',
      w: 1000,
      h: 1500,
    },
    {
      l: 'Video TikTok',
      s: '1080x1920',
      m: 'phone-story',
      c: [externalBrands.tiktokPink, externalBrands.tiktokTeal],
      p: 'TikTok',
      w: 1080,
      h: 1920,
    },
    {
      l: 'Foto perfil TT',
      s: '200x200',
      m: 'circle',
      c: [externalBrands.tiktokPink, externalBrands.tiktokTeal],
      p: 'TikTok',
      w: 200,
      h: 200,
    },
    {
      l: 'Post Twitter/X',
      s: '1600x900',
      m: 'desktop',
      c: [externalBrands.twitterBlue, externalBrands.twitterDark],
      p: 'Twitter',
      w: 1600,
      h: 900,
    },
    {
      l: 'Cabecalho X',
      s: '1500x500',
      m: 'desktop',
      c: [externalBrands.twitterBlue, externalBrands.twitterBlueDark],
      p: 'Twitter',
      w: 1500,
      h: 500,
    },
    {
      l: 'Shorts YouTube',
      s: '1080x1920',
      m: 'phone-story',
      c: [externalBrands.youtubeRed, externalBrands.youtubeDarkRed],
      p: 'YouTube',
      w: 1080,
      h: 1920,
    },
    {
      l: 'Miniatura YT',
      s: '1280x720',
      m: 'desktop',
      c: [externalBrands.youtubeRed, externalBrands.youtubeDarkRed],
      p: 'YouTube',
      w: 1280,
      h: 720,
    },
    {
      l: 'Banner YT',
      s: '2560x1440',
      m: 'desktop',
      c: [externalBrands.youtubeRed, externalBrands.youtubeDarkRed],
      p: 'YouTube',
      w: 2560,
      h: 1440,
    },
    {
      l: 'Foto perfil YT',
      s: '800x800',
      m: 'circle',
      c: [externalBrands.youtubeRed, canvasPalette.redDark],
      p: 'YouTube',
      w: 800,
      h: 800,
    },
  ],
  videos: [
    {
      l: 'Video horizontal',
      s: '1920x1080',
      m: 'desktop',
      c: [colors.canvas.pink, canvasPalette.pinkLight],
      w: 1920,
      h: 1080,
    },
    {
      l: 'Video vertical',
      s: '1080x1920',
      m: 'phone-story',
      c: [externalBrands.emailPurple, colors.semantic.purpleText],
      w: 1080,
      h: 1920,
    },
    {
      l: 'Video TikTok',
      s: '1080x1920',
      m: 'phone-story',
      c: [externalBrands.tiktokPink, externalBrands.tiktokTeal],
      w: 1080,
      h: 1920,
    },
    {
      l: 'Video YouTube',
      s: '1920x1080',
      m: 'desktop',
      c: [externalBrands.youtubeRed, externalBrands.youtubeDarkRed],
      w: 1920,
      h: 1080,
    },
    {
      l: 'Video Reels',
      s: '1080x1920',
      m: 'phone-story',
      c: [externalBrands.instagramPurple, externalBrands.instagramPink],
      w: 1080,
      h: 1920,
    },
    {
      l: 'Video quadrado',
      s: '1080x1080',
      m: 'square',
      c: [colors.text.muted, canvasPalette.gray],
      w: 1080,
      h: 1080,
    },
  ],
  impressao: [
    { l: 'Cartaz (A2)', s: '420x594mm', m: 'doc', c: [externalBrands.emailPurple, canvasPalette.violetDeep], w: 4961, h: 7016 },
    { l: 'Panfleto (A4)', s: '210x297mm', m: 'doc', c: [externalBrands.emailPurple, colors.semantic.purpleText], w: 2480, h: 3508 },
    { l: 'Convite', s: '148x210mm', m: 'doc', c: [externalBrands.emailPurple, canvasPalette.violetMid], w: 1748, h: 2480 },
    { l: 'Cartao visita', s: '85x55mm', m: 'desktop', c: [externalBrands.emailPurple, canvasPalette.violetDeep], w: 1004, h: 650 },
    { l: 'Folder', s: 'A4 paisagem', m: 'desktop', c: [externalBrands.emailPurple, colors.semantic.purpleText], w: 3508, h: 2480 },
  ],
  docs: [
    { l: 'Doc (digital)', s: 'Livre', m: 'desktop', c: [colors.canvas.cyan, canvasPalette.cyanLight], w: 1280, h: 720 },
    { l: 'Doc (A4)', s: '210x297mm', m: 'doc', c: [colors.canvas.cyan, canvasPalette.cyanLight], w: 2480, h: 3508 },
    { l: 'Doc (A3)', s: '297x420mm', m: 'doc', c: [colors.canvas.cyan, canvasPalette.cyanMid], w: 3508, h: 4961 },
  ],
  anuncios: [
    {
      l: 'Criativo Feed',
      s: '1080x1080',
      m: 'square',
      c: [colors.ember.primary, colors.canvas.accent],
      w: 1080,
      h: 1080,
    },
    {
      l: 'Criativo Story',
      s: '1080x1920',
      m: 'phone-story',
      c: [colors.ember.primary, colors.semantic.warning],
      w: 1080,
      h: 1920,
    },
    {
      l: 'Banner Display',
      s: '1200x628',
      m: 'desktop',
      c: [colors.ember.primary, colors.canvas.accent],
      w: 1200,
      h: 628,
    },
  ],
  quadros: [
    {
      l: 'Quadro branco',
      s: 'Infinito',
      m: 'desktop',
      c: [colors.semantic.success, canvasPalette.emeraldLight],
      w: 1920,
      h: 1080,
    },
  ],
  planilhas: [
    { l: 'Planilha', s: 'Livre', m: 'desktop-chart', c: [colors.semantic.info, canvasPalette.blueLight], w: 1920, h: 1080 },
  ],
  sites: [{ l: 'Site', s: '1440xauto', m: 'desktop', c: [canvasPalette.indigo, canvasPalette.indigoLight], w: 1440, h: 900 }],
  emails: [{ l: 'E-mail', s: '600xauto', m: 'doc', c: [externalBrands.emailPurple, colors.semantic.purpleText], w: 600, h: 800 }],
};

/* ═══ EDITOR SIDEBAR TABS ═══ */
export interface EditorTabItem {
  /** Id property. */
  id: string;
  /** L property. */
  l: string;
  /** Icon property. */
  icon: string;
}

/** Editor_tabs. */
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
  { l: 'Texto Magico', c: [colors.semantic.success, canvasPalette.emeraldLight] as [string, string] },
  { l: 'Removedor de Fundo', c: [externalBrands.emailPurple, colors.semantic.purpleText] as [string, string] },
  { l: 'Gerador de Fundo', c: [colors.semantic.info, canvasPalette.blueLight] as [string, string] },
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
  'Marketing',
  'Lancamento',
  'Desconto',
  'Depoimento',
  'Antes/Depois',
  'Produto',
];

/* ═══ EDITOR TEMPLATES ═══ */
export const EDITOR_TEMPLATES = [
  { l: 'Marketing Plan', c: [colors.semantic.success, canvasPalette.emeraldDeep] as [string, string] },
  { l: 'Social Media', c: [externalBrands.emailPurple, canvasPalette.violetIntense] as [string, string] },
  { l: 'Pitch Deck', c: [colors.canvas.cyan, canvasPalette.cyanDeep] as [string, string] },
  { l: 'Portfolio', c: [colors.canvas.pink, canvasPalette.pinkDeep] as [string, string] },
  { l: 'Business', c: [colors.semantic.warning, canvasPalette.amberDeep] as [string, string] },
  { l: 'Creative Brief', c: [colors.semantic.info, canvasPalette.blueDeep] as [string, string] },
];

/* ═══ PRODUCT TEMPLATES (Fabric.js JSON) ═══ */
export type { ProductTemplate } from './canvas-product-templates';
// PRODUCT_TEMPLATES data is now served via useProductTemplates hook
// Re-export retained for type compatibility; runtime import from '@/hooks/useProductTemplates'

/* ═══ ELEMENT CATEGORIES ═══ */
export const ELEMENT_CATEGORIES = [
  { l: 'Formas', c: colors.canvas.cyan },
  { l: 'Fotos', c: colors.canvas.pink },
  { l: 'Videos', c: externalBrands.youtubeRed },
  { l: '3D', c: externalBrands.emailPurple },
  { l: 'Graficos', c: colors.semantic.warning },
  { l: 'Stickers', c: colors.semantic.success },
];

/* ═══ EDITOR TOOLS ═══ */
export const EDITOR_TOOLS = [
  { l: 'Enfeitar', c: [colors.canvas.cyan, canvasPalette.cyanLight] as [string, string] },
  { l: 'Redimensionar', c: [colors.ember.primary, colors.canvas.accent] as [string, string] },
  { l: 'Fundo Magico', c: [externalBrands.emailPurple, colors.semantic.purpleText] as [string, string] },
  { l: 'Tradutor', c: [colors.semantic.info, canvasPalette.blueLight] as [string, string] },
  { l: 'Criar em lote', c: [colors.semantic.success, canvasPalette.emeraldLight] as [string, string] },
];
