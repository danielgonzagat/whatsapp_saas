import type { Canvas } from 'fabric';

const MAX_STATES = 50;

/** History manager. */
export class HistoryManager {
  private canvas: Canvas;
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private _loading = false;

  constructor(canvas: Canvas) {
    this.canvas = canvas;
    // Save initial blank state so first undo works
    this.saveState();
  }

  /** Can undo getter. */
  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** Can redo getter. */
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Save state. */
  saveState(): void {
    if (this._loading) {
      return;
    }
    const json = JSON.stringify(this.canvas.toJSON());
    this.undoStack.push(json);
    if (this.undoStack.length > MAX_STATES) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  /** Undo. */
  async undo(): Promise<void> {
    const state = this.undoStack.pop();
    if (!state) {
      return;
    }
    const current = JSON.stringify(this.canvas.toJSON());
    this.redoStack.push(current);
    await this._loadState(state);
  }

  /** Redo. */
  async redo(): Promise<void> {
    const state = this.redoStack.pop();
    if (!state) {
      return;
    }
    const current = JSON.stringify(this.canvas.toJSON());
    this.undoStack.push(current);
    await this._loadState(state);
  }

  private async _loadState(state: string): Promise<void> {
    this._loading = true;
    try {
      await this.canvas.loadFromJSON(state);
      this.canvas.requestRenderAll();
    } finally {
      this._loading = false;
    }
  }

  /** Clear. */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
