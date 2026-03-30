import { Canvas, FabricObject } from 'fabric';
import type { HistoryManager } from './HistoryManager';

const PASTE_OFFSET = 10;

export class ClipboardManager {
  private canvas: Canvas;
  private history: HistoryManager;
  private _clipboard: FabricObject[] = [];

  constructor(canvas: Canvas, history: HistoryManager) {
    this.canvas = canvas;
    this.history = history;
  }

  async copy(): Promise<void> {
    const objs = this.canvas.getActiveObjects();
    if (objs.length === 0) return;
    this._clipboard = [];
    for (const obj of objs) {
      const clone = await obj.clone();
      this._clipboard.push(clone);
    }
  }

  async cut(): Promise<void> {
    await this.copy();
    const objs = this.canvas.getActiveObjects();
    this.canvas.discardActiveObject();
    objs.forEach((obj) => this.canvas.remove(obj));
    this.canvas.requestRenderAll();
    this.history.saveState();
  }

  async paste(): Promise<void> {
    if (this._clipboard.length === 0) return;
    this.canvas.discardActiveObject();
    const cloned: FabricObject[] = [];
    for (const obj of this._clipboard) {
      const clone = await obj.clone();
      clone.left = (clone.left ?? 0) + PASTE_OFFSET;
      clone.top = (clone.top ?? 0) + PASTE_OFFSET;
      this.canvas.add(clone);
      cloned.push(clone);
    }
    // Update clipboard offsets for next paste
    this._clipboard = cloned;
    if (cloned.length === 1) {
      this.canvas.setActiveObject(cloned[0]);
    }
    this.canvas.requestRenderAll();
    this.history.saveState();
  }

  async duplicate(): Promise<void> {
    await this.copy();
    await this.paste();
  }
}
