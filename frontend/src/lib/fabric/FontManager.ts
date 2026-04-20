/** Available_fonts. */
export const AVAILABLE_FONTS = [
  'Sora',
  'Inter',
  'Roboto',
  'Montserrat',
  'Poppins',
  'Playfair Display',
  'Oswald',
  'Lato',
  'Open Sans',
  'Raleway',
  'JetBrains Mono',
  'Bebas Neue',
  'Merriweather',
  'Nunito',
  'Quicksand',
  'Dancing Script',
  'Pacifico',
  'Lobster',
  'Righteous',
  'Permanent Marker',
] as const;

/** Font name type. */
export type FontName = (typeof AVAILABLE_FONTS)[number];

const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=Inter:wght@300;400;500;600;700&family=Roboto:wght@300;400;500;700&family=Montserrat:wght@300;400;500;600;700;800&family=Poppins:wght@300;400;500;600;700&family=Playfair+Display:wght@400;500;600;700;800&family=Oswald:wght@300;400;500;600;700&family=Lato:wght@300;400;700&family=Open+Sans:wght@300;400;500;600;700&family=Raleway:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Bebas+Neue&family=Merriweather:wght@300;400;700&family=Nunito:wght@300;400;500;600;700&family=Quicksand:wght@300;400;500;600;700&family=Dancing+Script:wght@400;500;600;700&family=Pacifico&family=Lobster&family=Righteous&family=Permanent+Marker&display=swap';

/** Font manager. */
export class FontManager {
  private _loaded = false;

  /** Load all fonts in a single <link> tag */
  loadAllFonts(): void {
    if (this._loaded) {
      return;
    }
    if (typeof document === 'undefined') {
      return;
    }

    const id = 'kloel-google-fonts';
    if (document.getElementById(id)) {
      this._loaded = true;
      return;
    }

    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = GOOGLE_FONTS_URL;
    document.head.appendChild(link);
    this._loaded = true;
  }

  /** Load a single font (kept for backward compat) */
  loadFont(_fontName: string): void {
    this.loadAllFonts();
  }

  getAvailableFonts(): readonly string[] {
    return AVAILABLE_FONTS;
  }

  isLoaded(_fontName: string): boolean {
    return this._loaded;
  }
}
