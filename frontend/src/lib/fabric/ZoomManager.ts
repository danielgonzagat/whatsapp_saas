import { type Canvas, Point } from 'fabric';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.1;

export class ZoomManager {
  private canvas: Canvas;
  private _panning = false;
  private _spaceDown = false;
  private _lastPointer = { x: 0, y: 0 };
  private _keyDownHandler: ((e: KeyboardEvent) => void) | null = null;
  private _keyUpHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(canvas: Canvas) {
    this.canvas = canvas;
    this._initWheelZoom();
    this._initPan();
  }

  zoomIn(): void {
    this.zoomTo(this.canvas.getZoom() + ZOOM_STEP);
  }

  zoomOut(): void {
    this.zoomTo(this.canvas.getZoom() - ZOOM_STEP);
  }

  zoomTo(level: number): void {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, level));
    const center = new Point(this.canvas.width / 2, this.canvas.height / 2);
    this.canvas.zoomToPoint(center, clamped);
    this.canvas.requestRenderAll();
  }

  /** Fit the canvas design area inside the visible viewport with 40px margin */
  zoomToFit(): void {
    let parent: HTMLElement | null = null;
    try {
      const el = this.canvas.lowerCanvasEl;
      parent = el?.parentElement?.parentElement ?? null;
    } catch {
      // DOM not ready yet
    }
    if (!parent) {
      // Fallback: just reset
      this.canvas.setZoom(1);
      this.canvas.absolutePan(new Point(0, 0));
      this.canvas.requestRenderAll();
      return;
    }
    const vpW = parent.clientWidth;
    const vpH = parent.clientHeight;
    const margin = 80; // 40px each side
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const zoom = Math.min((vpW - margin) / cw, (vpH - margin) / ch, 1);
    this.canvas.setZoom(zoom);
    // Center the canvas in the viewport
    const panX = (vpW - cw * zoom) / 2;
    const panY = (vpH - ch * zoom) / 2;
    this.canvas.absolutePan(new Point(-panX / zoom, -panY / zoom));
    this.canvas.requestRenderAll();
  }

  resetZoom(): void {
    this.zoomToFit();
  }

  getZoom(): number {
    return Math.round(this.canvas.getZoom() * 100);
  }

  dispose(): void {
    if (typeof document !== 'undefined') {
      if (this._keyDownHandler) {
        document.removeEventListener('keydown', this._keyDownHandler);
      }
      if (this._keyUpHandler) {
        document.removeEventListener('keyup', this._keyUpHandler);
      }
    }
  }

  private _initWheelZoom(): void {
    this.canvas.on('mouse:wheel', (opt) => {
      const e = opt.e as WheelEvent;
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY;
      let zoom = this.canvas.getZoom();
      zoom *= 0.999 ** delta;
      zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
      this.canvas.zoomToPoint(new Point(e.offsetX, e.offsetY), zoom);
      this.canvas.requestRenderAll();
    });
  }

  private _initPan(): void {
    this._keyDownHandler = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !this._spaceDown) {
        this._spaceDown = true;
        this.canvas.defaultCursor = 'grab';
        this.canvas.selection = false;
      }
    };
    this._keyUpHandler = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        this._spaceDown = false;
        this._panning = false;
        this.canvas.defaultCursor = 'default';
        this.canvas.selection = true;
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', this._keyDownHandler);
      document.addEventListener('keyup', this._keyUpHandler);
    }

    this.canvas.on('mouse:down', (opt) => {
      if (this._spaceDown) {
        this._panning = true;
        this.canvas.defaultCursor = 'grabbing';
        const e = opt.e as MouseEvent;
        this._lastPointer = { x: e.clientX, y: e.clientY };
      }
    });

    this.canvas.on('mouse:move', (opt) => {
      if (!this._panning) {
        return;
      }
      const e = opt.e as MouseEvent;
      const dx = e.clientX - this._lastPointer.x;
      const dy = e.clientY - this._lastPointer.y;
      this._lastPointer = { x: e.clientX, y: e.clientY };
      this.canvas.relativePan(new Point(dx, dy));
    });

    this.canvas.on('mouse:up', () => {
      this._panning = false;
      if (this._spaceDown) {
        this.canvas.defaultCursor = 'grab';
      }
    });
  }
}
