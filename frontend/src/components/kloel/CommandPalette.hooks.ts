'use client';

import { type Dispatch, type SetStateAction, useCallback } from 'react';

interface KeyboardArgs {
  results: Array<{ id: string }>;
  selectedIndex: number;
  setSelectedIndex: Dispatch<SetStateAction<number>>;
  openConversation: (conversationId: string) => void;
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
  openConversation,
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
        openConversation(results[selectedIndex].id);
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    },
    [onClose, openConversation, results, selectedIndex, setSelectedIndex],
  );
}
