'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

/**
 * Light/dark toggle button for the admin topbar.
 *
 * Avoids the classic next-themes hydration mismatch by rendering a neutral
 * placeholder until the client mounts — which happens in a single effect
 * tick, before the user can notice.
 */
export function AdminThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === 'dark';
  const next = isDark ? 'light' : 'dark';
  const label = mounted
    ? isDark
      ? 'Mudar para tema claro'
      : 'Mudar para tema escuro'
    : 'Alternar tema';

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={label}
      title={label}
      className="flex size-9 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:text-foreground"
    >
      {mounted ? (
        isDark ? (
          <Sun className="size-4" aria-hidden />
        ) : (
          <Moon className="size-4" aria-hidden />
        )
      ) : (
        <Sun className="size-4 opacity-0" aria-hidden />
      )}
    </button>
  );
}
