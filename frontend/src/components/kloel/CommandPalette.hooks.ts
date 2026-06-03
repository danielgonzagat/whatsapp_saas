'use client';

import { type Dispatch, type SetStateAction, useCallback } from 'react';

export interface CommandPaletteKeyboardResult {
  id: string;
  href?: string | undefined;
  type?: string | undefined;
}

interface KeyboardArgs {
  results: CommandPaletteKeyboardResult[];
  selectedIndex: number;
  setSelectedIndex: Dispatch<SetStateAction<number>>;
  openResult: (result: CommandPaletteKeyboardResult) => void;
  onClose: () => void;
}

/**
 * Returns a memoized keydown handler for the CommandPalette modal.
 *
 * Handles ArrowDown/ArrowUp navigation, Enter to open, and Escape to close.
 */
export function useCommandPaletteKeyboard({
  results,
  selectedIndex,
  setSelectedIndex,
  openResult,
  onClose,
}: KeyboardArgs) {
  return useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((current) => Math.min(current + 1, Math.max(results.length - 1, 0)));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((current) => Math.max(current - 1, 0));
        return;
      }

      if (event.key === 'Enter' && results[selectedIndex]) {
        event.preventDefault();
        openResult(results[selectedIndex]);
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    },
    [onClose, openResult, results, selectedIndex, setSelectedIndex],
  );
}
