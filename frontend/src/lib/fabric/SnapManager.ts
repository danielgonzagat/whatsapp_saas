import { Canvas, Line, FabricObject } from 'fabric';

const THRESHOLD = 5;
const GUIDELINE_COLOR = '#E85D30';
const GUIDELINE_DASH = [3, 3];

export class SnapManager {
  private canvas: Canvas;
  private guidelines: Line[] = [];
  private _guidelineSet = new WeakSet<FabricObject>();

  constructor(canvas: Canvas) {
    this.canvas = canvas;
    this._initSnapping();
  }

  private _initSnapping(): void {
    this.canvas.on('object:moving', (e) => {
      this._clearGuidelines();
      const target = e.target;
      if (!target) return;

      const cw = this.canvas.width;
      const ch = this.canvas.height;
      const bound = target.getBoundingRect();
      const cx = bound.left + bound.width / 2;
      const cy = bound.top + bound.height / 2;

      // Snap to canvas center
      if (Math.abs(cx - cw / 2) < THRESHOLD) {
        target.left = (target.left ?? 0) + (cw / 2 - cx);
        this._addVerticalLine(cw / 2);
      }
      if (Math.abs(cy - ch / 2) < THRESHOLD) {
        target.top = (target.top ?? 0) + (ch / 2 - cy);
        this._addHorizontalLine(ch / 2);
      }

      // Snap to canvas edges
      if (Math.abs(bound.left) < THRESHOLD) {
        target.left = (target.left ?? 0) - bound.left;
        this._addVerticalLine(0);
      }
      if (Math.abs(bound.top) < THRESHOLD) {
        target.top = (target.top ?? 0) - bound.top;
        this._addHorizontalLine(0);
      }
      if (Math.abs(bound.left + bound.width - cw) < THRESHOLD) {
        target.left = (target.left ?? 0) + (cw - (bound.left + bound.width));
        this._addVerticalLine(cw);
      }
      if (Math.abs(bound.top + bound.height - ch) < THRESHOLD) {
        target.top = (target.top ?? 0) + (ch - (bound.top + bound.height));
        this._addHorizontalLine(ch);
      }

      // Snap to other objects
      const objects = this.canvas.getObjects().filter(
        (o) => o !== target && !this._guidelineSet.has(o),
      );
      for (const obj of objects) {
        const ob = obj.getBoundingRect();
        const ocx = ob.left + ob.width / 2;
        const ocy = ob.top + ob.height / 2;
        if (Math.abs(cx - ocx) < THRESHOLD) {
          target.left = (target.left ?? 0) + (ocx - cx);
          this._addVerticalLine(ocx);
        }
        if (Math.abs(cy - ocy) < THRESHOLD) {
          target.top = (target.top ?? 0) + (ocy - cy);
          this._addHorizontalLine(ocy);
        }
      }

      target.setCoords();
    });

    this.canvas.on('object:modified', () => this._clearGuidelines());
  }

  private _addVerticalLine(x: number): void {
    const line = new Line([x, 0, x, this.canvas.height], {
      stroke: GUIDELINE_COLOR,
      strokeDashArray: GUIDELINE_DASH,
      selectable: false,
      evented: false,
      excludeFromExport: true,
    });
    this.canvas.add(line);
    this.guidelines.push(line);
    this._guidelineSet.add(line);
  }

  private _addHorizontalLine(y: number): void {
    const line = new Line([0, y, this.canvas.width, y], {
      stroke: GUIDELINE_COLOR,
      strokeDashArray: GUIDELINE_DASH,
      selectable: false,
      evented: false,
      excludeFromExport: true,
    });
    this.canvas.add(line);
    this.guidelines.push(line);
    this._guidelineSet.add(line);
  }

  private _clearGuidelines(): void {
    this.guidelines.forEach((g) => this.canvas.remove(g));
    this.guidelines = [];
  }
}
