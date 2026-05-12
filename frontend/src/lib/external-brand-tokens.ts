/**
 * External Brand Color Tokens
 *
 * Colors for third-party platform brands (Google, Meta, TikTok, etc.).
 * These are NOT KLOEL brand colors — they represent external services.
 */

export const externalBrands = {
  meta: 'rgb(24, 119, 242)',
  metaBg: 'rgb(24, 119, 242)',
  facebook: 'rgb(24, 119, 242)',
  fbBlue: 'rgb(24, 119, 242)',
  fbBlueDark: 'rgb(22, 111, 229)',
  fbBlueLight: 'rgb(69, 153, 255)',

  google: 'rgb(66, 133, 244)',
  googleAds: 'rgb(66, 133, 244)',
  googleBlue: 'rgb(66, 133, 244)',
  googleRed: 'rgb(234, 67, 53)',
  googleYellow: 'rgb(251, 188, 4)',
  googleGreen: 'rgb(52, 168, 83)',

  tiktok: 'rgb(255, 0, 80)',
  tiktokPink: 'rgb(254, 44, 85)',
  tiktokTeal: 'rgb(37, 244, 238)',
  tiktokBlack: 'rgb(1, 1, 1)',
  tiktokBg: 'rgb(18, 18, 18)',

  whatsapp: 'rgb(37, 211, 102)',
  whatsappGreen: 'rgb(37, 211, 102)',
  whatsappDark: 'rgb(18, 140, 126)',
  whatsappLabel: 'rgb(126, 126, 133)',
  whatsappTextSecondary: 'rgb(169, 169, 176)',
  whatsappDangerBg: 'rgb(45, 22, 22)',
  whatsappSuccessBg: 'rgb(23, 51, 31)',
  whatsappCardBorder: 'rgb(38, 38, 43)',
  whatsappGradientStart: 'rgb(22, 22, 25)',
  whatsappGradientEnd: 'rgb(14, 14, 17)',
  whatsappCardText: 'rgb(215, 215, 221)',
  whatsappCardTextBright: 'rgb(212, 212, 218)',
  whatsappCardBg: 'rgb(14, 14, 16)',
  whatsappButtonText: 'rgb(242, 242, 245)',
  whatsappCardDark: 'rgb(31, 44, 51)',
  whatsappBgDark: 'rgb(16, 27, 32)',
  whatsappBubbleBorder: 'rgb(42, 57, 66)',
  whatsappBubbleBg: 'rgb(32, 44, 51)',

  instagram: 'rgb(225, 48, 108)',
  instagramPink: 'rgb(225, 48, 108)',
  instagramPurple: 'rgb(131, 58, 180)',
  instagramOrange: 'rgb(247, 119, 55)',
  instagramGradientStart: 'rgb(131, 58, 180)',
  instagramGradientMid: 'rgb(225, 48, 108)',
  instagramGradientEnd: 'rgb(247, 119, 55)',
  instagramGradientYellow: 'rgb(254, 218, 117)',
  instagramGradientOrange: 'rgb(250, 126, 30)',
  instagramGradientPink: 'rgb(214, 41, 118)',
  instagramGradientPurple: 'rgb(150, 47, 191)',
  instagramGradientBlue: 'rgb(79, 91, 213)',

  twitter: 'rgb(29, 161, 242)',
  twitterBlue: 'rgb(29, 161, 242)',
  twitterDark: 'rgb(20, 23, 26)',
  twitterBlueDark: 'rgb(13, 139, 217)',

  linkedin: 'rgb(10, 102, 194)',
  linkedinBlue: 'rgb(10, 102, 194)',
  linkedinDark: 'rgb(0, 119, 181)',
  linkedinDarker: 'rgb(0, 65, 130)',

  youtube: 'rgb(255, 0, 0)',
  youtubeRed: 'rgb(255, 0, 0)',
  youtubeDarkRed: 'rgb(204, 0, 0)',

  pinterest: 'rgb(230, 0, 35)',
  pinterestRed: 'rgb(230, 0, 35)',
  pinterestDarkRed: 'rgb(189, 8, 28)',

  apple: 'rgb(0, 0, 0)',
  appleRed: 'rgb(255, 0, 0)',
  appleBlue: 'rgb(0, 122, 255)',
  appleGreen: 'rgb(52, 199, 89)',
  appleOrange: 'rgb(255, 149, 0)',

  sms: 'rgb(139, 92, 246)',
  smsPurple: 'rgb(139, 92, 246)',

  messenger: 'rgb(0, 178, 255)',
  messengerBlue: 'rgb(0, 178, 255)',
  messengerDark: 'rgb(0, 106, 255)',

  snapchat: 'rgb(255, 252, 0)',
  spotify: 'rgb(29, 185, 84)',
  shopify: 'rgb(150, 191, 72)',

  email: 'rgb(139, 92, 246)',
  emailPurple: 'rgb(139, 92, 246)',

  skype: 'rgb(0, 175, 240)',

  creditCard: 'rgb(59, 130, 246)',
  boleto: 'rgb(245, 158, 11)',
  debit: 'rgb(16, 185, 129)',
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
