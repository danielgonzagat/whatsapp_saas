
/* ═══════════════════════════════════════════
   KLOEL CANVAS — Format & Category Data
   Single source of truth for all canvas formats.
   Heavy data tables now live in ./canvas-formats-data
   and types in ./canvas-formats-types — re-exported
   here to preserve the public surface.
   ═══════════════════════════════════════════ */

import { colors } from './design-tokens';
import { externalBrands } from './external-brand-tokens';
import { canvasPalette } from './canvas-palette-tokens';
import type { CategoryItem, EditorTabItem, PillItem } from './canvas-formats-types';

export type {
  CategoryItem,
  EditorTabItem,
  FormatItem,
  PillItem,
} from './canvas-formats-types';
export { FORMAT_DATA } from './canvas-formats-data';

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

/* ═══ EDITOR SIDEBAR TABS ═══ */
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
