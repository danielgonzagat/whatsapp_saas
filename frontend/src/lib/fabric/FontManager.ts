export const AVAILABLE_FONTS = [
  'Sora',
  'Inter',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'Playfair Display',
  'Merriweather',
  'Raleway',
  'Nunito',
  'DM Sans',
  'Space Grotesk',
  'Work Sans',
  'Outfit',
] as const;

export type FontName = (typeof AVAILABLE_FONTS)[number];

export class FontManager {
  private loadedFonts = new Set<string>();

  loadFont(fontName: string): void {
    if (this.loadedFonts.has(fontName)) return;
    if (typeof document === 'undefined') return;

    const id = `kloelfont-${fontName.replace(/\s+/g, '-').toLowerCase()}`;
    if (document.getElementById(id)) {
      this.loadedFonts.add(fontName);
      return;
    }

    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@300;400;500;600;700&display=swap`;
    document.head.appendChild(link);
    this.loadedFonts.add(fontName);
  }

  loadAllFonts(): void {
    AVAILABLE_FONTS.forEach((f) => this.loadFont(f));
  }

  getAvailableFonts(): readonly string[] {
    return AVAILABLE_FONTS;
  }

  isLoaded(fontName: string): boolean {
    return this.loadedFonts.has(fontName);
  }
}
