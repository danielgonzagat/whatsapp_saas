/**
 * External Brand Color Tokens
 *
 * Colors for third-party platform brands (Google, Meta, TikTok, etc.).
 * These are NOT KLOEL brand colors — they represent external services.
 */

export const externalBrands = {
  meta: '#1877F2',
  metaBg: '#1877F2',
  facebook: '#1877F2',
  fbBlue: '#1877F2',
  fbBlueDark: '#166FE5',
  fbBlueLight: '#4599FF',

  google: '#4285F4',
  googleAds: '#4285F4',
  googleBlue: '#4285F4',
  googleRed: '#EA4335',
  googleYellow: '#FBBC04',
  googleGreen: '#34A853',

  tiktok: '#FF0050',
  tiktokPink: '#FE2C55',
  tiktokTeal: '#25F4EE',
  tiktokBlack: '#010101',
  tiktokBg: '#121212',

  whatsapp: '#25D366',
  whatsappGreen: '#25D366',
  whatsappDark: '#128C7E',

  instagram: '#E1306C',
  instagramPink: '#E1306C',
  instagramPurple: '#833AB4',
  instagramOrange: '#F77737',
  instagramGradientStart: '#833AB4',
  instagramGradientMid: '#E1306C',
  instagramGradientEnd: '#F77737',
  instagramGradientYellow: '#FEDA75',
  instagramGradientOrange: '#FA7E1E',
  instagramGradientPink: '#D62976',
  instagramGradientPurple: '#962FBF',
  instagramGradientBlue: '#4F5BD5',

  twitter: '#1DA1F2',
  twitterBlue: '#1DA1F2',
  twitterDark: '#14171A',
  twitterBlueDark: '#0D8BD9',

  linkedin: '#0A66C2',
  linkedinBlue: '#0A66C2',
  linkedinDark: '#0077B5',
  linkedinDarker: '#004182',

  youtube: '#FF0000',
  youtubeRed: '#FF0000',
  youtubeDarkRed: '#CC0000',

  pinterest: '#E60023',
  pinterestRed: '#E60023',
  pinterestDarkRed: '#BD081C',

  apple: '#000000',
  appleRed: '#FF0000',
  appleBlue: '#007AFF',
  appleGreen: '#34C759',
  appleOrange: '#FF9500',

  sms: '#8B5CF6',
  smsPurple: '#8B5CF6',

  messenger: '#00B2FF',
  messengerBlue: '#00B2FF',
  messengerDark: '#006AFF',

  snapchat: '#FFFC00',
  spotify: '#1DB954',
  shopify: '#96BF48',

  email: '#8B5CF6',
  emailPurple: '#8B5CF6',

  skype: '#00AFF0',

  creditCard: '#3B82F6',
  boleto: '#F59E0B',
  debit: '#10B981',
} as const;

export const platformColors: Record<string, string> = {
  meta: externalBrands.meta,
  google: externalBrands.googleAds,
  tiktok: externalBrands.tiktok,
  whatsapp: externalBrands.whatsapp,
  instagram: externalBrands.instagram,
  twitter: externalBrands.twitter,
  linkedin: externalBrands.linkedin,
  youtube: externalBrands.youtube,
  pinterest: externalBrands.pinterest,
};
