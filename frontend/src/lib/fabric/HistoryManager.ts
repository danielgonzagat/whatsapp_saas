import type { Canvas } from 'fabric';

const MAX_STATES = 50;

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

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  saveState(): void {
    if (this._loading) return;
    const json = JSON.stringify(this.canvas.toJSON());
    this.undoStack.push(json);
    if (this.undoStack.length > MAX_STATES) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  async undo(): Promise<void> {
    if (!this.canUndo) return;
    const current = JSON.stringify(this.canvas.toJSON());
    this.redoStack.push(current);
    const state = this.undoStack.pop()!;
    await this._loadState(state);
  }

  async redo(): Promise<void> {
    if (!this.canRedo) return;
    const current = JSON.stringify(this.canvas.toJSON());
    this.undoStack.push(current);
    const state = this.redoStack.pop()!;
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

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
