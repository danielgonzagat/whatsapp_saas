import { type Canvas, IText, Textbox } from 'fabric';
import type { ClipboardManager } from './ClipboardManager';
import type { HistoryManager } from './HistoryManager';
import type { SelectionManager } from './SelectionManager';
import type { ZoomManager } from './ZoomManager';

interface KeyboardDeps {
  history: HistoryManager;
  clipboard: ClipboardManager;
  selection: SelectionManager;
  zoom: ZoomManager;
}

type ModAction = (deps: KeyboardDeps) => void;

const ARROW_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

function buildModActions(): Map<string, ModAction> {
  const actions = new Map<string, ModAction>();
  actions.set('z', (deps) => deps.history.undo());
  actions.set('shift+z', (deps) => deps.history.redo());
  actions.set('c', (deps) => deps.clipboard.copy());
  actions.set('x', (deps) => deps.clipboard.cut());
  actions.set('v', (deps) => deps.clipboard.paste());
  actions.set('d', (deps) => deps.clipboard.duplicate());
  actions.set('a', (deps) => deps.selection.selectAll());
  actions.set('=', (deps) => deps.zoom.zoomIn());
  actions.set('+', (deps) => deps.zoom.zoomIn());
  actions.set('-', (deps) => deps.zoom.zoomOut());
  actions.set('0', (deps) => deps.zoom.resetZoom());
  return actions;
}

const MOD_ACTIONS = buildModActions();

function modKey(e: KeyboardEvent): string {
  return e.shiftKey && e.key === 'z' ? 'shift+z' : e.key;
}

function nudgeActive(canvas: Canvas, key: string, amount: number): boolean {
  const active = canvas.getActiveObject();
  if (!active) {
    return false;
  }

  if (key === 'ArrowUp') {
    active.top = (active.top ?? 0) - amount;
  } else if (key === 'ArrowDown') {
    active.top = (active.top ?? 0) + amount;
  } else if (key === 'ArrowLeft') {
    active.left = (active.left ?? 0) - amount;
  } else if (key === 'ArrowRight') {
    active.left = (active.left ?? 0) + amount;
  } else {
    return false;
  }

  active.setCoords();
  canvas.requestRenderAll();
  return true;
}

/** Keyboard manager. */
export class KeyboardManager {
  private canvas: Canvas;
  private deps: KeyboardDeps;
  private _handler: ((e: KeyboardEvent) => void) | null = null;

  constructor(canvas: Canvas, deps: KeyboardDeps) {
    this.canvas = canvas;
    this.deps = deps;
    this._init();
  }

  private _isEditing(): boolean {
    const active = this.canvas.getActiveObject();
    if (active instanceof IText || active instanceof Textbox) {
      return active.isEditing;
    }
    return false;
  }

  private _handleModAction(e: KeyboardEvent): boolean {
    const action = MOD_ACTIONS.get(modKey(e));
    if (!action) {
      return false;
    }
    e.preventDefault();
    action(this.deps);
    return true;
  }

  private _handleDelete(e: KeyboardEvent): boolean {
    if (e.key !== 'Delete' && e.key !== 'Backspace') {
      return false;
    }
    e.preventDefault();
    this.deps.selection.deleteSelected();
    this.deps.history.saveState();
    return true;
  }

  private _handleArrow(e: KeyboardEvent): boolean {
    if (!ARROW_KEYS.has(e.key)) {
      return false;
    }
    const nudge = e.shiftKey ? 10 : 1;
    if (nudgeActive(this.canvas, e.key, nudge)) {
      e.preventDefault();
    }
    return true;
  }

  private _init(): void {
    this._handler = (e: KeyboardEvent) => {
      if (this._isEditing()) {
        return;
      }

      const mod = e.metaKey || e.ctrlKey;
      if (mod && this._handleModAction(e)) {
        return;
      }
      if (this._handleDelete(e)) {
        return;
      }
      this._handleArrow(e);
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', this._handler);
    }
  }

  /** Dispose. */
  dispose(): void {
    if (this._handler && typeof document !== 'undefined') {
      document.removeEventListener('keydown', this._handler);
      this._handler = null;
    }
  }
}
