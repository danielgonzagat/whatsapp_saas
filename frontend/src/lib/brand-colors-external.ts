/**
 * External Brand Colors
 *
 * Platform-identity colors owned by third-party brands (WhatsApp, Instagram,
 * Google, Meta, TikTok, etc.). These MUST NOT be used as UI primitives —
 * only for rendering platform-branded UI elements, badges, and indicators.
 */

export const externalBrands = {
  whatsapp: {
    primary: '#25D366',
    dark: '#128C7E',
    light: '#DCF8C6',
    bg: '#075E54',
    bgLight: '#ECE5DD',
  },

  facebook: {
    primary: '#1877F2',
    dark: '#166FE5',
    light: '#0D8BD9',
    classic: '#4267B2',
  },

  instagram: {
    primary: '#E1306C',
    purple: '#833AB4',
    gradientStart: '#FEDA75',
    gradientMid1: '#FA7E1E',
    gradientMid2: '#D62976',
    gradientMid3: '#962FBF',
    gradientEnd: '#4F5BD5',
  },

  tiktok: {
    primary: '#010101',
    cyan: '#25F4EE',
    red: '#FE2C55',
    white: '#FFFFFF',
  },

  twitter: {
    primary: '#1DA1F2',
    dark: '#14171A',
  },

  linkedin: {
    primary: '#0077B5',
    dark: '#0A66C2',
    navy: '#004182',
  },

  google: {
    blue: '#4285F4',
    red: '#EA4335',
    yellow: '#FBBC04',
    green: '#34A853',
  },

  messenger: {
    primary: '#00B2FF',
    gradientEnd: '#006AFF',
  },

  youtube: {
    primary: '#FF0000',
    dark: '#CC0000',
    light: '#BD081C',
  },

  pinterest: {
    primary: '#E60023',
  },

  discord: {
    primary: '#5865F2',
  },

  telegram: {
    primary: '#0088CC',
  },

  apple: {
    imessage: '#34C759',
  },

  snapchat: {
    primary: '#FFFC00',
  },
} as const;

export type ExternalBrand = keyof typeof externalBrands;
