'use client';

import { ThemeProvider as NextThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

/**
 * adm.kloel.com theme provider.
 *
 * Mirrors the `app.kloel.com` contract:
 *  - theme is stored on `<html>` as `data-kloel-app-theme="dark"` or `light`
 *  - light is the default
 *  - the actual theme tokens (`--app-bg-*`, `--app-text-*`, etc.) live on
 *    the `.kloel-app-theme-root` wrapper in globals.css, and shadcn tokens
 *    (`--background`, `--foreground`, `--card`, `--border`, ...) are
 *    mapped from those `--app-*` tokens so that flipping the attribute
 *    flips every UI primitive that references a shadcn token.
 *
 * next-themes is configured with `attribute="data-kloel-app-theme"` so the
 * same CSS selectors (`:root[data-kloel-app-theme="dark"]`) used by the
 * main app work verbatim here. `enableSystem` is on so a first-time visitor
 * on a system in dark mode gets dark automatically.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemeProvider
      attribute="data-kloel-app-theme"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
      storageKey="kloel-app-theme"
    >
      {children}
    </NextThemeProvider>
  );
}
