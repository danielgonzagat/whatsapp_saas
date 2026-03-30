import { Canvas, IText, Textbox } from 'fabric';
import type { HistoryManager } from './HistoryManager';
import type { ClipboardManager } from './ClipboardManager';
import type { SelectionManager } from './SelectionManager';
import type { ZoomManager } from './ZoomManager';

interface KeyboardDeps {
  history: HistoryManager;
  clipboard: ClipboardManager;
  selection: SelectionManager;
  zoom: ZoomManager;
}

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

  private _init(): void {
    this._handler = (e: KeyboardEvent) => {
      if (this._isEditing()) return;

      const mod = e.metaKey || e.ctrlKey;

      // Undo: Cmd+Z
      if (mod && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        this.deps.history.undo();
        return;
      }
      // Redo: Cmd+Shift+Z
      if (mod && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        this.deps.history.redo();
        return;
      }
      // Copy: Cmd+C
      if (mod && e.key === 'c') {
        e.preventDefault();
        this.deps.clipboard.copy();
        return;
      }
      // Cut: Cmd+X
      if (mod && e.key === 'x') {
        e.preventDefault();
        this.deps.clipboard.cut();
        return;
      }
      // Paste: Cmd+V
      if (mod && e.key === 'v') {
        e.preventDefault();
        this.deps.clipboard.paste();
        return;
      }
      // Duplicate: Cmd+D
      if (mod && e.key === 'd') {
        e.preventDefault();
        this.deps.clipboard.duplicate();
        return;
      }
      // Select All: Cmd+A
      if (mod && e.key === 'a') {
        e.preventDefault();
        this.deps.selection.selectAll();
        return;
      }
      // Delete / Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        this.deps.selection.deleteSelected();
        this.deps.history.saveState();
        return;
      }
      // Zoom In: Cmd+=
      if (mod && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        this.deps.zoom.zoomIn();
        return;
      }
      // Zoom Out: Cmd+-
      if (mod && e.key === '-') {
        e.preventDefault();
        this.deps.zoom.zoomOut();
        return;
      }
      // Reset Zoom: Cmd+0
      if (mod && e.key === '0') {
        e.preventDefault();
        this.deps.zoom.resetZoom();
        return;
      }
      // Arrow nudge
      const NUDGE = e.shiftKey ? 10 : 1;
      const active = this.canvas.getActiveObject();
      if (active && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        switch (e.key) {
          case 'ArrowUp': active.top = (active.top ?? 0) - NUDGE; break;
          case 'ArrowDown': active.top = (active.top ?? 0) + NUDGE; break;
          case 'ArrowLeft': active.left = (active.left ?? 0) - NUDGE; break;
          case 'ArrowRight': active.left = (active.left ?? 0) + NUDGE; break;
        }
        active.setCoords();
        this.canvas.requestRenderAll();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', this._handler);
    }
  }

  dispose(): void {
    if (this._handler && typeof document !== 'undefined') {
      document.removeEventListener('keydown', this._handler);
      this._handler = null;
    }
  }
}
