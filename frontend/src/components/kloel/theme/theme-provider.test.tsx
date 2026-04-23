import { act } from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ThemeProvider, useTheme } from './ThemeProvider';
import { ThemeToggle } from './ThemeToggle';
import { KLOEL_APP_THEME_STORAGE_SLOT } from '@/lib/kloel-theme';

function ThemeProbe() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div>
      <span data-testid="theme-value">{theme}</span>
      <button type="button" onClick={toggleTheme}>
        alternar
      </button>
      <ThemeToggle />
    </div>
  );
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-kloel-app-theme');
    document.documentElement.style.colorScheme = '';
    document.head.querySelector('meta[name="theme-color"]')?.remove();
  });

  afterEach(() => {
    cleanup();
  });

  it('usa claro como padrão para novos usuários', async () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(await screen.findByTestId('theme-value')).toHaveTextContent('light');
    expect(document.documentElement.getAttribute('data-kloel-app-theme')).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(window.localStorage.getItem(KLOEL_APP_THEME_STORAGE_SLOT)).toBe('light');
    expect(document.head.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      '#FFFFFF',
    );
    expect(screen.getByRole('switch', { name: /alternar tema/i })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('hidrata o tema salvo anteriormente', async () => {
    window.localStorage.setItem(KLOEL_APP_THEME_STORAGE_SLOT, 'dark');

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(await screen.findByTestId('theme-value')).toHaveTextContent('dark');
    expect(document.documentElement.getAttribute('data-kloel-app-theme')).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.head.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      '#0A0A0C',
    );
    expect(screen.getByRole('switch', { name: /alternar tema/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('persiste a troca feita pelo toggle', async () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    const switchButton = await screen.findByRole('switch', { name: /alternar tema/i });

    await act(async () => {
      switchButton.click();
    });

    expect(screen.getByTestId('theme-value')).toHaveTextContent('dark');
    expect(document.documentElement.getAttribute('data-kloel-app-theme')).toBe('dark');
    expect(window.localStorage.getItem(KLOEL_APP_THEME_STORAGE_SLOT)).toBe('dark');
    expect(document.head.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      '#0A0A0C',
    );

    await act(async () => {
      switchButton.click();
    });

    expect(screen.getByTestId('theme-value')).toHaveTextContent('light');
    expect(document.documentElement.getAttribute('data-kloel-app-theme')).toBe('light');
    expect(window.localStorage.getItem(KLOEL_APP_THEME_STORAGE_SLOT)).toBe('light');
    expect(document.head.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      '#FFFFFF',
    );
  });

  it('sincroniza mudanças de tema vindas de outra aba', async () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    await screen.findByTestId('theme-value');

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: KLOEL_APP_THEME_STORAGE_SLOT,
          newValue: 'dark',
        }),
      );
    });

    expect(screen.getByTestId('theme-value')).toHaveTextContent('dark');
    expect(document.documentElement.getAttribute('data-kloel-app-theme')).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.head.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      '#0A0A0C',
    );
  });
});
