import { ActiveSelection, type Canvas, type FabricObject } from 'fabric';

/** Selection change callback type. */
export type SelectionChangeCallback = (selected: FabricObject[]) => void;

/** Selection manager. */
export class SelectionManager {
  private canvas: Canvas;
  private _onChange?: SelectionChangeCallback;

  constructor(canvas: Canvas) {
    this.canvas = canvas;
    this._initEvents();
  }

  /** Select all. */
  selectAll(): void {
    const objs = this.canvas.getObjects();
    if (objs.length === 0) {
      return;
    }
    this.canvas.discardActiveObject();
    const sel = new ActiveSelection(objs, { canvas: this.canvas });
    this.canvas.setActiveObject(sel);
    this.canvas.requestRenderAll();
  }

  /** Deselect all. */
  deselectAll(): void {
    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
  }

  /** Get selected. */
  getSelected(): FabricObject[] {
    return this.canvas.getActiveObjects();
  }

  /** Delete selected. */
  deleteSelected(): void {
    const objs = this.canvas.getActiveObjects();
    if (objs.length === 0) {
      return;
    }
    this.canvas.discardActiveObject();
    objs.forEach((obj) => {
      this.canvas.remove(obj);
    });
    this.canvas.requestRenderAll();
  }

  /** On selection change. */
  onSelectionChange(cb: SelectionChangeCallback): void {
    this._onChange = cb;
  }

  private _initEvents(): void {
    const notify = () => {
      if (this._onChange) {
        this._onChange(this.canvas.getActiveObjects());
      }
    };
    this.canvas.on('selection:created', notify);
    this.canvas.on('selection:updated', notify);
    this.canvas.on('selection:cleared', notify);
  }
}
