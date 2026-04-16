'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Shared shell for all unauthenticated screens (/login, /change-password,
 * /mfa/setup, /mfa/verify). Mirrors the `KloelAuthScreen` visual DNA from
 * the app.kloel.com frontend: void background, centered card with thin
 * border, Sora headline, JetBrains Mono inputs, Ember accent.
 */
export function AuthScreenChrome({
  title,
  subtitle,
  children,
  footer,
  className,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6 py-12">
      <div
        className={cn(
          'w-full max-w-md rounded-md border border-border bg-card/70 p-8 backdrop-blur-sm',
          className,
        )}
      >
        <header className="mb-8 flex flex-col items-center gap-3 text-center">
          <img src="/kloel-mushroom-animated.svg" alt="Kloel" className="h-12 w-12" aria-hidden />
          <div className="flex flex-col items-center gap-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Kloel</h1>
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
              Admin
            </span>
          </div>
          <div className="h-px w-16 bg-border" />
          <p className="text-sm font-medium text-foreground">{title}</p>
          {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
        </header>
        <div className="flex flex-col gap-4">{children}</div>
        {footer ? (
          <footer className="mt-6 text-center text-xs text-muted-foreground">{footer}</footer>
        ) : null}
      </div>
    </main>
  );
}
