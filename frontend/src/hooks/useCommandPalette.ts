/**
 * ============================================
 * USE COMMAND PALETTE HOOK
 * ============================================
 * Hook para gerenciar o Command Palette globalmente.
 * Ctrl/⌘+K abre o palette de qualquer lugar.
 * 
 * "One keyboard shortcut to rule them all."
 * ============================================
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CommandCategory, CommandItem } from '@/components/kloel';

// ============================================
// TYPES
// ============================================

export interface UseCommandPaletteOptions {
  /** Callback quando o palette abre */
  onOpen?: () => void;
  /** Callback quando o palette fecha */
  onClose?: () => void;
  /** Comandos customizados para adicionar */
  customCommands?: CommandItem[];
  /** Desabilitar atalho de teclado */
  disableShortcut?: boolean;
}

export interface CommandPaletteState {
  /** Se o palette está aberto */
  isOpen: boolean;
  /** Categoria inicial quando abre */
  initialCategory?: CommandCategory;
  /** Query de busca inicial */
  initialQuery?: string;
}

// ============================================
// GLOBAL STATE (simples, sem contexto)
// ============================================

let globalOpenCallback: ((state: Partial<CommandPaletteState>) => void) | null = null;
let globalCloseCallback: (() => void) | null = null;

/**
 * Abre o Command Palette programaticamente de qualquer lugar
 */
export function openCommandPalette(options?: Partial<Omit<CommandPaletteState, 'isOpen'>>) {
  if (globalOpenCallback) {
    globalOpenCallback({ isOpen: true, ...options });
  }
}

/**
 * Fecha o Command Palette programaticamente
 */
export function closeCommandPalette() {
  if (globalCloseCallback) {
    globalCloseCallback();
  }
}

// ============================================
// HOOK
// ============================================

export function useCommandPalette(options: UseCommandPaletteOptions = {}) {
  const { onOpen, onClose, disableShortcut = false } = options;
  const router = useRouter();
  
  const [state, setState] = useState<CommandPaletteState>({
    isOpen: false,
    initialCategory: undefined,
    initialQuery: undefined,
  });

  // Abre o palette
  const open = useCallback((opts?: Partial<Omit<CommandPaletteState, 'isOpen'>>) => {
    setState({
      isOpen: true,
      initialCategory: opts?.initialCategory,
      initialQuery: opts?.initialQuery,
    });
    onOpen?.();
  }, [onOpen]);

  // Fecha o palette
  const close = useCallback(() => {
    setState(prev => ({
      ...prev,
      isOpen: false,
    }));
    onClose?.();
  }, [onClose]);

  // Toggle
  const toggle = useCallback(() => {
    if (state.isOpen) {
      close();
    } else {
      open();
    }
  }, [state.isOpen, open, close]);

  // Registra callbacks globais
  useEffect(() => {
    globalOpenCallback = open;
    globalCloseCallback = close;
    
    return () => {
      globalOpenCallback = null;
      globalCloseCallback = null;
    };
  }, [open, close]);

  // Handler de teclado global (Ctrl/⌘+K)
  useEffect(() => {
    if (disableShortcut) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K ou Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        e.stopPropagation();
        toggle();
        return;
      }

      // "/" para abrir com foco em busca (quando não está em input)
      if (e.key === '/' && !state.isOpen) {
        const target = e.target as HTMLElement;
        const isInputFocused = 
          target.tagName === 'INPUT' || 
          target.tagName === 'TEXTAREA' || 
          target.isContentEditable;
        
        if (!isInputFocused) {
          e.preventDefault();
          open({ initialQuery: '' });
          return;
        }
      }

      // Escape para fechar
      if (e.key === 'Escape' && state.isOpen) {
        e.preventDefault();
        close();
      }
    };

    document.addEventListener('keydown', handleKeyDown, { capture: true });
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [disableShortcut, state.isOpen, toggle, open, close]);

  // Executa um comando
  const executeCommand = useCallback((command: CommandItem) => {
    switch (command.type) {
      case 'navigate':
        if (command.href) {
          router.push(command.href);
        }
        break;
      
      case 'execute':
      case 'execute_gate':
        // Executa a função de ação diretamente
        if (command.action) {
          command.action();
        }
        break;
      
      case 'fill_chat':
        // Preenche o chat com o prompt - emite evento para UniversalComposer
        if (command.prompt) {
          window.dispatchEvent(
            new CustomEvent('kloel-fill-chat', { detail: { text: command.prompt } })
          );
        }
        break;
      
      default:
        console.log('[CommandPalette] Unknown command type:', command.type);
    }
    
    // Fecha após executar
    close();
  }, [router, close]);

  return {
    // State
    isOpen: state.isOpen,
    initialCategory: state.initialCategory,
    initialQuery: state.initialQuery,
    
    // Actions
    open,
    close,
    toggle,
    executeCommand,
    
    // Props para o componente CommandPalette
    paletteProps: {
      open: state.isOpen,
      onClose: close,
      initialCategory: state.initialCategory,
      initialSearch: state.initialQuery,
    },
  };
}

// ============================================
// ATALHOS PARA CATEGORIAS ESPECÍFICAS
// ============================================

/**
 * Abre o palette na categoria de navegação
 */
export function openNavigationPalette() {
  openCommandPalette({ initialCategory: 'navigate' });
}

/**
 * Abre o palette na categoria de criação
 */
export function openCreatePalette() {
  openCommandPalette({ initialCategory: 'create' });
}

/**
 * Abre o palette na categoria de autopilot
 */
export function openAutopilotPalette() {
  openCommandPalette({ initialCategory: 'autopilot' });
}

/**
 * Abre o palette na categoria de diagnósticos
 */
export function openDiagnosticsPalette() {
  openCommandPalette({ initialCategory: 'diagnostic' });
}

export default useCommandPalette;
