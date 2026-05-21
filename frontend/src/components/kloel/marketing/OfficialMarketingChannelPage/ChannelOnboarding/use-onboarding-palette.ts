import { useTheme } from '@/components/kloel/theme/ThemeProvider';
import { paletteFor, type OnboardingPalette } from './palette';

/**
 * The canonical onboarding palette for the workspace's live theme. Reuses the
 * app-wide {@link useTheme} provider (single source of truth for light/dark),
 * so the screen flips with the global toggle and never desyncs. Screen default
 * is dark per spec §12; the workspace toggle still governs.
 *
 * Kept separate from the pure {@link paletteFor} data module so presentational
 * atoms and their tests can consume the palette without pulling the React
 * theme-provider dependency graph.
 */
export function useOnboardingPalette(): OnboardingPalette {
  const { theme } = useTheme();
  return paletteFor(theme);
}
