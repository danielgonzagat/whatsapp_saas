import { Canvas } from 'fabric';

import { HistoryManager } from './HistoryManager';
import { TextManager } from './TextManager';
import { ImageManager } from './ImageManager';
import { ShapeManager } from './ShapeManager';
import { LayerManager } from './LayerManager';
import { BackgroundManager } from './BackgroundManager';
import { ZoomManager } from './ZoomManager';
import { SelectionManager } from './SelectionManager';
import { ClipboardManager } from './ClipboardManager';
import { GroupingManager } from './GroupingManager';
import { ExportManager } from './ExportManager';
import { SnapManager } from './SnapManager';
import { FilterManager } from './FilterManager';
import { KeyboardManager } from './KeyboardManager';
import { ContextMenuManager } from './ContextMenuManager';
import { FontManager } from './FontManager';

export class KloelEditor {
  readonly canvas: Canvas;
  readonly history: HistoryManager;
  readonly text: TextManager;
  readonly image: ImageManager;
  readonly shapes: ShapeManager;
  readonly layers: LayerManager;
  readonly background: BackgroundManager;
  readonly zoom: ZoomManager;
  readonly selection: SelectionManager;
  readonly clipboard: ClipboardManager;
  readonly grouping: GroupingManager;
  readonly exporter: ExportManager;
  readonly snap: SnapManager;
  readonly filters: FilterManager;
  readonly keyboard: KeyboardManager;
  readonly contextMenu: ContextMenuManager;
  readonly fonts: FontManager;

  private _onChange?: () => void;

  constructor(el: HTMLCanvasElement, width: number, height: number) {
    this.canvas = new Canvas(el, {
      width,
      height,
      backgroundColor: '#ffffff',
      preserveObjectStacking: true,
      stopContextMenu: true,
      fireRightClick: true,
    });

    // Core
    this.history = new HistoryManager(this.canvas);
    this.fonts = new FontManager();
    this.fonts.loadAllFonts();

    // Content managers
    this.text = new TextManager(this.canvas, this.history);
    this.image = new ImageManager(this.canvas, this.history);
    this.shapes = new ShapeManager(this.canvas, this.history);

    // Canvas managers
    this.layers = new LayerManager(this.canvas);
    this.background = new BackgroundManager(this.canvas);
    this.zoom = new ZoomManager(this.canvas);
    this.selection = new SelectionManager(this.canvas);
    this.clipboard = new ClipboardManager(this.canvas, this.history);
    this.grouping = new GroupingManager(this.canvas, this.history);
    this.exporter = new ExportManager(this.canvas);
    this.snap = new SnapManager(this.canvas);
    this.filters = new FilterManager(this.canvas);

    // Input managers
    this.keyboard = new KeyboardManager(this.canvas, {
      history: this.history,
      clipboard: this.clipboard,
      selection: this.selection,
      zoom: this.zoom,
    });
    this.contextMenu = new ContextMenuManager(this.canvas, {
      clipboard: this.clipboard,
      selection: this.selection,
      layers: this.layers,
      grouping: this.grouping,
    });

    // Auto-save hook
    this.canvas.on('object:modified', () => this._notifyChange());
    this.canvas.on('object:added', () => this._notifyChange());
    this.canvas.on('object:removed', () => this._notifyChange());
  }

  onChange(cb: () => void): void {
    this._onChange = cb;
  }

  private _notifyChange(): void {
    if (this._onChange) this._onChange();
  }

  toJSON(): object {
    return this.canvas.toJSON();
  }

  async loadJSON(json: string | object): Promise<void> {
    const data = typeof json === 'string' ? json : JSON.stringify(json);
    try {
      await this.canvas.loadFromJSON(data);
      this.canvas.requestRenderAll();
    } catch {
      // If JSON is incompatible (e.g. old Polotno format), clear and start fresh
      this.canvas.clear();
      this.canvas.backgroundColor = '#ffffff';
      this.canvas.requestRenderAll();
    }
    this.history.clear();
    this.history.saveState();
  }

  clear(): void {
    this.canvas.clear();
    this.canvas.backgroundColor = '#ffffff';
    this.canvas.requestRenderAll();
    this.history.clear();
    this.history.saveState();
  }

  setSize(width: number, height: number): void {
    this.canvas.setDimensions({ width, height });
    this.canvas.requestRenderAll();
  }

  dispose(): void {
    this.keyboard.dispose();
    this.zoom.dispose();
    this.canvas.dispose();
  }
}

// Re-export all managers
export { HistoryManager } from './HistoryManager';
export { TextManager } from './TextManager';
export { ImageManager } from './ImageManager';
export { ShapeManager } from './ShapeManager';
export { LayerManager } from './LayerManager';
export { BackgroundManager } from './BackgroundManager';
export { ZoomManager } from './ZoomManager';
export { SelectionManager } from './SelectionManager';
export { ClipboardManager } from './ClipboardManager';
export { GroupingManager } from './GroupingManager';
export { ExportManager } from './ExportManager';
export { SnapManager } from './SnapManager';
export { FilterManager } from './FilterManager';
export { KeyboardManager } from './KeyboardManager';
export { ContextMenuManager } from './ContextMenuManager';
export { FontManager, AVAILABLE_FONTS } from './FontManager';
